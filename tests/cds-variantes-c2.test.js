'use strict';
// Etapa C2 (cds-v3): señal de rotación en «Talle y color» y consulta manual de sugerencias, sin navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const fuente = fs.readFileSync(path.join(RAIZ, 'cds', 'variantes.js'), 'utf8'), detalle = fs.readFileSync(path.join(RAIZ, 'cds', 'detalle.js'), 'utf8');
const SUC5 = ['0001', '0005', '0010', '0012', '0014'];

function nuevo(extra = {}) {
  const llamadas = [];
  const cfg = { admin: true, status: 200, items: [], ...extra };
  const fetchSim = async (url, opts) => {
    const u = new URL(url, 'http://x'); llamadas.push({ path: u.pathname, q: Object.fromEntries(u.searchParams), headers: opts && opts.headers });
    if (u.pathname === '/analisis/rotaciones') {
      if (cfg.status !== 200) return { ok: false, status: cfg.status, json: async () => ({ ok: false, error: 'Acceso denegado' }) };
      const pares = []; cfg.items.forEach(it => { let p = pares.find(x => x.origen === it.origen && x.destino === it.destino); if (!p) pares.push(p = { origen: it.origen, destino: it.destino, items: [] }); p.items.push(it); });
      return { ok: true, status: 200, json: async () => ({ ok: true, desde: u.searchParams.get('desde'), hasta: u.searchParams.get('hasta'), pares }) };
    }
    throw new Error('consulta inesperada ' + u.pathname);
  };
  const ctx = { document: { documentElement: { classList: { contains: c => c === 'cds-v3' } }, createElement: () => ({}) }, Intl, URLSearchParams, AbortController, fetch: fetchSim, STOCK_API_URL: '', RT_DESDE: '2026-08-01', RT_HASTA: '2026-10-30', RT_CENTROS: SUC5.slice(), rrEsAdmin: () => cfg.admin, rtRotAuthHeaders: () => ({ Authorization: 'Bearer x' }) };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fuente, ctx);
  return { V: ctx.CDS_VARIANTES, llamadas, cfg };
}
const accion = (o = {}) => Object.assign({ accion: 'revisar_rotacion', estado_origen: 'posible_rotacion', principal: true, prioridad: 'alta', nivel: 'producto', ejecutable: false, requiere_validacion_variante: true, origen: '0001', destino: '0005', cantidad_orientativa: 6, cantidad_validada_por_variante: false }, o);
const fila = (o = {}) => Object.assign({ Codigo_producto: '00123', estado_principal: 'posible_rotacion', estados_secundarios: [], acciones: [accion()] }, o);
const variante = (V, o = {}) => V.normalizar(Object.assign({ Codigo_producto: '00123', Codigo_talle: '040', Codigo_color: '02', Nombre_color: 'NEGRO', Ventas_total: 3, Stock_ctro_0000: 4, Stock_fallados: 0, Stock_ctro_0001: 5, Ventas_ctro_0001: 0, Stock_ctro_0005: 0, Ventas_ctro_0005: 4, Stock_ctro_0010: 0, Ventas_ctro_0010: 0, Stock_ctro_0012: 0, Ventas_ctro_0012: 0, Stock_ctro_0014: 0, Ventas_ctro_0014: 0 }, o), SUC5, '00123');

test('señal: principal, secundaria y sin señal; origen, destino y cantidad orientativa del producto (nunca como cantidad lista)', () => {
  const { V } = nuevo(); const s = V.senalRotacion(fila());
  assert.equal(s.origen, '0001'); assert.equal(s.destino, '0005'); assert.equal(s.cantidad, 6); assert.equal(s.principal, true);
  const sec = V.senalRotacion(fila({ estado_principal: 'reposicion_urgente', estados_secundarios: ['posible_rotacion'], acciones: [{ accion: 'reponer_urgente', estado_origen: 'reposicion_urgente', principal: true }, accion({ principal: false, cantidad_orientativa: null })] }));
  assert.equal(sec.principal, false); assert.equal(sec.cantidad, null, 'sin cantidad orientativa si no existe');
  assert.equal(V.senalRotacion(fila({ estado_principal: 'bien_vendido', acciones: [{ accion: 'seguir_producto_nuevo', estado_origen: 'bien_vendido', principal: true }] })), null);
  assert.equal(V.senalRotacion(fila({ acciones: [accion({ cantidad_orientativa: 0 })] })).cantidad, null);
  const solo = V.senalRotacion({ Codigo_producto: '1', estado_principal: 'seguimiento', estados_secundarios: ['posible_rotacion'], acciones: [], diagnostico_rotacion: { par_sugerido: { origen: { sucursal: '0010', stock: 7 }, destino: { sucursal: '0012', ventas: 5 }, cantidad_sugerida: 3 }, pares: [{}, {}, {}] } });
  assert.equal(solo.origen, '0010'); assert.equal(solo.destino, '0012'); assert.equal(solo.cantidad, 3); assert.equal(solo.stockProducto, 7); assert.equal(solo.ventasProducto, 5); assert.equal(solo.otrosPares, 2);
  assert.equal(V.senalRotacion(null), null); assert.equal(V.senalRotacion(fila({ acciones: [accion({ origen: null, destino: null })] })), null);
});
test('sucursales excluidas: la señal solo se analiza si origen y destino están entre las sucursales de la consulta', () => {
  const { V } = nuevo(); const s = V.senalRotacion(fila());
  assert.equal(V.senalAplicable(s, SUC5), true); assert.equal(V.senalAplicable(s, ['0010', '0012']), false); assert.equal(V.senalAplicable(s, ['0001']), false); assert.equal(V.senalAplicable(null, SUC5), false);
});
test('revisión por variante: solo «para revisar» con stock POSITIVO en origen y ventas en destino; cero, negativo, sin ventas y datos faltantes se distinguen', () => {
  const { V } = nuevo(); const s = V.senalRotacion(fila()), r = o => V.revisionRotacion(variante(V, o), s);
  assert.equal(r({}).estado, 'revisar'); assert.equal(r({}).stockOrigen, 5); assert.equal(r({}).ventasDestino, 4);
  assert.equal(r({ Stock_ctro_0001: 0 }).estado, 'sin_stock_origen'); assert.equal(r({ Stock_ctro_0001: -2 }).estado, 'sin_stock_origen'); assert.equal(r({ Stock_ctro_0001: -2 }).saldoNegativoOrigen, true);
  assert.equal(r({ Ventas_ctro_0005: 0 }).estado, 'sin_ventas_destino'); assert.equal(r({ Ventas_ctro_0005: -1 }).estado, 'sin_ventas_destino'); assert.equal(r({ Ventas_ctro_0005: -1 }).ventasNegativasDestino, true);
  const falta = o => { const row = { Codigo_producto: '00123', Codigo_talle: 'S', Codigo_color: '02', Nombre_color: 'NEGRO', Ventas_total: 1, Stock_ctro_0000: 0, Stock_fallados: 0 }; SUC5.forEach(c => { row['Stock_ctro_' + c] = 1; row['Ventas_ctro_' + c] = 1; }); delete row[o]; return V.revisionRotacion(V.normalizar(row, SUC5, '00123'), s); };
  assert.equal(falta('Stock_ctro_0001').estado, 'datos_incompletos'); assert.equal(falta('Ventas_ctro_0005').estado, 'datos_incompletos');
});
test('depósito 90 y fallados 93 no se confunden con el stock de origen: una variante sin stock en la sucursal de origen no es «para revisar» aunque tenga depósito', () => {
  const { V } = nuevo(); const s = V.senalRotacion(fila()), v = variante(V, { Stock_ctro_0001: 0, Stock_ctro_0000: 20, Stock_fallados: 2 });
  assert.equal(v.dep90, 18); assert.equal(V.revisionRotacion(v, s).estado, 'sin_stock_origen'); assert.equal(V.revisionRotacion(v, s).stockOrigen, 0);
});
test('ordenar por stock en origen y por ventas en destino (descendente) con los faltantes al final; filtrar por estado de revisión', () => {
  const { V } = nuevo(); const s = V.senalRotacion(fila());
  const vs = [variante(V, { Codigo_talle: 'A', Stock_ctro_0001: 2 }), variante(V, { Codigo_talle: 'B', Stock_ctro_0001: 9 }), variante(V, { Codigo_talle: 'C', Stock_ctro_0001: 0 }), variante(V, { Codigo_talle: 'D', Stock_ctro_0001: -3 })];
  const rev = new Map(vs.map(v => [v.clave, V.revisionRotacion(v, s)]));
  assert.equal(Array.from(V.ordenar(vs, 'stockOrigen', -1, rev).map(v => v.talle)).join(''), 'BACD'); assert.equal(Array.from(V.ordenar(vs, 'stockOrigen', 1, rev).map(v => v.talle)).join(''), 'DCAB');
  const vsel = { chip: 'para_revisar', q: '' }; assert.equal(Array.from(V.filtrar(vs, vsel, rev, null).map(v => v.talle)).join(''), 'AB');
  assert.equal(Array.from(V.filtrar(vs, { chip: 'sin_stock_origen', q: '' }, rev, null).map(v => v.talle)).join(''), 'CD');
});
test('consulta manual: no se dispara sola; usa JWT, desde/hasta y codigo (sin refresh, sin talle/color/sucursales); filtra por sucursales y descarta repetidas y ajenas', async () => {
  const items = [
    { rotacion_id: 'a', Codigo_producto: '00123', Codigo_talle: '040', Codigo_color: '02', origen: '0001', destino: '0005', cantidad_sugerida: 3 },
    { rotacion_id: 'a', Codigo_producto: '00123', Codigo_talle: '040', Codigo_color: '02', origen: '0001', destino: '0005', cantidad_sugerida: 3 },
    { rotacion_id: 'b', Codigo_producto: '00123', Codigo_talle: 'S', Codigo_color: '02', origen: '0001', destino: '0014', cantidad_sugerida: 2 },
    { rotacion_id: 'c', Codigo_producto: 'OTRO', Codigo_talle: 'S', Codigo_color: '02', origen: '0001', destino: '0005', cantidad_sugerida: 1 }];
  const { V, llamadas } = nuevo({ items }), p = { codigo: '00123', desde: '2026-08-01', hasta: '2026-10-30', sucursales: ['0001', '0005'] };
  assert.equal(V.rotEstado(p).fase, 'inicial'); assert.equal(llamadas.length, 0, 'no hay consulta hasta pulsar');
  V.rotIniciar(p); for (let i = 0; i < 100 && V.rotEstado(p).fase === 'cargando'; i++) await new Promise(r => setTimeout(r, 2));
  const e = V.rotEstado(p); assert.equal(e.fase, 'listo'); assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].path, '/analisis/rotaciones'); assert.equal(JSON.stringify(Object.keys(llamadas[0].q).sort()), JSON.stringify(['codigo', 'desde', 'hasta'])); assert.equal(llamadas[0].headers.Authorization, 'Bearer x');
  assert.equal(e.entrada.items.length, 1); assert.equal(e.entrada.fuera, 1); assert.equal(e.entrada.repetidas, 1); assert.equal(e.entrada.ajenas, 1);
  assert.equal(V.claveItem(e.entrada.items[0]), 'V:00123:040:02'); assert.equal(V.rotEstado({ ...p, sucursales: ['0001', '0005', '0014'] }).fase, 'inicial', 'otra selección de sucursales = otra clave');
});
test('consulta manual: sin permiso (403) es un error explícito que no se guarda; el reintento vuelve a consultar', async () => {
  const { V, llamadas, cfg } = nuevo({ status: 403 }), p = { codigo: '1', desde: '2026-08-01', hasta: '2026-10-30', sucursales: SUC5 };
  V.rotIniciar(p); for (let i = 0; i < 100 && V.rotEstado(p).fase === 'cargando'; i++) await new Promise(r => setTimeout(r, 2));
  const e = V.rotEstado(p); assert.equal(e.fase, 'error'); assert.match(e.error.mensaje, /solo para administradores|es solo para administradores/); assert.equal(e.error.tipo, 'permiso');
  cfg.status = 200; V.rotIniciar(p); for (let i = 0; i < 100 && V.rotEstado(p).fase === 'cargando'; i++) await new Promise(r => setTimeout(r, 2)); assert.equal(V.rotEstado(p).fase, 'listo'); assert.equal(llamadas.length, 2);
});
test('estatico: la consulta de Rotaciones solo nace del botón; la señal no reimplementa Rotaciones; se conservan las acciones existentes', () => {
  assert.equal((fuente.match(/rotIniciar\(/g) || []).length, 2, 'solo la definición y el botón manual la invocan'); assert.match(fuente, /var consulta = function \(txt\) \{ return boton\(txt, function \(\) \{ rotIniciar\(ctx\); avisar\(\); \}/);
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(codigo, /refresh/); assert.doesNotMatch(codigo, /generarPlan|stock_virtual|reserva_origen|calcularRotac/);
  assert.match(fuente, /if \(!esAdmin\(\)\) return null;/); assert.match(fuente, /rrIrARotaciones\(f\.Codigo_producto\)/); assert.match(fuente, /rtAplicarFiltroYVerTallesColores\(\{ codigo: ctx\.codigo \}\)/);
  assert.match(fuente, /Rotaciones no permite filtrar por talle y color/); assert.match(detalle, /rrIrARotaciones\(f\.Codigo_producto\)/); assert.match(detalle, /Ver en Talles y colores/);
  assert.match(fuente, /no es una cantidad para transferir/); assert.match(fuente, /requiere validación por variante/);
});
