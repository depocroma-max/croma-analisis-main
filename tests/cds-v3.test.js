'use strict';
// Etapa A (cds-v3): pruebas de la BANDERA y guardas estaticas que protegen a la aplicacion legacy. No usan navegador. Se ejecutan con:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const css = n => fs.readFileSync(path.join(RAIZ, 'cds', n), 'utf8');
const m = html.match(/<script>\s*\(function \(\) \{\s*var CDS_V3_POR_DEFECTO[\s\S]*?\}\)\(\);\s*<\/script>/);

// Entorno falso minimo: location.search, localStorage (con opcion de fallar), documentElement.classList y head.appendChild registrado.
function correr({ search = '', guardado = null, fallaAlmacenamiento = false, porDefecto } = {}) {
  let codigo = m[0].replace(/^<script>/, '').replace(/<\/script>$/, '');
  if (porDefecto !== undefined) codigo = codigo.replace('CDS_V3_POR_DEFECTO = false', 'CDS_V3_POR_DEFECTO = ' + porDefecto);
  const almacen = new Map(guardado == null ? [] : [['cds-v3', guardado]]); const clases = new Set(); const agregados = [];
  const ctx = {
    location: { search }, URLSearchParams,
    localStorage: { getItem: k => { if (fallaAlmacenamiento) throw new Error('bloqueado'); return almacen.has(k) ? almacen.get(k) : null; }, setItem: (k, v) => { if (fallaAlmacenamiento) throw new Error('bloqueado'); almacen.set(k, v); } },
    document: { documentElement: { classList: { add: c => clases.add(c) } }, head: { appendChild: n => agregados.push(n) }, createElement: t => ({ tag: t }) },
  };
  vm.createContext(ctx); vm.runInContext(codigo, ctx);
  return { activa: clases.has('cds-v3'), almacen, agregados };
}

test('bandera: el bloque de arranque existe, es unico y su valor por defecto es APAGADO', () => {
  assert.ok(m, 'bloque no encontrado en index.html');
  assert.equal((html.match(/var CDS_V3_POR_DEFECTO/g) || []).length, 1);
  assert.match(m[0], /CDS_V3_POR_DEFECTO = false/);
});
test('bandera apagada (por defecto): no agrega clase ni descarga ningun archivo', () => {
  const r = correr(); assert.equal(r.activa, false); assert.equal(r.agregados.length, 0);
});
test('?cds-v3=1 enciende, recuerda la eleccion y descarga tokens, componentes, estructura, filtros, fuente y scripts', () => {
  const r = correr({ search: '?cds-v3=1' }); assert.equal(r.activa, true); assert.equal(r.almacen.get('cds-v3'), '1');
  const urls = r.agregados.map(n => n.href || n.src);
  assert.equal(urls.filter(u => /^cds\//.test(u)).length, 18); /* 13 + D1B (seguimientos.css, seguimientos-api.js, seguimientos.js) + navegacion superior (stock-ventas.css y stock-ventas.js) */ assert.ok(urls.some(u => /^cds\/seguimientos-api\.js/.test(u)) && urls.some(u => /^cds\/seguimientos\.js/.test(u)) && urls.some(u => /^cds\/seguimientos\.css/.test(u))); assert.ok(urls.some(u => /^cds\/variantes\.css/.test(u))); assert.ok(urls.some(u => /^cds\/variantes\.js/.test(u))); assert.ok(urls.some(u => /^cds\/resultados\.css/.test(u))); assert.ok(urls.some(u => /^cds\/resultados\.js/.test(u))); assert.ok(urls.some(u => /^cds\/detalle\.js/.test(u))); assert.ok(urls.some(u => /^cds\/por-accion\.css/.test(u))); assert.ok(urls.some(u => /^cds\/por-accion\.js/.test(u))); assert.ok(urls.some(u => /^cds\/filtros\.css/.test(u))); assert.ok(urls.some(u => /^cds\/filtros\.js/.test(u))); assert.ok(urls.some(u => /^cds\/tokens\.css/.test(u))); assert.ok(urls.some(u => /^cds\/componentes\.css/.test(u))); assert.ok(urls.some(u => /^cds\/app-shell\.css/.test(u))); assert.ok(urls.some(u => /^cds\/shell\.js/.test(u)));
  assert.ok(urls.some(u => /fonts\.googleapis\.com\/css2\?family=Geist/.test(u)));
});
test('la eleccion guardada ("1") se respeta sin parametro; ("0") la apaga', () => {
  assert.equal(correr({ guardado: '1' }).activa, true); assert.equal(correr({ guardado: '0' }).activa, false);
});
test('?cds-v3=0 apaga aunque haya una eleccion guardada, y ?cds-v3=on / off son equivalentes', () => {
  const r = correr({ search: '?cds-v3=0', guardado: '1' }); assert.equal(r.activa, false); assert.equal(r.almacen.get('cds-v3'), '0');
  assert.equal(correr({ search: '?cds-v3=on' }).activa, true); assert.equal(correr({ search: '?cds-v3=off', guardado: '1' }).activa, false);
});
test('un valor desconocido en la URL se ignora (no enciende nada)', () => { assert.equal(correr({ search: '?cds-v3=si' }).activa, false); assert.equal(correr({ search: '?otra=1' }).activa, false); });
test('si el almacenamiento falla (modo privado, bloqueado) rige el valor por defecto y no se lanza error', () => {
  assert.equal(correr({ search: '?cds-v3=1', fallaAlmacenamiento: true }).activa, false);
  assert.equal(correr({ fallaAlmacenamiento: true, porDefecto: true }).activa, true);
});
test('cuando el valor por defecto sea true, "?cds-v3=0" sigue pudiendo apagarla (reversibilidad)', () => {
  assert.equal(correr({ porDefecto: true }).activa, true); assert.equal(correr({ porDefecto: true, search: '?cds-v3=0' }).activa, false);
});

// ── Guardas estaticas: la aplicacion legacy no puede enterarse de que cds/ existe ─────────────────────────
test('index.html no referencia archivos de cds/ de forma estatica (solo los carga el bloque de la bandera)', () => {
  const sinBloque = html.replace(m[0], '');
  assert.doesNotMatch(sinBloque, /<link[^>]+cds\//); assert.doesNotMatch(sinBloque, /<script[^>]+cds\//); assert.doesNotMatch(sinBloque, /@import[^;]*cds\//);
});
test('tokens.css: TODAS las variables llevan el prefijo --cds- (no pisan croma-ds.css ni index.html)', () => {
  const nombres = [...css('tokens.css').matchAll(/(--[a-z0-9-]+)\s*:/g)].map(x => x[1]);
  assert.ok(nombres.length > 80); nombres.forEach(n => assert.match(n, /^--cds-/, n));
});
test('componentes.css y app-shell.css: solo usan variables --cds-* (y las locales --cds-c/ab/ai)', () => {
  ['componentes.css', 'app-shell.css'].forEach(f => [...css(f).matchAll(/var\((--[a-z0-9-]+)/g)].forEach(x => assert.match(x[1], /^--cds-/, f + ' ' + x[1])));
});
function partes(sel) { const o = []; let d = 0, ini = 0; for (let i = 0; i < sel.length; i++) { const c = sel[i]; if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if (c === ',' && d === 0) { o.push(sel.slice(ini, i)); ini = i + 1; } } o.push(sel.slice(ini)); return o; }
function selectoresRaiz(texto) { // selectores de primer nivel (y los dentro de @media), sin comentarios
  const t = texto.replace(/\/\*[\s\S]*?\*\//g, ''); const out = []; let prof = 0, ini = 0, esMedia = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '{') { const sel = t.slice(ini, i).trim(); if (prof === 0 || esMedia[prof - 1]) { if (!sel.startsWith('@')) out.push(sel); } esMedia[prof] = sel.startsWith('@media'); prof++; ini = i + 1; }
    else if (c === '}') { prof--; ini = i + 1; } else if (c === ';' && prof === 0) ini = i + 1;
  }
  return out;
}
test('componentes.css: ningun selector global (todo es .cds-*, [data-cds-g] o :root); no toca body, html, button ni *', () => {
  selectoresRaiz(css('componentes.css')).forEach(s => partes(s).forEach(p => { p = p.trim(); assert.match(p, /^(\.cds-|\[data-cds-g|svg\.cds-|:root)/, 'selector fuera del espacio de nombres: ' + p); }));
});
test('app-shell.css: todo selector cuelga de html.cds-v3 o es un componente .cds-*', () => {
  selectoresRaiz(css('app-shell.css')).forEach(s => partes(s).forEach(p => { p = p.trim(); assert.match(p, /^(html\.cds-v3|\.cds-)/, 'selector sin la bandera: ' + p); }));
});
test('app-shell.css: las pestañas viejas se ocultan solo con la bandera y no se eliminan', () => {
  assert.match(css('app-shell.css'), /html\.cds-v3 #rtTabs\{display:none\}/); assert.match(html, /<div class="tabs" id="rtTabs" role="tablist">/);
});
test('shell.js: sale de inmediato sin la clase cds-v3, delega en las pestañas existentes y no usa innerHTML con datos', () => {
  const js = fs.readFileSync(path.join(RAIZ, 'cds', 'shell.js'), 'utf8');
  assert.match(js, /if \(!document\.documentElement\.classList\.contains\('cds-v3'\)\) return;/); assert.match(js, /t\.click\(\)/);
  const usos = js.match(/\.innerHTML\s*=/g) || []; assert.equal(usos.length, 1, 'solo el SVG estatico propio'); assert.match(js, /s\.innerHTML = ICONOS\[n\]/);
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|localStorage|sessionStorage/);
});
