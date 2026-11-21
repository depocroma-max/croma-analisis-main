'use strict';
// Etapa C1 (cds-v3): logica de la pestaña «Talle y color» (cds/variantes.js) sin navegador, con un /analisis/stock-ventas SIMULADO que respeta el contrato real (INFORME-C0).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const fuente = leer('cds', 'variantes.js'), detalle = leer('cds', 'detalle.js'), html = leer('index.html');

const SUC5 = ['0001', '0005', '0010', '0012', '0014'];
// API simulada: n variantes del codigo pedido, paginadas como la real (limit <= 500). opciones permite alterar la respuesta.
function nuevo(opc = {}) {
  const llamadas = [];
  const cfg = { n: 1, codigo: '00123', alterar: null, falla: null, espera: null, ...opc };
  const fila = (i, codigo) => ({ Codigo_producto: codigo, Codigo_talle: String(i).padStart(4, '0'), Codigo_color: i % 7 === 0 ? 'ZZ' : '02', Nombre_color: i % 7 === 0 ? null : 'NEGRO', color_no_mapeado: i % 7 === 0, Ultimo_ingreso: null,
    Ventas_total: i % 5 === 0 ? -1 : 2, Stock_total: 999, Stock_ctro_0000: i % 3 === 0 ? 4 : 0, Stock_fallados: i % 3 === 0 ? 1 : 0, Ventas_ctro_0001: i % 5 === 0 ? -1 : 2, Stock_ctro_0001: i % 4 === 0 ? -2 : 3, Ventas_ctro_0005: 0, Stock_ctro_0005: 0, Ventas_ctro_0009: 0, Stock_ctro_0009: 0, Ventas_ctro_0010: 0, Stock_ctro_0010: 0, Ventas_ctro_0012: 0, Stock_ctro_0012: 0, Ventas_ctro_0014: 0, Stock_ctro_0014: 0 });
  const fetchSim = async (url, opts) => {
    const u = new URL(url, 'http://x'), off = Number(u.searchParams.get('offset')), lim = Number(u.searchParams.get('limit')), suc = u.searchParams.get('sucursales').split(','), codigo = u.searchParams.get('codigo');
    llamadas.push({ url, off, lim, suc, codigo });
    if (cfg.espera) await cfg.espera(llamadas.length, opts);
    if (opts && opts.signal && opts.signal.aborted) { const e = new Error('abortado'); e.name = 'AbortError'; throw e; }
    if (cfg.falla && cfg.falla(llamadas.length, off)) return { ok: false, status: 500, json: async () => ({ ok: false, error: 'error simulado' }) };
    const total = cfg.n, data = []; for (let i = off; i < Math.min(total, off + lim); i++) data.push(fila(i, codigo));
    const b = { ok: true, periodo: { desde: u.searchParams.get('desde'), hasta: u.searchParams.get('hasta') }, sucursales: suc, paginacion: { limit: lim, offset: off, total, devueltos: data.length }, total: data.length, data };
    if (cfg.alterar) cfg.alterar(b, off);
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(b)) };
  };
  let ahora = 1000000;
  const ctx = { document: { documentElement: { classList: { contains: c => c === 'cds-v3' } }, createElement: () => ({}) }, Intl, URLSearchParams, AbortController, fetch: fetchSim, STOCK_API_URL: '', RT_DESDE: '2026-08-01', RT_HASTA: '2026-10-30', RT_CENTROS: SUC5.slice() };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fuente, ctx);
  ctx.CDS_VARIANTES.CFG.ahora = () => ahora;
  return { V: ctx.CDS_VARIANTES, llamadas, cfg, avanzar: ms => { ahora += ms; }, ctx };
}
const P = (o = {}) => ({ codigo: '00123', desde: '2026-08-01', hasta: '2026-10-30', sucursales: SUC5, ...o });
const esperar = async (V, p) => { for (let i = 0; i < 200; i++) { const e = V.estadoDe(p); if (e.fase === 'listo' || e.fase === 'error') return e; await new Promise(r => setTimeout(r, 2)); } throw new Error('no termino'); };

test('claves de seguimiento canonicas: producto, color, talle, variante y variante por sucursal; todas cadenas, con ceros y escape', () => {
  const { V } = nuevo(); const v = { cod: '00123', talle: '040', color: '0A' };
  assert.equal(V.claveSeguimiento('producto', v), 'P:00123'); assert.equal(V.claveSeguimiento('color', v), 'C:00123:0A'); assert.equal(V.claveSeguimiento('talle', v), 'T:00123:040');
  assert.equal(V.claveSeguimiento('variante', v), 'V:00123:040:0A'); assert.equal(V.claveSeguimiento('variante_sucursal', v, '0005'), 'VS:00123:040:0A:0005');
  assert.equal(V.claveSeguimiento('variante', { cod: 'A:B', talle: 'x y', color: '' }), 'V:A%3AB:x%20y:'); assert.throws(() => V.claveSeguimiento('otro', v));
});
test('normalizar: ceros iniciales y largos libres como cadenas; ventas aunque stock sea 0; negativos no son disponibles; deposito 90 derivado y recortado; Stock_total ignorado', () => {
  const { V } = nuevo();
  const fila = (o) => Object.assign({ Codigo_producto: '00123', Codigo_talle: '040', Codigo_color: '0A', Nombre_color: 'VINTAGE', color_no_mapeado: false, Ventas_total: 3, Stock_total: 12345, Stock_ctro_0000: 6, Stock_fallados: 1, Ventas_ctro_0001: 3, Stock_ctro_0001: 5, Stock_ctro_0005: -2, Ventas_ctro_0005: 0, Stock_ctro_0010: 0, Ventas_ctro_0010: 0, Stock_ctro_0012: 0, Ventas_ctro_0012: 0, Stock_ctro_0014: 0, Ventas_ctro_0014: 0 }, o);
  const v = V.normalizar(fila(), SUC5, '00123');
  assert.equal(v.cod, '00123'); assert.equal(v.talle, '040'); assert.equal(v.color, '0A'); assert.equal(typeof v.talle, 'string'); assert.equal(v.clave, 'V:00123:040:0A');
  assert.equal(v.dep90, 5); assert.equal(v.fallados, 1); assert.equal(v.stockSucDisp, 5); assert.equal(v.stockSucRaw, 3); assert.equal(v.disp, 10); assert.equal(v.estado, 'con_stock'); assert.ok(v.flags.includes('saldo_negativo'));
  assert.ok(!JSON.stringify(v).includes('12345'), 'Stock_total no se usa');
  const solo = V.normalizar(fila({ Stock_ctro_0001: 0, Stock_ctro_0005: 0, Stock_ctro_0000: 10, Stock_fallados: 2, Ventas_total: 0 }), SUC5, '00123'); assert.equal(solo.estado, 'solo_deposito'); assert.equal(solo.dep90, 8); assert.ok(solo.flags.includes('sin_ventas'));
  const vend = V.normalizar(fila({ Stock_ctro_0001: 0, Stock_ctro_0005: 0, Stock_ctro_0000: 0, Stock_fallados: 0, Ventas_total: 7 }), SUC5, '00123'); assert.equal(vend.estado, 'sin_stock'); assert.equal(vend.ventas, 7, 'las ventas se suman aunque el stock sea 0');
  const dif = V.normalizar(fila({ Stock_ctro_0001: 0, Stock_ctro_0005: 0, Stock_ctro_0000: 1, Stock_fallados: 3 }), SUC5, '00123'); assert.equal(dif.dep90, 0); assert.equal(dif.depDif, -2); assert.ok(dif.flags.includes('deposito_menor_a_fallados')); assert.equal(dif.estado, 'sin_stock');
  const dev = V.normalizar(fila({ Ventas_total: -2 }), SUC5, '00123'); assert.ok(dev.flags.includes('ventas_negativas')); assert.equal(dev.ventas, -2);
  assert.equal(V.normalizar(fila({ Codigo_producto: 'OTRO' }), SUC5, '00123'), null, 'filas de otro producto se descartan');
});
test('talles unicos 99 y TU (y otros valores) y colores sin mapear conservan su codigo y se marcan', () => {
  const { V } = nuevo(); const base = { Codigo_producto: '5', Stock_ctro_0000: 0, Stock_fallados: 0, Ventas_total: 1 };
  ['99', 'TU', 'U', 'UNICO', '00'].forEach(t => { const v = V.normalizar({ ...base, Codigo_talle: t, Codigo_color: 'ZZ', Nombre_color: null, color_no_mapeado: true }, ['0001'], '5'); assert.equal(v.talle, t); assert.equal(v.color, 'ZZ'); assert.ok(v.flags.includes('color_sin_nombre')); assert.equal(v.flags.includes('talle_unico'), t === '99' || t === 'TU'); });
});
test('valores faltantes: no se inventan ceros; la variante se marca y los totales no se calculan', () => {
  const { V } = nuevo(); const v = V.normalizar({ Codigo_producto: '5', Codigo_talle: 'S', Codigo_color: '02', Nombre_color: 'NEGRO', Ventas_total: 1, Stock_ctro_0000: 2 }, ['0001'], '5');
  assert.equal(v.fallados, null); assert.equal(v.dep90, null); assert.equal(v.estado, 'sin_datos'); assert.ok(v.flags.includes('datos_faltantes')); assert.equal(V.totales([v]).dep90, null);
});
test('orden de talles: numericos por valor con desempate textual (040 ≠ 40), curva conocida y resto por texto', () => {
  const { V } = nuevo(); const ord = ['XL', '99', '040', '40', 'S', 'TU', '38', 'M', 'XS'].sort(V.compararTalle);
  assert.deepEqual(ord, ['38', '040', '40', '99', 'XS', 'S', 'M', 'XL', 'TU']);
});
test('carga de 1, 20, 300 y 1200 variantes: paginas de 500, sin duplicados, sucursales de Oportunidades y eco validado', async () => {
  for (const [n, pags] of [[1, 1], [20, 1], [300, 1], [1200, 3]]) {
    const { V, llamadas } = nuevo({ n }), p = P(); V.iniciar(p); const e = await esperar(V, p);
    assert.equal(e.fase, 'listo'); assert.equal(e.entrada.filas.length, n); assert.equal(e.entrada.completa, true); assert.equal(e.entrada.paginas, pags); assert.equal(llamadas.length, pags);
    assert.equal(new Set(e.entrada.filas.map(f => f.clave)).size, n, 'sin duplicados'); assert.equal(e.entrada.duplicadas, 0);
    assert.deepEqual(llamadas.map(c => c.off), [0, 500, 1000].slice(0, pags)); assert.ok(llamadas.every(c => c.lim === 500 && c.suc.join(',') === SUC5.join(',') && c.codigo === '00123'));
    assert.equal(V.totalesDisponibles(e.entrada).ok, true);
  }
});
test('parametros: periodo y sucursales salen de la consulta de Oportunidades (su eco); sin eco se usan las elegidas y no se concilia', () => {
  const { V } = nuevo();
  const a = V.parametros({ Codigo_producto: '00123' }, { periodo: { desde: '2026-07-01', hasta: '2026-09-30' }, sucursales: ['0014', '0001', '0005'] });
  assert.equal(JSON.stringify(a.sucursales), JSON.stringify(['0001', '0005', '0014'])); assert.equal(a.desde, '2026-07-01'); assert.equal(a.ecoOportunidades, true); assert.equal(a.periodoOportunidades, true);
  const b = V.parametros({ Codigo_producto: '00123' }, {}); assert.equal(JSON.stringify(b.sucursales), JSON.stringify(SUC5)); assert.equal(b.ecoOportunidades, false); assert.equal(b.desde, '2026-08-01');
});
test('resultado parcial por tope de paginas: 2200 variantes → 4 paginas (2000), sin totales ni conciliacion; se guarda en cache pero marcado parcial', async () => {
  const { V, llamadas } = nuevo({ n: 2200 }), p = P(); V.iniciar(p); const e = await esperar(V, p);
  assert.equal(e.entrada.completa, false); assert.equal(e.entrada.razonParcial, 'tope'); assert.equal(e.entrada.filas.length, 2000); assert.equal(e.entrada.total, 2200); assert.equal(llamadas.length, 4);
  assert.equal(V.totalesDisponibles(e.entrada).ok, false); assert.equal(V.conciliar({ variantes: 2000 }, e.entrada, { ...V.parametros({ Codigo_producto: '00123' }, { periodo: { desde: '2026-08-01', hasta: '2026-10-30' }, sucursales: SUC5 }) }).aplicable, false);
});
test('falla de una pagina intermedia: parcial por error, no se cachea y el reintento vuelve a pedir; falla de la primera: error', async () => {
  const { V, llamadas } = nuevo({ n: 1200, falla: (k) => k === 2 }), p = P(); V.iniciar(p); let e = await esperar(V, p);
  assert.equal(e.entrada.razonParcial, 'error'); assert.equal(e.entrada.completa, false); assert.equal(e.entrada.filas.length, 500); assert.equal(V.totalesDisponibles(e.entrada).ok, false);
  const antes = llamadas.length; V.reintentar(p); e = await esperar(V, p); assert.ok(llamadas.length > antes, 'el reintento consulta de nuevo');
  const r = nuevo({ n: 5, falla: () => true }), q = P(); r.V.iniciar(q); const er = await esperar(r.V, q); assert.equal(er.fase, 'error'); assert.match(er.error.mensaje, /error simulado/);
  r.cfg.falla = null; r.V.reintentar(q); const ok = await esperar(r.V, q); assert.equal(ok.fase, 'listo'); assert.equal(ok.entrada.filas.length, 5);
});
test('el eco de sucursales y de periodo se valida: si no coincide es un error y no se muestran numeros', async () => {
  const a = nuevo({ n: 3, alterar: b => { b.sucursales = ['0001']; } }), p = P(); a.V.iniciar(p); const ea = await esperar(a.V, p); assert.equal(ea.fase, 'error'); assert.match(ea.error.mensaje, /no confirmó las sucursales/); assert.equal(ea.error.tipo, 'eco');
  const b = nuevo({ n: 3, alterar: x => { delete x.sucursales; } }); b.V.iniciar(p); assert.equal((await esperar(b.V, p)).error.tipo, 'eco');
  const c = nuevo({ n: 3, alterar: x => { x.periodo = { desde: '2000-01-01', hasta: '2000-01-02' }; } }); c.V.iniciar(p); assert.equal((await esperar(c.V, p)).error.tipo, 'periodo');
});
test('repetidas y de otro producto se descartan y bloquean los totales; un total que cambia entre paginas deja el resultado parcial', async () => {
  const d = nuevo({ n: 3, alterar: b => { b.data.push({ ...b.data[0] }); b.data.push({ ...b.data[0], Codigo_producto: 'OTRO' }); } }), p = P(); d.V.iniciar(p); const e = await esperar(d.V, p);
  assert.equal(e.entrada.filas.length, 3); assert.equal(e.entrada.duplicadas, 1); assert.equal(e.entrada.ajenas, 1); assert.equal(d.V.totalesDisponibles(e.entrada).ok, false);
  const t = nuevo({ n: 700, alterar: (b, off) => { if (off > 0) b.paginacion.total += 5; } }); t.V.iniciar(p); const et = await esperar(t.V, p); assert.equal(et.entrada.razonParcial, 'cambio'); assert.equal(et.entrada.completa, false);
});
test('cache de 5 minutos: acierto sin consulta, vence a los 5 min, se invalida con Actualizar y la clave incluye periodo y sucursales', async () => {
  const { V, llamadas, avanzar } = nuevo({ n: 4 }), p = P(); V.iniciar(p); await esperar(V, p); assert.equal(llamadas.length, 1);
  assert.equal(V.estadoDe(p).fase, 'listo'); assert.equal(llamadas.length, 1, 'acierto de cache');
  assert.equal(V.estadoDe(P({ hasta: '2026-10-29' })).fase, 'inicial'); assert.equal(V.estadoDe(P({ sucursales: ['0001'] })).fase, 'inicial'); assert.equal(V.estadoDe(P({ codigo: '00124' })).fase, 'inicial');
  avanzar(4 * 60 * 1000); assert.equal(V.estadoDe(p).fase, 'listo'); avanzar(61 * 1000); assert.equal(V.estadoDe(p).fase, 'inicial', 'vencida');
  V.iniciar(p); await esperar(V, p); assert.equal(llamadas.length, 2); V.reintentar(p); await esperar(V, p); assert.equal(llamadas.length, 3, 'Actualizar vuelve a consultar'); V.invalidar(); assert.equal(V.estadoDe(p).fase, 'inicial');
});
test('cache acotada: nunca mas de 20 entradas (LRU)', async () => {
  const { V } = nuevo({ n: 1 }); for (let i = 0; i < 25; i++) { const p = P({ codigo: 'C' + i }); V.iniciar(p); await esperar(V, p); }
  assert.ok(V._estado().cache <= 20); assert.equal(V.estadoDe(P({ codigo: 'C0' })).fase, 'inicial'); assert.equal(V.estadoDe(P({ codigo: 'C24' })).fase, 'listo');
});
test('consultas simultaneas: una nueva descarta a la anterior y su respuesta tardia no se usa; la misma clave no duplica la consulta; cancelar descarta', async () => {
  let liberar; const puerta = new Promise(r => { liberar = r; });
  const a = nuevo({ n: 3, espera: async (k) => { if (k === 1) await puerta; } }), pa = P({ codigo: 'AAA' }), pb = P({ codigo: 'BBB' });
  a.V.iniciar(pa); a.V.iniciar(pa); assert.equal(a.llamadas.length, 1, 'misma clave en vuelo: una sola consulta');
  a.V.iniciar(pb); const eb = await esperar(a.V, pb); assert.equal(eb.entrada.filas[0].cod, 'BBB'); liberar(); await new Promise(r => setTimeout(r, 20));
  assert.equal(a.V.estadoDe(pa).fase, 'inicial', 'la respuesta tardia de A se descarto'); assert.equal(a.V._estado().vuelo, false);
  const c = nuevo({ n: 3, espera: async () => { await new Promise(r => setTimeout(r, 15)); } }), pc = P(); c.V.iniciar(pc); c.V.cancelar(); await new Promise(r => setTimeout(r, 40)); assert.equal(c.V.estadoDe(pc).fase, 'inicial'); assert.equal(c.V._estado().cache, 0);
});
test('conciliacion: solo con totales completos, mismo periodo y sucursales y mismo universo; nunca se inventa', async () => {
  const { V } = nuevo({ n: 3 }), p = P(); V.iniciar(p); const e = (await esperar(V, p)).entrada, t = V.totales(e.filas);
  const ctx = { ...V.parametros({ Codigo_producto: '00123' }, { periodo: { desde: '2026-08-01', hasta: '2026-10-30' }, sucursales: SUC5 }) };
  const prod = { variantes: 3, Ventas_total: t.ventas, Stock_sucursales: t.stockSucRaw, Stock_deposito: t.dep90, Stock_fallados: t.fallados, variantes_con_stock: t.conStockMotor };
  const c = V.conciliar(prod, e, ctx); assert.equal(c.aplicable, true); assert.ok(c.items.length === 5 && c.items.every(i => i.coincide));
  assert.equal(V.conciliar({ ...prod, Ventas_total: t.ventas + 1 }, e, ctx).items.find(i => i.etiqueta === 'Ventas netas').coincide, false);
  const u = V.conciliar({ ...prod, variantes: 4 }, e, ctx); assert.equal(u.aplicable, false); assert.match(u.motivo, /universo de variantes difiere/);
  assert.equal(V.conciliar(prod, e, { ...ctx, hasta: '2026-10-29' }).aplicable, false); assert.equal(V.conciliar(prod, e, { ...ctx, sucursales: ['0001'] }).aplicable, false); assert.equal(V.conciliar(prod, e, { ...ctx, ecoOportunidades: false }).aplicable, false);
});
test('«Mostrar más» no pierde el foco aunque el botón desaparezca, y salir de la pestaña reinicia filtros y orden', () => {
  assert.match(fuente, /\(f \|\| m \|\| zona\)\.focus\(\{ preventScroll: true \}\)/); assert.match(fuente, /function cancelar\(\) \{[\s\S]*?vista = null;/);
});
test('estatico: la pestaña se agrega al detalle, la consulta nace solo en panel(), el modulo no usa Stock_total y la bandera carga los 2 archivos', () => {
  assert.match(detalle, /\['variantes', 'Talle y color', ''\]/); assert.match(detalle, /tab === 'variantes' \? pestanaVariantes\(f, resp\)/);
  assert.equal((fuente.match(/iniciar\(ctx\)/g) || []).length, 1, 'solo panel() inicia la carga automatica'); assert.equal((detalle.match(/CDS_VARIANTES/g) || []).length >= 3, true);
  assert.doesNotMatch(fuente.replace(/\/\*[\s\S]*?\*\//, ''), /Stock_total/); assert.match(html, /'cds\/resultados\.js', 'cds\/detalle\.js', 'cds\/variantes\.js'/); assert.match(html, /'cds\/variantes\.css'/);
  assert.match(detalle, /if \(tab !== 'variantes'\) cancelarVariantes\(\)/); assert.match(detalle, /function cerrar\(\) \{ cancelarVariantes\(\);/);
  assert.match(fuente, /html\.cds-v3|classList\.contains\('cds-v3'\)/); const css = leer('cds', 'variantes.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(css.split('\n').map(l => l.trim()).filter(l => l.includes('{')).every(l => /^(html\.cds-v3|@media)/.test(l)), 'todos los selectores van bajo html.cds-v3');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css) && !/rgba?\(/.test(css), 'solo tokens: ningun color literal'); assert.ok(!/var\(--(?!cds-)/.test(css) && !/(^|[;{\s])--(?!cds-)[a-z-]+\s*:/.test(css), 'solo variables --cds-*');
});
