'use strict';
// Etapa B4 (cds-v3): ciclo de vida del detalle, pestañas y guardas de compatibilidad. Sin navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const html = leer('index.html'), det = leer('cds', 'detalle.js'), css = leer('cds', 'resultados.css'), filtros = leer('cds', 'filtros.js');

function cargarDetalle() {
  const ctx = { document: { documentElement: { classList: { contains: c => c === 'cds-v3' } }, createElement: () => ({}) }, RT_OPORTUNIDADES_EXPANDIDO: 'ABC', OV_FOCO: { codigo: 'ABC', hasta: Date.now() + 4000 }, Intl, Set, Array, JSON, String, Object, Math };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(det, ctx); return ctx;
}

test('rtCambiarVista cierra el detalle al salir de Oportunidades, solo con la bandera, y no antes de cambiar de vista', () => {
  assert.match(html, /function rtCambiarVista\(view\) \{\n  if \(view !== 'oportunidades' && window\.CDS_DETALLE\) window\.CDS_DETALLE\.cerrar\(\);/);
  assert.equal((html.match(/CDS_DETALLE\.cerrar\(\)/g) || []).length, 1);
});
test('CDS_DETALLE.cerrar(): deja el detalle sin producto abierto y sin foco pendiente (no se reabre ni roba el foco al volver)', () => {
  const c = cargarDetalle(); assert.equal(typeof c.CDS_DETALLE.cerrar, 'function'); c.CDS_DETALLE.cerrar();
  assert.equal(c.RT_OPORTUNIDADES_EXPANDIDO, null); assert.equal(c.OV_FOCO, null);
});
test('las pestañas tienen nombre accesible completo aunque en pantallas chicas se muestre el texto corto', () => {
  assert.match(det, /\['ingreso', 'Ingreso', ' y rendimiento'\]/); assert.match(det, /'aria-label': t\[1\] \+ t\[2\]/);
  assert.match(css, /@media \(max-width:480px\)\{\s*html\.cds-v3 \.cds-tab-x\{display:none\}/);
});
test('el cierre devuelve el foco al botón del producto por todos los caminos (cerrar, Escape y fondo usan la misma función)', () => {
  assert.match(det, /var cerrar = function \(\) \{[\s\S]*?\.focus\(\{ preventScroll: true \}\)/);
  assert.equal((det.match(/\bcerrar\)/g) || []).length >= 2, true); assert.match(det, /e\.key === 'Escape'\) \{ e\.stopPropagation\(\); cerrar\(\)/);
});
test('tablet: tarjetas hasta 900 px y controles táctiles de 44 px; la advertencia de rotaciones no se oculta en móvil', () => {
  assert.match(css, /@media \(min-width:701px\) and \(max-width:900px\)\{\s*html\.cds-v3 \.cds-res-tabla\{display:none\}/);
  assert.match(css, /@media \(max-width:900px\)\{\s*html\.cds-v3 #rtBar button/);
  assert.match(css, /html\.cds-v3 \.ov>\.ov-nota\{display:none\}/); assert.doesNotMatch(css, /html\.cds-v3 \.ov-nota\{display:none\}/);
});
test('las reglas personalizadas se avisan en la línea de cifras (en móvil el bloque de contexto se oculta)', () => {
  assert.match(filtros, /cj\.origen === 'activacion'/); assert.match(filtros, /'Reglas:'/);
});
