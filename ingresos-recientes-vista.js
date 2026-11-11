'use strict';
// Ingresos recientes (propuesta visual 2): subpestaña de Oportunidades. Script clasico que se carga DESPUES de oportunidades-vista.js y usa los
// helpers del principal (rtEl, nf, rtEstado, rtFormularioFiltro, rtFiltroAParams, RT_FILTRO, RT_CENTROS, RT_CENTRO_NOMBRE) y de Oportunidades
// (ovEsMovil, ogPaginasVisibles). Solo presentacion: lecturas, umbrales, fechas de referencia y completitud los resuelve croma-api
// (GET /analisis/ingresos-recientes). Todo texto de la API entra con textContent.

const IR_LIMITE = 50;
const IR_MAX_DIAS = 180;                       // espejo de MAX_RANGO_DIAS de la API (la API valida igual y responde 400)
const IR_ATAJOS = [7, 15, 30, 60];
const IR_OPERATIVAS = ['0001', '0005', '0010', '0012', '0014']; // espejo de CENTROS_OPERATIVOS: la API ignora las demas (p. ej. Cipo, cerrada)
// Orden de urgencia de la API. Nombre corto visible; el nombre completo de la API va como etiqueta accesible.
const IR_LECTURAS = [
  ['sin_ventas_con_stock', 'Revisar: sin ventas'], ['historial_insuficiente', 'Historial insuficiente'], ['sin_exposicion', 'Sin exposición'],
  ['en_observacion', 'En observación'], ['agotado_con_ventas', 'Vendió y agotado'], ['con_ventas', 'Con ventas'],
];
const IR_TONO = { sin_ventas_con_stock: 'danger', historial_insuficiente: 'warning', sin_exposicion: 'neutral', en_observacion: 'neutral', agotado_con_ventas: 'info', con_ventas: 'success' };
const IR_ORDENES = [['prioridad', 'Más urgentes primero'], ['ingreso_desc', 'Ingreso más reciente'], ['ingreso_asc', 'Ingreso más antiguo'], ['ventas_desc', 'Más ventas'], ['ventas_asc', 'Menos ventas'],
  ['producto_asc', 'Producto A–Z'], ['producto_desc', 'Producto Z–A'], ['dias_asc', 'Días con stock: menor a mayor'], ['dias_desc', 'Días con stock: mayor a menor'],
  ['stock_asc', 'Stock de sucursales: menor a mayor'], ['stock_desc', 'Stock de sucursales: mayor a menor'], ['deposito_asc', 'Depósito 90: menor a mayor'], ['deposito_desc', 'Depósito 90: mayor a menor'], ['lectura_desc', 'Lectura: menos urgentes primero']];
// Columnas ordenables de la tabla: [asc, desc]. El orden lo hace la API sobre TODOS los códigos (no solo la página visible); los nulos quedan al final.
const IR_ORDEN_COLUMNA = { 'Producto': ['producto_asc', 'producto_desc'], 'Último ingreso': ['ingreso_asc', 'ingreso_desc'], 'Ventas obs.': ['ventas_asc', 'ventas_desc'], 'Días con stock': ['dias_asc', 'dias_desc'], 'Stock suc.': ['stock_asc', 'stock_desc'], 'Dep. 90': ['deposito_asc', 'deposito_desc'], 'Lectura': ['prioridad', 'lectura_desc'] };
const IR_TIPOS = [['', 'Todos los ingresos'], ['primer_ingreso', 'Primer ingreso'], ['reingreso', 'Reingreso']];
const IR_TIPO_TEXTO = { primer_ingreso: 'Primer ingreso', reingreso: 'Reingreso', indeterminado: 'Ingreso sin verificar' };

const IR = {
  dias: 30, personalizado: false, desde: '', hasta: '', tipo: '', lectura: '', orden: 'prioridad', offset: 0,
  excluidas: [], mostrar: null, scrollY: null, resp: null, clave: null, cargando: false, error: null, seq: 0, abort: null,
  panelSuc: false, confirmar: null, filtrosAbiertos: false, filtrosMovilAbierto: false, expandido: null, ayuda: false, info: false, errorRango: null, foco: null,
};

// ── Utilidades puras (con pruebas) ───────────────────────────────────────────────────────────────
function irDM(iso) { return iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) : '—'; }
function irDMY(iso) { return iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '—'; }
function irHM(iso) { return iso ? irDM(String(iso).slice(0, 10)) + ' ' + String(iso).slice(11, 16) : '—'; }
function irNombre(c) { return String((typeof RT_CENTRO_NOMBRE !== 'undefined' && RT_CENTRO_NOMBRE[c]) || c).replace(/^\d+\s+/, ''); }
function irNum(v) { return v === null || v === undefined ? '—' : nf.format(v); }
// Alcance efectivo = seleccion global de sucursales (barra superior) ∩ operativas, menos las excluidas EXPLICITAMENTE en esta vista.
function irCentrosEfectivos(seleccion, excluidas) { return IR_OPERATIVAS.filter(c => seleccion.includes(c) && !excluidas.includes(c)); }
// Cero real vs dato no disponible: con el stock desalineado la API no clasifica (devuelve 0) y esos conteos NO son ceros reales -> null.
function irValorContador(resp, clave) {
  if (!resp) return null;
  const estado = resp.stock_actual && resp.stock_actual.sucursales && resp.stock_actual.sucursales.estado_general;
  if (estado !== 'alineado' && clave !== 'historial_insuficiente') return null;
  const v = resp.resumen && resp.resumen.por_lectura ? resp.resumen.por_lectura[clave] : undefined;
  return typeof v === 'number' ? v : null;
}
// Cantidad de dias del rango (ambos extremos incluidos) o null si las fechas no alcanzan para contarlos.
function irDiasRango(desde, hasta) {
  if (!desde || !hasta || desde > hasta) return null;
  const d = Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000) + 1;
  return isNaN(d) ? null : d;
}
function irTextoDiasRango(desde, hasta) {
  const d = irDiasRango(desde, hasta);
  if (d === null) return { texto: '', excede: false };
  return { texto: d + (d === 1 ? ' día' : ' días') + (d > IR_MAX_DIAS ? ' · máximo ' + IR_MAX_DIAS : ''), excede: d > IR_MAX_DIAS };
}
function irValidarRango(desde, hasta, corte) {
  if (!desde || !hasta) return 'Elegí las dos fechas.';
  if (desde > hasta) return '"Desde" no puede ser posterior a "Hasta".';
  if (corte && hasta > corte) return 'El último día posible es el corte (' + irDMY(corte) + ').';
  const dias = Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000) + 1;
  if (dias > IR_MAX_DIAS) return 'El rango no puede superar ' + IR_MAX_DIAS + ' días (elegiste ' + dias + ').';
  return null;
}
function irLocalesNoAlineados(resp) {
  const por = resp && resp.stock_actual && resp.stock_actual.sucursales && resp.stock_actual.sucursales.por_centro;
  return por ? Object.values(por).filter(c => c.estado !== 'ok') : [];
}
function irTextoLocal(c) {
  return irNombre(c.centro) + (c.estado === 'atrasado'
    ? ': stock al ' + irDM(c.fecha_actualizacion) + ', ' + (c.dias_atraso === 1 ? 'un día' : c.dias_atraso + ' días') + ' antes del corte'
    : ': fecha de actualización del stock desconocida');
}
function irFechaStock(resp) { // fecha de referencia del stock de sucursales para mostrar junto al dato
  const por = resp && resp.stock_actual && resp.stock_actual.sucursales && resp.stock_actual.sucursales.por_centro;
  const fechas = por ? [...new Set(Object.values(por).map(c => c.fecha_actualizacion))] : [];
  if (fechas.length === 1 && fechas[0]) return 'al ' + irDM(fechas[0]);
  return fechas.length ? 'según el local' : '';
}
function irResumenFiltros(e, filtro) {
  const partes = [];
  partes.push(e.personalizado ? irDM(e.desde) + ' al ' + irDM(e.hasta) : e.dias + ' días');
  if (e.tipo) partes.push((IR_TIPOS.find(t => t[0] === e.tipo) || [0, e.tipo])[1]);
  if (e.lectura) partes.push((IR_LECTURAS.find(l => l[0] === e.lectura) || [0, e.lectura])[1]);
  if (filtro) [['codigo', 'Código'], ['marca', 'Marca'], ['rubro', 'Rubro'], ['subrubro', 'Subrubro']].forEach(([c, n]) => { if (filtro[c]) partes.push(n + ': ' + (Array.isArray(filtro[c]) ? filtro[c].join(', ') : filtro[c])); });
  return partes.join(' · ');
}
function irParams(e, centros, filtro) {
  const p = new URLSearchParams();
  if (e.personalizado) { p.set('desde', e.desde); p.set('hasta', e.hasta); } else p.set('dias', String(e.dias));
  p.set('sucursales', centros.join(','));                           // siempre explicito: lo que se ve como alcance es lo que se pide
  if (filtro && typeof rtFiltroAParams === 'function') rtFiltroAParams(p, filtro, ['talle', 'color']);
  if (e.tipo) p.set('tipo', e.tipo);
  if (e.lectura) p.set('lectura', e.lectura);
  if (e.orden && e.orden !== 'prioridad') p.set('orden', e.orden);
  p.set('limit', String(IR_LIMITE)); p.set('offset', String(e.offset));
  return p;
}
function irClaveActual() { return irParams(IR, irCentrosEfectivos(RT_CENTROS, IR.excluidas), RT_FILTRO).toString(); }

// ── Carga (con secuencia y AbortController: una respuesta vieja nunca reemplaza a la vigente) ─────────
async function irCargar() {
  if (IR.abort) IR.abort.abort();
  const controller = new AbortController(); IR.abort = controller;
  const seq = ++IR.seq;
  const centros = irCentrosEfectivos(RT_CENTROS, IR.excluidas);
  const clave = irClaveActual();
  IR.cargando = true; IR.error = null; IR.clave = clave;
  rtRenderVistaActual();
  if (!centros.length) { IR.cargando = false; IR.resp = null; rtRenderVistaActual(); return; }
  let reintentar = false;
  try {
    const resp = await fetch(STOCK_API_URL + '/analisis/ingresos-recientes?' + clave, { signal: controller.signal });
    const data = await resp.json();
    if (seq !== IR.seq) return;
    if (!resp.ok || !data.ok) throw new Error(data.error || ('HTTP ' + resp.status));
    const total = data.paginacion.total;
    if (total > 0 && data.data.length === 0 && IR.offset > 0) { IR.offset = Math.floor((total - 1) / IR_LIMITE) * IR_LIMITE; reintentar = true; }
    else { IR.resp = data; if (!IR.personalizado) { IR.desde = data.periodo.desde; IR.hasta = data.periodo.hasta; } }
  } catch (err) {
    if (err.name === 'AbortError' || seq !== IR.seq) return;
    IR.error = err.message;
  } finally {
    if (seq === IR.seq) { IR.cargando = false; if (!reintentar) rtRenderVistaActual(); }
  }
  if (reintentar) irCargar();
}
function irReiniciar() { IR.offset = 0; IR.expandido = null; IR.confirmar = null; }
// Con Ingresos recientes activa, en escritorio «Sucursales», «Actualizar» y la hora de actualizacion pasan a la barra superior (ahorra una fila).
// En movil no hay lugar en la barra superior: quedan donde estaban. Son los mismos nodos (mismos ids y eventos), solo cambian de lugar.
function irUbicarAcciones() {
  const bar = document.getElementById('rtBar'), top = document.querySelector('header.topbar .top-actions');
  if (!bar || !top) return;
  const activa = bar.classList.contains('ir-activa') || bar.classList.contains('ir-en-top');
  const enTop = bar.classList.contains('ir-activa') && !(typeof ovEsMovil === 'function' && ovEsMovil());
  const cont = document.querySelector('header.topbar .ir-top-acc');
  const estado = document.querySelector('.rt-status'), fin = document.querySelector('.fbar-end');
  if (!estado || !fin) return;
  if (enTop && !cont) {
    const c = document.createElement('div'); c.className = 'ir-top-acc';
    c.appendChild(estado); c.appendChild(fin);
    top.insertBefore(c, top.firstChild);
  } else if (!enTop && cont) {
    bar.appendChild(estado); bar.appendChild(fin); cont.remove();
  }
  bar.classList.toggle('ir-en-top', enTop);
  if (!activa) bar.classList.remove('ir-en-top');
}
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', () => irUbicarAcciones());

function irAplicar(fn, foco) { fn(); if (foco) IR.foco = foco; irReiniciar(); irCargar(); }
// Redibuja conservando el scroll; despues enfoca 'foco' y deja visible 'mostrar' (selector) por debajo del encabezado fijo de la app.
function irRedibujar(foco, mostrar) { if (foco) IR.foco = foco; IR.mostrar = mostrar || null; IR.scrollY = window.scrollY; rtRenderVistaActual(); }
function irAltoCabecera() { const h = document.querySelector('header.topbar'); return h ? Math.round(h.getBoundingClientRect().bottom) : 0; }
function irVisible(sel) { return [...document.querySelectorAll(sel)].find(e => e.offsetParent !== null) || null; } // la tabla y las tarjetas conviven: el elemento visible
function irAsegurarVisible(el, margen) {
  if (!el || !el.getBoundingClientRect) return;
  const m = margen === undefined ? 10 : margen, tope = irAltoCabecera() + m, r = el.getBoundingClientRect();
  if (r.top < tope) window.scrollBy(0, r.top - tope);                                                              // lo tapa el encabezado fijo
  else if (r.bottom > window.innerHeight - m) window.scrollBy(0, Math.min(r.bottom - window.innerHeight + m, r.top - tope)); // queda fuera por abajo, sin tapar el inicio
}
function irRestaurarFoco() {
  if (IR.scrollY !== null && IR.scrollY !== undefined) { window.scrollTo(0, IR.scrollY); IR.scrollY = null; }
  const foco = IR.foco, mostrar = IR.mostrar;
  IR.foco = null; IR.mostrar = null;
  if (foco) { const sel = '[data-ir-foco="' + foco + '"]'; const el = irVisible(sel) || document.querySelector(sel); if (el && el.focus) el.focus({ preventScroll: true }); }
  if (mostrar) irAsegurarVisible(irVisible(mostrar));
}
// Teclado: Escape cierra lo ultimo abierto (confirmacion, panel de sucursales, informacion, detalle) y devuelve el foco a quien lo abrio.
function irTecla(e) {
  if (!e || e.key !== 'Escape') return;
  if (IR.confirmar) { const c = IR.confirmar; IR.confirmar = null; irRedibujar('excluir-' + c, '.ir-alcance'); }
  else if (IR.panelSuc) { IR.panelSuc = false; irRedibujar('alcance', '.ir-alcance'); }
  else if (IR.info) { IR.info = false; irRedibujar('info', '.ir-cab'); }
  else if (IR.expandido) { const c = IR.expandido; IR.expandido = null; irRedibujar('det-' + c, '[data-ir-fila="' + c + '"]'); }
  else return;
  if (e.preventDefault) e.preventDefault();
}

// ── Piezas pequeñas ─────────────────────────────────────────────────────────────────────────────
function irBoton(texto, clase, onClick, attrs) {
  const b = rtEl('button', { className: clase, text: texto, attrs: attrs || {} });
  b.type = 'button'; b.addEventListener('click', onClick); return b;
}
function irPildora(f) {
  const tono = IR_TONO[f.lectura] || 'neutral';
  return rtEl('span', { className: 'ir-pill ir-pill-' + tono, text: (IR_LECTURAS.find(l => l[0] === f.lectura) || [0, f.lectura_etiqueta])[1], attrs: { title: f.lectura_etiqueta || '' } });
}
function irNoDisponible(motivo) { // "—" con su razon, accesible
  const s = rtEl('span', { className: 'ir-nd', text: '—', attrs: { title: motivo } });
  s.appendChild(rtEl('span', { className: 'ov-solo-lectores', text: ' no disponible: ' + motivo }));
  return s;
}
function irMotivoSinDias(f) {
  const c = f.calidad_historial || {};
  if ((c.motivos || []).includes('stock_sucursales_atrasado')) return 'el stock de una sucursal está atrasado';
  if ((c.motivos || []).includes('stock_sucursales_fecha_desconocida')) return 'la fecha del stock de una sucursal es desconocida';
  if ((c.motivos || []).includes('saldo_negativo')) return 'el stock reconstruido da saldo negativo';
  return 'el stock no cuadra con los movimientos';
}

// ── Encabezado, alcance, aviso, panel de sucursales ─────────────────────────────────────────────
function irEncabezado(host, resp) {
  const cab = rtEl('div', { className: 'ir-cab' });
  const tit = rtEl('div');
  tit.appendChild(rtEl('h3', { className: 'ir-titulo', text: 'Ingresos recientes' }));
  const P = resp && resp.periodo;
  const movil = ovEsMovil();
  tit.appendChild(rtEl('p', { className: 'ir-sub', text: !P ? 'Consultando el período…' : (movil
    ? 'Último ingreso ' + irDM(P.desde) + ' al ' + irDM(P.hasta) + ' · ' + P.dias + ' días · corte ' + irDM(P.corte)
    : 'Último ingreso entre el ' + irDMY(P.desde) + ' y el ' + irDMY(P.hasta) + ' · ' + P.dias + ' días · corte ' + irDMY(P.corte) + ' (cierre de ayer)') }));
  cab.appendChild(tit);
  cab.appendChild(irBoton(movil ? 'Información' : 'Información de los datos', 'ir-link' + (IR.info ? ' ir-activo' : ''), () => { IR.info = !IR.info; irRedibujar('info', '.ir-cab'); },
    { 'aria-expanded': IR.info ? 'true' : 'false', 'aria-controls': 'irInfo', 'aria-label': 'Información de los datos', 'data-ir-foco': 'info' }));
  host.appendChild(cab);
}

function irAlcance(host, resp) {
  const centros = resp ? (resp.sucursales || []) : irCentrosEfectivos(RT_CENTROS, IR.excluidas);
  const no = irLocalesNoAlineados(resp);
  const fila = rtEl('div', { className: 'ir-alcance' });
  const abrir = rtEl('button', { className: 'ir-alcance-btn' + (IR.panelSuc ? ' ir-activo' : ''), attrs: { 'aria-expanded': IR.panelSuc ? 'true' : 'false', 'aria-controls': 'irPanelSuc', 'data-ir-foco': 'alcance' } });
  abrir.type = 'button';
  if (!ovEsMovil()) abrir.appendChild(rtEl('b', { text: 'Sucursales: ' }));
  if (ovEsMovil()) { abrir.setAttribute('title', centros.map(irNombre).join(', ')); abrir.appendChild(document.createTextNode(centros.length + (centros.length === 1 ? ' sucursal' : ' sucursales'))); }
  else abrir.appendChild(document.createTextNode(centros.length ? centros.map(irNombre).join(', ') : 'ninguna'));
  const estado = rtEl('span', { className: 'ir-estado ' + (!resp ? '' : (no.length ? 'ir-estado-alerta' : 'ir-estado-ok')) });
  estado.textContent = !resp ? 'Consultando…' : (no.length ? 'Stock desactualizado' : 'Stock al día · ' + irFechaStock(resp).replace(/^al /, ''));
  abrir.appendChild(estado);
  abrir.appendChild(rtEl('span', { className: 'ir-caret', text: IR.panelSuc ? ' ▴' : ' ▾', attrs: { 'aria-hidden': 'true' } }));
  abrir.addEventListener('click', () => { IR.panelSuc = !IR.panelSuc; IR.confirmar = null; irRedibujar('alcance', '.ir-alcance'); });
  fila.appendChild(abrir);
  if (IR.excluidas.length) {
    const ex = rtEl('span', { className: 'ir-excluidas' });
    ex.appendChild(document.createTextNode('Excluida' + (IR.excluidas.length > 1 ? 's' : '') + ' de esta vista: ' + IR.excluidas.map(irNombre).join(', ') + ' · ventas y stock no la incluyen. '));
    ex.appendChild(irBoton('Volver a incluir', 'ir-link', () => irAplicar(() => { IR.excluidas = []; }, 'alcance')));
    fila.appendChild(ex);
  }
  const global = IR_OPERATIVAS.filter(c => !RT_CENTROS.includes(c));
  if (global.length) fila.appendChild(rtEl('span', { className: 'ir-excluidas', text: 'Sin considerar por el botón «Sucursales» de la barra superior: ' + global.map(irNombre).join(', ') + '.' }));
  host.appendChild(fila);
}

function irAviso(host, resp) {
  const no = irLocalesNoAlineados(resp);
  if (!no.length) return;
  const caja = rtEl('div', { className: 'ir-aviso', attrs: { role: 'status' } });
  const txt = rtEl('p', { className: 'ir-aviso-txt' });
  txt.appendChild(rtEl('b', { text: no.map(irTextoLocal).join(' · ') + '. ' }));
  txt.appendChild(document.createTextNode('Sin un stock al corte no se calculan días con stock ni stock previo: los códigos figuran como Historial insuficiente.'));
  caja.appendChild(txt);
  const acc = rtEl('div', { className: 'ir-aviso-acc' });
  acc.appendChild(irBoton('Revisar sucursales', 'ir-btn-rojo', () => { IR.panelSuc = true; irRedibujar('panel', '.ir-alcance'); }, { 'data-ir-foco': 'revisar' }));
  acc.appendChild(irBoton('Reintentar', 'ir-btn', () => irCargar()));
  caja.appendChild(acc);
  host.appendChild(caja);
}

function irPanelSucursales(host, resp) {
  if (!IR.panelSuc) return;
  // tabindex -1: el foco puede ir al panel al abrirlo desde "Revisar sucursales"; el orden de tabulacion lo deja justo despues de la linea de alcance
  const panel = rtEl('section', { className: 'ir-panel-suc', attrs: { id: 'irPanelSuc', tabindex: '-1', 'data-ir-foco': 'panel', 'aria-label': 'Sucursales del alcance' } });
  panel.appendChild(rtEl('p', { className: 'ir-nota', text: 'Excluir un local quita sus ventas y su stock de todos los números de esta vista. Es una decisión tuya: nunca se excluye automáticamente.' }));
  const por = resp && resp.stock_actual ? resp.stock_actual.sucursales.por_centro : {};
  const ult = resp && resp.ventas ? resp.ventas.ultima_venta_observada_por_centro : {};
  const lista = rtEl('div', { className: 'ir-suc-lista' });
  const cab = rtEl('div', { className: 'ir-suc-fila ir-suc-cab', attrs: { 'aria-hidden': 'true' } });
  ['Sucursal', 'Stock al', 'Estado', 'Última venta', ''].forEach(t => cab.appendChild(rtEl('span', { text: t })));
  lista.appendChild(cab);
  IR_OPERATIVAS.filter(c => RT_CENTROS.includes(c)).forEach(c => {
    const exc = IR.excluidas.includes(c);
    const confirmando = IR.confirmar === c;
    const d = por[c];
    // Estructura estable por local: 1.ª linea = nombre + accion; debajo = fecha de stock, estado y ultima venta.
    const fila = rtEl('div', { className: 'ir-suc-fila' + (d && d.estado !== 'ok' ? ' ir-suc-alerta' : '') + (exc ? ' ir-suc-excluida' : '') + (confirmando ? ' ir-suc-confirma' : '') });
    fila.appendChild(rtEl('b', { className: 'ir-suc-nombre', text: irNombre(c) }));
    const acc = rtEl('span', { className: 'ir-suc-acc' });
    if (confirmando) {
      acc.appendChild(irBoton('Cancelar', 'ir-btn', () => { IR.confirmar = null; irRedibujar('excluir-' + c, '.ir-alcance'); }, { 'data-ir-foco': 'cancelar' }));
      acc.appendChild(irBoton('Confirmar exclusión', 'ir-btn-rojo', () => irAplicar(() => { IR.excluidas = IR.excluidas.concat([c]); IR.confirmar = null; }, 'alcance')));
    } else if (exc) {
      acc.appendChild(irBoton('Volver a incluir', 'ir-btn', () => irAplicar(() => { IR.excluidas = IR.excluidas.filter(x => x !== c); }, 'alcance')));
    } else {
      acc.appendChild(irBoton('Excluir…', 'ir-btn', () => { IR.confirmar = c; irRedibujar('cancelar', '.ir-alcance'); }, { 'aria-label': 'Excluir ' + irNombre(c) + ' de esta vista', 'data-ir-foco': 'excluir-' + c }));
    }
    fila.appendChild(acc);
    const datos = rtEl('div', { className: 'ir-suc-datos' });
    const est = exc ? 'Excluida de esta vista' : (!d ? '—' : (d.estado === 'ok' ? 'Al día' : (d.estado === 'atrasado' ? 'Atrasado ' + d.dias_atraso + (d.dias_atraso === 1 ? ' día' : ' días') : 'Fecha desconocida')));
    datos.appendChild(rtEl('span', { text: exc ? '—' : (d ? irDM(d.fecha_actualizacion) : '—'), attrs: { 'data-rotulo': 'Stock al' } }));
    datos.appendChild(rtEl('span', { className: 'ir-suc-estado', text: est, attrs: { 'data-rotulo': 'Estado' } }));
    datos.appendChild(rtEl('span', { text: exc ? '—' : irDM(ult[c]), attrs: { 'data-rotulo': 'Última venta' } }));
    fila.appendChild(datos);
    lista.appendChild(fila);
    if (confirmando) lista.appendChild(rtEl('p', { className: 'ir-confirma', attrs: { role: 'alert' }, text: 'Si excluís ' + irNombre(c) + ', todas las ventas y el stock de esta vista se recalculan SIN esa sucursal (contadores, tabla y detalle). No cambia la selección de sucursales del resto de la app.' }));
  });
  panel.appendChild(lista);
  panel.appendChild(rtEl('p', { className: 'ir-nota', text: 'Cipo San Martín (cerrada) no se considera. Las sucursales que quitaste con el botón «Sucursales» de la barra superior tampoco entran.' }));
  host.appendChild(panel);
}

// ── Información de los datos (todas las explicaciones, una sola vez) ─────────────────────────────
function irInfo(host, resp) {
  if (!IR.info) return;
  const caja = rtEl('section', { className: 'ir-info', attrs: { id: 'irInfo', 'aria-label': 'Información de los datos' } });
  const bloque = (titulo, texto) => { const d = rtEl('div'); d.appendChild(rtEl('h4', { text: titulo })); d.appendChild(rtEl('p', { text: texto })); caja.appendChild(d); };
  if (!resp) { caja.appendChild(rtEl('p', { text: 'Se completa cuando llega la consulta.' })); host.appendChild(caja); return; }
  const por = Object.values(resp.stock_actual.sucursales.por_centro);
  bloque('Stock de sucursales', por.map(c => irNombre(c.centro) + ' al ' + irDM(c.fecha_actualizacion) + (c.estado === 'ok' ? '' : (c.estado === 'atrasado' ? ' (atrasado)' : ' (fecha desconocida)'))).join(' · ')
    + '. Cada local informa la fecha a la que corresponde su stock; si alguno está atrasado respecto del corte, no se calculan días con stock ni stock previo.');
  bloque('Depósito 90', 'Stock informado por el sistema · sin fecha de actualización disponible.');
  const fa = resp.stock_actual.fallados_93;
  bloque('Fallados 93', 'No suma al stock operativo.' + (fa && fa.fecha_actualizacion ? ' Última actualización: ' + irHM(fa.fecha_actualizacion) + '.' : ' Sin fecha verificada.'));
  bloque('Ventas observadas', 'Son las ventas registradas hasta el ' + irDMY(resp.ventas.observadas_hasta) + '. Sysneo no informa cuándo se cargan, así que no se puede garantizar que estén completas: «sin ventas» significa «sin ventas observadas». «Con ventas» y «Vendió y agotado» siguen valiendo; «En observación», «Sin exposición» y «Revisar: sin ventas» se apoyan en la ausencia de ventas y podrían ser falsas por ese margen.');
  bloque('Datos no disponibles (—)', 'Un guion indica que el dato no se pudo calcular; no es cero. El motivo figura en el detalle de cada código y, si es general, en el aviso de arriba.');
  bloque('Corte', 'El corte es el cierre de ayer (hora de Argentina): los ingresos de hoy no entran en la consulta.');
  host.appendChild(caja);
}

// ── Filtros ────────────────────────────────────────────────────────────────────────────────────
function irControlesFiltro(host, resp) {
  const fila = rtEl('div', { className: 'ir-controles' });
  const rap = rtEl('div', { className: 'ir-rapidos', attrs: { role: 'group', 'aria-label': 'Período' } });
  IR_ATAJOS.forEach(n => {
    const act = !IR.personalizado && IR.dias === n;
    rap.appendChild(irBoton(n + ' d', 'ir-rapido' + (act ? ' ir-activo' : ''), () => irAplicar(() => { IR.personalizado = false; IR.dias = n; IR.errorRango = null; }), { 'aria-pressed': act ? 'true' : 'false', 'aria-label': 'Últimos ' + n + ' días' }));
  });
  rap.appendChild(irBoton('Personalizado', 'ir-rapido' + (IR.personalizado ? ' ir-activo' : ''), () => { IR.personalizado = true; if (resp && !IR.desde) { IR.desde = resp.periodo.desde; IR.hasta = resp.periodo.hasta; } irRedibujar('personalizado'); }, { 'aria-pressed': IR.personalizado ? 'true' : 'false', 'data-ir-foco': 'personalizado' }));
  fila.appendChild(rap);
  const sel = (rotulo, opciones, valor, onChange) => {
    const s = rtEl('select', { className: 'ir-select', attrs: { 'aria-label': rotulo } });
    opciones.forEach(([v, t]) => s.appendChild(rtEl('option', { attrs: { value: v }, text: t })));
    s.value = valor; s.addEventListener('change', () => onChange(s.value)); return s;
  };
  fila.appendChild(sel('Tipo de ingreso', IR_TIPOS, IR.tipo, v => irAplicar(() => { IR.tipo = v; })));
  fila.appendChild(sel('Orden', IR_ORDENES, IR.orden, v => irAplicar(() => { IR.orden = v; })));
  const nF = RT_FILTRO ? Object.keys(RT_FILTRO).filter(k => !['talle', 'color'].includes(k)).length : 0;
  fila.appendChild(irBoton('Marca, rubro, código' + (nF ? ' (' + nF + ')' : '') + (IR.filtrosAbiertos ? ' ▴' : ' ▾'), 'ir-btn' + (IR.filtrosAbiertos ? ' ir-activo' : ''), () => { IR.filtrosAbiertos = !IR.filtrosAbiertos; irRedibujar('filtros'); }, { 'aria-expanded': IR.filtrosAbiertos ? 'true' : 'false', 'data-ir-foco': 'filtros' }));
  host.appendChild(fila);
  if (IR.personalizado) {
    const r = rtEl('form', { className: 'ir-rango' });
    const campo = (rot, id, valor, max) => { const l = rtEl('label', { text: rot + ' ' }); const i = rtEl('input', { className: 'form-control ir-fecha', attrs: { type: 'date', id } }); i.value = valor || ''; if (max) i.setAttribute('max', max); l.appendChild(i); r.appendChild(l); return i; };
    const corte = resp && resp.periodo ? resp.periodo.corte : '';
    const d = campo('Desde', 'irDesde', IR.desde, corte), h = campo('Hasta', 'irHasta', IR.hasta, corte);
    // al lado de las fechas: cuantos dias se estan consultando (se actualiza al escribir o elegir)
    const dias = rtEl('span', { className: 'ir-dias-rango', attrs: { id: 'irDiasRango', role: 'status', 'aria-live': 'polite' } });
    const pintarDias = () => { const t = irTextoDiasRango(d.value, h.value); dias.textContent = t.texto; dias.classList.toggle('ir-dias-excede', t.excede); const e = document.querySelector('.ir-error'); if (e && e.parentNode) { e.parentNode.removeChild(e); IR.errorRango = null; } };
    [d, h].forEach(x => { x.addEventListener('input', pintarDias); x.addEventListener('change', pintarDias); });
    pintarDias(); r.appendChild(dias);
    const ap = rtEl('button', { className: 'ir-btn ir-btn-rojo', text: 'Aplicar' }); ap.type = 'submit'; r.appendChild(ap);
    r.addEventListener('submit', e => {
      if (e && e.preventDefault) e.preventDefault();
      const msg = irValidarRango(d.value, h.value, corte);
      IR.errorRango = msg; if (msg) { irRedibujar(); return; }
      irAplicar(() => { IR.desde = d.value; IR.hasta = h.value; });
    });
    host.appendChild(r);
    if (IR.errorRango) host.appendChild(rtEl('p', { className: 'rr-error ir-error', text: IR.errorRango, attrs: { role: 'alert' } }));
  }
  if (IR.filtrosAbiertos) {
    const caja = rtEl('div', { className: 'ir-filtros-form' });
    rtFormularioFiltro(caja, () => { IR.filtrosAbiertos = false; irReiniciar(); irCargar(); }, { sinTalleColor: true, compacto: true, textoAplicar: 'Aplicar', textoLimpiar: 'Limpiar' });
    host.appendChild(caja);
  }
}
function irFiltrosActivos(host) {
  if (!RT_FILTRO) return;
  const fila = rtEl('div', { className: 'ov-activos', attrs: { role: 'group', 'aria-label': 'Filtros activos' } });
  [['codigo', 'Código'], ['marca', 'Marca'], ['rubro', 'Rubro'], ['subrubro', 'Subrubro']].forEach(([campo, nombre]) => {
    const v = RT_FILTRO[campo]; if (!v) return;
    const texto = nombre + ': ' + (Array.isArray(v) ? v.join(', ') : v);
    const chip = rtEl('span', { className: 'ov-chip-filtro' });
    chip.appendChild(rtEl('span', { text: texto }));
    const x = rtEl('button', { text: '×', attrs: { 'aria-label': 'Quitar filtro ' + texto, title: 'Quitar' } }); x.type = 'button';
    x.addEventListener('click', () => { const f = Object.assign({}, RT_FILTRO); delete f[campo]; RT_FILTRO = Object.keys(f).length ? f : null; RT_PRODUCTOS_FILTRO_ORIGEN = null; irAplicar(() => {}); });
    chip.appendChild(x); fila.appendChild(chip);
  });
  if (fila.children.length) host.appendChild(fila);
}
function irBarraFiltros(host, resp) { // escritorio: en linea; movil: plegable con resumen de lo activo
  if (!ovEsMovil()) { irControlesFiltro(host, resp); irFiltrosActivos(host); return; }
  const det = rtEl('details', { className: 'ir-plegable' });
  if (IR.filtrosMovilAbierto) det.setAttribute('open', '');
  const sum = rtEl('summary');
  sum.appendChild(rtEl('span', { className: 'ir-fp-tit', text: 'Filtros' }));
  sum.appendChild(rtEl('span', { className: 'ir-fp-res', text: irResumenFiltros(IR, RT_FILTRO) }));
  det.appendChild(sum);
  det.addEventListener('toggle', () => { IR.filtrosMovilAbierto = det.open; });
  irControlesFiltro(det, resp);
  irFiltrosActivos(det);
  host.appendChild(det);
}

// ── Contadores ─────────────────────────────────────────────────────────────────────────────────
function irContadores(host, resp) {
  const grupo = rtEl('div', { className: 'ir-contadores', attrs: { role: 'group', 'aria-label': 'Lecturas comerciales' } });
  IR_LECTURAS.forEach(([clave, corto]) => {
    const v = irValorContador(resp, clave);
    const act = IR.lectura === clave;
    const completo = resp && resp.lecturas ? resp.lecturas[clave] : corto;
    const b = rtEl('button', { className: 'ir-cont ir-cont-' + (IR_TONO[clave] || 'neutral') + (act ? ' ir-activo' : ''),
      attrs: { 'aria-pressed': act ? 'true' : 'false', 'aria-label': completo + ': ' + (v === null ? 'dato no disponible' : v), 'data-ir-foco': 'cont-' + clave } });
    b.type = 'button';
    b.appendChild(rtEl('span', { className: 'ir-cont-num', text: v === null ? '—' : nf.format(v) }));
    b.appendChild(rtEl('span', { className: 'ir-cont-nom', text: corto }));
    if (v === null && resp) b.setAttribute('title', 'No se clasifica mientras el stock de alguna sucursal no esté al corte');
    b.addEventListener('click', () => irAplicar(() => { IR.lectura = act ? '' : clave; }, 'cont-' + clave));
    grupo.appendChild(b);
  });
  host.appendChild(grupo);
}
function irAyudaLecturas(resp) {
  const ay = rtEl('div', { className: 'ir-ayuda' });
  if (IR.ayuda) {
    const u = resp && resp.umbrales ? resp.umbrales : null;
    const dl = rtEl('dl', { className: 'ir-ayuda-lista' });
    [['Revisar: sin ventas', 'Tiene stock en sucursales y no vendió: ' + (u ? 'el mínimo es el p90 de su rubro (si tiene ' + u.n_min_muestra_rubro + ' códigos o más calibrados) o ' + u.minimo_dias_global + ' días con stock' : 'supera el mínimo de días con stock') + '.'],
      ['Historial insuficiente', 'El stock no cuadra con los movimientos o está atrasado: no se calculan días con stock ni stock previo.'],
      ['Sin exposición', 'Todo el stock sigue en el Depósito 90: no llegó a sucursales.'],
      ['En observación', 'Sin ventas todavía y sin llegar al mínimo de días con stock.'],
      ['Vendió y agotado', 'Vendió desde su último ingreso y ya no queda stock en sucursales ni en el Depósito 90.'],
      ['Con ventas', 'Vendió desde su último ingreso.']].forEach(([t, d]) => { dl.appendChild(rtEl('dt', { text: t })); dl.appendChild(rtEl('dd', { text: d })); });
    ay.appendChild(dl);
  }
  return ay;
}

// ── Tabla (escritorio) y tarjetas (móvil) ───────────────────────────────────────────────────────
function irCeldaProducto(f) {
  const w = rtEl('div', { className: 'ir-prod' });
  const l1 = rtEl('div', { className: 'ir-prod-l1' });
  l1.appendChild(rtEl('b', { text: f.cod })); l1.appendChild(document.createTextNode(' ' + (f.nombre || '')));
  w.appendChild(l1);
  w.appendChild(rtEl('div', { className: 'ir-meta', text: [f.marca, f.rubro].filter(Boolean).join(' · ') }));
  return w;
}
function irCeldaIngreso(f) {
  const w = rtEl('div');
  w.appendChild(rtEl('div', { text: irDM(f.ultimo_ingreso) + ' · ' + irNum(f.unidades_ingresadas) + ' u.', attrs: { title: irDMY(f.ultimo_ingreso) } }));
  w.appendChild(rtEl('div', { className: 'ir-meta', text: (IR_TIPO_TEXTO[f.tipo_ingreso] || f.tipo_ingreso) + ' · hace ' + f.dias_desde_ingreso + ' d' }));
  return w;
}
function irCeldaDias(f) {
  if (f.dias_con_stock_sucursales === null || f.dias_con_stock_sucursales === undefined) return irNoDisponible(irMotivoSinDias(f));
  return document.createTextNode(f.dias_con_stock_sucursales + ' de ' + f.dias_observados);
}
function irCeldaLectura(f) {
  const w = rtEl('div', { className: 'ir-lect' });
  w.appendChild(irPildora(f));
  if (f.lectura === 'sin_ventas_con_stock' && f.minimo_dias) w.appendChild(rtEl('div', { className: 'ir-meta', text: 'mín. ' + f.minimo_dias.valor + ' d · ' + (f.minimo_dias.fuente === 'rubro' ? 'del rubro' : 'global') }));
  return w;
}
function irBotonDetalle(f, abierto) {
  const b = rtEl('button', { className: 'ir-det-btn', text: abierto ? 'Cerrar' : 'Detalle', attrs: { 'aria-expanded': abierto ? 'true' : 'false', 'aria-label': (abierto ? 'Cerrar' : 'Ver') + ' detalle de ' + f.cod, 'data-ir-foco': 'det-' + f.cod } });
  b.type = 'button'; b.appendChild(rtEl('span', { text: abierto ? ' ▴' : ' ▾', attrs: { 'aria-hidden': 'true' } }));
  b.addEventListener('click', e => { if (e && e.stopPropagation) e.stopPropagation(); IR.expandido = abierto ? null : f.cod; irRedibujar('det-' + f.cod, '[data-ir-fila="' + f.cod + '"]'); });
  return b;
}

function irDetalle(f, resp) {
  const w = rtEl('div', { className: 'ir-detalle' });
  const par = (rot, valor) => { const d = rtEl('div', { className: 'ir-d-item' }); d.appendChild(rtEl('span', { className: 'ir-d-rot', text: rot })); const v = rtEl('span', { className: 'ir-d-val' }); if (valor && valor.nodeType) v.appendChild(valor); else v.textContent = valor; d.appendChild(v); return d; };
  const grid = rtEl('div', { className: 'ir-d-grid' });
  grid.appendChild(par('Último ingreso', irDMY(f.ultimo_ingreso) + ' · ' + irNum(f.unidades_ingresadas) + ' u. · ' + (IR_TIPO_TEXTO[f.tipo_ingreso] || f.tipo_ingreso)));
  grid.appendChild(par('Primer ingreso registrado', irDMY(f.primer_ingreso_registrado) + (f.primer_ingreso_estado === 'indeterminado' ? ' (no verificable)' : '')));
  grid.appendChild(par('Ventas observadas', irNum(f.ventas_desde_ingreso) + ' u.' + (f.devoluciones_desde_ingreso ? ' (' + f.devoluciones_desde_ingreso + ' devuelta' + (f.devoluciones_desde_ingreso === 1 ? '' : 's') + ')' : '') + (f.ventas_dia_ingreso ? ' · ' + f.ventas_dia_ingreso + ' el día del ingreso' : '')));
  grid.appendChild(par('Días con stock', f.dias_con_stock_sucursales === null ? irNoDisponible(irMotivoSinDias(f)) : f.dias_con_stock_sucursales + ' de ' + f.dias_observados + ' días'));
  grid.appendChild(par('Stock previo en sucursales', f.stock_previo_sucursales === null ? irNoDisponible('sin un stock al corte no hay saldo previo') : irNum(f.stock_previo_sucursales) + ' u.'));
  grid.appendChild(par('Stock previo en Depósito 90', irNoDisponible('no se puede reconstruir')));
  const m = f.minimo_dias;
  grid.appendChild(par('Umbral aplicado', m ? m.valor + ' días con stock · ' + (m.fuente === 'rubro' ? 'p90 del rubro (' + m.n_muestra + ' códigos)' : 'umbral global') : '—'));
  grid.appendChild(par('Variantes agotadas con ventas', f.variantes_agotadas_con_ventas ? f.variantes_agotadas_con_ventas.variantes + ' · ' + f.variantes_agotadas_con_ventas.unidades_vendidas + ' u.' : irNoDisponible('depende del stock actual')));
  if (f.fallados_93) grid.appendChild(par('Fallados 93', irNum(f.fallados_93) + ' u. (no suman al stock)'));
  w.appendChild(grid);
  if (f.reingreso_con_stock_previo) w.appendChild(rtEl('p', { className: 'ir-nota ir-nota-aviso', text: 'Reingreso con stock previo: había ' + irNum(f.stock_previo_sucursales) + ' u. en sucursales antes del ingreso. Las ventas son del código desde la fecha de ingreso; su atribución al lote nuevo está pendiente.' }));
  if (f.calidad_historial && f.calidad_historial.estado !== 'ok' && f.motivo) w.appendChild(rtEl('p', { className: 'ir-nota', text: f.motivo }));
  // desglose por sucursal
  const t = rtEl('table', { className: 'ir-suc-tabla' });
  const th = rtEl('thead'), trh = rtEl('tr');
  ['Sucursal', 'Stock', 'Ventas obs.', 'Días con stock', 'Stock al'].forEach(x => trh.appendChild(rtEl('th', { text: x, attrs: { scope: 'col' } })));
  th.appendChild(trh); t.appendChild(th);
  const tb = rtEl('tbody');
  (f.por_sucursal || []).forEach(s => {
    const tr = rtEl('tr');
    tr.appendChild(rtEl('td', { text: irNombre(s.centro) }));
    tr.appendChild(rtEl('td', { text: irNum(s.stock) }));
    tr.appendChild(rtEl('td', { text: irNum(s.ventas) }));
    const td = rtEl('td'); if (s.dias_con_stock === null || s.dias_con_stock === undefined) td.appendChild(irNoDisponible(irMotivoSinDias(f))); else td.textContent = String(s.dias_con_stock); tr.appendChild(td);
    const rf = s.referencia_stock;
    tr.appendChild(rtEl('td', { text: rf ? irDM(rf.fecha_actualizacion) + (rf.estado === 'ok' ? '' : ' · ' + (rf.estado === 'atrasado' ? 'atrasado' : 'fecha desconocida')) : '—' }));
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  const cont = rtEl('div', { className: 'ir-suc-tabla-wrap' }); cont.appendChild(t);
  w.appendChild(rtEl('h5', { className: 'ir-d-sub', text: 'Por sucursal' }));
  w.appendChild(cont);
  return w;
}

function irTabla(datos, resp) {
  const wrap = rtEl('div', { className: 'ir-tabla-wrap' });
  const tabla = rtEl('table', { className: 'ir-tabla' });
  const fechaStock = irFechaStock(resp);
  const cols = [['Producto', 'ir-c-prod'], ['Último ingreso', 'ir-c-ing'], ['Ventas obs.', 'ir-c-num'], ['Días con stock', 'ir-c-num'], ['Stock suc.', 'ir-c-num', fechaStock], ['Dep. 90', 'ir-c-num', 'sin fecha'], ['Lectura', 'ir-c-lect'], ['', 'ir-c-det']];
  const thead = rtEl('thead'), trh = rtEl('tr');
  cols.forEach(([t, cls, sub]) => {
    const par = IR_ORDEN_COLUMNA[t];
    const activo = par ? (IR.orden === par[0] ? 'ascending' : IR.orden === par[1] ? 'descending' : null) : null;
    const th = rtEl('th', { className: cls + (par ? ' ir-th-orden' : ''), attrs: { scope: 'col' } });
    if (activo) th.setAttribute('aria-sort', activo);
    if (par) {
      // un clic ordena de menor a mayor (o A–Z); otro clic invierte. El orden "Más urgentes primero" se recupera desde el selector.
      const b = irBoton(t + (activo ? (activo === 'ascending' ? ' ▲' : ' ▼') : ''), 'ir-th-btn', () => irAplicar(() => { IR.orden = activo === 'ascending' ? par[1] : par[0]; }, 'th-' + par[0]), { 'data-ir-foco': 'th-' + par[0], 'aria-label': 'Ordenar por ' + t + (activo === 'ascending' ? ', de mayor a menor' : ', de menor a mayor') });
      th.appendChild(b);
    } else th.textContent = t;
    if (sub) th.appendChild(rtEl('span', { className: 'ir-th-sub', text: sub })); if (!t) th.appendChild(rtEl('span', { className: 'ov-solo-lectores', text: 'Detalle' })); trh.appendChild(th); });
  thead.appendChild(trh); tabla.appendChild(thead);
  const tbody = rtEl('tbody');
  datos.forEach(f => {
    const abierto = IR.expandido === f.cod;
    const tr = rtEl('tr', { className: 'ir-fila' + (abierto ? ' ir-fila-abierta' : '') });
    tr.addEventListener('click', () => { IR.expandido = abierto ? null : f.cod; irRedibujar('det-' + f.cod, '[data-ir-fila="' + f.cod + '"]'); });
    tr.setAttribute('data-ir-fila', f.cod);
    const td = (cls, c) => { const x = rtEl('td', { className: cls }); if (c && c.nodeType) x.appendChild(c); else x.textContent = c; tr.appendChild(x); };
    td('ir-c-prod', irCeldaProducto(f)); td('ir-c-ing', irCeldaIngreso(f));
    td('ir-c-num', irNum(f.ventas_desde_ingreso)); td('ir-c-num', irCeldaDias(f));
    td('ir-c-num', irNum(f.stock_sucursales)); td('ir-c-num', irNum(f.stock_deposito_90));
    td('ir-c-lect', irCeldaLectura(f)); td('ir-c-det', irBotonDetalle(f, abierto));
    tbody.appendChild(tr);
    if (abierto) { const trd = rtEl('tr', { className: 'ir-fila-detalle' }); const c = rtEl('td', { attrs: { colspan: '8' } }); c.appendChild(irDetalle(f, resp)); trd.appendChild(c); tbody.appendChild(trd); }
  });
  tabla.appendChild(tbody); wrap.appendChild(tabla);
  return wrap;
}

function irTarjetas(datos, resp) {
  const wrap = rtEl('div', { className: 'ir-tarjetas' });
  const fechaStock = irFechaStock(resp);
  datos.forEach(f => {
    const abierto = IR.expandido === f.cod;
    const c = rtEl('article', { className: 'ir-tarjeta' + (abierto ? ' ir-fila-abierta' : ''), attrs: { 'data-ir-fila': f.cod } });
    const top = rtEl('div', { className: 'ir-t-top' });
    const id = rtEl('div', { className: 'ir-t-id' }); id.appendChild(rtEl('b', { text: f.cod })); id.appendChild(document.createTextNode(' ' + (f.nombre || '')));
    top.appendChild(id);
    top.appendChild(irCeldaLectura(f));
    c.appendChild(top);
    const filaMeta = rtEl('div', { className: 'ir-t-meta' }); // marca/rubro y Detalle comparten renglon: la tarjeta es mas baja y entra mas contenido en la primera pantalla
    filaMeta.appendChild(rtEl('div', { className: 'ir-meta', text: [f.marca, f.rubro].filter(Boolean).join(' · ') }));
    const m = rtEl('dl', { className: 'ir-t-metricas' });
    const met = (rot, val, sub) => { const d = rtEl('div'); d.appendChild(rtEl('dt', { text: rot })); const dd = rtEl('dd'); dd.appendChild(rtEl('b', { text: val })); if (sub) dd.appendChild(rtEl('small', { text: sub })); d.appendChild(dd); m.appendChild(d); };
    met('Ingreso', irDM(f.ultimo_ingreso) + ' · ' + irNum(f.unidades_ingresadas) + ' u.', (IR_TIPO_TEXTO[f.tipo_ingreso] || f.tipo_ingreso));
    met('Ventas obs.', irNum(f.ventas_desde_ingreso), f.dias_con_stock_sucursales === null ? 'días con stock —' : f.dias_con_stock_sucursales + ' de ' + f.dias_observados + ' d con stock');
    met('Stock', irNum(f.stock_sucursales) + ' · Dep. ' + irNum(f.stock_deposito_90), fechaStock ? 'suc. ' + fechaStock : '');
    filaMeta.appendChild(irBotonDetalle(f, abierto));
    c.appendChild(filaMeta);
    c.appendChild(m);
    if (abierto) c.appendChild(irDetalle(f, resp));
    wrap.appendChild(c);
  });
  return wrap;
}

function irPaginacion(p) {
  const pag = rtEl('nav', { className: 'ov-pag ir-pag', attrs: { 'aria-label': 'Paginación' } });
  const devueltos = Math.min(p.limit, Math.max(0, p.total - p.offset));
  pag.appendChild(rtEl('span', { className: 'ov-pag-info', text: 'Mostrando ' + (p.total === 0 ? 0 : p.offset + 1) + '–' + (p.offset + devueltos) + ' de ' + nf.format(p.total) }));
  const paginas = Math.max(1, Math.ceil(p.total / p.limit));
  if (paginas < 2) return pag;
  const actual = Math.floor(p.offset / p.limit) + 1;
  const botones = rtEl('div', { className: 'ov-pag-botones' });
  const flecha = (txt, et, dest, dis) => { const b = irBoton(txt, 'ov-pag-btn', () => { IR.offset = (dest - 1) * IR_LIMITE; IR.expandido = null; irCargar(); }, { 'aria-label': et }); b.disabled = dis; return b; };
  botones.appendChild(flecha('‹', 'Página anterior', actual - 1, actual === 1));
  ogPaginasVisibles(actual, paginas).forEach(n => {
    if (n === '…') { botones.appendChild(rtEl('span', { className: 'ov-pag-gap', text: '…', attrs: { 'aria-hidden': 'true' } })); return; }
    const b = irBoton(String(n), 'ov-pag-btn' + (n === actual ? ' ov-activo' : ''), () => { IR.offset = (n - 1) * IR_LIMITE; IR.expandido = null; irCargar(); }, { 'aria-label': 'Página ' + n });
    if (n === actual) b.setAttribute('aria-current', 'page');
    botones.appendChild(b);
  });
  botones.appendChild(flecha('›', 'Página siguiente', actual + 1, actual === paginas));
  pag.appendChild(botones);
  return pag;
}

function irEsqueleto() {
  const w = rtEl('div', { className: 'ir-esqueleto', attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < 6; i++) { const f = rtEl('div', { className: 'ir-skel-fila' }); [38, 16, 8, 8, 8, 14].forEach(a => f.appendChild(rtEl('span', { className: 'ir-skel', attrs: { style: 'width:' + a + '%' } }))); w.appendChild(f); }
  return w;
}

function irLista(host, resp) {
  const panel = rtEl('section', { className: 'ir-lista', attrs: { 'aria-busy': IR.cargando ? 'true' : 'false', 'aria-label': 'Códigos con ingreso reciente' } });
  const cab = rtEl('div', { className: 'ir-lista-cab' });
  const hay = resp && !IR.cargando && !IR.error;
  cab.appendChild(rtEl('span', { className: 'ir-lista-cuenta', text: resp ? nf.format(resp.paginacion.total) + (resp.paginacion.total === 1 ? ' código' : ' códigos') + (IR.lectura || IR.tipo || RT_FILTRO ? ' con los filtros elegidos' : '') : 'Consultando…' }));
  cab.appendChild(irBoton('¿Cómo se leen las lecturas?' + (IR.ayuda ? ' ▴' : ' ▾'), 'ir-link', () => { IR.ayuda = !IR.ayuda; irRedibujar('ayuda'); }, { 'aria-expanded': IR.ayuda ? 'true' : 'false', 'data-ir-foco': 'ayuda' }));
  panel.appendChild(cab);
  if (IR.ayuda) panel.appendChild(irAyudaLecturas(resp));
  if (IR.error) { const caja = rtEl('div'); panel.appendChild(caja); rtEstado(caja, 'error', 'No se pudieron consultar los ingresos recientes. ' + IR.error, irCargar); }
  else if (!irCentrosEfectivos(RT_CENTROS, IR.excluidas).length) {
    const caja = rtEl('div'); panel.appendChild(caja); rtEstado(caja, 'vacio', 'No quedan sucursales en el alcance. Volvé a incluir al menos una desde «Sucursales».');
  } else if (!resp || (IR.cargando && !hay)) { panel.appendChild(irEsqueleto()); const s = rtEl('p', { className: 'ov-solo-lectores', text: 'Consultando ingresos recientes…', attrs: { role: 'status' } }); panel.appendChild(s); }
  else if (!resp.data.length) {
    const caja = rtEl('div'); panel.appendChild(caja);
    rtEstado(caja, 'vacio', (IR.lectura || IR.tipo || RT_FILTRO) ? 'Ningún código cumple los filtros elegidos en este período.' : 'No hubo ingresos al Depósito 90 en este período.');
    if (IR.lectura || IR.tipo || RT_FILTRO) panel.appendChild(irBoton('Limpiar filtros', 'ir-btn', () => { RT_FILTRO = null; irAplicar(() => { IR.lectura = ''; IR.tipo = ''; }); }));
  } else {
    panel.appendChild(irTabla(resp.data, resp));
    panel.appendChild(irTarjetas(resp.data, resp));
    panel.appendChild(irPaginacion(resp.paginacion));
  }
  host.appendChild(panel);
}

let IR_CARGA_PENDIENTE = false;
function irProgramarCarga() {
  if (IR_CARGA_PENDIENTE) return;
  IR_CARGA_PENDIENTE = true;
  setTimeout(() => { IR_CARGA_PENDIENTE = false; if (typeof RT_VIEW !== 'undefined' && RT_VIEW === 'oportunidades' && OV_SUBVISTA === 'ingresos' && !IR.cargando) irCargar(); }, 0);
}

// Punto de entrada: lo llama renderRTOportunidades cuando la subpestaña activa es "Ingresos recientes".
function irRender(raiz) {
  const resp = IR.resp;
  if (!IR.cargando && !IR.error && IR.clave !== irClaveActual()) irProgramarCarga(); // primera visita o cambio de filtros/sucursales hechos fuera de esta vista
  raiz.addEventListener('keydown', irTecla);
  irEncabezado(raiz, resp);
  irAlcance(raiz, resp);
  irPanelSucursales(raiz, resp);
  irAviso(raiz, resp);
  irInfo(raiz, resp);
  irBarraFiltros(raiz, resp);
  irContadores(raiz, resp);
  irLista(raiz, resp);
  irRestaurarFoco();
}
