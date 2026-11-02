'use strict';
// Reglas de Oportunidades (Fase 5) -- SOLO ADMIN. Pestana "Reglas" con tres secciones:
//   Perfiles      configuracion de reglas: General y perfiles especificos, versiones, formulario con herencia.
//   Simulaciones  comparacion antes/despues de un conjunto EXPLICITO de versiones, con evidencia guardada.
//   Activacion    revision de un conjunto simulado, activacion explicita e historial.
// Script clasico cargado despues del principal (index.html): usa sus helpers (rtEl, rtEstado, rtTabla, nf, STOCK_API_URL,
// getUser, rtRotAuthHeaders, RT_*). Reglas de diseno:
//   - NO se calcula ni valida ninguna regla aca: el servidor es la fuente del contrato (GET …/perfiles/esquema), de la
//     validacion (los errores vuelven por campo), de la elegibilidad de la evidencia y de la activacion.
//   - Todo texto que viene de la API (nombres, motivos, notas) se inserta con textContent; nunca innerHTML.
//   - Los errores nunca se muestran como listas vacias; guardar un perfil o terminar una simulacion NUNCA activa nada.
//   - Los controles admin no se renderizan para otros roles (el servidor igual exige admin en cada ruta).
const RR_RUTA = '/analisis/oportunidades';
const RR = {
  sub: 'perfiles', base: null, cargandoBase: false, falla: null, mensaje: null,
  detalle: null, form: null, cachePerfil: new Map(), cacheGeneral: new Map(),
  sims: { lista: null, cargando: false, falla: null, offset: 0, form: null, enCurso: false, resultado: null, productos: null, filtros: { categoria: '', perfil: '', codigo: '' }, offsetProd: 0, elegibilidad: null, expandido: null },
  act: { revision: null, motivo: '', confirmo: false, enviando: false, error: null, hist: null, histCargando: false, histFalla: null, histOffset: 0 },
};

const RR_TXT_CAT = { cambia_estado: 'Cambia el estado', mismo_estado_cambia_detalle: 'Mismo estado, cambia el detalle', solo_umbrales: 'Solo cambian los umbrales', sin_cambios: 'Sin cambios' };
const RR_TXT_ALCANCE_ESTADO = {
  ok: 'Existe en el catálogo', alcance_inexistente: 'El alcance ya no existe en el catálogo', sin_productos_en_periodo: 'Sin productos en este período',
  superado_por_precedencia: 'Todos sus productos resuelven a un perfil de mayor precedencia', no_verificado: 'No se pudo verificar contra el catálogo',
};
const RR_TXT_ESTADO_PERFIL = { borrador: 'Borrador', archivado: 'Archivado' };

// ── Utilidades ──────────────────────────────────────────────────────────────────────────────────
const rrEsAdmin = () => { const u = getUser(); return Boolean(u) && u.rol === 'admin'; };
const rrRender = () => { if (RT_VIEW === 'reglas') rtRenderVistaActual(); };
const rrFecha = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso || '—') : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }); };
const rrFrase = t => String(t || '').replace(/\.?\s*$/, '.'); // los mensajes del servidor no siempre terminan en punto
const rrCorta = h => String(h || '').slice(0, 8);
function rrAlcanceTexto(a) {
  if (!a || a.tipo === 'general') return 'General (todos los productos sin perfil propio)';
  if (a.tipo === 'rubro') return 'Rubro ' + a.rubro;
  if (a.tipo === 'rubro_subrubro') return 'Rubro ' + a.rubro + ' · Subrubro ' + a.subrubro;
  if (a.tipo === 'rubro_marca') return 'Rubro ' + a.rubro + ' · Marca ' + a.marca;
  return String(a.tipo);
}
function rrBtn(texto, onClick, cls) {
  const b = rtEl('button', { className: cls || 'btn-sm', text: texto });
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
function rrAviso(tipo, ...hijos) {
  const d = rtEl('div', { className: 'rr-aviso' + (tipo ? ' rr-' + tipo : ''), attrs: { role: tipo === 'peligro' ? 'alert' : 'status' } });
  const c = rtEl('div');
  hijos.forEach(h => c.appendChild(typeof h === 'string' ? document.createTextNode(h) : h));
  d.appendChild(c);
  return d;
}
const rrNegrita = t => rtEl('b', { text: t });
function rrLista(items) { const ul = rtEl('ul'); items.forEach(t => ul.appendChild(rtEl('li', { text: t }))); return ul; }
function rrTag(texto, cls) { return rtEl('span', { className: 'rr-tag' + (cls ? ' rr-' + cls : ''), text: texto }); }
function rrDelta(n) { return rtEl('span', { className: n > 0 ? 'rr-num-pos' : n < 0 ? 'rr-num-neg' : 'rr-muted', text: (n > 0 ? '+' : '') + nf.format(n) }); }
function rrSecundario(host, titulo) { host.appendChild(rtEl('div', { className: 'rr-sec', text: titulo })); }
function rrCampo(etiqueta, control, error) {
  const l = rtEl('label');
  l.appendChild(rtEl('span', { text: etiqueta }));
  l.appendChild(control);
  if (error) l.appendChild(rtEl('span', { className: 'rr-error', text: error }));
  return l;
}
function rrSelect(opciones, valor, onChange, attrs) {
  const s = rtEl('select', attrs ? { attrs } : undefined);
  opciones.forEach(([v, t]) => { const o = rtEl('option', { text: t, attrs: { value: String(v) } }); if (String(v) === String(valor)) o.selected = true; s.appendChild(o); });
  if (onChange) s.addEventListener('change', () => onChange(s.value));
  return s;
}
function rrInput(tipo, valor, onInput, attrs) {
  const i = rtEl('input', { attrs: { type: tipo, ...(attrs || {}) } });
  i.value = valor ?? '';
  if (onInput) i.addEventListener('input', () => onInput(i.value));
  return i;
}
function rrAnidar(planos) { // { 'a.b': 1 } -> { a: { b: 1 } }  (solo arma el cuerpo del pedido; el servidor valida)
  const o = {};
  Object.entries(planos).forEach(([ruta, v]) => { const p = ruta.split('.'); let c = o; p.slice(0, -1).forEach(k => { c[k] = c[k] || {}; c = c[k]; }); c[p[p.length - 1]] = v; });
  return o;
}
function rrAplanar(obj, pre = '', salida = {}) {
  Object.entries(obj || {}).forEach(([k, v]) => { const r = pre ? pre + '.' + k : k; if (v && typeof v === 'object' && !Array.isArray(v)) rrAplanar(v, r, salida); else salida[r] = v; });
  return salida;
}

// rtEstado() hace container.replaceChildren(): se le da un div propio para no borrar el titulo, las subpestanas ni los botones de la vista.
function rrEstado(host, tipo, mensaje, reintentar) {
  const caja = rtEl('div');
  host.appendChild(caja);
  rtEstado(caja, tipo, mensaje, reintentar);
}

// ── Capa HTTP ───────────────────────────────────────────────────────────────────────────────────
// Clasifica cada falla: nunca se devuelve "lista vacia" ante un error.
function rrClasificar(status, data) {
  const codigo = data && data.codigo;
  if (status === 401) return { tipo: 'sesion', mensaje: 'Tu sesión venció. Volvé a ingresar desde el menú principal.' };
  if (status === 403) return { tipo: 'permiso', mensaje: 'No tenés permiso para administrar las reglas.' };
  if (status === 503 && codigo === 'perfiles_no_habilitados') return { tipo: 'no_habilitado', mensaje: 'Las reglas configurables todavía no están habilitadas en este entorno. Oportunidades usa las reglas estándar.' };
  if (status === 503 && (codigo === 'migracion_pendiente' || codigo === 'configuracion_invalida')) return { tipo: 'preparacion', mensaje: 'El módulo de reglas todavía no está listo en el servidor. Avisá a quien administra el sistema.' };
  if (status === 429) return { tipo: 'en_curso', codigo, mensaje: (data && data.error) || 'Ya hay una simulación en curso.' };
  if (status === 500 && codigo === 'conjunto_activo_invalido') return { tipo: 'conjunto_invalido', mensaje: 'El conjunto de reglas vigente no se puede leer. Oportunidades no está aplicando las reglas activadas hasta que se resuelva: avisá a quien administra el sistema.' };
  if (status === 409) return { tipo: 'conflicto', codigo, mensaje: (data && data.error) || 'Conflicto.', datos: data };
  if (status === 400 || status === 422) return { tipo: 'validacion', codigo, mensaje: (data && data.error) || 'Datos inválidos.', errores: (data && data.errores) || [], datos: data };
  return { tipo: 'error', mensaje: (data && data.error) || ('Error del servidor (HTTP ' + status + ').') };
}
async function rrApi(metodo, ruta, cuerpo) {
  try {
    const headers = { ...rtRotAuthHeaders() };
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
    const resp = await fetch(STOCK_API_URL + RR_RUTA + ruta, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    let data = null;
    try { data = await resp.json(); } catch (e) { data = null; }
    if (resp.ok && data && data.ok !== false) return { ok: true, status: resp.status, data };
    return { ok: false, status: resp.status, data: data || {}, falla: rrClasificar(resp.status, data || {}), reintentarEn: resp.headers.get('Retry-After') };
  } catch (e) {
    return { ok: false, status: 0, data: {}, falla: { tipo: 'red', mensaje: 'No se pudo conectar con el servidor. Revisá la conexión y reintentá.' } };
  }
}
function rrMostrarFalla(host, falla, reintentar) {
  const wrap = rtEl('div');
  host.appendChild(wrap);
  if (falla.tipo === 'no_habilitado') return rtEstado(wrap, 'vacio', falla.mensaje);
  if (falla.tipo === 'sesion') {
    rtEstado(wrap, 'error', falla.mensaje);
    const b = rrBtn('Ir al menú principal', () => { location.href = HUB_URL; });
    wrap.querySelector('.rt-state').appendChild(b);
    return;
  }
  if (falla.tipo === 'permiso' || falla.tipo === 'preparacion') return rtEstado(wrap, 'error', falla.mensaje);
  return rtEstado(wrap, 'error', falla.mensaje, reintentar);
}

// ── Carga base ──────────────────────────────────────────────────────────────────────────────────
async function rrCargarBase() {
  RR.cargandoBase = true; RR.falla = null;
  RR.cachePerfil.clear(); RR.cacheGeneral.clear();
  rrRender();
  const [pl, es, vig, cat] = await Promise.all([
    rrApi('GET', '/perfiles?estado=todos'), rrApi('GET', '/perfiles/esquema'), rrApi('GET', '/activaciones/vigente'),
    fetch(STOCK_API_URL + '/analisis/catalogo').then(r => r.json()).catch(() => null),
  ]);
  RR.cargandoBase = false;
  if (!pl.ok) { RR.falla = pl.falla; RR.base = null; return rrRender(); }
  if (!es.ok) { RR.falla = es.falla; RR.base = null; return rrRender(); }
  const perfiles = pl.data.perfiles;
  RR.base = {
    perfiles, esquema: rrLocalizarEsquema(es.data.esquema), general: perfiles.find(p => p.alcance.tipo === 'general') || null,
    vigente: vig.ok ? vig.data.vigente : null, vigenteFalla: vig.ok ? null : vig.falla,
    catalogo: cat && cat.ok ? cat : null,
  };
  rrRender();
}
// Etiquetas visibles de los parametros que miden el ratio de venta = ventas / (ventas + stock). Es solo presentacion: la ruta
// (identificador), el calculo y los valores no cambian. Se aplica sobre el esquema recibido sin modificar la API.
const RR_TEXTOS_RATIO = {
  'venta_destacada.ratio_min': ['Ratio de venta mínimo de "Venta destacada"', 'Ventas ÷ (ventas + stock): 0,7 = 70 %. No es el porcentaje vendido de un ingreso.'],
  'bien_vendido.ratio_min': ['Ratio de venta mínimo de "Bien vendido"', 'Ventas ÷ (ventas + stock): 0,5 = 50 %. No es el porcentaje vendido de un ingreso.'],
  'stock_parado.ratio_max': ['Ratio de venta máximo de "Stock parado"', 'Ventas ÷ (ventas + stock) por debajo del cual rota poco. No es el porcentaje vendido de un ingreso.'],
  'posible_descuento.ratio_max': ['Ratio de venta máximo de "Posible descuento"', 'Ventas ÷ (ventas + stock) por debajo del cual se evalúa un descuento. No es el porcentaje vendido de un ingreso.'],
  'confiabilidad.ventas_min': [null, 'Con menos ventas que esto, el ratio de venta (ventas ÷ (ventas + stock)) se marca como poco confiable.'],
};
function rrLocalizarEsquema(es) {
  const etiquetas = {};
  const grupos = es.grupos.map(g => ({ ...g, parametros: g.parametros.map(p => {
    const t = RR_TEXTOS_RATIO[p.ruta];
    const np = t ? { ...p, etiqueta: t[0] || p.etiqueta, ayuda: t[1] } : p;
    etiquetas[p.ruta] = np.etiqueta;
    return np;
  }) }));
  // El texto de las relaciones lo arma el servidor con las etiquetas originales: se rearma con las visibles (misma ruta/operador).
  const relaciones = (es.relaciones || []).map(r => ({ ...r, texto: (etiquetas[r.izq] || r.izq) + ' ' + r.op + ' ' + (etiquetas[r.der] || r.der) }));
  return { ...es, grupos, relaciones };
}
const rrParamsEsquema = () => RR.base.esquema.grupos.flatMap(g => g.parametros);
function rrEnVigente(perfilId) {
  const v = RR.base && RR.base.vigente;
  if (!v) return null;
  if (v.conjunto.general.perfil_id === perfilId) return v.conjunto.general.version;
  const e = v.conjunto.especificos.find(x => x.perfil_id === perfilId);
  return e ? e.version : null;
}
async function rrDetallePerfil(id, forzar) {
  if (!forzar && RR.cachePerfil.has(id)) return RR.cachePerfil.get(id);
  const r = await rrApi('GET', '/perfiles/' + id);
  if (r.ok) RR.cachePerfil.set(id, r.data);
  return r.ok ? r.data : null;
}
async function rrVersionGeneral(version) {
  if (RR.cacheGeneral.has(version)) return RR.cacheGeneral.get(version);
  const r = await rrApi('GET', '/perfiles/' + RR.base.general.perfil_id + '/versiones/' + version);
  if (!r.ok) return null;
  const v = { ...r.data.version, plano: rrAplanar(r.data.version.parametros_efectivos) }; // la API entrega los efectivos anidados
  RR.cacheGeneral.set(version, v);
  return v;
}

// ── Raiz de la pestana ──────────────────────────────────────────────────────────────────────────
function renderRTReglas(host) {
  host.appendChild(rtEl('h3', { text: 'Reglas de Oportunidades', className: 'rt-subtitulo' }));
  if (!rrEsAdmin()) return rrEstado(host, 'vacio', 'La administración de reglas es solo para administradores.');
  if (!RR.base && !RR.cargandoBase && !RR.falla) rrCargarBase();
  if (RR.cargandoBase && !RR.base) return rrEstado(host, 'loading', 'Cargando reglas...');
  if (RR.falla) return rrMostrarFalla(host, RR.falla, () => rrCargarBase());
  if (!RR.base) return rrEstado(host, 'loading', 'Cargando reglas...');

  host.appendChild(rtEl('p', { className: 'rr-intro', text: 'Acá se configuran, comparan y activan las reglas que usa Oportunidades. Guardar un perfil o terminar una simulación no cambia lo que ve el equipo: solo una activación explícita lo hace.' }));
  if (RR.mensaje) {
    const m = RR.mensaje;
    const a = rrAviso(m.tipo || 'ok', m.texto);
    a.querySelector('div').appendChild(document.createTextNode(' '));
    a.querySelector('div').appendChild(rrBtn('Cerrar', () => { RR.mensaje = null; rrRender(); }));
    host.appendChild(a);
  }
  const subtabs = rtEl('div', { className: 'tabs rt-rot-subtabs' });
  [['perfiles', 'Perfiles'], ['simulaciones', 'Simulaciones'], ['activacion', 'Activación']].forEach(([v, t]) => {
    subtabs.appendChild(rrBtn(t, () => { RR.sub = v; RR.mensaje = null; rrRender(); }, 'tab' + (RR.sub === v ? ' active' : '')));
  });
  host.appendChild(subtabs);
  if (RR.sub === 'perfiles') rrVistaPerfiles(host);
  else if (RR.sub === 'simulaciones') rrVistaSimulaciones(host);
  else rrVistaActivacion(host);
}

// ═════════════════════════ PERFILES ═════════════════════════════════════════════════════════════
function rrBannerVigente(host) {
  const b = RR.base;
  if (b.vigenteFalla) {
    if (b.vigenteFalla.tipo === 'conjunto_invalido') host.appendChild(rrAviso('peligro', rrNegrita('El conjunto vigente no se puede leer. '), b.vigenteFalla.mensaje));
    else host.appendChild(rrAviso('', rrNegrita('No se pudo consultar el conjunto vigente. '), b.vigenteFalla.mensaje));
  } else if (b.vigente) {
    host.appendChild(rrAviso('info', rrNegrita('Conjunto vigente #' + b.vigente.activacion_id + ': '), 'General v' + b.vigente.conjunto.general.version + (b.vigente.conjunto.especificos.length ? ' + ' + b.vigente.conjunto.especificos.length + ' perfil(es) específico(s)' : ' sin perfiles específicos') + ' · activado ' + rrFecha(b.vigente.creada.en) + ' por ' + b.vigente.creada.nombre + '. La vigencia pertenece al conjunto y a sus versiones exactas, no al perfil.'));
  } else {
    host.appendChild(rrAviso('info', rrNegrita('Todavía no hay un conjunto activado. '), 'Oportunidades usa las reglas estándar.'));
  }
}

function rrVistaPerfiles(host) {
  if (RR.form) return rrRenderForm(host);
  if (RR.detalle) return rrRenderDetalle(host);
  rrBannerVigente(host);
  const b = RR.base;
  const barra = rtEl('div', { className: 'rr-row' });
  barra.appendChild(rrBtn('Nuevo perfil específico', () => rrAbrirForm('crear')));
  if (b.general) barra.appendChild(rrBtn('Nueva versión del General', () => rrAbrirForm('general', b.general)));
  host.appendChild(barra);
  if (!b.perfiles.length) return rrEstado(host, 'vacio', 'No hay perfiles guardados.');
  const generalUltimo = b.general ? b.general.version_actual : null;
  const filas = [...b.perfiles].sort((x, y) => (x.alcance.tipo === 'general' ? -1 : y.alcance.tipo === 'general' ? 1 : x.nombre.localeCompare(y.nombre, 'es')));
  const tablaEscritorio = rtTabla(['Perfil', 'Alcance', 'Última versión', 'En el conjunto vigente', 'Estado y avisos', ''], filas, p => {
    const tr = rtEl('tr');
    tr.appendChild(rtEl('td', { className: 'rr-wrap', text: p.nombre }));
    tr.appendChild(rtEl('td', { className: 'rr-wrap', text: rrAlcanceTexto(p.alcance) }));
    tr.appendChild(rtEl('td', { text: 'v' + p.version_actual }));
    const vg = rrEnVigente(p.perfil_id);
    const tdV = rtEl('td', { className: 'rr-wrap' });
    if (b.vigente) tdV.appendChild(vg ? rrTag('v' + vg, vg === p.version_actual ? 'good' : 'warn') : rtEl('span', { className: 'rr-muted', text: 'No incluido' }));
    else tdV.appendChild(rtEl('span', { className: 'rr-muted', text: 'Sin conjunto vigente' }));
    tr.appendChild(tdV);
    const tdE = rtEl('td', { className: 'rr-wrap' });
    tdE.appendChild(rrTag(RR_TXT_ESTADO_PERFIL[p.estado] || p.estado, p.estado === 'archivado' ? 'bad' : ''));
    if (vg && vg !== p.version_actual) tdE.appendChild(rrTag('Hay v' + p.version_actual + ' más nueva que la del conjunto vigente (v' + vg + ')', 'warn'));
    if (p.alcance.tipo !== 'general' && p.estado !== 'archivado' && generalUltimo && p.general_version_referenciada < generalUltimo) tdE.appendChild(rrTag('Vinculado al General v' + p.general_version_referenciada + ' (hay v' + generalUltimo + ')', 'warn'));
    if (p.estado === 'archivado' && p.archivado) tdE.appendChild(rtEl('div', { className: 'rr-muted', text: 'Archivado ' + rrFecha(p.archivado.en) + ' por ' + p.archivado.nombre + ': ' + p.archivado.motivo }));
    tr.appendChild(tdE);
    const tdA = rtEl('td');
    const ac = rtEl('div', { className: 'rr-acciones' });
    ac.appendChild(rrBtn('Ver versiones', () => rrAbrirDetalle(p.perfil_id)));
    if (p.estado !== 'archivado') ac.appendChild(rrBtn('Nueva versión', () => rrAbrirForm(p.alcance.tipo === 'general' ? 'general' : 'version', p)));
    tdA.appendChild(ac);
    tr.appendChild(tdA);
    return tr;
  }, { tableClassName: 'rr-tabla' });
  const envTabla = rtEl('div', { className: 'rr-perfiles-tabla' });
  envTabla.appendChild(tablaEscritorio);
  host.appendChild(envTabla);
  // Mobile: la misma informacion como tarjetas (el CSS alterna tabla/tarjetas por ancho).
  const tarjetas = rtEl('div', { className: 'rr-perfiles-tarjetas' });
  filas.forEach(p => tarjetas.appendChild(rrTarjetaPerfil(p, generalUltimo)));
  host.appendChild(tarjetas);
}

function rrTarjetaPerfil(p, generalUltimo) {
  const b = RR.base;
  const card = rtEl('div', { className: 'rr-perfil-card' });
  card.appendChild(rtEl('h4', { text: p.nombre }));
  const dl = rtEl('dl');
  const fila = (t, v) => { dl.appendChild(rtEl('dt', { text: t })); const dd = rtEl('dd'); if (typeof v === 'object') dd.appendChild(v); else dd.textContent = v; dl.appendChild(dd); };
  fila('Alcance', rrAlcanceTexto(p.alcance));
  fila('Versión guardada', 'v' + p.version_actual);
  const vg = rrEnVigente(p.perfil_id);
  if (b.vigente) fila('Versión vigente', vg ? rrTag('v' + vg, vg === p.version_actual ? 'good' : 'warn') : rtEl('span', { className: 'rr-muted', text: 'No incluido en el conjunto vigente' }));
  else fila('Versión vigente', rtEl('span', { className: 'rr-muted', text: 'Sin conjunto vigente' }));
  const estado = rtEl('div');
  estado.appendChild(rrTag(RR_TXT_ESTADO_PERFIL[p.estado] || p.estado, p.estado === 'archivado' ? 'bad' : ''));
  if (vg && vg !== p.version_actual) estado.appendChild(rrTag('Hay v' + p.version_actual + ' más nueva que la del conjunto vigente (v' + vg + ')', 'warn'));
  if (p.alcance.tipo !== 'general' && p.estado !== 'archivado' && generalUltimo && p.general_version_referenciada < generalUltimo) estado.appendChild(rrTag('Vinculado al General v' + p.general_version_referenciada + ' (hay v' + generalUltimo + ')', 'warn'));
  if (p.estado === 'archivado' && p.archivado) estado.appendChild(rtEl('div', { className: 'rr-muted', text: 'Archivado ' + rrFecha(p.archivado.en) + ' por ' + p.archivado.nombre + ': ' + p.archivado.motivo }));
  fila('Estado', estado);
  card.appendChild(dl);
  const ac = rtEl('div', { className: 'rr-acciones' });
  ac.appendChild(rrBtn('Ver versiones', () => rrAbrirDetalle(p.perfil_id)));
  if (p.estado !== 'archivado') ac.appendChild(rrBtn('Nueva versión', () => rrAbrirForm(p.alcance.tipo === 'general' ? 'general' : 'version', p)));
  card.appendChild(ac);
  return card;
}

// ── Detalle de un perfil: versiones y parametros efectivos ──────────────────────────────────────
async function rrAbrirDetalle(id) {
  RR.detalle = { id, datos: null, cargando: true, falla: null, verVersion: null, archivando: null };
  rrRender();
  const r = await rrApi('GET', '/perfiles/' + id);
  RR.detalle.cargando = false;
  if (r.ok) { RR.detalle.datos = r.data; RR.cachePerfil.set(id, r.data); } else RR.detalle.falla = r.falla;
  rrRender();
}
async function rrVerParametros(version) {
  const d = RR.detalle;
  d.verVersion = { version, cargando: true };
  rrRender();
  const r = await rrApi('GET', '/perfiles/' + d.id + '/versiones/' + version);
  d.verVersion = r.ok ? { version, datos: r.data.version } : { version, falla: r.falla };
  rrRender();
}
function rrRenderDetalle(host) {
  const d = RR.detalle;
  host.appendChild(rrBtn('← Volver a los perfiles', () => { RR.detalle = null; rrRender(); }));
  if (d.cargando) return rrEstado(host, 'loading', 'Cargando versiones...');
  if (d.falla) return rrMostrarFalla(host, d.falla, () => rrAbrirDetalle(d.id));
  const p = d.datos.perfil;
  host.appendChild(rtEl('h4', { className: 'rt-subtitulo', text: p.nombre }));
  host.appendChild(rtEl('p', { className: 'rt-note', text: rrAlcanceTexto(p.alcance) + ' · ' + (RR_TXT_ESTADO_PERFIL[p.estado] || p.estado) + ' · creado por ' + p.creado.nombre + ' el ' + rrFecha(p.creado.en) }));
  if (p.estado === 'archivado' && p.archivado) host.appendChild(rrAviso('', rrNegrita('Archivado: '), p.archivado.motivo + ' (' + p.archivado.nombre + ', ' + rrFecha(p.archivado.en) + '). Las versiones y su historial se conservan.'));
  const vg = rrEnVigente(p.perfil_id);
  if (vg) host.appendChild(rrAviso('info', 'Este perfil forma parte del conjunto vigente con la versión v' + vg + '. No se puede archivar mientras forme parte de él.'));
  if (p.estado !== 'archivado') {
    const barra = rtEl('div', { className: 'rr-row' });
    barra.appendChild(rrBtn('Nueva versión', () => rrAbrirForm(p.alcance.tipo === 'general' ? 'general' : 'version', RR.base.perfiles.find(x => x.perfil_id === p.perfil_id) || p)));
    if (p.alcance.tipo !== 'general') barra.appendChild(rrBtn('Archivar…', () => { d.archivando = { motivo: '', error: null }; rrRender(); }));
    host.appendChild(barra);
  }
  if (d.archivando) {
    const f = rtEl('div', { className: 'rr-form' });
    const area = rtEl('textarea', { attrs: { maxlength: '500', placeholder: 'Motivo del archivado (obligatorio)' } });
    area.value = d.archivando.motivo;
    area.addEventListener('input', () => { d.archivando.motivo = area.value; });
    f.appendChild(rrCampo('Motivo del archivado', area));
    if (d.archivando.error) f.appendChild(rtEl('div', { className: 'rr-error', text: d.archivando.error }));
    const fila = rtEl('div', { className: 'rr-row' });
    fila.appendChild(rrBtn('Confirmar archivado', async () => {
      const r = await rrApi('POST', '/perfiles/' + p.perfil_id + '/archivar', { motivo: d.archivando.motivo, version_base: p.version_actual });
      if (r.ok) { RR.mensaje = { tipo: 'ok', texto: 'Perfil archivado. Sus versiones y su historial se conservan.' }; RR.detalle = null; await rrCargarBase(); return; }
      d.archivando.error = r.falla.tipo === 'validacion' ? (r.falla.errores[0] ? r.falla.errores[0].mensaje : r.falla.mensaje) : r.falla.mensaje;
      rrRender();
    }));
    fila.appendChild(rrBtn('Cancelar', () => { d.archivando = null; rrRender(); }));
    f.appendChild(fila);
    host.appendChild(f);
  }
  rrSecundario(host, 'Versiones (inmutables: editar crea una nueva)');
  host.appendChild(rtTabla(['Versión', 'Motivo', 'Autor', 'Fecha', 'Vinculada al General', 'Huella', ''], [...d.datos.versiones].reverse(), v => {
    const tr = rtEl('tr');
    tr.appendChild(rtEl('td', { text: 'v' + v.version + (rrEnVigente(p.perfil_id) === v.version ? ' · vigente' : '') }));
    tr.appendChild(rtEl('td', { className: 'rr-wrap', text: v.motivo }));
    tr.appendChild(rtEl('td', { text: v.creado.nombre }));
    tr.appendChild(rtEl('td', { text: rrFecha(v.creado.en) }));
    tr.appendChild(rtEl('td', { text: v.general_version ? 'General v' + v.general_version : 'Parámetros completos' }));
    tr.appendChild(rtEl('td', { className: 'rr-mono', text: rrCorta(v.huella) }));
    const td = rtEl('td'); td.appendChild(rrBtn(d.verVersion && d.verVersion.version === v.version ? 'Ocultar parámetros' : 'Ver parámetros', () => {
      if (d.verVersion && d.verVersion.version === v.version) { d.verVersion = null; rrRender(); } else rrVerParametros(v.version);
    }));
    tr.appendChild(td);
    return tr;
  }, { tableClassName: 'rr-tabla' }));
  if (d.verVersion) {
    if (d.verVersion.cargando) host.appendChild(rtEl('p', { className: 'rt-note', text: 'Cargando parámetros...' }));
    else if (d.verVersion.falla) host.appendChild(rrAviso('peligro', d.verVersion.falla.mensaje));
    else rrTablaParametrosEfectivos(host, d.verVersion.datos);
  }
}
function rrTablaParametrosEfectivos(host, v) {
  const plano = rrAplanar(v.parametros_efectivos);
  rrSecundario(host, 'Parámetros efectivos de v' + v.version + (v.general_version ? ' (diferencias sobre el General v' + v.general_version + ')' : ''));
  RR.base.esquema.grupos.forEach(g => {
    const det = rtEl('details', { className: 'rr-grupo' });
    det.appendChild(rtEl('summary', { text: g.titulo }));
    det.appendChild(rtTabla(['Parámetro', 'Valor', 'Origen'], g.parametros, par => {
      const tr = rtEl('tr');
      tr.appendChild(rtEl('td', { className: 'rr-wrap', text: par.etiqueta }));
      tr.appendChild(rtEl('td', { text: nf1.format(plano[par.ruta]) + ' ' + par.unidad }));
      const propio = v.origen_parametros[par.ruta] === 'perfil';
      const tdOrigen = rtEl('td');
      tdOrigen.appendChild(rrTag(v.general_version ? (propio ? 'Propio de este perfil' : 'Heredado del General v' + v.general_version) : 'General', propio ? 'warn' : ''));
      tr.appendChild(tdOrigen);
      return tr;
    }, { tableClassName: 'rr-tabla' }));
    host.appendChild(det);
  });
}

// ── Formulario: crear perfil / nueva version ────────────────────────────────────────────────────
async function rrAbrirForm(modo, perfil) {
  const b = RR.base;
  const f = RR.form = { modo, perfil: perfil || null, cargando: true, falla: null, nombre: '', rubro: '', alcanceTipo: 'rubro', rubrosExtra: [], subrubro: '', marca: '', motivo: '',
    generalVersion: b.general ? b.general.version_actual : 1, generalBase: null, versionBase: null, sobrescribe: {}, valores: {}, valoresBase: {}, errores: { campos: {}, resumen: [] }, conflicto: null, guardando: false };
  rrRender();
  try {
    if (modo === 'crear') {
      await rrVersionGeneral(f.generalVersion);
    } else if (modo === 'general') {
      const det = await rrDetallePerfil(perfil.perfil_id, true);
      const ult = det.versiones[det.versiones.length - 1];
      const r = await rrApi('GET', '/perfiles/' + perfil.perfil_id + '/versiones/' + ult.version);
      if (!r.ok) throw r.falla;
      f.versionBase = ult.version;
      const plano = rrAplanar(r.data.version.parametros_efectivos); // el General guarda los parametros completos
      f.valoresBase = plano;
      rrParamsEsquema().forEach(p => { f.valores[p.ruta] = String(plano[p.ruta]); });
    } else {
      const det = await rrDetallePerfil(perfil.perfil_id, true);
      const ult = det.versiones[det.versiones.length - 1];
      f.versionBase = ult.version;
      f.generalVersion = ult.general_version; f.generalBase = ult.general_version;
      await rrVersionGeneral(f.generalVersion);
      Object.entries(rrAplanar(ult.parametros)).forEach(([ruta, v]) => { f.sobrescribe[ruta] = true; f.valores[ruta] = String(v); });
      f.alcance = perfil.alcance;
    }
    f.cargando = false;
  } catch (falla) {
    f.cargando = false; f.falla = falla && falla.tipo ? falla : { tipo: 'error', mensaje: 'No se pudo cargar el perfil.' };
  }
  rrRender();
}
function rrErrorForm(f, ruta) { return f.errores.campos[ruta] || null; }

function rrRenderForm(host) {
  const f = RR.form;
  host.appendChild(rrBtn('← Cancelar y volver', () => { RR.form = null; rrRender(); }));
  if (f.cargando) return rrEstado(host, 'loading', 'Preparando el formulario...');
  if (f.falla) return rrMostrarFalla(host, f.falla, () => rrAbrirForm(f.modo, f.perfil));
  const esGeneral = f.modo === 'general';
  const titulo = f.modo === 'crear' ? 'Nuevo perfil específico' : esGeneral ? 'Nueva versión del General (v' + f.versionBase + ' → v' + (f.versionBase + 1) + ')' : 'Nueva versión de "' + f.perfil.nombre + '" (v' + f.versionBase + ' → v' + (f.versionBase + 1) + ')';
  host.appendChild(rtEl('h4', { className: 'rt-subtitulo', text: titulo }));
  host.appendChild(rtEl('p', { className: 'rt-note', text: 'Guardar crea un borrador o una versión nueva; no activa nada. Para que Oportunidades las use hay que simularlas y activarlas.' }));

  if (f.conflicto) {
    const a = rrAviso('peligro', rrNegrita('Otra persona guardó cambios mientras editabas. '), f.conflicto.mensaje + ' Tus cambios siguen en este formulario: no se perdieron.');
    a.querySelector('div').appendChild(rtEl('div', { className: 'rr-row' }));
    const fila = a.querySelector('.rr-row');
    fila.appendChild(rrBtn('Reintentar sobre la versión v' + f.conflicto.version_actual, () => { f.versionBase = f.conflicto.version_actual; f.conflicto = null; f.errores = { campos: {}, resumen: [] }; rrRender(); }));
    fila.appendChild(rrBtn('Descartar mis cambios y recargar', () => rrAbrirForm(f.modo, f.perfil)));
    host.appendChild(a);
  }
  if (f.errores.resumen.length) {
    const a = rrAviso('peligro', rrNegrita('No se pudo guardar. '), 'Revisá lo siguiente:');
    a.querySelector('div').appendChild(rrLista(f.errores.resumen));
    host.appendChild(a);
  }

  const form = rtEl('div', { className: 'rr-form' });
  const campos = rtEl('div', { className: 'rr-campos' });
  if (f.modo === 'crear') {
    campos.appendChild(rrCampo('Nombre del perfil', rrInput('text', f.nombre, v => { f.nombre = v; }, { maxlength: '80', placeholder: 'Ej.: Remeras de verano' }), rrErrorForm(f, 'nombre')));
    const cat = RR.base.catalogo;
    if (!cat) campos.appendChild(rrAviso('', 'No se pudo consultar el catálogo de rubros y marcas: no se puede definir el alcance ahora. Reintentá más tarde.'));
    const rubros = cat ? cat.rubros : [];
    campos.appendChild(rrCampo('Rubro', rrSelect([['', 'Elegí un rubro'], ...rubros.map(r => [r, r])], f.rubro, v => { f.rubro = v; f.subrubro = ''; f.rubrosExtra = f.rubrosExtra.filter(x => x !== v); rrRender(); }), rrErrorForm(f, 'alcance.rubro')));
    campos.appendChild(rrCampo('Aplicar a', rrSelect([['rubro', 'Todo el rubro'], ['rubro_subrubro', 'Un subrubro del rubro'], ['rubro_marca', 'Una marca dentro del rubro']], f.alcanceTipo, v => { f.alcanceTipo = v; rrRender(); })));
    if (f.alcanceTipo === 'rubro_subrubro') {
      const subs = (cat && cat.subrubros_por_rubro && cat.subrubros_por_rubro[f.rubro]) || [];
      campos.appendChild(rrCampo('Subrubro', rrSelect([['', f.rubro ? 'Elegí un subrubro' : 'Elegí primero un rubro'], ...subs.map(s => [s, s])], f.subrubro, v => { f.subrubro = v; }), rrErrorForm(f, 'alcance.subrubro')));
    }
    if (f.alcanceTipo === 'rubro_marca') {
      campos.appendChild(rrCampo('Marca', rrSelect([['', 'Elegí una marca'], ...(cat ? cat.marcas : []).map(m => [m, m])], f.marca, v => { f.marca = v; }), rrErrorForm(f, 'alcance.marca')));
    }
  } else if (!esGeneral) {
    campos.appendChild(rrAviso('info', rrNegrita('Alcance (no se edita): '), rrAlcanceTexto(f.perfil.alcance)));
  }
  form.appendChild(campos);
  if (f.modo === 'crear' && f.alcanceTipo === 'rubro' && RR.base.catalogo) {
    const otros = RR.base.catalogo.rubros.filter(r => r !== f.rubro);
    const det = rtEl('details', { className: 'rr-grupo rr-rubros-extra' });
    if (f.rubrosExtra.length) det.setAttribute('open', '');
    det.appendChild(rtEl('summary', { text: 'Aplicar el mismo perfil también a otros rubros' + (f.rubrosExtra.length ? ' (' + f.rubrosExtra.length + ' elegido' + (f.rubrosExtra.length === 1 ? '' : 's') + ')' : '') }));
    det.appendChild(rtEl('p', { className: 'rr-grupo-desc', text: 'Se crea un perfil por rubro, con los mismos parámetros y el rubro agregado al nombre. Después cada perfil se versiona por separado.' }));
    const lista = rtEl('div', { className: 'rr-rubros-lista' });
    otros.forEach(r => {
      const l = rtEl('label', { className: 'rr-sobrescribir' });
      const cb = rtEl('input', { attrs: { type: 'checkbox' } }); cb.checked = f.rubrosExtra.includes(r);
      cb.addEventListener('change', () => { f.rubrosExtra = cb.checked ? [...f.rubrosExtra, r] : f.rubrosExtra.filter(x => x !== r); rrRender(); });
      l.appendChild(cb); l.appendChild(document.createTextNode(r));
      lista.appendChild(l);
    });
    det.appendChild(lista);
    form.appendChild(det);
  }
  if (f.alcanceTipo === 'rubro_marca' && f.modo === 'crear') form.appendChild(rrAviso('info', 'El catálogo actual valida la marca y el rubro por separado, pero no que esa marca exista en ese rubro. Si no hay productos en esa combinación, el perfil simplemente no se aplicará a ninguno.'));
  if (f.modo === 'crear' && f.alcanceTipo !== 'rubro') form.appendChild(rtEl('p', { className: 'rr-muted', text: 'Si un producto coincide con varios perfiles, rige el de mayor precedencia: rubro + subrubro, luego rubro + marca, luego rubro, luego el General. Nunca se combinan.' }));

  // Referencia al General (solo perfiles especificos)
  if (!esGeneral) {
    const g = RR.base.general;
    const versiones = Array.from({ length: g.version_actual }, (_, i) => [i + 1, 'General v' + (i + 1) + (i + 1 === g.version_actual ? ' (última)' : '')]);
    const sel = rrSelect(versiones, f.generalVersion, async v => { f.generalVersion = Number(v); await rrVersionGeneral(f.generalVersion); rrRender(); });
    form.appendChild(rrCampo('Hereda de', sel, rrErrorForm(f, 'general_version')));
    form.appendChild(rtEl('p', { className: 'rr-muted', text: 'Los parámetros que no sobrescribas se toman de esa versión del General. Cambiar de versión es una decisión explícita: no se actualiza sola.' }));
    if (f.modo === 'version' && f.generalBase && f.generalVersion !== f.generalBase) rrPreviewCambioGeneral(form, f);
  }

  // Parametros agrupados segun el contrato del servidor
  const general = esGeneral ? null : RR.cacheGeneral.get(f.generalVersion);
  RR.base.esquema.grupos.forEach((g, i) => {
    const det = rtEl('details', { className: 'rr-grupo' });
    if (i === 0 || g.parametros.some(p => f.errores.campos[p.ruta])) det.setAttribute('open', '');
    const resumen = rtEl('summary');
    resumen.appendChild(document.createTextNode(g.titulo));
    const n = g.parametros.filter(p => (esGeneral ? f.valores[p.ruta] !== String(f.valoresBase[p.ruta]) : f.sobrescribe[p.ruta])).length;
    if (n) resumen.appendChild(rrTag(n + (esGeneral ? ' modificado(s)' : ' sobrescrito(s)'), 'warn'));
    det.appendChild(resumen);
    det.appendChild(rtEl('p', { className: 'rr-grupo-desc', text: g.descripcion }));
    g.parametros.forEach(p => det.appendChild(rrFilaParametro(f, p, general, esGeneral)));
    form.appendChild(det);
  });

  if (RR.base.esquema.relaciones.length) {
    const d2 = rtEl('details', { className: 'rr-grupo' });
    d2.appendChild(rtEl('summary', { text: 'Relaciones que debe cumplir el conjunto de valores' }));
    const cajaRel = rtEl('div', { className: 'rr-grupo-desc' });
    cajaRel.appendChild(rrLista(RR.base.esquema.relaciones.map(r => r.texto)));
    d2.appendChild(cajaRel);
    d2.appendChild(rtEl('p', { className: 'rr-grupo-desc', text: 'El servidor las comprueba sobre los valores efectivos al guardar. Reglas fijas que ningún perfil puede cambiar: ' + RR.base.esquema.reglas_fijas.join(' · ') }));
    form.appendChild(d2);
  }

  const area = rtEl('textarea', { attrs: { maxlength: '500', placeholder: 'Qué cambia y por qué' } });
  area.value = f.motivo;
  area.addEventListener('input', () => { f.motivo = area.value; });
  form.appendChild(rtEl('div', { className: 'rr-row' }));
  form.appendChild(rrCampo('Motivo del cambio (obligatorio)', area, rrErrorForm(f, 'motivo')));
  const fila = rtEl('div', { className: 'rr-row' });
  const guardar = rrBtn(f.guardando ? 'Guardando…' : (f.modo === 'crear' ? 'Guardar borrador' : 'Guardar nueva versión'), () => rrGuardarForm(), 'btn-sm rr-btn-principal');
  guardar.disabled = f.guardando;
  fila.appendChild(guardar);
  fila.appendChild(rrBtn('Cancelar', () => { RR.form = null; rrRender(); }));
  form.appendChild(fila);
  host.appendChild(form);
}

function rrFilaParametro(f, p, general, esGeneral) {
  const fila = rtEl('div', { className: 'rr-param' });
  const err = f.errores.campos[p.ruta];
  const base = esGeneral ? f.valoresBase[p.ruta] : (general ? general.plano[p.ruta] : undefined);
  const nom = rtEl('div', { className: 'rr-param-nombre' });
  nom.appendChild(document.createTextNode(p.etiqueta));
  nom.appendChild(rtEl('small', { text: p.ayuda }));
  nom.appendChild(rtEl('small', { text: 'Unidad: ' + p.unidad + ' · rango ' + (p.minimo_exclusivo ? 'mayor que 0' : p.min) + ' a ' + p.max }));
  fila.appendChild(nom);
  const ctl = rtEl('div', { className: 'rr-param-ctl' });
  const attrs = { step: String(p.paso), min: String(p.min), max: String(p.max), inputmode: 'decimal' };
  if (esGeneral) {
    const inp = rrInput('number', f.valores[p.ruta], v => { f.valores[p.ruta] = v; fila.classList.toggle('rr-cambiado', v !== String(base)); }, { ...attrs, 'aria-label': p.etiqueta });
    if (f.valores[p.ruta] !== String(base)) fila.classList.add('rr-cambiado');
    ctl.appendChild(inp);
  } else {
    const activo = Boolean(f.sobrescribe[p.ruta]);
    const check = rtEl('input', { attrs: { type: 'checkbox' } }); check.checked = activo;
    const lab = rtEl('label', { className: 'rr-sobrescribir' });
    lab.appendChild(check); lab.appendChild(document.createTextNode('Sobrescribir'));
    const inp = rrInput('number', activo ? f.valores[p.ruta] : (base ?? ''), v => { f.valores[p.ruta] = v; }, { ...attrs, 'aria-label': p.etiqueta });
    inp.disabled = !activo;
    check.addEventListener('change', () => {
      f.sobrescribe[p.ruta] = check.checked;
      if (check.checked && f.valores[p.ruta] === undefined) f.valores[p.ruta] = String(base ?? '');
      rrRender();
    });
    ctl.appendChild(inp); ctl.appendChild(lab);
    if (activo) fila.classList.add('rr-cambiado');
  }
  fila.appendChild(ctl);
  const info = rtEl('div', { className: 'rr-herencia' });
  if (esGeneral) info.appendChild(document.createTextNode('Valor actual: ' + nf1.format(base) + ' ' + p.unidad));
  else {
    info.appendChild(document.createTextNode('Heredado del General v' + f.generalVersion + ': '));
    info.appendChild(rtEl('b', { text: base === undefined ? '—' : nf1.format(base) + ' ' + p.unidad }));
  }
  if (err) { info.appendChild(rtEl('div', { className: 'rr-error', text: err })); fila.classList.add('rr-con-error'); }
  fila.appendChild(info);
  return fila;
}

// "Al cambiar el General referenciado, mostrar que parametros efectivos cambiaran antes de guardar" (solo aritmetica de
// visualizacion: nada de reglas; el servidor valida al guardar).
function rrPreviewCambioGeneral(form, f) {
  const anterior = RR.cacheGeneral.get(f.generalBase), nuevo = RR.cacheGeneral.get(f.generalVersion);
  if (!anterior || !nuevo) { form.appendChild(rtEl('p', { className: 'rt-note', text: 'Calculando el efecto del cambio de General…' })); return; }
  const cambios = rrParamsEsquema().filter(p => !f.sobrescribe[p.ruta] && anterior.plano[p.ruta] !== nuevo.plano[p.ruta]);
  if (!cambios.length) { form.appendChild(rrAviso('info', 'Pasar del General v' + f.generalBase + ' al v' + f.generalVersion + ' no cambia ningún parámetro efectivo de este perfil.')); return; }
  const a = rrAviso('', rrNegrita('Al pasar del General v' + f.generalBase + ' al v' + f.generalVersion + ' cambian estos parámetros efectivos: '));
  a.querySelector('div').appendChild(rrLista(cambios.map(p => p.etiqueta + ': ' + nf1.format(anterior.plano[p.ruta]) + ' → ' + nf1.format(nuevo.plano[p.ruta]) + ' ' + p.unidad)));
  a.querySelector('div').appendChild(rtEl('span', { className: 'rr-muted', text: 'Los parámetros que sobrescribiste no cambian. Si algún valor deja de ser compatible, el servidor lo rechaza al guardar.' }));
  form.appendChild(a);
}

// Un perfil por rubro con los mismos parametros (el modelo sigue siendo un rubro por perfil). Se crean en orden; si uno falla se
// frena, se conservan los ya creados y el formulario queda con los que faltan para reintentar sin duplicar.
async function rrGuardarVariosRubros(f, parametros) {
  const rubros = [f.rubro, ...f.rubrosExtra.filter(r => r !== f.rubro)];
  const nombreDe = r => f.nombre.trim() + ' · ' + r;
  const largo = rubros.find(r => nombreDe(r).length > 80);
  if (largo) { f.errores.campos.nombre = 'Con el rubro agregado el nombre supera los 80 caracteres ("' + nombreDe(largo).slice(0, 30) + '…"). Acortalo.'; f.errores.resumen = ['Completá los campos marcados.']; return rrRender(); }
  f.guardando = true; rrRender();
  const creados = [];
  for (const rubro of rubros) {
    const r = await rrApi('POST', '/perfiles', { nombre: nombreDe(rubro), alcance: { tipo: 'rubro', rubro }, parametros: rrAnidar(parametros), motivo: f.motivo.trim() });
    if (r.ok) { creados.push(rubro); continue; }
    f.guardando = false;
    const falla = r.falla;
    if (falla.tipo === 'sesion' || falla.tipo === 'permiso') { RR.form = null; RR.falla = falla; return rrRender(); }
    const motivo = falla.tipo === 'validacion' && falla.errores && falla.errores[0] ? falla.errores[0].mensaje : falla.mensaje;
    if (creados.length) { // los ya creados salen de la seleccion: reintentar no los duplica
      const faltan = rubros.filter(x => !creados.includes(x));
      f.rubro = faltan[0]; f.rubrosExtra = faltan.slice(1);
      f.errores.resumen.push('Se crearon ' + creados.length + ' perfil(es): ' + creados.join(', ') + '.');
      await rrCargarBase();
    }
    f.errores.resumen.push('No se pudo crear el perfil de "' + rubro + '": ' + motivo + (creados.length ? ' El formulario quedó con los rubros que faltan.' : ''));
    return rrRender();
  }
  RR.form = null;
  RR.mensaje = { tipo: 'ok', texto: creados.length + ' perfiles guardados como borrador (' + creados.join(', ') + '). Todavía no están activos: para usarlos hay que simularlos y activarlos.' };
  await rrCargarBase();
}

async function rrGuardarForm() {
  const f = RR.form;
  f.errores = { campos: {}, resumen: [] }; f.conflicto = null;
  const esGeneral = f.modo === 'general';
  const parametros = {};
  const pendientes = [];
  rrParamsEsquema().forEach(p => {
    if (esGeneral || f.sobrescribe[p.ruta]) {
      const bruto = f.valores[p.ruta];
      if (bruto === undefined || String(bruto).trim() === '') pendientes.push(p);
      else parametros[p.ruta] = Number(bruto);
    }
  });
  pendientes.forEach(p => { f.errores.campos[p.ruta] = 'Ingresá un valor' + (esGeneral ? '' : ' o desmarcá "Sobrescribir"'); });
  if (f.modo === 'crear') {
    if (!f.nombre.trim()) f.errores.campos.nombre = 'Ingresá un nombre';
    if (!f.rubro) f.errores.campos['alcance.rubro'] = 'Elegí un rubro';
    if (f.alcanceTipo === 'rubro_subrubro' && !f.subrubro) f.errores.campos['alcance.subrubro'] = 'Elegí un subrubro';
    if (f.alcanceTipo === 'rubro_marca' && !f.marca) f.errores.campos['alcance.marca'] = 'Elegí una marca';
  }
  if (!f.motivo.trim()) f.errores.campos.motivo = 'Contá brevemente qué cambia y por qué';
  if (Object.keys(f.errores.campos).length) { f.errores.resumen = ['Completá los campos marcados.']; return rrRender(); }

  if (f.modo === 'crear' && f.alcanceTipo === 'rubro' && f.rubrosExtra.length) return rrGuardarVariosRubros(f, parametros);
  let ruta, cuerpo;
  if (f.modo === 'crear') {
    const alcance = { tipo: f.alcanceTipo, rubro: f.rubro };
    if (f.alcanceTipo === 'rubro_subrubro') alcance.subrubro = f.subrubro;
    if (f.alcanceTipo === 'rubro_marca') alcance.marca = f.marca;
    ruta = '/perfiles'; cuerpo = { nombre: f.nombre.trim(), alcance, parametros: rrAnidar(parametros), motivo: f.motivo.trim() };
  } else {
    ruta = '/perfiles/' + f.perfil.perfil_id + '/versiones';
    cuerpo = { version_base: f.versionBase, parametros: rrAnidar(parametros), motivo: f.motivo.trim() };
    if (!esGeneral && f.generalBase !== null && f.generalVersion !== f.generalBase) cuerpo.general_version = f.generalVersion;
  }
  f.guardando = true; rrRender();
  const r = await rrApi('POST', ruta, cuerpo);
  f.guardando = false;
  if (r.ok) {
    const etiqueta = f.modo === 'crear' ? 'Perfil "' + cuerpo.nombre + '" guardado como borrador' : 'Nueva versión guardada (v' + r.data.version.version + ')';
    RR.form = null;
    RR.mensaje = { tipo: 'ok', texto: etiqueta + '. Todavía no está activo: para usarlo hay que simularlo y activarlo.' };
    await rrCargarBase();
    return;
  }
  const falla = r.falla;
  if (falla.tipo === 'conflicto' && falla.codigo === 'conflicto_version') {
    f.conflicto = { version_actual: falla.datos.version_actual, mensaje: falla.mensaje.replace(/\.?\s*$/, '.') };
    const det = f.perfil ? await rrDetallePerfil(f.perfil.perfil_id, true) : null;
    const ult = det && det.versiones.find(v => v.version === falla.datos.version_actual);
    if (ult) f.conflicto.mensaje += ' La versión v' + ult.version + ' la guardó ' + ult.creado.nombre + ' (' + rrFecha(ult.creado.en) + '): "' + ult.motivo + '".';
  } else if (falla.tipo === 'validacion') {
    (falla.errores || []).forEach(e => {
      const clave = e.ruta;
      if (e.codigo === 'relacion') { // "a < b": se traduce con el texto del contrato y se marcan los dos parametros involucrados
        const rel = RR.base.esquema.relaciones.find(r => r.izq + ' ' + r.op + ' ' + r.der === clave);
        const m = String(e.mensaje).match(/\(recibido[^)]*\)/);
        if (rel) {
          f.errores.resumen.push('No se cumple la relación entre parámetros: ' + rel.texto + (m ? ' ' + m[0] : '') + '.');
          [rel.izq, rel.der].forEach(r => { f.errores.campos[r] = 'Interviene en: ' + rel.texto; });
          return;
        }
      }
      if (rrParamsEsquema().some(p => p.ruta === clave) || ['nombre', 'motivo', 'alcance.rubro', 'alcance.subrubro', 'alcance.marca', 'general_version'].includes(clave)) f.errores.campos[clave] = e.mensaje;
      else f.errores.resumen.push(e.mensaje);
    });
    if (!falla.errores || !falla.errores.length) f.errores.resumen.push(falla.mensaje);
    else if (!f.errores.resumen.length && !Object.keys(f.errores.campos).length) f.errores.resumen.push(falla.mensaje);
  } else if (falla.tipo === 'conflicto') {
    f.errores.resumen.push(falla.mensaje);
  } else if (falla.tipo === 'sesion' || falla.tipo === 'permiso') {
    RR.form = null; RR.falla = falla;
  } else {
    f.errores.resumen.push(falla.mensaje);
  }
  rrRender();
}

// ═════════════════════════ SIMULACIONES ═════════════════════════════════════════════════════════
async function rrCargarSims() {
  const s = RR.sims;
  s.cargando = true; s.falla = null; rrRender();
  const r = await rrApi('GET', '/simulaciones?limit=20&offset=' + s.offset);
  s.cargando = false;
  if (r.ok) s.lista = r.data; else s.falla = r.falla;
  rrRender();
}
function rrFormSimNuevo(base) {
  const hoy = RT_HASTA, desde = RT_DESDE;
  RR.sims.form = Object.assign({ desde, hasta: hoy, generalVersion: RR.base.general.version_actual, esp: {}, todas: true, sucursales: [...RT_CENTROS_TODOS].filter(c => c !== '0009'), referencia: 'vigente', errores: [], aviso: null }, base || {});
  RR.sims.resultado = null; rrRender();
}
function rrFormSimDesdeVigente() {
  const v = RR.base.vigente, f = RR.sims.form;
  f.generalVersion = v ? v.conjunto.general.version : RR.base.general.version_actual;
  f.esp = {};
  if (v) v.conjunto.especificos.forEach(e => { f.esp[e.perfil_id] = { sel: true, version: e.version }; });
  rrRender();
}

function rrVistaSimulaciones(host) {
  const s = RR.sims;
  if (s.resultado) return rrRenderResultadoSim(host);
  if (s.form) return rrRenderFormSim(host);
  if (!s.lista && !s.cargando && !s.falla) rrCargarSims();
  const barra = rtEl('div', { className: 'rr-row' });
  barra.appendChild(rrBtn('Nueva simulación', () => rrFormSimNuevo()));
  host.appendChild(barra);
  host.appendChild(rtEl('p', { className: 'rr-intro', text: 'Una simulación evalúa un conjunto explícito de versiones sobre los datos actuales y lo compara contra las reglas vigentes. Abrir una simulación guardada no vuelve a consultar los datos.' }));
  if (s.cargando && !s.lista) return rrEstado(host, 'loading', 'Cargando simulaciones...');
  if (s.falla) return rrMostrarFalla(host, s.falla, rrCargarSims);
  if (!s.lista) return;
  if (!s.lista.simulaciones.length) return rrEstado(host, 'vacio', 'Todavía no hay simulaciones guardadas.');
  host.appendChild(rtTabla(['Fecha', 'Autor', 'Período', 'Conjunto simulado', 'Impacto', ''], s.lista.simulaciones, x => {
    const tr = rtEl('tr');
    tr.appendChild(rtEl('td', { text: rrFecha(x.creada.en) + (x.origen_simulacion_id ? ' · reejecución' : '') }));
    tr.appendChild(rtEl('td', { text: x.creada.nombre }));
    tr.appendChild(rtEl('td', { text: x.periodo.desde + ' a ' + x.periodo.hasta }));
    tr.appendChild(rtEl('td', { className: 'rr-wrap', text: 'General v' + x.escenario.general.version + (x.escenario.especificos.length ? ' + ' + x.escenario.especificos.map(e => e.nombre + ' v' + e.version).join(', ') : '') }));
    const c = x.cambios;
    tr.appendChild(rtEl('td', { className: 'rr-wrap', text: nf.format(c.cambia_estado) + ' cambian de estado · ' + nf.format(c.mismo_estado_cambia_detalle) + ' cambian el detalle · ' + nf.format(c.solo_umbrales) + ' solo umbrales' }));
    const td = rtEl('td'); td.appendChild(rrBtn('Abrir', () => rrAbrirSim(x.simulacion_id))); tr.appendChild(td);
    return tr;
  }, { tableClassName: 'rr-tabla' }));
  const p = s.lista.paginacion;
  const pag = rtEl('div', { className: 'rt-pagination' });
  pag.appendChild(rtEl('span', { text: 'Mostrando ' + (p.total ? p.offset + 1 : 0) + '–' + (p.offset + p.devueltos) + ' de ' + nf.format(p.total) }));
  const ant = rrBtn('← Anterior', () => { s.offset = Math.max(0, s.offset - p.limit); rrCargarSims(); }); ant.disabled = p.offset === 0;
  const sig = rrBtn('Siguiente →', () => { s.offset += p.limit; rrCargarSims(); }); sig.disabled = p.offset + p.devueltos >= p.total;
  pag.appendChild(ant); pag.appendChild(sig);
  host.appendChild(pag);
}

// ── Formulario de nueva simulacion (seleccion EXPLICITA) ────────────────────────────────────────
function rrRenderFormSim(host) {
  const f = RR.sims.form, b = RR.base;
  host.appendChild(rrBtn('← Volver a las simulaciones', () => { RR.sims.form = null; rrRender(); }));
  host.appendChild(rtEl('h4', { className: 'rt-subtitulo', text: 'Nueva simulación' }));
  host.appendChild(rtEl('p', { className: 'rt-note', text: 'Elegí exactamente qué versiones querés probar. No se usa "la última" ni se incluyen perfiles que no marques. Simular no cambia lo que ve el equipo.' }));
  if (RR.sims.enCurso) host.appendChild(rrAviso('info', rrNegrita('Simulación en curso… '), 'Está consultando los datos y comparando; puede tardar unos segundos. No hace falta que hagas nada más.'));
  if (f.aviso) host.appendChild(rrAviso(f.aviso.tipo || '', f.aviso.texto));
  if (f.errores.length) { const a = rrAviso('peligro', rrNegrita('No se pudo ejecutar la simulación:')); a.querySelector('div').appendChild(rrLista(f.errores)); host.appendChild(a); }

  const form = rtEl('div', { className: 'rr-form' });
  const campos = rtEl('div', { className: 'rr-campos' });
  campos.appendChild(rrCampo('Desde', rrInput('date', f.desde, v => { f.desde = v; })));
  campos.appendChild(rrCampo('Hasta', rrInput('date', f.hasta, v => { f.hasta = v; })));
  const g = b.general;
  campos.appendChild(rrCampo('General', rrSelect(Array.from({ length: g.version_actual }, (_, i) => [i + 1, 'General v' + (i + 1) + (i + 1 === g.version_actual ? ' (última)' : '')]), f.generalVersion, v => { f.generalVersion = Number(v); rrRender(); })));
  const refTxt = b.vigente ? 'conjunto vigente #' + b.vigente.activacion_id : 'reglas estándar (compat-operativo): no hay conjunto vigente';
  campos.appendChild(rrCampo('Comparar contra', rrSelect([['vigente', 'Reglas vigentes — ' + refTxt], ['compat', 'Reglas estándar (diagnóstico; no sirve para activar)']], f.referencia, v => { f.referencia = v; rrRender(); })));
  form.appendChild(campos);
  if (f.referencia === 'compat' && b.vigente) form.appendChild(rrAviso('', 'Comparar contra las reglas estándar sirve para entender el efecto acumulado, pero esta simulación no podrá usarse para activar mientras exista un conjunto vigente.'));

  rrSecundario(form, 'Perfiles específicos a probar (marcá y elegí la versión de cada uno)');
  const barra = rtEl('div', { className: 'rr-row' });
  barra.appendChild(rrBtn('Partir del conjunto vigente', () => rrFormSimDesdeVigente()));
  barra.appendChild(rrBtn('Quitar todos', () => { f.esp = {}; rrRender(); }));
  form.appendChild(barra);
  const especificos = b.perfiles.filter(p => p.alcance.tipo !== 'general' && p.estado !== 'archivado');
  if (!especificos.length) form.appendChild(rtEl('p', { className: 'rr-muted', text: 'No hay perfiles específicos activos para elegir; la simulación evaluaría solo el General.' }));
  especificos.forEach(p => {
    const fila = rtEl('div', { className: 'rr-param' });
    const e = f.esp[p.perfil_id] || { sel: false, version: p.version_actual };
    const cb = rtEl('input', { attrs: { type: 'checkbox', 'aria-label': 'Incluir ' + p.nombre } }); cb.checked = Boolean(e.sel);
    cb.addEventListener('change', async () => { f.esp[p.perfil_id] = { sel: cb.checked, version: e.version }; if (cb.checked) await rrDetallePerfil(p.perfil_id); rrRender(); });
    const nom = rtEl('div', { className: 'rr-param-nombre' });
    const lab = rtEl('label', { className: 'rr-sobrescribir' }); lab.appendChild(cb); lab.appendChild(document.createTextNode(p.nombre));
    nom.appendChild(lab); nom.appendChild(rtEl('small', { text: rrAlcanceTexto(p.alcance) }));
    fila.appendChild(nom);
    const ctl = rtEl('div', { className: 'rr-param-ctl' });
    const selVersion = rrSelect(Array.from({ length: p.version_actual }, (_, i) => [i + 1, 'v' + (i + 1) + (i + 1 === p.version_actual ? ' (última)' : '')]), e.version, v => { f.esp[p.perfil_id] = { sel: e.sel, version: Number(v) }; rrRender(); }, { 'aria-label': 'Versión de ' + p.nombre });
    selVersion.disabled = !e.sel;
    ctl.appendChild(selVersion);
    fila.appendChild(ctl);
    const info = rtEl('div', { className: 'rr-herencia' });
    const det = RR.cachePerfil.get(p.perfil_id);
    const vv = det && det.versiones.find(x => x.version === Number(e.version));
    if (e.sel && vv && vv.general_version) {
      info.appendChild(document.createTextNode('Vinculada al General v' + vv.general_version + '. '));
      if (vv.general_version !== f.generalVersion) info.appendChild(rrTag('Distinto del General v' + f.generalVersion + ' elegido: se evalúa con los parámetros del v' + vv.general_version, 'warn'));
    } else if (e.sel) info.appendChild(document.createTextNode('Cargando vínculo…'));
    const vg = rrEnVigente(p.perfil_id);
    if (vg) info.appendChild(rtEl('div', { className: 'rr-muted', text: 'Conjunto vigente usa v' + vg }));
    fila.appendChild(info);
    form.appendChild(fila);
  });

  rrSecundario(form, 'Sucursales');
  const cbTodas = rtEl('input', { attrs: { type: 'checkbox' } }); cbTodas.checked = f.todas;
  cbTodas.addEventListener('change', () => { f.todas = cbTodas.checked; rrRender(); });
  const lt = rtEl('label', { className: 'rr-sobrescribir' }); lt.appendChild(cbTodas); lt.appendChild(document.createTextNode('Todas las sucursales operativas (necesario para poder activar)'));
  form.appendChild(lt);
  if (!f.todas) {
    form.appendChild(rrAviso('', 'Con un subconjunto de sucursales la simulación sirve para explorar, pero no podrá respaldar una activación. El servidor solo evalúa sucursales operativas.'));
    const fila = rtEl('div', { className: 'rr-row' });
    RT_CENTROS_TODOS.forEach(c => {
      const cb = rtEl('input', { attrs: { type: 'checkbox' } }); cb.checked = f.sucursales.includes(c);
      cb.addEventListener('change', () => { f.sucursales = cb.checked ? [...new Set([...f.sucursales, c])] : f.sucursales.filter(x => x !== c); });
      const l = rtEl('label', { className: 'rr-sobrescribir' }); l.appendChild(cb); l.appendChild(document.createTextNode(RT_CENTRO_NOMBRE[c]));
      fila.appendChild(l);
    });
    form.appendChild(fila);
  }
  const accion = rtEl('div', { className: 'rr-row' });
  const ejecutar = rrBtn(RR.sims.enCurso ? 'Simulando…' : 'Ejecutar simulación', () => rrEjecutarSim(), 'btn-sm rr-btn-principal');
  ejecutar.disabled = RR.sims.enCurso;
  accion.appendChild(ejecutar);
  form.appendChild(accion);
  host.appendChild(form);
}

async function rrEjecutarSim(reejecutarDe) {
  const s = RR.sims, f = s.form;
  f.errores = []; f.aviso = null;
  const especificos = Object.entries(f.esp).filter(([, e]) => e.sel).map(([id, e]) => ({ perfil_id: Number(id), version: Number(e.version) }));
  const cuerpo = { general: { version: f.generalVersion }, especificos, desde: f.desde, hasta: f.hasta, referencia: f.referencia };
  if (!f.todas) cuerpo.sucursales = f.sucursales;
  s.enCurso = true; rrRender();
  const r = await rrApi('POST', '/simulaciones', cuerpo);
  s.enCurso = false;
  if (r.ok) {
    s.form = null; s.lista = null;
    return rrAbrirSim(r.data.simulacion.simulacion_id, r.data.simulacion);
  }
  const fl = r.falla;
  if (fl.tipo === 'en_curso') f.aviso = { tipo: '', texto: 'Ya hay una simulación en curso (' + (r.reintentarEn ? 'reintentá en unos ' + r.reintentarEn + ' segundos' : 'esperá unos segundos') + '). Tus selecciones se conservan: volvé a ejecutar cuando termine.' };
  else if (fl.tipo === 'conflicto' && fl.codigo === 'limite_simulaciones') f.aviso = { tipo: 'peligro', texto: 'Se alcanzó el límite de simulaciones guardadas. No se borra nada automáticamente: avisá a quien administra el sistema.' };
  else if (fl.tipo === 'validacion' || fl.tipo === 'conflicto') f.errores = (fl.datos && fl.datos.errores && fl.datos.errores.length) ? fl.datos.errores.map(e => e.mensaje) : [fl.mensaje];
  else if (fl.codigo === 'datos_no_disponibles' || (r.data && r.data.codigo === 'datos_no_disponibles')) f.aviso = { tipo: 'peligro', texto: 'No se pudieron obtener los datos para simular. Reintentá en unos minutos.' };
  else if (fl.tipo === 'sesion' || fl.tipo === 'permiso') { RR.falla = fl; }
  else f.aviso = { tipo: 'peligro', texto: fl.mensaje };
  rrRender();
}

// ── Resultado de una simulacion (historico guardado) ────────────────────────────────────────────
async function rrAbrirSim(id, yaCargada) {
  const s = RR.sims;
  s.resultado = { id, cargando: !yaCargada, sim: yaCargada || null, falla: null, confirmarReejecucion: false, reejecutando: false };
  s.filtros = { categoria: '', perfil: '', codigo: '' }; s.offsetProd = 0; s.productos = null; s.elegibilidad = null; s.expandido = null;
  s.form = null; RR.sub = 'simulaciones';
  rrRender();
  if (!yaCargada) {
    const r = await rrApi('GET', '/simulaciones/' + id);
    s.resultado.cargando = false;
    if (r.ok) s.resultado.sim = r.data.simulacion; else s.resultado.falla = r.falla;
  }
  rrRender();
  if (s.resultado.sim) { rrCargarElegibilidad(id); rrCargarProductosSim(); }
}
async function rrCargarElegibilidad(id) {
  const r = await rrApi('GET', '/activaciones/elegibilidad/' + id);
  RR.sims.elegibilidad = r.ok ? r.data : { error: r.falla };
  rrRender();
}
async function rrCargarProductosSim() {
  const s = RR.sims;
  if (!s.resultado) return;
  const q = new URLSearchParams({ limit: '25', offset: String(s.offsetProd) });
  if (s.filtros.categoria) q.set('categoria', s.filtros.categoria);
  if (s.filtros.perfil) q.set('perfil', s.filtros.perfil);
  if (s.filtros.codigo.trim()) q.set('codigo', s.filtros.codigo.trim());
  s.productos = { cargando: true };
  rrRender();
  const r = await rrApi('GET', '/simulaciones/' + s.resultado.id + '/productos?' + q.toString());
  s.productos = r.ok ? r.data : { falla: r.falla };
  rrRender();
}
async function rrReejecutar() {
  const s = RR.sims, id = s.resultado.id;
  s.resultado.reejecutando = true; rrRender();
  const r = await rrApi('POST', '/simulaciones/' + id + '/reejecutar', {});
  if (r.ok) { s.lista = null; return rrAbrirSim(r.data.simulacion.simulacion_id, r.data.simulacion); }
  s.resultado.reejecutando = false; s.resultado.confirmarReejecucion = false;
  s.resultado.aviso = r.falla.tipo === 'en_curso' ? 'Ya hay una simulación en curso: reintentá cuando termine.' : r.falla.tipo === 'conflicto' ? r.falla.mensaje + ' (Si un perfil fue archivado, armá una simulación nueva con otra selección.)' : r.falla.mensaje;
  rrRender();
}
function rrFormDesdeSim(sim) {
  rrFormSimNuevo({ desde: sim.periodo.desde, hasta: sim.periodo.hasta, generalVersion: sim.escenario.general.version,
    esp: Object.fromEntries(sim.escenario.especificos.map(e => [e.perfil_id, { sel: true, version: e.version }])) });
  RR.sims.resultado = null; RR.act.revision = null; RR.sub = 'simulaciones';
  Promise.all(sim.escenario.especificos.map(e => rrDetallePerfil(e.perfil_id))).then(rrRender);
  rrRender();
}

function rrTablaAntesDespues(host, titulo, bloque, etiqueta) {
  const claves = Object.keys(bloque.antes).filter(k => bloque.antes[k] || bloque.despues[k]);
  if (!claves.length) return;
  const d = rtEl('details', { className: 'rr-grupo' }); d.setAttribute('open', '');
  d.appendChild(rtEl('summary', { text: titulo }));
  d.appendChild(rtTabla(['', 'Antes', 'Después', 'Diferencia'], claves, k => {
    const tr = rtEl('tr');
    tr.appendChild(rtEl('td', { className: 'rr-wrap', text: etiqueta(k) }));
    tr.appendChild(rtEl('td', { text: nf.format(bloque.antes[k]) }));
    tr.appendChild(rtEl('td', { text: nf.format(bloque.despues[k]) }));
    const td = rtEl('td'); td.appendChild(rrDelta(bloque.delta[k])); tr.appendChild(td);
    return tr;
  }, { tableClassName: 'rr-tabla' }));
  host.appendChild(d);
}
const rrEtEstado = k => (k === 'sin_clasificar' ? 'Sin clasificar' : rrTextoEstado(k));
const rrEtAccion = k => (k === 'sin_clasificar' ? 'Sin acción' : (RR_ACCION_TEXTO[k] || k));
const rrEtNivel = k => (k === 'sin_clasificar' || k === 'sin_nivel' ? 'Sin clasificar' : (RR_NIVEL_TEXTO[k] || k));

function rrRenderResultadoSim(host) {
  const s = RR.sims, rs = s.resultado;
  host.appendChild(rrBtn('← Volver a las simulaciones', () => { s.resultado = null; rrRender(); }));
  if (rs.cargando) return rrEstado(host, 'loading', 'Cargando la simulación guardada...');
  if (rs.falla) return rrMostrarFalla(host, rs.falla, () => rrAbrirSim(rs.id));
  const sim = rs.sim;
  host.appendChild(rtEl('h4', { className: 'rt-subtitulo', text: 'Simulación del ' + rrFecha(sim.creada.en) + ' · ' + sim.creada.nombre }));
  host.appendChild(rrAviso('info', rrNegrita('Resultado guardado. '), 'Se muestra lo calculado el ' + rrFecha(sim.datos.obtenidos_en) + '; abrirlo no vuelve a pedir datos. Reejecutar crea una simulación nueva con los datos de ahora.'));
  if (rs.aviso) host.appendChild(rrAviso('peligro', rs.aviso));
  const accion = rtEl('div', { className: 'rr-row' });
  if (!rs.confirmarReejecucion) accion.appendChild(rrBtn('Reejecutar con datos actuales…', () => { rs.confirmarReejecucion = true; rrRender(); }));
  else {
    accion.appendChild(rtEl('span', { className: 'rr-muted', text: 'Esto crea una simulación NUEVA con los datos de ahora; la actual no cambia.' }));
    const ok = rrBtn(rs.reejecutando ? 'Reejecutando…' : 'Confirmar: crear simulación nueva', () => rrReejecutar()); ok.disabled = rs.reejecutando;
    accion.appendChild(ok); accion.appendChild(rrBtn('Cancelar', () => { rs.confirmarReejecucion = false; rrRender(); }));
  }
  accion.appendChild(rrBtn('Simular de nuevo con esta selección', () => rrFormDesdeSim(sim)));
  host.appendChild(accion);

  // Elegibilidad para activar (la decide el servidor)
  const el = s.elegibilidad;
  if (!el) host.appendChild(rtEl('p', { className: 'rt-note', text: 'Verificando si esta simulación puede respaldar una activación…' }));
  else if (el.error) host.appendChild(rrAviso('', rrNegrita('No se pudo verificar la elegibilidad para activar: '), el.error.mensaje));
  else if (el.elegible) {
    const a = rrAviso('ok', rrNegrita('Esta simulación puede usarse para activar '), 'hasta el ' + rrFecha(el.vigente_hasta) + ' (vigencia de ' + el.vigencia_horas + ' horas). Activar es una acción aparte y explícita.');
    a.querySelector('div').appendChild(rtEl('div', { className: 'rr-row' }));
    a.querySelector('.rr-row').appendChild(rrBtn('Revisar para activar', () => { RR.act.revision = { sim, eleg: el }; RR.act.motivo = ''; RR.act.confirmo = false; RR.act.error = null; RR.sub = 'activacion'; rrRender(); }, 'btn-sm rr-btn-principal'));
    host.appendChild(a);
  } else {
    const a = rrAviso('', rrNegrita('Esta simulación no puede respaldar una activación. '), el.motivo ? rrFrase(el.motivo.mensaje) : 'No es elegible.', ' Hace falta volver a simular.');
    a.querySelector('div').appendChild(rtEl('div', { className: 'rr-row' }));
    a.querySelector('.rr-row').appendChild(rrBtn('Simular de nuevo con esta selección', () => rrFormDesdeSim(sim)));
    host.appendChild(a);
  }

  // Cabecera de datos
  const grid = rtEl('div', { className: 'rr-grid' });
  const card = (t, ...lineas) => { const c = rtEl('div', { className: 'rr-card' }); c.appendChild(rtEl('h4', { text: t })); lineas.forEach(l => c.appendChild(rtEl('p', { text: l }))); grid.appendChild(c); return c; };
  const ref = sim.referencia;
  card('Se comparó contra', ref.tipo === 'vigente' ? 'Conjunto vigente #' + ref.activacion_id + ' (huella ' + rrCorta(ref.conjunto_huella) + ')' : 'Reglas estándar (compat-operativo)' + (ref.motivo === 'sin_conjunto_vigente' ? ' — no había conjunto vigente' : ref.motivo === 'diagnostico_solicitado' ? ' — comparación de diagnóstico' : ''));
  card('Período y datos', 'Período evaluado: ' + sim.periodo.desde + ' a ' + sim.periodo.hasta + ' (' + sim.periodo.dias + ' días)', 'Sucursales: ' + sim.sucursales.activas.map(c => RT_CENTRO_NOMBRE[c] || c).join(', ') + (sim.sucursales.ignoradas.length ? ' · ignoradas: ' + sim.sucursales.ignoradas.map(c => RT_CENTRO_NOMBRE[c] || c).join(', ') : ''),
    nf.format(sim.datos.productos_evaluados) + ' productos evaluados', 'Stock: ' + (sim.datos.stock_fecha_actualizacion ? rrFecha(sim.datos.stock_fecha_actualizacion) : 'la fuente no informa su fecha de actualización'));
  const cE = card('Conjunto simulado', 'General v' + sim.escenario.general.version);
  sim.escenario.especificos.forEach(e => cE.appendChild(rtEl('p', { text: e.nombre + ' v' + e.version + ' — ' + rrAlcanceTexto(e.alcance) + ' · vinculado al General v' + e.general_version_referenciada + (e.difiere_del_general_del_escenario ? ' (≠ v' + e.general_version_escenario + ' del escenario)' : '') })));
  if (!sim.escenario.especificos.length) cE.appendChild(rtEl('p', { className: 'rr-muted', text: 'Sin perfiles específicos.' }));
  host.appendChild(grid);

  // Categorias (nunca se llama "sin cambios" a algo que cambio de motivo, accion, rendimiento o umbrales)
  rrSecundario(host, 'Qué cambia');
  const kp = rtEl('div', { className: 'rt-kpis' });
  Object.keys(RR_TXT_CAT).forEach(cat => {
    const c = rtEl('div', { className: 'card rt-kpi rr-kpi-cat' + (s.filtros.categoria === cat ? ' rt-kpi-activo' : '') });
    c.appendChild(rtEl('div', { className: 'rt-kpi-label', text: RR_TXT_CAT[cat] }));
    c.appendChild(rtEl('div', { className: 'rt-kpi-valor', text: nf.format(sim.cambios[cat]) }));
    c.setAttribute('role', 'button'); c.tabIndex = 0;
    const abrir = () => { s.filtros.categoria = s.filtros.categoria === cat ? '' : cat; s.offsetProd = 0; rrCargarProductosSim(); };
    c.addEventListener('click', abrir); c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
    kp.appendChild(c);
  });
  host.appendChild(kp);
  host.appendChild(rtEl('p', { className: 'rt-note', text: '"Sin cambios" significa que ningún resultado cambió y los umbrales aplicados son los mismos. Un producto que mantiene su estado puede igual cambiar de motivo, etiquetas, acción, rendimiento o umbrales.' }));
  rrTablaAntesDespues(host, 'Productos por estado (antes → después)', sim.conteos.por_estado_principal, rrEtEstado);
  rrTablaAntesDespues(host, 'Productos por acción principal', sim.conteos.por_accion_principal, rrEtAccion);
  rrTablaAntesDespues(host, 'Productos por rendimiento', sim.conteos.por_rendimiento, rrEtNivel);
  const t = sim.transiciones;
  host.appendChild(rtEl('p', { className: 'rt-note', text: 'Transiciones de estado: ' + nf.format(t.entran) + ' entran a una oportunidad · ' + nf.format(t.salen) + ' salen · ' + nf.format(t.cambian) + ' cambian de estado · ' + nf.format(t.igual) + ' mantienen el estado.' }));
  if (t.matriz.length) {
    const d = rtEl('details', { className: 'rr-grupo' });
    d.appendChild(rtEl('summary', { text: 'Cambios de estado (de → a)' }));
    d.appendChild(rtTabla(['De', 'A', 'Productos'], t.matriz.slice(0, 15), m => { const tr = rtEl('tr'); tr.appendChild(rtEl('td', { text: rrEtEstado(m.de) })); tr.appendChild(rtEl('td', { text: rrEtEstado(m.a) })); tr.appendChild(rtEl('td', { text: nf.format(m.n) })); return tr; }, { tableClassName: 'rr-tabla' }));
    host.appendChild(d);
  }
  if (sim.rendimiento.cambian) {
    host.appendChild(rtEl('p', { className: 'rt-note', text: nf.format(sim.rendimiento.cambian) + ' productos cambian de rendimiento: ' + sim.rendimiento.matriz.slice(0, 6).map(m => rrEtNivel(m.de) + ' → ' + rrEtNivel(m.a) + ' (' + nf.format(m.n) + ')').join(' · ') }));
  }

  // Perfiles que resolvieron
  rrSecundario(host, 'Qué perfil aplicó a cada producto');
  host.appendChild(rtTabla(['Perfil', 'Versión', 'Productos', 'Cambia estado', 'Cambia detalle', 'Solo umbrales', 'Sin cambios'], sim.por_perfil, p => {
    const tr = rtEl('tr');
    tr.appendChild(rtEl('td', { className: 'rr-wrap', text: p.clave === 'general' ? 'General' : p.nombre + ' (' + rrAlcanceTexto(p.alcance) + ')' }));
    tr.appendChild(rtEl('td', { text: 'v' + p.version + (p.clave === 'general' ? '' : ' · General v' + p.version_general) }));
    tr.appendChild(rtEl('td', { text: nf.format(p.productos) }));
    ['cambia_estado', 'mismo_estado_cambia_detalle', 'solo_umbrales', 'sin_cambios'].forEach(c => tr.appendChild(rtEl('td', { text: nf.format(p.categorias[c]) })));
    return tr;
  }, { tableClassName: 'rr-tabla' }));

  // Alcances y advertencias
  if (sim.alcances.length || sim.advertencias.length) {
    rrSecundario(host, 'Alcances y advertencias');
    sim.alcances.forEach(a => {
      const ok = a.estado === 'ok' && !a.par_no_verificable_en_catalogo;
      const av = rrAviso(ok ? 'ok' : (a.estado === 'alcance_inexistente' ? 'peligro' : ''), rrNegrita(a.nombre + ' (' + rrAlcanceTexto(a.alcance) + '): '), RR_TXT_ALCANCE_ESTADO[a.estado] || a.estado, ' · ' + nf.format(a.productos_coincidentes) + ' productos en el alcance, ' + nf.format(a.productos_resueltos) + ' resueltos por este perfil.');
      if (a.par_no_verificable_en_catalogo) av.querySelector('div').appendChild(rtEl('div', { className: 'rr-muted', text: 'El par rubro + marca no se puede validar contra el catálogo disponible.' }));
      host.appendChild(av);
    });
    sim.advertencias.filter(w => !['alcance_inexistente', 'sin_productos_en_periodo', 'superado_por_precedencia', 'par_no_verificable'].includes(w.codigo)).forEach(w => host.appendChild(rrAviso('info', w.mensaje)));
  }

  // Productos afectados (paginados y filtrables)
  rrSecundario(host, 'Productos');
  const filtros = rtEl('div', { className: 'rr-row' });
  filtros.appendChild(rrSelect([['', 'Todas las categorías'], ...Object.entries(RR_TXT_CAT)], s.filtros.categoria, v => { s.filtros.categoria = v; s.offsetProd = 0; rrCargarProductosSim(); }, { 'aria-label': 'Categoría' }));
  filtros.appendChild(rrSelect([['', 'Todos los perfiles'], ...sim.por_perfil.map(p => [p.clave, p.clave === 'general' ? 'General' : p.nombre])], s.filtros.perfil, v => { s.filtros.perfil = v; s.offsetProd = 0; rrCargarProductosSim(); }, { 'aria-label': 'Perfil' }));
  const cod = rrInput('text', s.filtros.codigo, v => { s.filtros.codigo = v; }, { placeholder: 'Código exacto', 'aria-label': 'Código' });
  cod.addEventListener('keydown', e => { if (e.key === 'Enter') { s.offsetProd = 0; rrCargarProductosSim(); } });
  filtros.appendChild(cod);
  filtros.appendChild(rrBtn('Buscar', () => { s.offsetProd = 0; rrCargarProductosSim(); }));
  host.appendChild(filtros);
  const pr = s.productos;
  if (!pr || pr.cargando) return host.appendChild(rtEl('p', { className: 'rt-note', text: 'Cargando productos...' }));
  if (pr.falla) return rrMostrarFalla(host, pr.falla, rrCargarProductosSim);
  if (!pr.productos.length) return rrEstado(host, 'vacio', 'Ningún producto coincide con estos filtros.');
  host.appendChild(rtEl('p', { className: 'rt-note', text: nf.format(pr.paginacion.total) + ' productos con este filtro. Los conteos de arriba no dependen del filtro.' }));
  const frag = [];
  host.appendChild(rtTabla(['Código', 'Producto', 'Perfil', 'Estado', 'Acción', 'Rendimiento', 'Qué cambia', ''], pr.productos, p => {
    const fr = document.createDocumentFragment();
    const tr = rtEl('tr');
    tr.appendChild(rtEl('td', { text: p.codigo }));
    tr.appendChild(rtEl('td', { className: 'rr-wrap', text: (p.nombre || '') + (p.marca ? ' · ' + p.marca : '') }));
    tr.appendChild(rtEl('td', { text: p.perfil === 'general' ? 'General' : 'Perfil #' + p.perfil.replace('perfil:', '') }));
    tr.appendChild(rtEl('td', { className: 'rr-wrap', text: rrEtEstado(p.estado.antes) + (p.estado.antes !== p.estado.despues ? ' → ' + rrEtEstado(p.estado.despues) : '') }));
    tr.appendChild(rtEl('td', { className: 'rr-wrap', text: rrEtAccion(p.accion_principal.antes) + (p.accion_principal.antes !== p.accion_principal.despues ? ' → ' + rrEtAccion(p.accion_principal.despues) : '') }));
    tr.appendChild(rtEl('td', { text: rrEtNivel(p.rendimiento.antes) + (p.rendimiento.antes !== p.rendimiento.despues ? ' → ' + rrEtNivel(p.rendimiento.despues) : '') }));
    const tdC = rtEl('td', { className: 'rr-wrap' }); tdC.appendChild(rrTag(RR_TXT_CAT[p.categoria], p.categoria === 'cambia_estado' ? 'bad' : p.categoria === 'sin_cambios' ? '' : 'warn')); tr.appendChild(tdC);
    const tdB = rtEl('td');
    if (p.detalle) tdB.appendChild(rrBtn(s.expandido === p.codigo ? 'Ocultar' : 'Ver detalle', () => { s.expandido = s.expandido === p.codigo ? null : p.codigo; rrRender(); }));
    tr.appendChild(tdB);
    fr.appendChild(tr);
    if (s.expandido === p.codigo && p.detalle) {
      const trd = rtEl('tr'); const td = rtEl('td', { attrs: { colspan: '8' } });
      td.appendChild(rrDetalleProductoSim(p));
      trd.appendChild(td); fr.appendChild(trd);
    }
    return fr;
  }, { tableClassName: 'rr-tabla' }));
  const pg = pr.paginacion;
  const pag = rtEl('div', { className: 'rt-pagination' });
  pag.appendChild(rtEl('span', { text: 'Mostrando ' + (pg.total ? pg.offset + 1 : 0) + '–' + (pg.offset + pg.devueltos) + ' de ' + nf.format(pg.total) }));
  const ant = rrBtn('← Anterior', () => { s.offsetProd = Math.max(0, s.offsetProd - pg.limit); rrCargarProductosSim(); }); ant.disabled = pg.offset === 0;
  const sig = rrBtn('Siguiente →', () => { s.offsetProd += pg.limit; rrCargarProductosSim(); }); sig.disabled = pg.offset + pg.devueltos >= pg.total;
  pag.appendChild(ant); pag.appendChild(sig); host.appendChild(pag);
}

function rrDetalleProductoSim(p) {
  const d = p.detalle, caja = rtEl('div', { className: 'rr-detalle-sim' });
  const lado = (t, x) => {
    const c = rtEl('div'); c.appendChild(rtEl('b', { text: t }));
    const dl = rtEl('dl');
    const fila = (k, v) => { dl.appendChild(rtEl('dt', { text: k })); dl.appendChild(rtEl('dd', { text: v })); };
    fila('Estado', x.estado_principal ? rrEtEstado(x.estado_principal) : 'Sin oportunidad');
    fila('Motivo', x.motivo || '—');
    fila('Etiquetas', (x.etiquetas_secundarias || []).map(rrTextoEstado).join(', ') || '—');
    fila('Acciones', (x.acciones || []).map(a => (RR_ACCION_TEXTO[a.accion] || a.accion) + (a.principal ? ' (principal)' : '')).join(', ') || '—');
    fila('Rendimiento', x.rendimiento && x.rendimiento.nivel ? (RR_NIVEL_TEXTO[x.rendimiento.nivel] || x.rendimiento.nivel) : 'Sin clasificar');
    c.appendChild(dl); return c;
  };
  const dos = rtEl('div', { className: 'rr-comparar' });
  dos.appendChild(lado('Antes (reglas de referencia)', d.antes)); dos.appendChild(lado('Después (conjunto simulado)', d.despues));
  caja.appendChild(dos);
  if (d.parametros_distintos.length) {
    caja.appendChild(rtEl('b', { text: 'Umbrales distintos aplicados a este producto' }));
    caja.appendChild(rrLista(d.parametros_distintos.map(x => {
      const par = rrParamsEsquema().find(q => q.ruta === x.ruta);
      return (par ? par.etiqueta : x.ruta) + ': ' + nf1.format(x.referencia) + ' → ' + nf1.format(x.escenario);
    })));
  }
  caja.appendChild(rtEl('p', { className: 'rr-muted', text: 'Resuelto por: ' + (d.resolucion.alcance_tipo === 'general' ? 'General' : d.resolucion.nombre + ' (' + rrAlcanceTexto({ tipo: d.resolucion.alcance_tipo }).split(' · ')[0] + ')') + ' — ' + d.resolucion.motivo.texto }));
  return caja;
}

// ═════════════════════════ ACTIVACION ═══════════════════════════════════════════════════════════
async function rrCargarHistorial() {
  const a = RR.act;
  a.histCargando = true; a.histFalla = null; rrRender();
  const r = await rrApi('GET', '/activaciones?limit=15&offset=' + a.histOffset);
  a.histCargando = false;
  if (r.ok) a.hist = r.data; else a.histFalla = r.falla;
  rrRender();
}
function rrFilaConjunto(c) {
  return 'General v' + c.general.version + (c.especificos.length ? ' + ' + c.especificos.map(e => e.nombre + ' v' + e.version).join(', ') : ' (sin perfiles específicos)');
}

function rrVistaActivacion(host) {
  const a = RR.act, b = RR.base;
  if (!b.vigente) rrBannerVigente(host); // con conjunto vigente alcanza con la tarjeta de abajo
  if (b.vigente) {
    const c = rtEl('div', { className: 'rr-card' });
    c.appendChild(rtEl('h4', { text: 'Conjunto vigente #' + b.vigente.activacion_id }));
    c.appendChild(rtEl('p', { text: rrFilaConjunto(b.vigente.conjunto) }));
    c.appendChild(rtEl('p', { className: 'rr-muted', text: 'Activado el ' + rrFecha(b.vigente.creada.en) + ' por ' + b.vigente.creada.nombre + ' · "' + b.vigente.motivo + '" · huella ' + rrCorta(b.vigente.conjunto.huella) }));
    b.vigente.advertencias.forEach(w => c.appendChild(rtEl('p', { className: 'rr-muted', text: 'Advertencia al activar: ' + w.mensaje })));
    host.appendChild(c);
  }
  if (a.revision) rrRenderRevision(host);
  else host.appendChild(rrAviso('info', rrNegrita('Para activar reglas '), 'abrí una simulación elegible en la sección Simulaciones y elegí "Revisar para activar". Nada se activa al guardar un perfil ni al terminar una simulación.'));
  if (!a.hist && !a.histCargando && !a.histFalla) rrCargarHistorial();
  rrSecundario(host, 'Historial de activaciones');
  if (a.histCargando && !a.hist) return host.appendChild(rtEl('p', { className: 'rt-note', text: 'Cargando historial...' }));
  if (a.histFalla) return rrMostrarFalla(host, a.histFalla, rrCargarHistorial);
  if (!a.hist) return;
  if (!a.hist.activaciones.length) return rrEstado(host, 'vacio', 'Todavía no se activó ningún conjunto.');
  host.appendChild(rtTabla(['#', 'Fecha', 'Autor', 'Motivo', 'Conjunto', 'Reemplazó a', 'Advertencias', ''], a.hist.activaciones, x => {
    const tr = rtEl('tr');
    tr.appendChild(rtEl('td', { text: '#' + x.activacion_id + (x.vigente ? ' · vigente' : '') }));
    tr.appendChild(rtEl('td', { text: rrFecha(x.creada.en) }));
    tr.appendChild(rtEl('td', { text: x.creada.nombre }));
    tr.appendChild(rtEl('td', { className: 'rr-wrap', text: x.motivo }));
    tr.appendChild(rtEl('td', { className: 'rr-wrap', text: rrFilaConjunto(x.conjunto) }));
    tr.appendChild(rtEl('td', { text: x.reemplaza_activacion_id ? '#' + x.reemplaza_activacion_id : 'Reglas estándar' }));
    tr.appendChild(rtEl('td', { className: 'rr-wrap', text: x.advertencias.length ? x.advertencias.map(w => w.mensaje).join(' · ') : '—' }));
    const td = rtEl('td'); td.appendChild(rrBtn('Ver evidencia', () => rrAbrirSim(x.simulacion.simulacion_id))); tr.appendChild(td);
    return tr;
  }, { tableClassName: 'rr-tabla' }));
  const pg = a.hist.paginacion;
  const pag = rtEl('div', { className: 'rt-pagination' });
  pag.appendChild(rtEl('span', { text: 'Mostrando ' + (pg.total ? pg.offset + 1 : 0) + '–' + (pg.offset + pg.devueltos) + ' de ' + nf.format(pg.total) }));
  const ant = rrBtn('← Anterior', () => { a.histOffset = Math.max(0, a.histOffset - pg.limit); rrCargarHistorial(); }); ant.disabled = pg.offset === 0;
  const sig = rrBtn('Siguiente →', () => { a.histOffset += pg.limit; rrCargarHistorial(); }); sig.disabled = pg.offset + pg.devueltos >= pg.total;
  pag.appendChild(ant); pag.appendChild(sig); host.appendChild(pag);
}

function rrRenderRevision(host) {
  const a = RR.act, sim = a.revision.sim, b = RR.base;
  rrSecundario(host, 'Revisión de la activación');
  const grid = rtEl('div', { className: 'rr-comparar' });
  const lado = (t, lineas) => { const c = rtEl('div', { className: 'rr-card' }); c.appendChild(rtEl('h4', { text: t })); lineas.forEach(l => c.appendChild(rtEl('p', { text: l }))); return c; };
  grid.appendChild(lado('Conjunto vigente ahora', b.vigente
    ? ['Conjunto #' + b.vigente.activacion_id, 'General v' + b.vigente.conjunto.general.version, ...b.vigente.conjunto.especificos.map(e => e.nombre + ' v' + e.version + ' (General v' + e.general_version_referenciada + ')')]
    : ['Reglas estándar (no hay conjunto activado)']));
  grid.appendChild(lado('Conjunto propuesto', ['Versiones exactas simuladas:', 'General v' + sim.escenario.general.version, ...sim.escenario.especificos.map(e => e.nombre + ' v' + e.version + ' — ' + rrAlcanceTexto(e.alcance) + ' (General v' + e.general_version_referenciada + ')'), ...(sim.escenario.especificos.length ? [] : ['Sin perfiles específicos'])]));
  host.appendChild(grid);
  const c = sim.cambios, t = sim.transiciones;
  host.appendChild(rrAviso('info', rrNegrita('Impacto medido: '), 'período ' + sim.periodo.desde + ' a ' + sim.periodo.hasta + ' (' + sim.periodo.dias + ' días), ' + nf.format(sim.datos.productos_evaluados) + ' productos. ' + nf.format(c.cambia_estado) + ' cambian de estado (' + nf.format(t.entran) + ' entran, ' + nf.format(t.salen) + ' salen), ' + nf.format(c.mismo_estado_cambia_detalle) + ' cambian el detalle, ' + nf.format(c.solo_umbrales) + ' solo cambian umbrales, ' + nf.format(c.sin_cambios) + ' sin cambios.'));
  const adv = [...sim.advertencias.map(w => w.mensaje), ...sim.alcances.filter(x => x.estado !== 'ok').map(x => x.nombre + ': ' + (RR_TXT_ALCANCE_ESTADO[x.estado] || x.estado))];
  if (adv.length) { const av = rrAviso('', rrNegrita('Advertencias a tener en cuenta:')); av.querySelector('div').appendChild(rrLista([...new Set(adv)])); host.appendChild(av); }
  if (a.error) host.appendChild(a.error);
  const form = rtEl('div', { className: 'rr-form' });
  const area = rtEl('textarea', { attrs: { maxlength: '500', placeholder: 'Por qué se activan estas reglas' } }); area.value = a.motivo;
  const cb = rtEl('input', { attrs: { type: 'checkbox' } }); cb.checked = a.confirmo;
  const lc = rtEl('label', { className: 'rr-sobrescribir' }); lc.appendChild(cb); lc.appendChild(document.createTextNode('Revisé el impacto y entiendo que Oportunidades pasará a usar este conjunto de reglas.'));
  const boton = rrBtn(a.enviando ? 'Activando…' : 'Activar estas reglas', () => rrActivar(), 'btn-sm rr-btn-principal');
  const actualizar = () => { boton.disabled = a.enviando || a.motivo.trim().length < 3 || !a.confirmo; };
  area.addEventListener('input', () => { a.motivo = area.value; actualizar(); });
  cb.addEventListener('change', () => { a.confirmo = cb.checked; actualizar(); });
  form.appendChild(rrCampo('Motivo de la activación (obligatorio)', area));
  form.appendChild(lc);
  actualizar();
  const fila = rtEl('div', { className: 'rr-row' });
  fila.appendChild(boton);
  fila.appendChild(rrBtn('Cancelar', () => { a.revision = null; rrRender(); }));
  form.appendChild(fila);
  host.appendChild(form);
}

async function rrActivar() {
  const a = RR.act, sim = a.revision.sim;
  a.enviando = true; a.error = null; rrRender();
  const cuerpo = {
    simulacion_id: sim.simulacion_id, vigente_esperado: RR.base.vigente ? RR.base.vigente.activacion_id : null, motivo: a.motivo.trim(),
    general: { version: sim.escenario.general.version }, especificos: sim.escenario.especificos.map(e => ({ perfil_id: e.perfil_id, version: e.version })),
  };
  const r = await rrApi('POST', '/activaciones', cuerpo);
  a.enviando = false;
  if (r.ok) {
    const id = r.data.activacion.activacion_id;
    a.revision = null; a.hist = null; a.histOffset = 0;
    RT_OPORTUNIDADES = null; RT_OPORTUNIDADES_EXPANDIDO = null; // Oportunidades vuelve a pedir resultados con el conjunto nuevo
    RR.sims.lista = null;
    RR.mensaje = { tipo: 'ok', texto: 'Reglas activadas: conjunto #' + id + '. Oportunidades ya usa este conjunto (las demás pestañas se refrescan al abrirlas).' };
    await rrCargarBase();
    return;
  }
  const fl = r.falla;
  const volver = rrBtn('Volver a simular', () => rrFormDesdeSim(sim));
  const caja = (tipo, titulo, texto, extra) => { const av = rrAviso(tipo, rrNegrita(titulo), texto); if (extra) av.querySelector('div').appendChild(extra); av.querySelector('div').appendChild(rtEl('div', { className: 'rr-row' })); return av; };
  const necesitaNueva = ['evidencia_vencida', 'vigente_cambio_tras_simular', 'conflicto_vigente', 'evidencia_incompleta', 'evidencia_incompatible', 'referencia_no_vigente', 'escenario_distinto'];
  if (fl.tipo === 'conflicto' && necesitaNueva.includes(fl.codigo)) {
    const av = caja('peligro', 'Hace falta volver a simular. ', fl.codigo === 'evidencia_vencida' ? 'La evidencia de esta simulación venció.' : fl.codigo === 'vigente_cambio_tras_simular' || fl.codigo === 'conflicto_vigente' ? 'El conjunto vigente cambió después de simular. ' + rrFrase(fl.mensaje) : rrFrase(fl.mensaje));
    av.querySelector('.rr-row').appendChild(volver);
    a.error = av;
    if (fl.codigo === 'vigente_cambio_tras_simular' || fl.codigo === 'conflicto_vigente') await rrCargarBase();
  } else if (fl.tipo === 'validacion' && fl.codigo === 'alcance_inexistente') {
    const av = caja('peligro', 'La activación está bloqueada: ', 'hay alcances que ya no existen en el catálogo.', rrLista((fl.datos.alcances || []).map(x => x.nombre + ': ' + x.errores.join(' '))));
    a.error = av;
  } else if (fl.tipo === 'conflicto') {
    a.error = rrAviso('peligro', fl.mensaje);
    if (fl.datos && fl.datos.errores && fl.datos.errores.length) a.error.querySelector('div').appendChild(rrLista(fl.datos.errores.map(e => e.mensaje)));
  } else if (fl.tipo === 'sesion' || fl.tipo === 'permiso') { RR.falla = fl; }
  else a.error = rrAviso('peligro', (fl.codigo === 'catalogo_no_disponible' || (r.data && r.data.codigo === 'catalogo_no_disponible')) ? 'No se pudo consultar el catálogo para revalidar los alcances, por eso no se activó nada. Reintentá en unos minutos.' : fl.mensaje);
  rrRender();
}

// Oculta la pestana a quienes no son administradores (el servidor igual exige admin en cada ruta).
(function rrOcultarPestanaSiNoAdmin() {
  const ocultar = () => { if (!rrEsAdmin()) { const t = document.getElementById('rtTabReglas'); if (t) t.remove(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ocultar); else ocultar();
})();
