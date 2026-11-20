'use strict';
// Etapa B2 (cds-v3): logica de «Por acción» / «Lista» (agrupacion por pagina y contadores respaldados por la API). Sin navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const html = leer('index.html'), vista = leer('oportunidades-vista.js'), js = leer('cds', 'por-accion.js'), css = leer('cds', 'por-accion.css'), grupos = leer('oportunidades-grupos.js');

function entorno(est = {}) {
  const ctx = {
    document: { documentElement: { classList: { contains: c => c === 'cds-v3' } }, createElement: () => ({ setAttribute() {}, appendChild() {}, addEventListener() {} }) },
    Intl, Set, Array, JSON, String, Object, Math, RT_OPORTUNIDADES_GRUPO: 'todas', RT_OPORTUNIDADES_ESTADO: null, RT_VIEW: 'dashboard',
    ovHayFiltroExtra() { return Boolean(ctx.extra); }, extra: false, rtRenderVistaActual() { ctx.renders = (ctx.renders || 0) + 1; }, rrTextoEstado: e => e,
  };
  Object.assign(ctx, est); ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(grupos + '\nthis.OG_GRUPOS = OG_GRUPOS; this.OG_ESTADOS = OG_ESTADOS;', ctx); vm.runInContext(js, ctx);
  return ctx;
}
const J = o => JSON.parse(JSON.stringify(o));
const ORDEN = ['revisar_devoluciones', 'reposicion_urgente', 'reponer_desde_deposito', 'reposicion_a_evaluar', 'posible_rotacion', 'reposicion_proxima', 'venta_destacada', 'bien_vendido', 'seguimiento', 'posible_descuento', 'stock_parado'];

// Universo como lo devuelve el servidor: orden global por prioridad (estado principal) y los "sin accion" (null) al final.
function universo(cuentas, sin) {
  const filas = []; let n = 1000;
  Object.keys(cuentas).forEach(e => { for (let i = 0; i < cuentas[e]; i++) filas.push({ Codigo_producto: String(n++), estado_principal: e }); });
  for (let i = 0; i < sin; i++) filas.push({ Codigo_producto: String(n++), estado_principal: null });
  return filas;
}
function paginar(filas, limite) { const p = []; for (let o = 0; o < filas.length; o += limite) p.push({ offset: o, data: filas.slice(o, o + limite) }); return p; }
function respuesta(filas, pagina, limite, cuentas, sin) {
  const por = Object.fromEntries(ORDEN.map(e => [e, cuentas[e] || 0]));
  return { data: pagina.data, paginacion: { total: filas.length, limit: limite, offset: pagina.offset, devueltos: pagina.data.length },
    resumen: { total_evaluados: filas.length, total_clasificados: filas.length - sin, total_sin_clasificacion: sin, por_estado_principal: por } };
}
const CUENTAS = { posible_rotacion: 36, reposicion_proxima: 1, venta_destacada: 2, bien_vendido: 13, seguimiento: 1, stock_parado: 9 }, SIN = 48;

test('guardas: por-accion.js sale sin la bandera y no consulta la API, no usa almacenamiento ni innerHTML', () => {
  assert.match(js, /if \(!document\.documentElement\.classList\.contains\('cds-v3'\)\) return;/);
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML|eval\(/);
});
test('guardas: por-accion.css solo cuelga de html.cds-v3 y solo usa variables --cds-*', () => {
  const t = css.replace(/\/\*[\s\S]*?\*\//g, ''); const sels = [...t.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map(m => m[2].trim()).filter(Boolean);
  assert.ok(sels.length >= 15); sels.forEach(s => s.split(',').forEach(p => assert.match(p.trim(), /^html\.cds-v3 /, p)));
  [...t.matchAll(/var\((--[a-z0-9-]+)/g)].forEach(m => assert.match(m[1], /^--cds-/));
});
test('compatibilidad: todos los ganchos de la vista dependen de window.CDS_POR_ACCION y index.html solo lo carga con la bandera', () => {
  const lineas = vista.split(/\r?\n/);
  const usos = lineas.filter(l => /CDS_POR_ACCION/.test(l)); assert.equal(usos.length, 1, 'solo la funcion ovCds() nombra al objeto');
  const ganchos = lineas.filter(l => /ovCds\(\)/.test(l)); assert.equal(ganchos.length, 5, 'definicion + 4 ganchos'); // todo pasa por ovCds(): null sin la bandera y sin `window` en Node
  assert.match(html, /por-accion\.css/); assert.match(html, /por-accion\.js/);
  assert.doesNotMatch(html.replace(/<script>\s*\(function \(\) \{\s*var CDS_V3_POR_DEFECTO[\s\S]*?<\/script>/, ''), /cds\/por-accion/);
});

test('agrupar: conserva el ORDEN DEL SERVIDOR (no reordena), un grupo por estado principal y «sin acción» al final', () => {
  const c = entorno(); const filas = universo(CUENTAS, 3);
  const g = J(c.CDS_POR_ACCION.agrupar(filas)); assert.deepEqual(g.grupos.map(x => x.clave), ['posible_rotacion', 'reposicion_proxima', 'venta_destacada', 'bien_vendido', 'seguimiento', 'stock_parado', c.CDS_POR_ACCION.SIN]);
  assert.deepEqual(g.grupos.map(x => x.filas.length), [36, 1, 2, 13, 1, 9, 3]);
  const idx = g.grupos.filter(x => x.estado).map(x => ORDEN.indexOf(x.estado)); assert.deepEqual(idx, [...idx].sort((a, b) => a - b)); // el orden del servidor coincide con el del motor
  // si el servidor mandara otro orden, se respeta tal cual (la vista no impone el suyo)
  const raro = J(c.CDS_POR_ACCION.agrupar([{ Codigo_producto: 'a', estado_principal: 'stock_parado' }, { Codigo_producto: 'b', estado_principal: 'posible_rotacion' }]));
  assert.deepEqual(raro.grupos.map(x => x.clave), ['stock_parado', 'posible_rotacion']);
});
test('agrupar: ningun producto repetido (se informa cuantos se omitieron) y el null es «sin acción», no una clasificacion nueva', () => {
  const c = entorno(); const g = J(c.CDS_POR_ACCION.agrupar([{ Codigo_producto: '1', estado_principal: 'bien_vendido' }, { Codigo_producto: '1', estado_principal: 'bien_vendido' }, { Codigo_producto: '2' }, { Codigo_producto: '3', estado_principal: null }]));
  assert.equal(g.repetidos, 1); assert.deepEqual(g.grupos.map(x => [x.clave, x.filas.length]), [['bien_vendido', 1], [c.CDS_POR_ACCION.SIN, 2]]);
  assert.equal(g.grupos[1].estado, null);
});
test('grupos que cruzan paginas: cada pagina agrupa solo lo recibido; sumando las paginas se reconstruye cada grupo, sin duplicados ni faltantes', () => {
  const c = entorno(); const filas = universo(CUENTAS, SIN), pags = paginar(filas, 50); assert.equal(pags.length, 3);
  const suma = {}, vistos = new Set(); let cruzan = 0;
  pags.forEach(p => { const g = J(c.CDS_POR_ACCION.agrupar(p.data)); g.grupos.forEach(x => { suma[x.clave] = (suma[x.clave] || 0) + x.filas.length; }); p.data.forEach(f => { assert.ok(!vistos.has(f.Codigo_producto)); vistos.add(f.Codigo_producto); }); });
  Object.keys(CUENTAS).forEach(e => assert.equal(suma[e], CUENTAS[e], e)); assert.equal(suma[c.CDS_POR_ACCION.SIN], SIN); assert.equal(vistos.size, filas.length);
  pags.forEach(p => { const r = respuesta(filas, p, 50, CUENTAS, SIN); J(c.CDS_POR_ACCION.agrupar(p.data)).grupos.forEach(x => { if (x.filas.length < c.CDS_POR_ACCION.contadores(r, true).porClave[x.clave]) cruzan++; }); });
  assert.ok(cruzan >= 3, 'cruces detectados: ' + cruzan); // un grupo cruza paginas cuando su total del resumen supera lo recibido en la pagina
});

test('contadores: con alcance completo salen del resumen de la API y «sin acción» de total_sin_clasificacion', () => {
  const c = entorno(); const filas = universo(CUENTAS, SIN), r = respuesta(filas, paginar(filas, 50)[1], 50, CUENTAS, SIN);
  const k = J(c.CDS_POR_ACCION.contadores(r, true)); assert.equal(k.fiable, true);
  assert.equal(k.porClave.posible_rotacion, 36); assert.equal(k.porClave.stock_parado, 9); assert.equal(k.porClave[c.CDS_POR_ACCION.SIN], SIN);
  assert.equal(k.porClave.reposicion_urgente, 0); // un estado sin productos es 0 de la API, no "no disponible"
});
test('contadores: con grupo/estado/prioridad/rotacion el total por acción NO está disponible (alcance), no se inventa', () => {
  const c = entorno(); const filas = universo(CUENTAS, SIN), r = respuesta(filas, paginar(filas, 50)[0], 50, CUENTAS, SIN);
  [{ RT_OPORTUNIDADES_GRUPO: 'reposicion' }, { RT_OPORTUNIDADES_ESTADO: 'bien_vendido' }, { extra: true }].forEach(est => {
    const e = entorno(est); assert.equal(e.CDS_POR_ACCION.alcanceCompleto(), false, JSON.stringify(est));
    const k = J(e.CDS_POR_ACCION.contadores(r, e.CDS_POR_ACCION.alcanceCompleto())); assert.equal(k.fiable, false); assert.equal(k.motivo, 'alcance'); assert.deepEqual(k.porClave, {});
  });
  assert.equal(c.CDS_POR_ACCION.alcanceCompleto(), true);
});
test('contadores: datos ausentes o inconsistentes (la suma no cierra con total_evaluados o con la paginacion) => no disponible', () => {
  const c = entorno(); const filas = universo(CUENTAS, SIN), base = () => respuesta(filas, paginar(filas, 50)[0], 50, CUENTAS, SIN);
  let r = base(); delete r.resumen.total_sin_clasificacion; assert.equal(c.CDS_POR_ACCION.contadores(r, true).motivo, 'sin-datos');
  r = base(); r.resumen.por_estado_principal.bien_vendido += 1; assert.equal(c.CDS_POR_ACCION.contadores(r, true).motivo, 'inconsistente');
  r = base(); r.paginacion.total += 1; assert.equal(c.CDS_POR_ACCION.contadores(r, true).motivo, 'inconsistente');
  r = base(); r.resumen.por_estado_principal.stock_parado = null; assert.equal(c.CDS_POR_ACCION.contadores(r, true).fiable, false);
  r = base(); delete r.resumen; assert.equal(c.CDS_POR_ACCION.contadores(r, true).fiable, false);
});
test('consulta: «Todos» sin estado no envia `estado` (incluye los sin acción); cualquier estado o grupo SI lo envia (como siempre)', () => {
  assert.equal(entorno().CDS_POR_ACCION.sinFiltroDeEstado(), true);
  assert.equal(entorno({ RT_OPORTUNIDADES_ESTADO: 'bien_vendido' }).CDS_POR_ACCION.sinFiltroDeEstado(), false);
  assert.equal(entorno({ RT_OPORTUNIDADES_GRUPO: 'rotaciones' }).CDS_POR_ACCION.sinFiltroDeEstado(), false);
});
test('tarjeta «Todos»: el contador es resumen.total_evaluados (= total de la lista); sin dato queda en «—» (null), nunca 0', () => {
  const c = entorno(); const g = x => J(c.CDS_POR_ACCION.ajustarConteos(x)).conteos.grupos.todas;
  assert.equal(g({ base: { resumen: { total_evaluados: 110 } }, conteos: { grupos: { todas: 61 } } }), 110);
  assert.equal(g({ base: { resumen: {} }, conteos: { grupos: { todas: 61 } } }), null); assert.equal(g({ base: null, conteos: { grupos: { todas: 61 } } }), null);
  assert.equal(c.OG_GRUPOS[0].etiqueta, 'Todos'); // se renombra solo con la bandera (el archivo ni se carga sin ella)
});
test('selector: la vista Lista devuelve false (se dibuja la tabla de siempre) y la vista predeterminada es Por acción', () => {
  const c = entorno(); assert.equal(c.CDS_POR_ACCION.vista(), 'accion'); c.CDS_POR_ACCION.fijarVista('lista');
  assert.equal(c.CDS_POR_ACCION.lista({}, {}, 91), false);
});
