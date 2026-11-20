'use strict';
// Etapa B3 (cds-v3): tabla comercial, tarjetas y detalle de Oportunidades. Pruebas sin navegador (DOM de mentira) de la logica de celdas,
// valores faltantes, estados secundarios y guardas de compatibilidad. El comportamiento visual y de teclado se valida con validacion-b3.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const html = leer('index.html'), vista = leer('oportunidades-vista.js'), res = leer('cds', 'resultados.js'), det = leer('cds', 'detalle.js'), css = leer('cds', 'resultados.css'), grupos = leer('oportunidades-grupos.js');

class N {
  constructor(tag) { this.tag = tag; this.className = ''; this.hijos = []; this.attrs = {}; this.eventos = {}; this._t = ''; }
  appendChild(n) { this.hijos.push(n); return n; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(t, f) { (this.eventos[t] = this.eventos[t] || []).push(f); }
  get classList() { const s = this; return { add(c) { s.className = (s.className + ' ' + c).trim(); } }; }
  set textContent(v) { this.hijos = []; this._t = String(v); }
  get textContent() { return this._t + this.hijos.map(h => h.textContent).join(''); }
  buscar(fn, acc = []) { if (fn(this)) acc.push(this); this.hijos.forEach(h => h.buscar && h.buscar(fn, acc)); return acc; }
  disparar(t) { (this.eventos[t] || []).forEach(f => f({ target: this, stopPropagation() {} })); }
}
function entorno(extra = {}) {
  const abiertos = [];
  const ctx = {
    document: { documentElement: { classList: { contains: c => c === 'cds-v3' } }, createElement: t => new N(t), createTextNode: t => { const n = new N('#t'); n._t = t; return n; } },
    Intl, Set, Array, JSON, String, Object, Math, RT_OPORTUNIDADES_EXPANDIDO: null,
    rrAccionPrincipal: f => (f.acciones || []).find(a => a.principal) || null, rrTextoAccion: a => 'Acción ' + a.accion, rrTextoEstado: e => 'Estado ' + e,
    ovCeldaCobertura: f => { const n = new N('span'); n.textContent = f.cobertura_dias == null ? 'Sin ventas' : f.cobertura_dias + ' días'; return n; },
    ovBotonDetalle: (f, ab) => { const b = new N('button'); b.textContent = ab ? 'Ocultar' : 'Ver detalle'; b.setAttribute('data-detalle-codigo', f.Codigo_producto); return b; },
    rtOportunidadesToggleDetalle: c => abiertos.push(c), abiertos,
  };
  Object.assign(ctx, extra); ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(grupos, ctx); vm.runInContext(res, ctx);
  return ctx;
}
const fila = (o = {}) => Object.assign({ Codigo_producto: '00123', Nombre_producto: 'Campera rompeviento', Nombre_marca: 'NIKE', Nombre_rubro: 'CAMPERAS', estado_principal: 'posible_rotacion', etiquetas_secundarias: ['bien_vendido'], Ventas_total: 9, Stock_sucursales: 4, Stock_deposito: 2, cobertura_dias: 30, ratio_confiable: true,
  acciones: [{ accion: 'revisar_rotacion', principal: true, prioridad: 'alta', requiere_validacion_variante: true }] }, o);
const J = o => JSON.parse(JSON.stringify(o));

test('guardas: los archivos de B3 salen sin la bandera, no consultan la API, no usan almacenamiento ni innerHTML', () => {
  [res, det].forEach(s => { assert.match(s, /if \(!document\.documentElement\.classList\.contains\('cds-v3'\)\) return;/); assert.doesNotMatch(s, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML|eval\(/); });
});
test('guardas: resultados.css solo cuelga de html.cds-v3 y solo usa variables --cds-*', () => {
  const t = css.replace(/\/\*[\s\S]*?\*\//g, ''); const sels = [...t.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map(m => m[2].trim()).filter(Boolean);
  assert.ok(sels.length > 80); const partes = s => { const o = []; let d = 0, i0 = 0; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if (c === ',' && d === 0) { o.push(s.slice(i0, i)); i0 = i + 1; } } o.push(s.slice(i0)); return o; }; // comas de primer nivel (no las de :is(...))
  sels.forEach(s => partes(s).forEach(p => assert.match(p.trim(), /^html\.cds-v3[ :]/, p)));
  [...t.matchAll(/var\((--[a-z0-9-]+)/g)].filter(m => m[1] !== '--ov-sticky-top').forEach(m => assert.match(m[1], /^--cds-/, m[1])); // --ov-sticky-top: variable de la tabla actual que app-shell.css ya redefine
});
test('compatibilidad: los ganchos de la vista pasan por ovCdsRes()/ovCdsDet() (null sin la bandera) y index.html solo carga los archivos con la bandera', () => {
  const lineas = vista.split(/\r?\n/);
  assert.equal(lineas.filter(l => /CDS_RESULTADOS|CDS_DETALLE/.test(l)).length, 2, 'solo las dos funciones de acceso nombran a los objetos');
  assert.match(vista, /function ovTabla\(datos, resp, periodoDias\) \{\n  if \(ovCdsRes\(\)\) return ovCdsRes\(\)\.tabla/); assert.match(vista, /function ovTarjetas\(datos, resp\) \{\n  if \(ovCdsRes\(\)\) return ovCdsRes\(\)\.tarjetas/);
  assert.match(vista, /if \(ovCdsDet\(\)\) ovCdsDet\(\)\.dibujar\(raiz\);/);
  ['resultados.css', 'resultados.js', 'detalle.js'].forEach(f => assert.match(html, new RegExp(f.replace('.', '\\.'))));
  assert.doesNotMatch(html.replace(/<script>\s*\(function \(\) \{\s*var CDS_V3_POR_DEFECTO[\s\S]*?<\/script>/, ''), /cds\/(resultados|detalle)/);
});
test('detalle: el estado abierto sigue siendo RT_OPORTUNIDADES_EXPANDIDO y usa los mismos bloques que el detalle anterior (sin recalcular)', () => {
  ['rrBloquePorQue', 'rrBloqueTecnico', 'ovBloqueIngresos', 'riBloquesDetalle', 'rrTextoRendimiento', 'calcularDesbalance', 'evaluarAceleracion', 'rtOportunidadesVerDetalle', 'rtAplicarFiltroYVerTallesColores', 'rrIrARotaciones'].forEach(n => assert.match(det, new RegExp(n + '\\(')));
  assert.match(det, /RT_OPORTUNIDADES_EXPANDIDO/); assert.match(det, /rrEsAdmin\(\)/); // la explicacion tecnica es solo para administradores
});

test('valores faltantes: ventas, stock y deposito ausentes se muestran «—», nunca 0 ni NaN', () => {
  const c = entorno(); const t = c.CDS_RESULTADOS.tabla([fila({ Ventas_total: undefined, Stock_sucursales: null, Stock_deposito: undefined })], {}, 91);
  const celdas = t.buscar(n => n.tag === 'td').map(n => n.textContent); assert.ok(!celdas.some(x => /NaN|undefined|null/.test(x)));
  assert.equal(celdas.filter(x => x === '—').length >= 3, true);
  assert.equal(c.CDS_RESULTADOS.num(0), '0'); assert.equal(c.CDS_RESULTADOS.num(undefined), '—'); assert.equal(c.CDS_RESULTADOS.num(NaN), '—');
});
test('urgencia: sin acción no inventa una; con acción muestra barras y palabra', () => {
  const c = entorno(); const sin = c.CDS_RESULTADOS.celdaUrgencia(fila({ acciones: [] })); assert.equal(sin.textContent, '—'); assert.match(sin.attrs.title, /Sin urgencia/);
  const alta = c.CDS_RESULTADOS.celdaUrgencia(fila()); assert.match(alta.className, /cds-urg--alta/); assert.match(alta.textContent, /Alta/);
  assert.equal(c.CDS_RESULTADOS.urgenciaDe(fila({ acciones: [{ accion: 'x', principal: true, prioridad: 'rara' }] })), null); // un valor desconocido no se interpreta
});
test('estado: principal con etiqueta; «Sin acción» sin principal; los secundarios se cuentan sin repetir ni incluir el principal', () => {
  const c = entorno();
  const sec = c.CDS_RESULTADOS.secundarios(fila({ etiquetas_secundarias: ['bien_vendido', 'posible_rotacion'], estados_secundarios: ['bien_vendido', 'seguimiento'] })); assert.deepEqual(J(sec), ['bien_vendido', 'seguimiento']);
  const e = c.CDS_RESULTADOS.celdaEstado(fila({ etiquetas_secundarias: ['bien_vendido', 'seguimiento'] })); assert.match(e.textContent, /Estado posible_rotacion/); assert.match(e.textContent, /\+2/);
  assert.match(e.buscar(n => /cds-state-mas/.test(n.className))[0].attrs.title, /Estado bien_vendido, Estado seguimiento/);
  assert.equal(c.CDS_RESULTADOS.celdaEstado(fila({ estado_principal: null, etiquetas_secundarias: [] })).textContent, 'Sin acción');
});
test('etiquetas de la fila: devoluciones, muestra chica y validar por variante, solo cuando corresponde', () => {
  const c = entorno(); const e = f => J(c.CDS_RESULTADOS.etiquetasProducto(f));
  assert.deepEqual(e(fila()), ['validar por variante']); assert.deepEqual(e(fila({ Ventas_total: -3 })), ['devoluciones', 'validar por variante']);
  assert.deepEqual(e(fila({ ratio_confiable: false, acciones: [] })), ['muestra chica']);
});
test('tabla: encabezados completos, una fila por producto, el ingreso y el rendimiento NO están en la fila y cada fila abre su detalle', () => {
  const c = entorno({ RT_OPORTUNIDADES_EXPANDIDO: '00124' }); const t = c.CDS_RESULTADOS.tabla([fila(), fila({ Codigo_producto: '00124' })], {}, 91);
  assert.deepEqual(t.buscar(n => n.tag === 'th').map(n => n.textContent.replace('Detalle', '')), ['Urgencia', 'Producto', 'Estado', 'Acción recomendada', 'Ventas (91 d)', 'Stock suc.', 'Dep. 90', 'Cobertura', '']);
  const filas = t.buscar(n => n.tag === 'tr' && /cds-fila/.test(n.className)); assert.equal(filas.length, 2); assert.match(filas[1].className, /cds-fila--abierta/);
  assert.ok(!/ngreso|endimiento/.test(filas.map(f => f.textContent).join(' ')));
  filas[0].disparar('click'); assert.deepEqual(J(c.abiertos), ['00123']);
  const b = filas[0].buscar(n => n.tag === 'button')[0]; assert.equal(b.attrs['data-detalle-codigo'], '00123'); assert.equal(b.attrs['aria-haspopup'], 'dialog'); // conserva el boton y su atributo de foco
});
test('producto: nombre, marca, rubro y código identificables; el código en su propio elemento', () => {
  const c = entorno(); const p = c.CDS_RESULTADOS.tabla([fila()], {}, 91);
  assert.equal(p.buscar(n => /cds-prod-nombre/.test(n.className))[0].textContent, 'Campera rompeviento'); assert.equal(p.buscar(n => /cds-mono/.test(n.className))[0].textContent, '00123'); assert.match(p.textContent, /NIKE · CAMPERAS/);
  assert.equal(c.CDS_RESULTADOS.tabla([fila({ Nombre_producto: undefined })], {}, 91).buscar(n => /cds-prod-nombre/.test(n.className))[0].textContent, '00123'); // sin nombre se muestra el código
});
test('tarjetas: una por producto con acción, estado, cuatro datos y su botón de detalle (la tarjeta también abre el detalle)', () => {
  const c = entorno(); const w = c.CDS_RESULTADOS.tarjetas([fila(), fila({ Codigo_producto: '2', Ventas_total: undefined })], {});
  const cards = w.buscar(n => /cds-card /.test(n.className + ' ')); assert.equal(cards.length, 2);
  assert.equal(cards[0].buscar(n => n.tag === 'dt').map(n => n.textContent).join(), 'Ventas,Stock,Dep. 90,Cobertura'); assert.equal(cards[1].buscar(n => n.tag === 'dd')[0].textContent, '—');
  assert.equal(cards[0].buscar(n => n.tag === 'button').length, 1); cards[0].eventos.click[0]({ target: { closest: () => null } }); assert.deepEqual(J(c.abiertos), ['00123']);
  cards[1].eventos.click[0]({ target: { closest: s => ({}) } }); assert.equal(c.abiertos.length, 1, 'un click sobre un boton no abre dos veces');
});
