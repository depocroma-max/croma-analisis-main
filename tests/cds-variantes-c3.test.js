'use strict';
// Etapa C3 (cds-v3): tarjetas móviles, información progresiva y accesibilidad de «Talle y color» (guardas estáticas y lógica pura, sin navegador).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const fuente = fs.readFileSync(path.join(RAIZ, 'cds', 'variantes.js'), 'utf8'), css = fs.readFileSync(path.join(RAIZ, 'cds', 'variantes.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function cargar() {
  const ctx = { document: { documentElement: { classList: { contains: c => c === 'cds-v3' } }, createElement: () => ({}) }, Intl, URLSearchParams, AbortController, fetch: async () => { throw new Error('sin red'); }, STOCK_API_URL: '', RT_DESDE: '2026-08-01', RT_HASTA: '2026-10-30', RT_CENTROS: ['0001'] };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fuente, ctx); return ctx.CDS_VARIANTES;
}

test('el selector de orden de las tarjetas ofrece cada columna en ambos sentidos y, con señal, stock en origen y ventas en destino', () => {
  const V = cargar(), sin = Array.from(V.opcionesOrden(null).map(o => o[0])), con = Array.from(V.opcionesOrden({ rev: new Map() }).map(o => o[0]));
  assert.deepEqual(sin, ['color|1', 'talle|1', 'ventas|-1', 'ventas|1', 'stock|-1', 'stock|1', 'dep90|-1', 'dep90|1', 'fallados|-1', 'fallados|1']);
  assert.deepEqual(con.slice(sin.length), ['stockOrigen|-1', 'stockOrigen|1', 'ventasDestino|-1', 'ventasDestino|1']);
});
test('las tarjetas se eligen por ancho (≤ 700 px, matchMedia) y se redibujan al cruzar el umbral; la tabla se mantiene en tablet y escritorio', () => {
  assert.match(codigo, /matchMedia\('\(max-width:700px\)'\)/); assert.match(codigo, /MQ\.addEventListener\('change', function \(\) \{ avisar\(\); \}\)/);
  assert.match(codigo, /zona\.appendChild\(movil \? tarjetas\(vis, e, vs, pintar, rc\) : tabla\(vis, e, vs, pintar, rc\)\)/);
  assert.doesNotMatch(codigo.slice(codigo.indexOf('function tarjeta('), codigo.indexOf('function panel(')), /createElement\('table'\)|el\('table', 'cds-var-t'\)/, 'las tarjetas no son una tabla comprimida (solo la distribución por sucursal usa una tabla pequeña)');
});
test('información progresiva: avisos importantes visibles como resumen, explicaciones plegables, filtros plegados en móvil y orden del DOM = orden del foco', () => {
  assert.match(codigo, /el\('details', 'cds-var-nota'\); nota\.appendChild\(el\('summary', null, 'Solo se listan variantes con stock o ventas en el período: desde acá no se puede afirmar que la curva esté completa\.'\)\)/);
  assert.match(codigo, /Origen: ' \+ nombreSuc\(s\.origen\) \+ ' → Destino: '/); assert.match(codigo, /no es una cantidad para transferir/); assert.match(codigo, /La sugerencia es por producto y requiere validación por variante\. Acá no se crean envíos\./);
  assert.match(codigo, /vs\.filtrosAbierto = !movil \|\| activo/); assert.match(codigo, /if \(!movil\) det\.setAttribute\('open', ''\)/);
  assert.match(codigo, /var previo = movil \? \[cab, nSenal, nSug, nota\] : \[cab, nota, nSenal, nSug\]/); assert.match(codigo, /if \(movil\) cola\.push\(barra\); else raiz\.appendChild\(barra\)/);
});
test('accesibilidad: región viva dentro del diálogo, cada aviso se anuncia una vez, botones de despliegue con aria-expanded/aria-controls, etiqueta del buscador y selector nativo', () => {
  assert.match(codigo, /'data-cds-anuncio': '1', role: 'status', 'aria-live': 'polite'/); assert.match(codigo, /function anunciarUnaVez\(clave, txt\)/); assert.match(codigo, /ultimosAnuncios = \{\}/);
  assert.match(codigo, /'aria-expanded': abierto \? 'true' : 'false', 'aria-controls': region\.id/); assert.match(codigo, /for: 'cdsVarBuscar'/); assert.match(codigo, /el\('select', 'cds-var-orden'/);
  assert.match(codigo, /role: 'status', 'aria-live': 'polite', 'aria-busy': 'true'/); assert.match(codigo, /role: 'alert'/);
});
test('CSS: foco visible en toda la pestaña, controles de la pestaña a 44 px, tarjetas sin desborde y solo tokens', () => {
  assert.match(css, /html\.cds-v3 \.cds-var :focus-visible\{outline:2px solid var\(--cds-focus\)/);
  assert.match(css, /\.cds-var-exp\.cds-var-exp--txt\{[^}]*min-height:var\(--cds-hit\)/); assert.match(css, /\.cds-var-orden\{height:var\(--cds-hit\)/); assert.match(css, /\.cds-var-card-m\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.ok(css.split('\n').map(l => l.trim()).filter(l => l.includes('{')).every(l => /^(html\.cds-v3|@media)/.test(l)), 'todo bajo html.cds-v3'); assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css) && !/rgba?\(/.test(css), 'sin colores literales');
});
test('garantías comerciales: las tarjetas muestran las mismas cifras que la tabla (ventas, stock disponible, Dep. 90, Fallados 93) y nunca Stock_total ni textos de transferencia', () => {
  const t = codigo.slice(codigo.indexOf('function tarjeta('), codigo.indexOf('function tarjetas('));
  assert.match(t, /\['Ventas netas', v\.ventas, 'ventas'\], \['Stock suc\.', v\.stockSucDisp, 'stock'\], \['Dep\. 90', v\.dep90, 'dep90'\], \['Fallados 93', v\.fallados, 'fallados'\]/);
  assert.doesNotMatch(codigo, /Stock_total/); assert.doesNotMatch(codigo, /[Tt]ransferir ahora|Transferir\b(?!\))/); assert.match(codigo, /«Para revisar» solo indica stock positivo/);
});
