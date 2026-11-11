'use strict';
// DOM MINIMO para probar los modulos de la interfaz (oportunidades-explicacion.js / oportunidades-reglas.js) con node:test, sin
// navegador ni dependencias. Solo implementa lo que esos modulos usan. Registra cada asignacion a innerHTML para poder afirmar que
// NUNCA se usa con datos de la API.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

class Nodo {
  constructor(tag, reg) {
    this.tagName = String(tag).toUpperCase(); this.reg = reg; this.children = []; this.attrs = {}; this.listeners = {};
    this.className = ''; this.value = ''; this.checked = false; this.disabled = false; this.open = false; this._texto = ''; this.hidden = false; this.type = '';
    this.style = {}; this.tabIndex = 0;
  }
  get esTexto() { return false; }
  appendChild(n) { if (n.esFragmento) { n.children.slice().forEach(c => this.appendChild(c)); return n; } this.children.push(n); return n; }
  replaceChildren() { this.children = []; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'open') this.open = true; }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  click() { (this.listeners.click || []).forEach(f => f({ stopPropagation() {}, preventDefault() {}, target: this })); }
  dispararInput(valor) { this.value = valor; (this.listeners.input || []).forEach(f => f({ target: this })); (this.listeners.change || []).forEach(f => f({ target: this })); }
  set textContent(v) { this.children = []; this._texto = String(v); }
  get textContent() { return this._texto + this.children.map(c => c.textContent).join(''); }
  set innerHTML(v) { this.reg.innerHTML.push(String(v)); this.children = []; this._texto = ''; }
  get innerHTML() { return ''; }
  get classList() {
    const self = this;
    return { toggle(c, on) { const s = new Set(self.className.split(/\s+/).filter(Boolean)); (on === undefined ? !s.has(c) : on) ? s.add(c) : s.delete(c); self.className = [...s].join(' '); }, add(c) { this.toggle(c, true); }, contains(c) { return self.className.split(/\s+/).includes(c); } };
  }
  get options() { return this.children.filter(c => c.tagName === 'OPTION'); }
  // Solo selectores simples: 'tag' o '.clase' (lo unico que usan los modulos).
  querySelector(sel) {
    const pred = sel.startsWith('.') ? (n => n.classList && n.classList.contains(sel.slice(1))) : (n => n.tagName === sel.toUpperCase());
    return this.children.reduce((r, c) => r || (c.esTexto ? null : (pred(c) ? c : c.querySelector(sel))), null);
  }
  recorrer(f) { f(this); this.children.forEach(c => c.recorrer && c.recorrer(f)); }
  buscar(pred) { const r = []; this.recorrer(n => { if (pred(n)) r.push(n); }); return r; }
  botones(texto) { return this.buscar(n => n.tagName === 'BUTTON' && n.textContent.trim().startsWith(texto)); }
}
class Texto extends Nodo { constructor(t, reg) { super('#text', reg); this._texto = String(t); } get esTexto() { return true; } recorrer(f) { f(this); } }
class Fragmento extends Nodo { constructor(reg) { super('#fragment', reg); } get esFragmento() { return true; } }

function crearEntorno({ rutas = {}, usuario = { rol: 'admin', usuario: 'tester' }, globales = {} } = {}) {
  const reg = { innerHTML: [], llamadas: [] };
  const documento = {
    createElement: t => new Nodo(t, reg), createTextNode: t => new Texto(t, reg), createDocumentFragment: () => new Fragmento(reg),
    getElementById: () => null, addEventListener() {}, readyState: 'complete', querySelector: () => null, querySelectorAll: () => [],
  };
  // fetch simulado: rutas = { 'GET /perfiles?estado=todos': { status, body } | (cuerpo) => {...} }
  const fetch = async (url, opts = {}) => {
    const metodo = (opts.method || 'GET').toUpperCase();
    const ruta = String(url).replace(/^.*?\/analisis\/oportunidades/, '');
    const cuerpo = opts.body ? JSON.parse(opts.body) : undefined;
    reg.llamadas.push({ metodo, ruta, cuerpo, url: String(url) });
    let def = rutas[metodo + ' ' + ruta];
    if (def === undefined) def = rutas[metodo + ' *'] ;
    if (typeof def === 'function') def = def(cuerpo, ruta);
    if (!def) def = { status: 404, body: { ok: false, error: 'no simulado: ' + metodo + ' ' + ruta } };
    return { ok: def.status >= 200 && def.status < 300, status: def.status, json: async () => def.body, headers: { get: k => (def.headers || {})[k] || null } };
  };
  const ctx = vm.createContext({
    console, document: documento, fetch, setTimeout, URLSearchParams, location: { href: '' }, STOCK_API_URL: '', HUB_URL: 'https://hub.example/',
    getUser: () => usuario, rtRotAuthHeaders: () => ({ Authorization: 'Bearer prueba' }), ...globales,
  });
  const sandbox = (codigo, nombre) => vm.runInContext(codigo, ctx, { filename: nombre });
  // Auxiliares del script principal (index.html) que los modulos usan; versiones minimas equivalentes.
  sandbox(`
    var RT_VIEW = 'reglas', RT_DESDE = '2026-08-01', RT_HASTA = '2026-10-30', RT_CENTROS = ['0001','0005','0010','0012','0014'], RT_CENTROS_TODOS = ['0001','0005','0009','0010','0012','0014'];
    var RT_CENTRO_NOMBRE = {'0001':'01 Paseo','0005':'05 Wave','0009':'09 Cipo San Martín','0010':'10 Perito Moreno','0012':'12 Centenario','0014':'14 Roca'};
    var RT_TEXTO_ESTADO = { seguimiento: 'Seguimiento', posible_rotacion: 'Posible rotación', bien_vendido: 'Bien vendido', stock_parado: 'Stock parado', posible_descuento: 'Posible descuento', reposicion_proxima: 'Reposición próxima', venta_destacada: 'Venta destacada' };
    var RT_OPORTUNIDADES = { marca: 'previo' }, RT_OPORTUNIDADES_EXPANDIDO = null, RT_ROTACIONES_FILTRO = {}, RT_ROTACIONES = 'previo', RT_ROTACIONES_SUBVISTA = '';
    var rotacionesAbiertas = 0, ultimaVista = null, HOST = null;
    var RT_OPORTUNIDADES_GRUPO = 'todas', RT_OPORTUNIDADES_ESTADO = null, RT_OPORTUNIDADES_PRIORIDAD = null, RT_OPORTUNIDADES_CONFIANZA = null, RT_OPORTUNIDADES_OFFSET = 0, RT_OPORTUNIDADES_LIMITE = 50;
    var RT_OPORTUNIDADES_ROTACION = { origen:'', destino:'', ventasDestinoMin:'', stockOrigenMin:'', coberturaOrigenMin:'' }, RT_FILTRO = null, RT_PRODUCTOS_FILTRO_ORIGEN = null, RT_OPORTUNIDADES_BASE = null, RT_OPORTUNIDADES_UNIONES = null;
    var RT_ESTADO_CLS = { reposicion_urgente: 'badge-danger', reposicion_proxima: 'badge-warning', stock_parado: 'badge-neutral' }, periodoCambiado = 0, inputsFecha = { rtDesde: { value: '', focus() {} }, rtHasta: { value: '' } };
    function rtOportunidadesStockDeposito(f) { return f.Stock_deposito ?? f.Stock_ctro_0000 ?? 0; }
    function rtSucursalesEsSubconjunto() { return RT_CENTROS.length < RT_CENTROS_TODOS.length; }
    function rtSucursalesParams(p) { if (rtSucursalesEsSubconjunto()) p.set('sucursales', RT_CENTROS.join(',')); return p; }
    function rtFiltroAParams(p, f) { Object.keys(f).forEach(k => p.set(k, Array.isArray(f[k]) ? f[k].join(',') : f[k])); }
    function rtRestarDias(iso, d) { const x = new Date(iso + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - d); return x.toISOString().slice(0, 10); }
    function rtCambiarPeriodo() { periodoCambiado++; RT_DESDE = inputsFecha.rtDesde.value; RT_HASTA = inputsFecha.rtHasta.value; }
    function rtOportunidadesPanelDetalle() { return rtEl('div'); }
    document.getElementById = id => inputsFecha[id] || null;
    const nf = { format: n => String(n) }, nf1 = { format: n => String(n) };
    const rtOportunidadesPct = v => (v * 100).toFixed(1) + '%';
    function rtEl(tag, opts) { const e = document.createElement(tag); if (opts) { if (opts.className != null) e.className = opts.className; if (opts.text != null) e.textContent = opts.text; if (opts.html != null) e.innerHTML = opts.html; if (opts.attrs) Object.keys(opts.attrs).forEach(k => e.setAttribute(k, opts.attrs[k])); } return e; }
    function rtEstado(c, tipo, msg, reintentar) { c.replaceChildren(); const b = rtEl('div', { className: 'rt-state estado-' + tipo }); b.appendChild(rtEl('p', { text: msg || '' })); if (reintentar) { const x = rtEl('button', { text: 'Reintentar' }); x.addEventListener('click', reintentar); b.appendChild(x); } c.appendChild(b); }
    function rtTabla(headers, filas, renderFila) { const t = rtEl('table'); const tb = rtEl('tbody'); filas.forEach(f => tb.appendChild(renderFila(f))); t.appendChild(tb); return t; }
    function rtRenderVistaActual() { HOST.replaceChildren(); renderRTReglas(HOST); }
    function rtCambiarVista(v) { RT_VIEW = v; ultimaVista = v; }
  `, 'auxiliares');
  const raiz = path.join(__dirname, '..');
  for (const f of ['oportunidades-explicacion.js', 'oportunidades-grupos.js', 'oportunidades-reglas.js', 'oportunidades-vista.js', 'ingresos-recientes-vista.js']) sandbox(fs.readFileSync(path.join(raiz, f), 'utf8'), f);
  sandbox('HOST = document.createElement("div");', 'host');
  return { ctx, reg, ev: c => vm.runInContext(c, ctx), host: () => vm.runInContext('HOST', ctx), Nodo };
}

module.exports = { crearEntorno };
