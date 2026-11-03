'use strict';
// Oportunidades: VISTA (encabezado, filtros activos, contexto del analisis, grupos, tabla/tarjetas, paginacion). Script clasico que se
// carga despues de oportunidades-explicacion.js y usa los helpers del principal (rtEl, nf, nf1, rtFormularioFiltro, RT_*...).
// Solo presentacion: aca NO se clasifica ningun producto ni se vuelve a correr el motor. Todo lo que se muestra sale de campos que ya
// resuelve croma-api (acciones, rendimiento, motivo, explicacion, cobertura, stock...). Texto de la API: siempre textContent.
// La logica de grupos y contadores vive en oportunidades-grupos.js (pura y con pruebas).

const OV_DIAS_RAPIDOS = [30, 60, 90];
const OV_PRIORIDADES =[['', 'Prioridad: todas'], ['alta', 'Prioridad: alta'], ['media', 'Prioridad: media'], ['baja', 'Prioridad: baja']];
const OV_ESTADOS_REPOSICION = ['reposicion_urgente', 'reponer_desde_deposito', 'reposicion_a_evaluar', 'reposicion_proxima'];
// Severidad de cada estado (igual que RT_ESTADO_CLS de index.html): solo para el punto de color de los chips; el texto de la prioridad
// va aparte, el color nunca es el unico indicador.
const OV_PRIORIDAD_TEXTO = { 'badge-danger': 'prioridad alta', 'badge-warning': 'prioridad media', 'badge-neutral': 'prioridad baja' };

// ── Utilidades de periodo y claves ───────────────────────────────────────────────────────────────
// Dias inclusivos (desde y hasta cuentan), igual que el resto de la app; aritmetica en UTC sobre fechas ISO (sin zona horaria).
function ovDiasPeriodo(desde, hasta) {
  if (!desde || !hasta) return null;
  return Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000) + 1;
}
function ovFechaCorta(iso) { return iso ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '—'; }

// Los contadores dependen de periodo, sucursales y filtros de catalogo, NUNCA del grupo, estado ni prioridad elegidos.
function rtOportunidadesClaveBase() {
  return JSON.stringify([RT_DESDE, RT_HASTA, rtSucursalesEsSubconjunto() ? RT_CENTROS.join(',') : '', RT_FILTRO || null]);
}
function rtOportunidadesParamsBase() {
  const params = rtSucursalesParams(new URLSearchParams({ desde: RT_DESDE, hasta: RT_HASTA }));
  if (RT_FILTRO) rtFiltroAParams(params, RT_FILTRO, ['talle', 'color']);
  return params;
}
// Los filtros de rotacion (origen/destino/minimos) solo tienen sentido cuando la lista es de posible_rotacion.
function ovSoloRotacion() { return RT_OPORTUNIDADES_ESTADO === 'posible_rotacion' || (RT_OPORTUNIDADES_GRUPO === 'rotaciones' && !RT_OPORTUNIDADES_ESTADO); }
function ovHayFiltroExtra() {
  const rot = RT_OPORTUNIDADES_ROTACION;
  return Boolean(RT_OPORTUNIDADES_PRIORIDAD || (ovSoloRotacion() && (RT_OPORTUNIDADES_CONFIANZA || rot.origen || rot.destino || rot.ventasDestinoMin || rot.stockOrigenMin || rot.coberturaOrigenMin)));
}
function ovParamsLista() {
  const params = rtOportunidadesParamsBase();
  params.set('limit', String(RT_OPORTUNIDADES_LIMITE)); params.set('offset', String(RT_OPORTUNIDADES_OFFSET));
  params.set('estado', ogParametroEstado(RT_OPORTUNIDADES_GRUPO, RT_OPORTUNIDADES_ESTADO));
  if (RT_OPORTUNIDADES_PRIORIDAD) params.set('prioridad', RT_OPORTUNIDADES_PRIORIDAD);
  if (ovSoloRotacion()) {
    if (RT_OPORTUNIDADES_CONFIANZA) params.set('confianza', RT_OPORTUNIDADES_CONFIANZA);
    const rot = RT_OPORTUNIDADES_ROTACION;
    if (rot.origen) params.set('rotacion_origen', rot.origen);
    if (rot.destino) params.set('rotacion_destino', rot.destino);
    if (rot.ventasDestinoMin) params.set('rotacion_ventas_destino_min', rot.ventasDestinoMin);
    if (rot.stockOrigenMin) params.set('rotacion_stock_origen_min', rot.stockOrigenMin);
    if (rot.coberturaOrigenMin) params.set('rotacion_cobertura_origen_min', rot.coberturaOrigenMin);
  }
  return params;
}

// ── Carga: listado y conteos unicos por grupo ───────────────────────────────────────────────────
async function rtCargarOportunidades() {
  if (RT_OPORTUNIDADES_ABORT) RT_OPORTUNIDADES_ABORT.abort();
  const controller = new AbortController();
  RT_OPORTUNIDADES_ABORT = controller;
  const seq = ++RT_OPORTUNIDADES_SEQ;
  const clave = rtOportunidadesClaveBase();
  RT_OPORTUNIDADES_LOADING = true; RT_OPORTUNIDADES_ERROR = null;
  rtRenderVistaActual();
  let reintentarUltima = false;
  try {
    const resp = await fetch(STOCK_API_URL + '/analisis/oportunidades?' + ovParamsLista().toString(), { signal: controller.signal });
    const data = await resp.json();
    if (seq !== RT_OPORTUNIDADES_SEQ) return;
    if (!resp.ok || !data.ok) throw new Error(data.error || ('HTTP ' + resp.status));
    // Pagina valida: si el offset quedo fuera de rango (los datos cambiaron), se vuelve a la ultima pagina que tenga filas.
    const total = data.paginacion.total;
    if (total > 0 && data.data.length === 0 && RT_OPORTUNIDADES_OFFSET > 0) {
      RT_OPORTUNIDADES_OFFSET = Math.floor((total - 1) / RT_OPORTUNIDADES_LIMITE) * RT_OPORTUNIDADES_LIMITE;
      reintentarUltima = true;
    } else {
      RT_OPORTUNIDADES = data;
      RT_OPORTUNIDADES_BASE = { clave, resumen: data.resumen };
      if (!RT_OPORTUNIDADES_UNIONES || RT_OPORTUNIDADES_UNIONES.clave !== clave) rtCargarUnionesOportunidades(clave);
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (seq !== RT_OPORTUNIDADES_SEQ) return;
    RT_OPORTUNIDADES_ERROR = err.message;
  } finally {
    if (seq === RT_OPORTUNIDADES_SEQ) { RT_OPORTUNIDADES_LOADING = false; if (!reintentarUltima) rtRenderVistaActual(); }
  }
  if (reintentarUltima) rtCargarOportunidades();
}

// Productos UNICOS de cada grupo con varios estados: una consulta liviana (limit=1) por grupo; el total viene en la paginacion.
async function rtCargarUnionesOportunidades(clave) {
  const seq = ++RT_OPORTUNIDADES_UNIONES_SEQ;
  RT_OPORTUNIDADES_UNIONES = { clave, estado: 'loading', valores: {} };
  try {
    const pares = await Promise.all(ogGruposConUnion().map(async id => {
      const params = rtOportunidadesParamsBase();
      params.set('limit', '1'); params.set('offset', '0'); params.set('estado', ogEstadosDelGrupo(id).join(','));
      const resp = await fetch(STOCK_API_URL + '/analisis/oportunidades?' + params.toString());
      const data = await resp.json();
      if (!resp.ok || !data.ok) throw new Error(data.error || ('HTTP ' + resp.status));
      return [id, data.paginacion.total];
    }));
    if (seq !== RT_OPORTUNIDADES_UNIONES_SEQ) return;
    RT_OPORTUNIDADES_UNIONES = { clave, estado: 'ok', valores: Object.fromEntries(pares) };
  } catch (err) {
    if (seq !== RT_OPORTUNIDADES_UNIONES_SEQ) return;
    RT_OPORTUNIDADES_UNIONES = { clave, estado: 'error', valores: {} };
  }
  if (RT_VIEW === 'oportunidades') rtRenderVistaActual();
}

// ── Acciones del usuario ─────────────────────────────────────────────────────────────────────────
function ovReiniciarLista() { RT_OPORTUNIDADES_OFFSET = 0; RT_OPORTUNIDADES_EXPANDIDO = null; OV_ERROR_FILTRO = null; }

function ovElegirGrupo(id) {
  if (RT_OPORTUNIDADES_GRUPO === id && !RT_OPORTUNIDADES_ESTADO) return;
  RT_OPORTUNIDADES_GRUPO = id; RT_OPORTUNIDADES_ESTADO = null;
  ovReiniciarLista(); rtCargarOportunidades();
}
function rtOportunidadesCambiarEstado(estado) {
  RT_OPORTUNIDADES_ESTADO = (!estado || RT_OPORTUNIDADES_ESTADO === estado) ? null : estado;
  ovReiniciarLista(); rtCargarOportunidades();
}
function ovElegirPrioridad(valor) { RT_OPORTUNIDADES_PRIORIDAD = valor || null; ovReiniciarLista(); rtCargarOportunidades(); }
function rtOportunidadesPagina(delta) {
  if (!RT_OPORTUNIDADES) return;
  ovIrAPagina(Math.floor(RT_OPORTUNIDADES_OFFSET / RT_OPORTUNIDADES_LIMITE) + 1 + delta);
}
function ovIrAPagina(numero) {
  if (!RT_OPORTUNIDADES) return;
  const nuevo = (numero - 1) * RT_OPORTUNIDADES_LIMITE;
  if (nuevo < 0 || nuevo >= RT_OPORTUNIDADES.paginacion.total || nuevo === RT_OPORTUNIDADES_OFFSET) return;
  RT_OPORTUNIDADES_OFFSET = nuevo; RT_OPORTUNIDADES_EXPANDIDO = null;
  rtCargarOportunidades();
  const tope = document.getElementById('ovPanel'); if (tope && tope.scrollIntoView) tope.scrollIntoView({ block: 'start' });
}
// Filtros plegables en movil: abiertos mientras el usuario los usa o haya un error de validacion; al aplicar con exito se pliegan.
let OV_FILTROS_ABIERTO = false, OV_ERROR_FILTRO = null, OV_ESCUCHA_MEDIOS = false;
const OV_MEDIA_MOVIL = '(max-width: 700px)';
function ovEsMovil() { return typeof matchMedia === 'function' && matchMedia(OV_MEDIA_MOVIL).matches; }
const OV_CODIGO_MAX = 40;
// Solo valores realmente invalidos: aplicar sin ningun filtro es valido (consulta todas las oportunidades del periodo y las sucursales elegidas).
function ovValidarFiltro(filtro) {
  const c = filtro && filtro.codigo;
  if (c && c.length > OV_CODIGO_MAX) return 'El código es demasiado largo (máximo ' + OV_CODIGO_MAX + ' caracteres).';
  if (c && /[\u0000-\u001f\u007f]/.test(c)) return 'El código tiene caracteres no válidos.';
  return null;
}
function ovFiltroInvalido(mensaje) { OV_ERROR_FILTRO = mensaje; OV_FILTROS_ABIERTO = true; rtRenderVistaActual(); }
function ovAlAplicarFiltro() { OV_ERROR_FILTRO = null; OV_FILTROS_ABIERTO = false; RT_OPORTUNIDADES = null; ovReiniciarLista(); rtCargarOportunidades(); }
// Resumen de los filtros activos (se muestra con el desplegable cerrado).
function ovResumenFiltros() {
  if (!RT_FILTRO) return 'ninguno';
  return [['codigo', 'Código'], ['marca', 'Marca'], ['rubro', 'Rubro'], ['subrubro', 'Subrubro']]
    .filter(([c]) => RT_FILTRO[c]).map(([c, n]) => n + ': ' + (Array.isArray(RT_FILTRO[c]) ? RT_FILTRO[c].join(', ') : RT_FILTRO[c])).join(' · ');
}
function ovFormularioFiltros(raiz) {
  const opciones = { sinTalleColor: true, compacto: true, textoAplicar: 'Aplicar', textoLimpiar: 'Limpiar', validar: ovValidarFiltro, onError: ovFiltroInvalido };
  const error = () => OV_ERROR_FILTRO ? rtEl('p', { className: 'rr-error ov-error-filtro', text: OV_ERROR_FILTRO, attrs: { role: 'alert' } }) : null;
  if (!ovEsMovil()) { rtFormularioFiltro(raiz, ovAlAplicarFiltro, opciones); const e = error(); if (e) raiz.appendChild(e); return; }
  const det = rtEl('details', { className: 'ov-filtros-plegable' });
  if (OV_FILTROS_ABIERTO || OV_ERROR_FILTRO) det.setAttribute('open', '');
  const sum = rtEl('summary');
  sum.appendChild(rtEl('span', { className: 'ov-fp-tit', text: 'Filtros' }));
  sum.appendChild(rtEl('span', { className: 'ov-fp-res', text: ovResumenFiltros() }));
  det.appendChild(sum);
  det.addEventListener('toggle', () => { OV_FILTROS_ABIERTO = det.open; });
  rtFormularioFiltro(det, ovAlAplicarFiltro, opciones);
  const e = error(); if (e) det.appendChild(e);
  raiz.appendChild(det);
}
function ovQuitarCampoFiltro(campo) {
  const f = Object.assign({}, RT_FILTRO); delete f[campo];
  RT_FILTRO = Object.keys(f).length ? f : null;
  RT_PRODUCTOS_FILTRO_ORIGEN = null; OV_ERROR_FILTRO = null;
  RT_OPORTUNIDADES = null; ovReiniciarLista(); rtCargarOportunidades();
}
// Accesos rapidos: reutilizan el mecanismo global de fechas (mismos controles Desde/Hasta, mismo guardado en la sesion y mismo
// reinicio de caches). "hasta" no cambia; "desde" = hasta - (N-1) dias, con la convencion de dias inclusivos.
function ovPeriodoRapido(dias) {
  if (!RT_HASTA || ovDiasPeriodo(RT_DESDE, RT_HASTA) === dias) return;
  document.getElementById('rtDesde').value = rtRestarDias(RT_HASTA, dias - 1);
  document.getElementById('rtHasta').value = RT_HASTA;
  ovReiniciarLista();
  rtCambiarPeriodo();
  rtRenderVistaActual();
}
function ovPeriodoPersonalizado() { const d = document.getElementById('rtDesde'); if (d && d.focus) d.focus(); }

// Abrir/cerrar el detalle conserva filtros, pagina y posicion de la pantalla; el foco vuelve al boton de la fila.
function rtOportunidadesToggleDetalle(codigo) {
  RT_OPORTUNIDADES_EXPANDIDO = (RT_OPORTUNIDADES_EXPANDIDO === codigo) ? null : codigo;
  if (RT_OPORTUNIDADES_EXPANDIDO) rtCargarAceleracion(RT_OPORTUNIDADES_EXPANDIDO);
  ovRenderConservandoPosicion(codigo);
}
// El foco vuelve al boton de la fila aunque la vista se vuelva a dibujar mas tarde (ej. al terminar de cargar la tendencia del detalle).
let OV_FOCO = null; // { codigo, hasta }
function ovRestaurarFoco() {
  if (!OV_FOCO || Date.now() > OV_FOCO.hasta || (document.activeElement && document.activeElement !== document.body)) return;
  // la tabla y las tarjetas comparten el boton; el foco va al que esta visible
  const btn = [...document.querySelectorAll('[data-detalle-codigo="' + String(OV_FOCO.codigo).replace(/"/g, '') + '"]')].find(b => b.offsetParent !== null);
  if (btn && btn.focus) btn.focus({ preventScroll: true });
}
function ovRenderConservandoPosicion(codigo) {
  const y = window.scrollY;
  OV_FOCO = { codigo, hasta: Date.now() + 4000 };
  rtRenderVistaActual();
  window.scrollTo(0, y);
}

// ── Piezas de la vista ───────────────────────────────────────────────────────────────────────────
function ovBoton(texto, clase, onClick, attrs) {
  const b = rtEl('button', { className: clase, text: texto, attrs: attrs || {} });
  b.type = 'button'; b.addEventListener('click', onClick);
  return b;
}

function ovEncabezado() {
  const cab = rtEl('div', { className: 'ov-head' });
  const tit = rtEl('div');
  tit.appendChild(rtEl('h3', { className: 'ov-titulo', text: 'Oportunidades' }));
  tit.appendChild(rtEl('p', { className: 'ov-sub', text: 'Detectá qué reponer, mover o revisar.' }));
  cab.appendChild(tit);
  if (typeof rrEsAdmin === 'function' && rrEsAdmin()) cab.appendChild(ovBoton('Ver reglas', 'btn-sm ov-ver-reglas', () => rtCambiarVista('reglas')));
  return cab;
}

// Un chip por filtro activo, cada uno con su boton para quitarlo.
function ovFiltrosActivos(host) {
  if (!RT_FILTRO) return;
  const fila = rtEl('div', { className: 'ov-activos', attrs: { role: 'group', 'aria-label': 'Filtros activos' } });
  fila.appendChild(rtEl('span', { className: 'ov-activos-rot', text: 'Filtros activos:' }));
  [['codigo', 'Código'], ['marca', 'Marca'], ['rubro', 'Rubro'], ['subrubro', 'Subrubro']].forEach(([campo, nombre]) => {
    const v = RT_FILTRO[campo]; if (!v) return;
    const texto = nombre + ': ' + (Array.isArray(v) ? v.join(', ') : v);
    const chip = rtEl('span', { className: 'ov-chip-filtro' });
    chip.appendChild(rtEl('span', { text: texto }));
    const x = rtEl('button', { text: '×', attrs: { 'aria-label': 'Quitar filtro ' + texto, title: 'Quitar' } });
    x.type = 'button'; x.addEventListener('click', () => ovQuitarCampoFiltro(campo));
    chip.appendChild(x);
    fila.appendChild(chip);
  });
  host.appendChild(fila);
}

// Sucursales que Oportunidades no evaluo (p. ej. Cipo, cerrada): aviso, pero la consulta historica sigue en las demas secciones.
function ovAvisoSucursalesNoConsideradas(host, resp) {
  const activas = resp.sucursales || [];
  const ignoradas = new Set(resp.sucursales_ignoradas || []);
  RT_CENTROS.forEach(c => { if (activas.length && !activas.includes(c)) ignoradas.add(c); });
  if (!ignoradas.size) return;
  const nombres = [...ignoradas].map(c => RT_CENTRO_NOMBRE[c] || c).join(', ');
  const aviso = rtEl('div', { className: 'rr-aviso', attrs: { role: 'status' } });
  const txt = rtEl('div');
  txt.appendChild(rtEl('b', { text: 'Sucursales no consideradas: ' }));
  txt.appendChild(document.createTextNode(nombres + '. Oportunidades solo evalúa sucursales operativas; las sucursales cerradas conservan su consulta histórica en las demás secciones, pero no son candidatas para reponer ni rotar.'));
  aviso.appendChild(txt);
  host.appendChild(aviso);
}

// Contexto: fechas efectivas y dias, sucursales incluidas, reglas usadas + accesos rapidos de periodo.
function ovContexto(host, resp) {
  const barra = rtEl('div', { className: 'ov-contexto' });
  const info = rtEl('div', { className: 'ov-contexto-info' });
  const periodo = resp && resp.periodo ? resp.periodo : { desde: RT_DESDE, hasta: RT_HASTA };
  const dias = ovDiasPeriodo(periodo.desde, periodo.hasta);
  const dato = (etiqueta, valor) => { const s = rtEl('span', { className: 'ov-dato' }); s.appendChild(rtEl('b', { text: etiqueta + ' ' })); s.appendChild(document.createTextNode(valor)); return s; };
  info.appendChild(dato('Período:', ovFechaCorta(periodo.desde) + ' al ' + ovFechaCorta(periodo.hasta) + (dias ? ' · ' + dias + ' días' : '')));
  if (resp) {
    const sucs = resp.sucursales || [];
    info.appendChild(dato('Sucursales:', sucs.length + (sucs.length === 1 ? ' sucursal' : ' sucursales') + (sucs.length ? ' (' + sucs.map(c => RT_CENTRO_NOMBRE[c] || c).join(', ') + ')' : '')));
    const c = resp.conjunto;
    const personalizado = c && c.origen === 'activacion';
    info.appendChild(dato('Reglas:', personalizado
      ? 'conjunto personalizado activo' + (typeof rrEsAdmin === 'function' && rrEsAdmin() ? ' #' + c.activacion_id : '')
      : 'estándar'));
  } else {
    info.appendChild(dato('Sucursales y reglas:', 'calculando…'));
  }
  barra.appendChild(info);

  const rapidos = rtEl('div', { className: 'ov-rapidos', attrs: { role: 'group', 'aria-label': 'Período rápido' } });
  OV_DIAS_RAPIDOS.forEach(n => {
    const activo = dias === n;
    const b = ovBoton(n + ' días', 'ov-rapido' + (activo ? ' ov-activo' : ''), () => ovPeriodoRapido(n), { 'aria-pressed': activo ? 'true' : 'false' });
    rapidos.appendChild(b);
  });
  const personalizado = !OV_DIAS_RAPIDOS.includes(dias);
  rapidos.appendChild(ovBoton('Personalizado', 'ov-rapido' + (personalizado ? ' ov-activo' : ''), ovPeriodoPersonalizado, { 'aria-pressed': personalizado ? 'true' : 'false', title: 'Elegí las fechas en Desde y Hasta' }));
  barra.appendChild(rapidos);
  host.appendChild(barra);
}

function ovFmtConteo(v) { return v === null || v === undefined ? '—' : nf.format(v); }

function ovConteosActuales() {
  const base = RT_OPORTUNIDADES_BASE && RT_OPORTUNIDADES_BASE.clave === rtOportunidadesClaveBase() ? RT_OPORTUNIDADES_BASE : null;
  const un = RT_OPORTUNIDADES_UNIONES && RT_OPORTUNIDADES_UNIONES.clave === rtOportunidadesClaveBase() ? RT_OPORTUNIDADES_UNIONES : null;
  return { base, un, conteos: ogConteos(base && base.resumen, un && un.estado === 'ok' ? un.valores : null) };
}

const OV_CLASE_GRUPO = { todas: 'ov-g-todas', reposicion: 'ov-g-reposicion', rotaciones: 'ov-g-rotaciones', rendimiento: 'ov-g-rendimiento', estancados: 'ov-g-estancados', revisar_datos: 'ov-g-datos' };

function ovGrupos(host, cx) {
  const fila = rtEl('div', { className: 'ov-grupos', attrs: { role: 'group', 'aria-label': 'Grupos de oportunidades' } });
  OG_GRUPOS.forEach(g => {
    const activo = RT_OPORTUNIDADES_GRUPO === g.id;
    const b = rtEl('button', { className: 'ov-grupo ' + OV_CLASE_GRUPO[g.id] + (activo ? ' ov-activo' : ''), attrs: { 'aria-pressed': activo ? 'true' : 'false', title: g.ayuda } });
    b.type = 'button';
    const rot = rtEl('span', { className: 'ov-grupo-rot' });
    if (activo) rot.appendChild(rtEl('span', { className: 'ov-tilde', text: '✓', attrs: { 'aria-hidden': 'true' } }));
    rot.appendChild(document.createTextNode(g.etiqueta));
    b.appendChild(rot);
    b.appendChild(rtEl('span', { className: 'ov-grupo-num', text: ovFmtConteo(cx.conteos.grupos[g.id]) }));
    b.addEventListener('click', () => ovElegirGrupo(g.id));
    fila.appendChild(b);
  });
  host.appendChild(fila);
}

function ovPuntoPrioridad(estado) {
  const cls = RT_ESTADO_CLS[estado] || 'badge-neutral';
  return rtEl('span', { className: 'ov-punto ov-punto-' + cls.replace('badge-', ''), attrs: { 'aria-hidden': 'true', title: OV_PRIORIDAD_TEXTO[cls] } });
}

// Chips de los estados del grupo elegido (con "Todas" dentro del grupo). Cada contador coincide con el listado de ese chip.
function ovChipsEstados(host, cx) {
  const g = ogGrupo(RT_OPORTUNIDADES_GRUPO);
  if (g.id === 'todas' || g.estados.length < 2) return;
  const fila = rtEl('div', { className: 'ov-chips', attrs: { role: 'group', 'aria-label': 'Estados de ' + g.etiqueta } });
  const chip = (texto, num, activo, onClick, estado) => {
    const b = rtEl('button', { className: 'ov-chip' + (activo ? ' ov-activo' : ''), attrs: { 'aria-pressed': activo ? 'true' : 'false' } });
    b.type = 'button';
    if (activo) b.appendChild(rtEl('span', { className: 'ov-tilde', text: '✓', attrs: { 'aria-hidden': 'true' } }));
    if (estado) b.appendChild(ovPuntoPrioridad(estado));
    b.appendChild(rtEl('span', { text: texto }));
    b.appendChild(rtEl('span', { className: 'ov-chip-num', text: ovFmtConteo(num) }));
    b.addEventListener('click', onClick);
    return b;
  };
  fila.appendChild(chip('Todas', cx.conteos.grupos[g.id], !RT_OPORTUNIDADES_ESTADO, () => rtOportunidadesCambiarEstado(null), null));
  g.estados.forEach(e => fila.appendChild(chip(rrTextoEstado(e), cx.conteos.estados[e], RT_OPORTUNIDADES_ESTADO === e, () => rtOportunidadesCambiarEstado(e), e)));
  host.appendChild(fila);
}

// Nota corta + ayuda ampliada accesible (details nativo: se abre con teclado y lo leen los lectores de pantalla).
function ovNotaConAyuda(host, corto, ayuda) {
  const nota = rtEl('div', { className: 'ov-nota', attrs: { role: 'note' } });
  nota.appendChild(rtEl('span', { text: corto + ' ' }));
  const det = rtEl('details', { className: 'ov-ayuda' });
  det.appendChild(rtEl('summary', { text: 'Más información' }));
  det.appendChild(rtEl('p', { text: ayuda }));
  nota.appendChild(det);
  host.appendChild(nota);
}

function ovNotasConteo(host, cx) {
  const g = ogGrupo(RT_OPORTUNIDADES_GRUPO);
  if (cx.un && cx.un.estado === 'error') {
    const aviso = rtEl('div', { className: 'rr-aviso', attrs: { role: 'alert' } });
    aviso.appendChild(rtEl('div', { text: 'No se pudieron contar los grupos con varios estados. Los demás datos siguen siendo válidos.' }));
    aviso.appendChild(ovBoton('Reintentar', 'btn-sm', () => { RT_OPORTUNIDADES_UNIONES = null; rtCargarUnionesOportunidades(rtOportunidadesClaveBase()); }));
    host.appendChild(aviso);
    return;
  }
  if (cx.un && cx.un.estado === 'ok' && ogGruposConUnion().some(id => cx.conteos.grupos[id] === null)) {
    const aviso = rtEl('div', { className: 'rr-aviso rr-peligro', attrs: { role: 'alert' } });
    aviso.appendChild(rtEl('div', { text: 'El servidor todavía no admite consultar varios estados a la vez, por eso no se pueden mostrar los grupos de varios estados. Hace falta actualizar croma-api.' }));
    host.appendChild(aviso);
    return;
  }
  if (cx.conteos.gruposSeSuperponen) ovNotaConAyuda(host, 'Un producto puede aparecer en varios grupos.', 'Un producto con más de un estado aparece en cada grupo que corresponda, por eso los contadores de los grupos no suman el total de "Todas" (' + ovFmtConteo(cx.conteos.total) + ').');
  if (g.id !== 'todas' && ogChipsSeSuperponen(g.id, cx.conteos)) ovNotaConAyuda(host, 'Un producto puede cumplir más de un estado.', 'Los estados de ' + g.etiqueta + ' suman más que los ' + ovFmtConteo(cx.conteos.grupos[g.id]) + ' productos únicos del grupo porque algunos productos cumplen varios estados a la vez.');
}

// Filtros especificos de Rotaciones (mismos controles y parametros que antes; solo aparecen en la lista de posible rotacion).
function ovFiltrosRotacion(host) {
  host.appendChild(rtEl('p', { className: 'rt-note ov-nota', text: 'Las rotaciones requieren validación por talle y color.' }));
  const confRow = rtEl('div', { className: 'rt-buscador-row' });
  [['', 'Todos'], ['manual', 'Revisión manual']].forEach(([valor, etiqueta]) => {
    const activo = valor ? RT_OPORTUNIDADES_CONFIANZA === valor : !RT_OPORTUNIDADES_CONFIANZA;
    const btn = ovBoton(etiqueta, 'btn-sm' + (activo ? ' rt-kpi-activo' : ''), () => rtOportunidadesCambiarConfianza(valor || null), { 'aria-pressed': activo ? 'true' : 'false' });
    confRow.appendChild(btn);
  });
  host.appendChild(confRow);
  const rotRow = rtEl('div', { className: 'rt-buscador-row' });
  const selOrigen = rtEl('select', { attrs: { 'aria-label': 'Sucursal origen' } }); selOrigen.appendChild(rtEl('option', { attrs: { value: '' }, text: 'Sucursal origen' }));
  const selDestino = rtEl('select', { attrs: { 'aria-label': 'Sucursal destino' } }); selDestino.appendChild(rtEl('option', { attrs: { value: '' }, text: 'Sucursal destino' }));
  RT_CENTROS.forEach(c => {
    selOrigen.appendChild(rtEl('option', { attrs: { value: c }, text: RT_CENTRO_NOMBRE[c] }));
    selDestino.appendChild(rtEl('option', { attrs: { value: c }, text: RT_CENTRO_NOMBRE[c] }));
  });
  selOrigen.value = RT_OPORTUNIDADES_ROTACION.origen; selDestino.value = RT_OPORTUNIDADES_ROTACION.destino;
  selOrigen.addEventListener('change', () => { RT_OPORTUNIDADES_ROTACION.origen = selOrigen.value; rtOportunidadesAplicarRotacion(); });
  selDestino.addEventListener('change', () => { RT_OPORTUNIDADES_ROTACION.destino = selDestino.value; rtOportunidadesAplicarRotacion(); });
  rotRow.appendChild(selOrigen); rotRow.appendChild(selDestino);
  [['ventasDestinoMin', 'Mín. ventas destino'], ['stockOrigenMin', 'Mín. stock origen'], ['coberturaOrigenMin', 'Mín. cobertura origen (días)']].forEach(([campo, ph]) => {
    const inp = rtEl('input', { attrs: { type: 'number', min: '0', placeholder: ph, 'aria-label': ph } });
    inp.value = RT_OPORTUNIDADES_ROTACION[campo];
    inp.addEventListener('change', () => { RT_OPORTUNIDADES_ROTACION[campo] = inp.value; rtOportunidadesAplicarRotacion(); });
    rotRow.appendChild(inp);
  });
  host.appendChild(rotRow);
}

// ── Celdas de la tabla ───────────────────────────────────────────────────────────────────────────
function ovNombreSucursal(c) { return RT_CENTRO_NOMBRE[c] || String(c); }
// INGRESOS DE PROVEEDOR (informativo: no participa en ninguna regla). La API entrega f.ingreso_proveedor = ultimo ingreso de mercaderia al
// Deposito 90 (sin Fallados 93, transferencias ni rotaciones) con su cantidad y lo ingresado en el periodo; null = sin ingresos. Con una API
// anterior el campo no existe (undefined): se muestra la fecha del ultimo ingreso que ya entregaba, sin cantidad. Nunca se inventa un dato.
const OV_NOTA_INGRESO_PROV = 'Último ingreso de proveedor al Depósito 90 (todos los talles y colores del producto). No incluye Fallados 93, transferencias ni rotaciones.';
const OV_NOTA_INGRESO = 'Fecha del último ingreso del producto completo (el más reciente entre todos sus talles y colores); no indica cuántas unidades entraron.';
function ovFechaIngreso(valor) { return ovFechaCorta(String(valor).slice(0, 10)); }
function ovHaceDias(valor, hasta) {
  const d = Math.round((Date.parse((hasta || RT_HASTA) + 'T00:00:00Z') - Date.parse(String(valor).slice(0, 10) + 'T00:00:00Z')) / 86400000);
  return isFinite(d) && d >= 0 ? ' (hace ' + nf.format(d) + (d === 1 ? ' día)' : ' días)') : '';
}
function ovTextoIngreso(f) {
  const ip = f.ingreso_proveedor;
  if (ip === null) return 'Sin ingreso de proveedor registrado';
  if (ip && ip.ultima_fecha) return 'Ingreso proveedor: ' + ovFechaIngreso(ip.ultima_fecha) + ' · ' + nf.format(ip.ultima_cantidad) + ' u.' + ovHaceDias(ip.ultima_fecha);
  if (!f.Ultimo_ingreso) return 'Sin ingreso registrado';
  const dias = f.dias_desde_ultimo_ingreso;
  return 'Último ingreso: ' + ovFechaIngreso(f.Ultimo_ingreso) + (dias === null || dias === undefined ? '' : ' (hace ' + nf.format(dias) + (dias === 1 ? ' día)' : ' días)'));
}
function ovNotaTextoIngreso(f) { return f.ingreso_proveedor !== undefined ? OV_NOTA_INGRESO_PROV : OV_NOTA_INGRESO; }

// Bloque del detalle: ultimo ingreso, lo ingresado en el periodo y, si difiere, la fecha que usan hoy las reglas de antiguedad.
function ovBloqueIngresos(f, resp) {
  const caja = rtEl('div');
  const ip = f.ingreso_proveedor;
  const linea = t => caja.appendChild(rtEl('div', { text: t }));
  if (ip === undefined) { linea(ovTextoIngreso(f) + '.'); linea(OV_NOTA_INGRESO); return caja; }
  if (ip === null) linea('Sin ingresos de proveedor al Depósito 90 hasta el final del período.');
  else {
    linea('Último ingreso: ' + ovFechaIngreso(ip.ultima_fecha) + ' · ' + nf.format(ip.ultima_cantidad) + ' unidades' + ovHaceDias(ip.ultima_fecha, resp && resp.periodo && resp.periodo.hasta));
    linea(ip.unidades_periodo > 0
      ? 'En el período: ' + nf.format(ip.unidades_periodo) + ' unidades en ' + nf.format(ip.dias_con_ingreso_periodo) + (ip.dias_con_ingreso_periodo === 1 ? ' día con ingreso.' : ' días con ingreso.')
      : 'En el período: sin ingresos de proveedor.');
  }
  caja.appendChild(rtEl('div', { className: 'rt-note', text: OV_NOTA_INGRESO_PROV }));
  // Las reglas de antiguedad (Ingreso reciente, Stock parado, Posible descuento) siguen usando el dato anterior: si difiere, se aclara.
  const reglas = f.Ultimo_ingreso ? String(f.Ultimo_ingreso).slice(0, 10) : null;
  const prov = ip && ip.ultima_fecha ? String(ip.ultima_fecha).slice(0, 10) : null;
  if (reglas && reglas !== prov) caja.appendChild(rtEl('div', { className: 'rt-note', text: 'Las reglas de antigüedad usan hoy otro dato: último ingreso registrado el ' + ovFechaIngreso(reglas) + ' (incluye Fallados 93 y cualquier talle).' }));
  return caja;
}
function ovProductoMeta(f) { return [f.Nombre_marca, f.Nombre_rubro].filter(Boolean).join(' · '); }

function ovCeldaProducto(f) {
  const wrap = rtEl('div', { className: 'ov-prod' });
  const linea = rtEl('div', { className: 'ov-prod-nombre', attrs: { title: f.Codigo_producto + ' ' + (f.Nombre_producto || '') } });
  linea.appendChild(rtEl('b', { text: f.Codigo_producto }));
  linea.appendChild(document.createTextNode(' ' + (f.Nombre_producto || '')));
  wrap.appendChild(linea);
  const meta = ovProductoMeta(f);
  if (meta) wrap.appendChild(rtEl('div', { className: 'ov-prod-meta', text: meta }));
  wrap.appendChild(rtEl('div', { className: 'ov-prod-meta ov-prod-ingreso', text: ovTextoIngreso(f), attrs: { title: ovNotaTextoIngreso(f) } }));
  return wrap;
}

// Estados que se estan buscando (el chip o los del grupo) en los que el producto entra SOLO como etiqueta secundaria. La prioridad y el
// orden siguen siendo los del estado principal: esto solo explica por que aparece en esta lista.
function ovEstadosSecundariosBuscados(f) {
  const buscados = RT_OPORTUNIDADES_ESTADO ? [RT_OPORTUNIDADES_ESTADO] : ogEstadosDelGrupo(RT_OPORTUNIDADES_GRUPO);
  if (buscados.includes(f.estado_principal)) return [];
  return (f.etiquetas_secundarias || []).filter(e => buscados.includes(e));
}

// Accion principal + rendimiento, dos dimensiones separadas que ya entrega el motor (acciones / rendimiento). Nada se deduce aca.
function ovCeldaAccion(f) {
  const wrap = rtEl('div', { className: 'ov-accion' });
  const a = rrAccionPrincipal(f);
  if (a) {
    const sev = a.prioridad === 'alta' ? 'danger' : (a.prioridad === 'media' ? 'warning' : 'neutral');
    wrap.appendChild(rtEl('span', { className: 'ov-pill ov-pill-' + sev, text: rrTextoAccion(a), attrs: { title: 'Acción sugerida · prioridad ' + a.prioridad } }));
  } else {
    wrap.appendChild(rtEl('span', { className: 'ov-sin', text: 'Sin acción sugerida' }));
  }
  const nivel = f.rendimiento && f.rendimiento.nivel;
  const estadoDelRendimiento = nivel === 'destacado' ? 'venta_destacada' : (nivel ? 'bien_vendido' : null);
  // Badge del estado secundario por el que aparece en esta lista (sin repetir lo que ya muestra el rendimiento)
  const mostrados = new Set();
  ovEstadosSecundariosBuscados(f).filter(e => e !== estadoDelRendimiento).forEach(e => {
    mostrados.add(e);
    const b = rtEl('span', { className: 'ov-badge-sec', attrs: { title: 'También cumple este estado (secundario); la prioridad es la del estado principal' } });
    b.appendChild(ovPuntoPrioridad(e));
    b.appendChild(document.createTextNode('También: ' + rrTextoEstado(e)));
    wrap.appendChild(b);
  });
  const otras = (f.acciones || []).filter(x => !x.principal && !mostrados.has(x.estado_origen));
  if (otras.length) wrap.appendChild(rtEl('span', { className: 'ov-mas', text: 'Otras acciones: ' + otras.map(rrTextoAccion).join(' · ') }));
  if (nivel) {
    const p = rtEl('span', { className: 'ov-pill ov-pill-success', attrs: { title: 'Rendimiento' } });
    p.appendChild(rtEl('span', { text: '↗ ', attrs: { 'aria-hidden': 'true' } }));
    p.appendChild(document.createTextNode(nivel === 'destacado' ? 'Venta destacada' : 'Bien vendido'));
    wrap.appendChild(p);
  } else {
    wrap.appendChild(rtEl('span', { className: 'ov-sin', text: RR_SIN_RENDIMIENTO }));
  }
  if (a && a.requiere_validacion_variante) wrap.appendChild(rtEl('span', { className: 'ov-validar', text: 'Validar por variante' }));
  return wrap;
}

// "Por que aparece", version breve: siempre con valores concretos que entrega el motor. En rotacion se arma con el par estructurado
// (nombres de sucursal del catalogo, no los codigos del texto); en el resto es el motivo del propio motor. El detalle conserva la
// explicacion completa.
function ovMotivoCorto(f) {
  const ps = f.estado_principal === 'posible_rotacion' && f.diagnostico_rotacion && f.diagnostico_rotacion.par_sugerido;
  if (ps && ps.destino && ps.origen) {
    return 'Vende en ' + ovNombreSucursal(ps.destino.sucursal) + ' (' + nf.format(ps.destino.ventas) + ' ventas, stock ' + nf.format(ps.destino.stock) + ') y tiene stock parado en ' + ovNombreSucursal(ps.origen.sucursal) + ' (' + nf.format(ps.origen.stock) + ' u.).';
  }
  return f.motivo || (f.explicacion && f.explicacion.resumen) || '—';
}

function ovCeldaVentas(f) {
  const wrap = rtEl('span', { className: f.Ventas_total < 0 ? 'rt-oport-ventas-neg' : '' });
  wrap.appendChild(document.createTextNode(nf.format(f.Ventas_total)));
  if (f.Ventas_total < 0) wrap.appendChild(rtEl('span', { className: 'ov-chica', text: 'devoluciones' }));
  else if (f.ratio_confiable === false) wrap.appendChild(rtEl('span', { className: 'ov-chica', text: 'muestra chica' }));
  return wrap;
}

function ovCeldaStock(f) {
  const wrap = rtEl('div', { className: 'ov-stock' });
  const par = (valor, rotulo) => { const s = rtEl('span'); s.appendChild(rtEl('b', { text: nf.format(valor) })); s.appendChild(rtEl('small', { text: rotulo })); return s; };
  wrap.appendChild(par(f.Stock_sucursales || 0, 'suc.'));
  wrap.appendChild(par(rtOportunidadesStockDeposito(f), 'dep. 90'));
  return wrap;
}

// Cobertura (dias de stock en sucursales al ritmo del periodo). Sin ventas NO es 0 dias. El color solo se usa en productos con algun estado de
// reposicion y solo con los umbrales que rigen para todos los productos (sin conjunto personalizado activo).
function ovTonoCobertura(f, resp) {
  if (f.cobertura_estado !== 'calculada' || !resp || !resp.campos_globales || !resp.campos_globales.aplican_a_todos_los_productos) return null;
  if (![f.estado_principal, ...(f.etiquetas_secundarias || [])].some(e => OV_ESTADOS_REPOSICION.includes(e)) || !resp.umbrales || !resp.umbrales.reposicion) return null;
  const u = resp.umbrales.reposicion;
  return f.cobertura_dias <= u.cobertura_reponer_max ? 'danger' : (f.cobertura_dias <= u.cobertura_proxima_max ? 'warning' : 'success');
}
function ovCeldaCobertura(f, resp) {
  if (f.cobertura_estado === 'sin_ventas' || f.cobertura_dias === null || f.cobertura_dias === undefined) return rtEl('span', { className: 'ov-sin', text: 'Sin ventas', attrs: { title: 'Sin ventas en el período: la cobertura no se puede calcular' } });
  const tono = ovTonoCobertura(f, resp);
  return rtEl('span', { className: 'ov-pill ' + (tono ? 'ov-pill-' + tono : 'ov-pill-plano'), text: nf1.format(f.cobertura_dias) + ' días', attrs: { title: 'Cobertura de stock en sucursales' } });
}

function ovBotonDetalle(f, expandido) {
  const b = rtEl('button', { className: 'ov-detalle-btn', text: expandido ? 'Ocultar' : 'Ver detalle', attrs: { 'aria-expanded': expandido ? 'true' : 'false', 'aria-label': (expandido ? 'Ocultar' : 'Ver') + ' detalle de ' + f.Codigo_producto, 'data-detalle-codigo': f.Codigo_producto } });
  b.type = 'button';
  b.appendChild(rtEl('span', { text: expandido ? ' ▴' : ' ›', attrs: { 'aria-hidden': 'true' } }));
  b.addEventListener('click', e => { e.stopPropagation(); rtOportunidadesToggleDetalle(f.Codigo_producto); });
  return b;
}

function ovFilaProducto(f, resp) {
  const expandido = RT_OPORTUNIDADES_EXPANDIDO === f.Codigo_producto;
  const tr = rtEl('tr', { className: 'ov-fila' + (expandido ? ' ov-fila-activa' : '') });
  tr.addEventListener('click', () => rtOportunidadesToggleDetalle(f.Codigo_producto));
  const td = (cls, contenido) => { const c = rtEl('td', { className: cls }); if (contenido instanceof Object) c.appendChild(contenido); else c.textContent = contenido; return c; };
  tr.appendChild(td('ov-c-prod', ovCeldaProducto(f)));
  tr.appendChild(td('ov-c-accion', ovCeldaAccion(f)));
  tr.appendChild(td('ov-c-motivo', rtEl('div', { className: 'ov-motivo', text: ovMotivoCorto(f), attrs: { title: ovMotivoCorto(f) } })));
  tr.appendChild(td('ov-c-num', ovCeldaVentas(f)));
  tr.appendChild(td('ov-c-stock', ovCeldaStock(f)));
  tr.appendChild(td('ov-c-cob', ovCeldaCobertura(f, resp)));
  tr.appendChild(td('ov-c-det', ovBotonDetalle(f, expandido)));
  const frag = document.createDocumentFragment();
  frag.appendChild(tr);
  if (expandido) {
    const trDet = rtEl('tr', { className: 'rt-oport-detalle-fila' });
    const tdDet = rtEl('td', { attrs: { colspan: '7' } });
    tdDet.appendChild(rtOportunidadesPanelDetalle(f));
    trDet.appendChild(tdDet);
    frag.appendChild(trDet);
  }
  return frag;
}

function ovTabla(datos, resp, periodoDias) {
  const wrap = rtEl('div', { className: 'ov-tabla-wrap rt-oportunidades-tabla' });
  const tabla = rtEl('table', { className: 'ov-tabla' });
  const thead = rtEl('thead'); const trh = rtEl('tr');
  [['Producto', 'ov-c-prod'], ['Acción / rendimiento', 'ov-c-accion'], ['Por qué aparece', 'ov-c-motivo'],
    ['Ventas del período' + (periodoDias ? ' (' + periodoDias + ' d)' : ''), 'ov-c-num'], ['Stock suc. / Dep. 90', 'ov-c-stock'], ['Cobertura', 'ov-c-cob'], ['', 'ov-c-det']]
    .forEach(([t, cls]) => { const th = rtEl('th', { className: cls, text: t, attrs: { scope: 'col' } }); if (!t) th.appendChild(rtEl('span', { className: 'ov-solo-lectores', text: 'Detalle' })); trh.appendChild(th); });
  thead.appendChild(trh); tabla.appendChild(thead);
  const tbody = rtEl('tbody');
  datos.forEach(f => tbody.appendChild(ovFilaProducto(f, resp)));
  tabla.appendChild(tbody); wrap.appendChild(tabla);
  return wrap;
}

function ovTarjetas(datos, resp) {
  const wrap = rtEl('div', { className: 'ov-tarjetas rt-oportunidades-cards' });
  datos.forEach(f => {
    const expandido = RT_OPORTUNIDADES_EXPANDIDO === f.Codigo_producto;
    const card = rtEl('div', { className: 'ov-tarjeta' + (expandido ? ' ov-fila-activa' : '') });
    card.appendChild(ovCeldaProducto(f));
    card.appendChild(ovCeldaAccion(f));
    card.appendChild(rtEl('p', { className: 'ov-motivo ov-motivo-completo', text: ovMotivoCorto(f) }));
    const datosLinea = rtEl('dl', { className: 'ov-tarjeta-datos' });
    const par = (rotulo, valor) => { const d = rtEl('div'); d.appendChild(rtEl('dt', { text: rotulo })); const dd = rtEl('dd'); if (valor instanceof Object) dd.appendChild(valor); else dd.textContent = valor; d.appendChild(dd); datosLinea.appendChild(d); };
    par('Ventas', ovCeldaVentas(f));
    par('Stock suc.', nf.format(f.Stock_sucursales || 0));
    par('Dep. 90', nf.format(rtOportunidadesStockDeposito(f)));
    par('Cobertura', ovCeldaCobertura(f, resp));
    card.appendChild(datosLinea);
    card.appendChild(ovBotonDetalle(f, expandido));
    if (expandido) card.appendChild(rtOportunidadesPanelDetalle(f));
    wrap.appendChild(card);
  });
  return wrap;
}

function ovPaginacion(p) {
  const pag = rtEl('nav', { className: 'ov-pag', attrs: { 'aria-label': 'Paginación' } });
  pag.appendChild(rtEl('span', { className: 'ov-pag-info', text: 'Mostrando ' + (p.total === 0 ? 0 : p.offset + 1) + '–' + (p.offset + p.devueltos) + ' de ' + nf.format(p.total) }));
  const paginas = Math.max(1, Math.ceil(p.total / p.limit));
  if (paginas < 2) return pag;
  const actual = Math.floor(p.offset / p.limit) + 1;
  const botones = rtEl('div', { className: 'ov-pag-botones' });
  const flecha = (txt, etiqueta, destino, dis) => { const b = ovBoton(txt, 'ov-pag-btn', () => ovIrAPagina(destino), { 'aria-label': etiqueta }); b.disabled = dis; return b; };
  botones.appendChild(flecha('‹', 'Página anterior', actual - 1, actual === 1));
  ogPaginasVisibles(actual, paginas).forEach(n => {
    if (n === '…') { botones.appendChild(rtEl('span', { className: 'ov-pag-gap', text: '…', attrs: { 'aria-hidden': 'true' } })); return; }
    const b = ovBoton(String(n), 'ov-pag-btn' + (n === actual ? ' ov-activo' : ''), () => ovIrAPagina(n), { 'aria-label': 'Página ' + n });
    if (n === actual) b.setAttribute('aria-current', 'page');
    botones.appendChild(b);
  });
  botones.appendChild(flecha('›', 'Página siguiente', actual + 1, actual === paginas));
  pag.appendChild(botones);
  return pag;
}

function ovTituloPanel() {
  const g = ogGrupo(RT_OPORTUNIDADES_GRUPO);
  return RT_OPORTUNIDADES_ESTADO ? g.etiqueta + ' · ' + rrTextoEstado(RT_OPORTUNIDADES_ESTADO) : g.etiqueta;
}

function ovPanelLista(host, cx) {
  const panel = rtEl('section', { className: 'ov-panel', attrs: { id: 'ovPanel', 'aria-labelledby': 'ovPanelTitulo', 'aria-busy': RT_OPORTUNIDADES_LOADING ? 'true' : 'false' } });
  const cab = rtEl('div', { className: 'ov-panel-cab' });
  const tit = rtEl('div', { className: 'ov-panel-tit' });
  tit.appendChild(rtEl('h4', { className: 'ov-panel-h', text: ovTituloPanel(), attrs: { id: 'ovPanelTitulo' } }));
  const lista = RT_OPORTUNIDADES && !RT_OPORTUNIDADES_LOADING && !RT_OPORTUNIDADES_ERROR ? RT_OPORTUNIDADES : null;
  const sinSoporte = cx.un && cx.un.estado === 'ok' && ogNecesitaUnion(RT_OPORTUNIDADES_GRUPO) && !RT_OPORTUNIDADES_ESTADO && cx.conteos.grupos[RT_OPORTUNIDADES_GRUPO] === null;
  if (lista && !sinSoporte) {
    const total = lista.paginacion.total;
    const esperado = ogTotalEsperado(RT_OPORTUNIDADES_GRUPO, RT_OPORTUNIDADES_ESTADO, cx.conteos);
    const filtrado = RT_OPORTUNIDADES_PRIORIDAD && esperado !== null && esperado !== total;
    tit.appendChild(rtEl('span', { className: 'ov-panel-cuenta', text: filtrado ? nf.format(total) + ' de ' + nf.format(esperado) + ' productos' : nf.format(total) + (total === 1 ? ' producto' : ' productos') }));
  }
  cab.appendChild(tit);
  const ctl = rtEl('div', { className: 'ov-panel-ctl' });
  const sel = rtEl('select', { className: 'ov-select', attrs: { 'aria-label': 'Filtrar por prioridad' } });
  OV_PRIORIDADES.forEach(([v, t]) => sel.appendChild(rtEl('option', { attrs: { value: v }, text: t })));
  sel.value = RT_OPORTUNIDADES_PRIORIDAD || '';
  sel.addEventListener('change', () => ovElegirPrioridad(sel.value));
  ctl.appendChild(sel);
  ctl.appendChild(rtEl('span', { className: 'ov-orden', text: 'Ordenado por urgencia', attrs: { title: 'Prioridad del estado principal y, dentro de cada estado, el criterio propio del motor' } }));
  cab.appendChild(ctl);
  panel.appendChild(cab);
  if (ovSoloRotacion()) { const f = rtEl('div', { className: 'ov-rot-filtros' }); ovFiltrosRotacion(f); panel.appendChild(f); }

  if (RT_OPORTUNIDADES_ERROR) {
    const caja = rtEl('div'); panel.appendChild(caja);
    rtEstado(caja, 'error', 'No se pudieron calcular las oportunidades. ' + RT_OPORTUNIDADES_ERROR, rtCargarOportunidades);
  } else if (!lista) {
    const caja = rtEl('div', { attrs: { role: 'status' } }); panel.appendChild(caja);
    rtEstado(caja, 'loading', RT_OPORTUNIDADES ? 'Actualizando…' : 'Calculando oportunidades del período…');
  } else if (!lista.data.length) {
    const caja = rtEl('div'); panel.appendChild(caja);
    if (sinSoporte) rtEstado(caja, 'error', 'No se puede mostrar este grupo: el servidor todavía no admite consultar varios estados a la vez.');
    else rtEstado(caja, 'vacio', RT_OPORTUNIDADES_ESTADO === 'reponer_desde_deposito'
      ? 'No se encontraron productos que necesiten reposición desde Depósito 90 para este período.'
      : (ovHayFiltroExtra() ? 'Ningún producto cumple los filtros elegidos. Probá con otra prioridad o limpiá los filtros.' : 'Sin oportunidades para esta selección y período.'));
  } else {
    const dias = ovDiasPeriodo(lista.periodo.desde, lista.periodo.hasta);
    const esperado = ogTotalEsperado(RT_OPORTUNIDADES_GRUPO, RT_OPORTUNIDADES_ESTADO, cx.conteos);
    if (!ovHayFiltroExtra() && esperado !== null && esperado !== lista.paginacion.total) {
      panel.appendChild(rtEl('p', { className: 'ov-nota ov-nota-alerta', text: 'El listado (' + nf.format(lista.paginacion.total) + ') no coincide con el contador (' + nf.format(esperado) + '): los datos pudieron cambiar entre consultas. Volvé a consultar para actualizar.' }));
    }
    panel.appendChild(ovTabla(lista.data, lista, dias));
    panel.appendChild(ovTarjetas(lista.data, lista));
    panel.appendChild(ovPaginacion(lista.paginacion));
  }
  host.appendChild(panel);
}

// Carga diferida: se programa fuera del render para no anidar renders (rtCargarOportunidades re-renderiza al empezar).
let OV_CARGA_PENDIENTE = false;
function ovProgramarCarga() {
  if (OV_CARGA_PENDIENTE) return;
  OV_CARGA_PENDIENTE = true;
  setTimeout(() => {
    OV_CARGA_PENDIENTE = false;
    if (RT_VIEW === 'oportunidades' && !RT_OPORTUNIDADES && !RT_OPORTUNIDADES_LOADING && !RT_OPORTUNIDADES_ERROR) rtCargarOportunidades();
  }, 0);
}

function renderRTOportunidades(host) {
  const raiz = rtEl('div', { className: 'ov' });
  host.appendChild(raiz);
  raiz.appendChild(ovEncabezado());
  if (!OV_ESCUCHA_MEDIOS && typeof matchMedia === 'function') { // al cruzar el ancho movil se vuelve a dibujar
    OV_ESCUCHA_MEDIOS = true;
    matchMedia(OV_MEDIA_MOVIL).addEventListener('change', () => { if (RT_VIEW === 'oportunidades') rtRenderVistaActual(); });
  }
  ovFormularioFiltros(raiz);
  ovFiltrosActivos(raiz);

  if (!RT_OPORTUNIDADES && !RT_OPORTUNIDADES_LOADING && !RT_OPORTUNIDADES_ERROR) ovProgramarCarga();
  if (RT_OPORTUNIDADES) ovAvisoSucursalesNoConsideradas(raiz, RT_OPORTUNIDADES);
  ovContexto(raiz, RT_OPORTUNIDADES);

  const cx = ovConteosActuales();
  ovGrupos(raiz, cx);
  ovChipsEstados(raiz, cx);
  ovNotasConteo(raiz, cx);
  ovPanelLista(raiz, cx);
  ovRestaurarFoco();
}
