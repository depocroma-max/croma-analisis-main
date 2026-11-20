'use strict';
// Etapa B1 (cds-v3): filtros pendientes vs. aplicados de Oportunidades. Pruebas sin navegador. Se ejecutan con:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const vista = fs.readFileSync(path.join(RAIZ, 'oportunidades-vista.js'), 'utf8');
const js = fs.readFileSync(path.join(RAIZ, 'cds', 'filtros.js'), 'utf8');
const css = fs.readFileSync(path.join(RAIZ, 'cds', 'filtros.css'), 'utf8');

// Funcion real de index.html (no una copia): rtFiltroDesdeBorrador + el normalizador de texto.
function extraer(nombre) { const i = html.indexOf('function ' + nombre + '('); assert.ok(i >= 0, nombre); let d = 0, j = html.indexOf('{', i); const ini = i; for (let k = j; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}') { d--; if (d === 0) return html.slice(ini, k + 1); } } }
const CODIGO = extraer('rtProductosNormalizarCodigo'), DESDE_BORRADOR = extraer('rtFiltroDesdeBorrador');

// Entorno falso: variables globales de la aplicacion que filtros.js lee (let globales se simulan como propiedades del contexto).
function entorno(est = {}) {
  const ctx = {
    document: { documentElement: { classList: { contains: c => c === 'cds-v3' } }, createElement: () => ({ setAttribute() {}, appendChild() {}, classList: { toggle() {} } }) },
    Intl, Set, Array, JSON, String, RT_FILTRO: null, RT_OPORTUNIDADES: null, RT_OPORTUNIDADES_LOADING: false, RT_OPORTUNIDADES_ERROR: null, RT_VIEW: 'dashboard',
    RT_FILTRO_BORRADOR: { marca: new Set(), rubro: new Set(), subrubro: new Set(), talle: new Set(), color: new Set() },
    RT_FILTRO_BUSQUEDA: { marca: 'x' }, rtRenderVistaActual() { ctx.renders++; }, renders: 0,
    rtFiltroKey() { return ctx.RT_FILTRO ? JSON.stringify(ctx.RT_FILTRO) : null; },
  };
  Object.assign(ctx, est); ctx.window = ctx; vm.createContext(ctx);
  // Los `let` de index.html son del ambito global; aqui se leen del contexto.
  vm.runInContext(CODIGO + '\n' + DESDE_BORRADOR, ctx); vm.runInContext(js, ctx);
  return ctx;
}
const sets = o => Object.fromEntries(['marca', 'rubro', 'subrubro', 'talle', 'color'].map(c => [c, new Set(o[c] || [])]));

test('guardas: filtros.js sale sin la bandera, no consulta la API, no usa almacenamiento ni innerHTML', () => {
  assert.match(js, /if \(!document\.documentElement\.classList\.contains\('cds-v3'\)\) return;/);
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML|eval\(/);
});
test('guardas: filtros.css solo cuelga de html.cds-v3 y solo usa variables --cds-*', () => {
  const t = css.replace(/\/\*[\s\S]*?\*\//g, ''); const sels = [...t.matchAll(/(^|\})\s*([^{}]+)\{/g)].map(m => m[2].trim());
  assert.ok(sels.length >= 6); sels.forEach(s => s.split(',').forEach(p => assert.match(p.trim(), /^html\.cds-v3 /, p)));
  [...t.matchAll(/var\((--[a-z0-9-]+)/g)].forEach(m => assert.match(m[1], /^--cds-/));
});
test('compatibilidad: todos los ganchos de index.html y de la vista dependen de window.CDS_FILTROS (sin bandera no existe)', () => {
  assert.match(html, /const v3 = compacto && window\.CDS_FILTROS;/);
  const usos = html.match(/\bv3\.[a-zA-Z]+/g) || []; assert.ok(usos.length >= 6);
  [...html.matchAll(/^.*\bv3\b.*$/gm)].map(m => m[0]).filter(l => /\bv3\./.test(l)).forEach(l => assert.match(l, /v3\s*(\?|&&|\)|\()|if \(v3\)|\(v3\)/, l));
  assert.match(vista, /if \(typeof window !== 'undefined' && window\.CDS_FILTROS\) window\.CDS_FILTROS\.resultados\(raiz\);/);
  assert.doesNotMatch(html.replace(/<script>\s*\(function \(\) \{\s*var CDS_V3_POR_DEFECTO[\s\S]*?<\/script>/, ''), /cds\/filtros/);
});

test('rtFiltroDesdeBorrador: orden fijo, listas ordenadas, ceros iniciales y tildes intactos, espacios colapsados', () => {
  const c = entorno();
  c.RT_FILTRO_BORRADOR = sets({ marca: ['RIP CURL', 'BILLABONG'], rubro: ['ZAPATILLAS'], subrubro: [], talle: [], color: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('rtFiltroDesdeBorrador("  00123  ")', c))), { buscar: '00123', marca: ['BILLABONG', 'RIP CURL'], rubro: ['ZAPATILLAS'] });
  assert.equal(vm.runInContext('rtFiltroDesdeBorrador("campera   rompeviento").buscar', c), 'campera rompeviento');
  assert.equal(vm.runInContext('rtFiltroDesdeBorrador("Cámara ñandú").buscar', c), 'Cámara ñandú');
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('rtFiltroDesdeBorrador("")', c))), { marca: ['BILLABONG', 'RIP CURL'], rubro: ['ZAPATILLAS'] });
});
test('comparacion: { codigo } equivale a { buscar }; el orden de claves y de listas no importa', () => {
  const c = entorno();
  assert.equal(c.CDS_FILTROS.clave({ codigo: '00123' }), c.CDS_FILTROS.clave({ buscar: '00123' }));
  assert.equal(c.CDS_FILTROS.clave({ marca: ['B', 'A'], rubro: ['R'] }), c.CDS_FILTROS.clave({ rubro: ['R'], marca: ['A', 'B'] }));
  assert.notEqual(c.CDS_FILTROS.clave({ buscar: '00123' }), c.CDS_FILTROS.clave({ buscar: '123' })); // los ceros iniciales cuentan
  assert.equal(c.CDS_FILTROS.clave(null), c.CDS_FILTROS.clave({}));
});
test('pendientes: con el borrador igual a lo aplicado no hay cambios; cada campo distinto se nombra', () => {
  const c = entorno({ RT_FILTRO: { buscar: 'rompeviento', marca: ['NIKE'] } });
  c.RT_FILTRO_BORRADOR = sets({ marca: ['NIKE'] });
  assert.deepEqual([...c.CDS_FILTROS.cambios('rompeviento')], []);
  assert.deepEqual([...c.CDS_FILTROS.cambios('rompeviento  ')], []); // solo espacios
  assert.deepEqual([...c.CDS_FILTROS.cambios('rompeviento 2')], ['Búsqueda']);
  c.RT_FILTRO_BORRADOR.rubro.add('CALZADO'); c.RT_FILTRO_BORRADOR.marca.delete('NIKE');
  assert.deepEqual([...c.CDS_FILTROS.cambios('rompeviento')], ['Marca', 'Rubro']);
});
test('aplicar sin cambios NO consulta cuando la lista ya esta cargada o cargandose; un error o la ausencia de datos SI permiten reintentar', () => {
  const f = { buscar: 'abc' };
  const c = entorno({ RT_FILTRO: f, RT_OPORTUNIDADES: { data: [] } });
  assert.equal(c.CDS_FILTROS.sinCambios({ buscar: 'abc' }), true);
  assert.equal(c.CDS_FILTROS.sinCambios({ buscar: 'abcd' }), false);
  c.RT_OPORTUNIDADES_ERROR = 'HTTP 500'; assert.equal(c.CDS_FILTROS.sinCambios({ buscar: 'abc' }), false);
  c.RT_OPORTUNIDADES_ERROR = null; c.RT_OPORTUNIDADES = null; assert.equal(c.CDS_FILTROS.sinCambios({ buscar: 'abc' }), false);
  c.RT_OPORTUNIDADES_LOADING = true; assert.equal(c.CDS_FILTROS.sinCambios({ buscar: 'abc' }), true); // ya hay una consulta con ese mismo filtro en curso
  const v = entorno({ RT_FILTRO: null, RT_OPORTUNIDADES: { data: [] } }); assert.equal(v.CDS_FILTROS.sinCambios({}), true); // sin filtros y lista cargada
});
test('texto escrito sin aplicar sobrevive a los re-dibujos y se descarta al aplicar, al cambiar el filtro por otra via o al limpiar', () => {
  const c = entorno({ RT_FILTRO: { marca: ['NIKE'] } }); const F = c.CDS_FILTROS;
  assert.equal(F.textoInicial(''), '');
  F.alEscribir('remera'); assert.equal(F.textoInicial(''), 'remera'); assert.equal(F.textoInicial(''), 'remera'); // re-dibujos
  c.RT_FILTRO = { marca: ['NIKE'], buscar: 'otra' }; assert.equal(F.textoInicial('otra'), 'otra'); // el filtro cambio por otra via (chip, otra vista)
  F.alEscribir('zz'); F.alAplicar(); assert.equal(F.textoInicial('otra'), 'otra');
  F.alEscribir('zz'); F.limpiar(() => { c.RT_FILTRO = null; c.renders++; }); assert.equal(F.hayPendiente(), false);
  assert.equal(c.RT_FILTRO, null); assert.equal(c.RT_FILTRO_BUSQUEDA.marca, '');
});
test('Limpiar con solo cambios sin aplicar descarta el borrador SIN quitar ni consultar nada; con filtro aplicado lo quita una vez', () => {
  const c = entorno({ RT_FILTRO: null }); let quitar = 0; c.RT_FILTRO_BORRADOR.marca.add('NIKE'); c.CDS_FILTROS.alEscribir('abc');
  c.CDS_FILTROS.limpiar(() => quitar++); assert.equal(quitar, 0); assert.equal(c.renders, 1); assert.equal(c.RT_FILTRO_BORRADOR.marca.size, 0);
  const d = entorno({ RT_FILTRO: { buscar: 'abc' } }); let q2 = 0; d.CDS_FILTROS.limpiar(() => q2++); assert.equal(q2, 1);
});
