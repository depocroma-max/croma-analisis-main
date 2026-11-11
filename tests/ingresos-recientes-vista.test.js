'use strict';
// Pruebas de la LOGICA pura de la vista Ingresos recientes (ingresos-recientes-vista.js): conteos (cero real vs no disponible), alcance efectivo,
// parametros de consulta, validacion de rango, textos de atraso y fecha de referencia del stock. No replican el marcado visual (eso se valida en
// el harness: tests/harness/validacion-ingresos-recientes.js). Se ejecutan con:  node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./dom-minimo');

const plano = v => JSON.parse(JSON.stringify(v));
const centro = (c, fecha, estado = 'ok', atraso = 0) => ({ centro: c, nombre: c, fecha_actualizacion: fecha, estado, dias_atraso: atraso, motivo: estado === 'ok' ? null : 'anterior_al_corte' });
const resp = (estado, por, lectura = {}) => ({
  stock_actual: { sucursales: { estado_general: estado, por_centro: por } },
  resumen: { por_lectura: { sin_ventas_con_stock: 0, historial_insuficiente: 0, sin_exposicion: 0, en_observacion: 0, agotado_con_ventas: 0, con_ventas: 0, ...lectura } },
});
const ALINEADO = resp('alineado', { '0001': centro('0001', '2026-11-10'), '0012': centro('0012', '2026-11-10') }, { con_ventas: 48, historial_insuficiente: 6 });
const ATRASADO = resp('atrasado', { '0001': centro('0001', '2026-11-10'), '0012': centro('0012', '2026-11-09', 'atrasado', 1) }, { historial_insuficiente: 92 });

test('contadores: un cero REAL se muestra como 0 y el dato no disponible como null (nunca 0)', () => {
  const env = crearEntorno();
  const v = (r, k) => env.ev(`irValorContador(${JSON.stringify(r)}, '${k}')`);
  assert.equal(v(ALINEADO, 'sin_ventas_con_stock'), 0, 'alineado: 0 es un cero real');
  assert.equal(v(ALINEADO, 'con_ventas'), 48);
  assert.equal(v(ATRASADO, 'historial_insuficiente'), 92, 'atrasado: el total insuficiente se informa');
  for (const k of ['con_ventas', 'en_observacion', 'sin_ventas_con_stock', 'agotado_con_ventas', 'sin_exposicion']) assert.equal(v(ATRASADO, k), null, k + ' no se clasifica con el stock desalineado');
  assert.equal(v(null, 'con_ventas'), null, 'sin respuesta: no disponible');
  const desconocido = resp('desconocido', {}, { historial_insuficiente: 5, con_ventas: 0 });
  assert.equal(v(desconocido, 'con_ventas'), null);
  assert.equal(v(desconocido, 'historial_insuficiente'), 5);
});

test('alcance efectivo: seleccion global ∩ operativas, menos las exclusiones EXPLICITAS de esta vista', () => {
  const env = crearEntorno();
  const f = (sel, exc) => plano(env.ev(`irCentrosEfectivos(${JSON.stringify(sel)}, ${JSON.stringify(exc)})`));
  assert.deepEqual(f(['0001', '0005', '0009', '0010', '0012', '0014'], []), ['0001', '0005', '0010', '0012', '0014'], 'Cipo (cerrada) no entra');
  assert.deepEqual(f(['0001', '0005', '0010', '0012', '0014'], ['0012']), ['0001', '0005', '0010', '0014']);
  assert.deepEqual(f(['0001', '0005'], ['0005']), ['0001']);
  assert.deepEqual(f(['0001'], ['0001']), []);
});

test('parametros de consulta: rango inicial dias=30, sucursales siempre explicitas, filtros del contrato y paginacion', () => {
  const env = crearEntorno();
  const e = "{ personalizado: false, dias: 30, desde: '', hasta: '', tipo: '', lectura: '', orden: 'prioridad', offset: 0 }";
  const q = (estado, centros, filtro) => env.ev(`irParams(${estado}, ${JSON.stringify(centros)}, ${JSON.stringify(filtro)}).toString()`);
  assert.equal(q(e, ['0001', '0005'], null), 'dias=30&sucursales=0001%2C0005&limit=50&offset=0');
  assert.equal(q("{ personalizado: true, dias: 30, desde: '2026-10-01', hasta: '2026-10-31', tipo: 'reingreso', lectura: 'con_ventas', orden: 'ventas_desc', offset: 50 }", ['0001'], { marca: ['NIKE'], codigo: 'B1113' }),
    'desde=2026-10-01&hasta=2026-10-31&sucursales=0001&marca=NIKE&codigo=B1113&tipo=reingreso&lectura=con_ventas&orden=ventas_desc&limit=50&offset=50');
  assert.ok(!/dias=/.test(q("{ personalizado: true, dias: 30, desde: '2026-10-01', hasta: '2026-10-31', tipo: '', lectura: '', orden: 'prioridad', offset: 0 }", ['0001'], null)), 'con rango no se manda dias');
});

test('rango personalizado: máximo 180 días, hasta no posterior al corte y orden de fechas', () => {
  const env = crearEntorno();
  const v = (d, h, c) => env.ev(`irValidarRango(${JSON.stringify(d)}, ${JSON.stringify(h)}, ${JSON.stringify(c)})`);
  assert.equal(v('2026-10-01', '2026-11-10', '2026-11-10'), null);
  assert.match(v('', '2026-11-10', '2026-11-10'), /dos fechas/);
  assert.match(v('2026-11-10', '2026-10-01', '2026-11-10'), /posterior/);
  assert.match(v('2026-10-01', '2026-11-11', '2026-11-10'), /corte/);
  assert.equal(v('2026-05-15', '2026-11-10', '2026-11-10'), null, '180 días inclusivos entran');
  assert.match(v('2026-05-14', '2026-11-10', '2026-11-10'), /180 días/, '181 no');
});

test('aviso de atraso: local, fecha y efecto; sin locales afectados no hay aviso', () => {
  const env = crearEntorno();
  const no = plano(env.ev(`irLocalesNoAlineados(${JSON.stringify(ATRASADO)})`));
  assert.deepEqual(no.map(c => c.centro), ['0012']);
  assert.equal(env.ev(`irTextoLocal(${JSON.stringify(ATRASADO.stock_actual.sucursales.por_centro['0012'])})`), 'Centenario: stock al 09/11, un día antes del corte');
  assert.equal(env.ev(`irTextoLocal({ centro: '0005', estado: 'atrasado', fecha_actualizacion: '2026-11-07', dias_atraso: 3 })`), 'Wave: stock al 07/11, 3 días antes del corte');
  assert.equal(env.ev(`irTextoLocal({ centro: '0010', estado: 'fecha_desconocida', fecha_actualizacion: null, dias_atraso: null })`), 'Perito Moreno: fecha de actualización del stock desconocida');
  assert.equal(plano(env.ev(`irLocalesNoAlineados(${JSON.stringify(ALINEADO)})`)).length, 0);
});

test('fecha de referencia del stock junto al dato: una fecha comun, o "según el local" si difieren', () => {
  const env = crearEntorno();
  assert.equal(env.ev(`irFechaStock(${JSON.stringify(ALINEADO)})`), 'al 10/11');
  assert.equal(env.ev(`irFechaStock(${JSON.stringify(ATRASADO)})`), 'según el local');
  assert.equal(env.ev('irFechaStock(null)'), '');
});

test('resumen de filtros activos (movil): período, tipo, lectura y catálogo', () => {
  const env = crearEntorno();
  const r = (e, f) => env.ev(`irResumenFiltros(${e}, ${JSON.stringify(f)})`);
  assert.equal(r("{ personalizado: false, dias: 30, tipo: '', lectura: '' }", null), '30 días');
  assert.equal(r("{ personalizado: true, desde: '2026-10-01', hasta: '2026-10-20', tipo: 'reingreso', lectura: 'sin_ventas_con_stock' }", { marca: ['NIKE', 'VANS'], codigo: 'B1' }),
    '01/10 al 20/10 · Reingreso · Revisar: sin ventas · Código: B1 · Marca: NIKE, VANS');
});

test('formato: fechas cortas y valores no disponibles', () => {
  const env = crearEntorno();
  assert.equal(env.ev("irDM('2026-11-10')"), '10/11');
  assert.equal(env.ev("irDMY('2026-11-10')"), '10/11/2026');
  assert.equal(env.ev('irDM(null)'), '—');
  assert.equal(env.ev('irNum(null)'), '—');
  assert.equal(env.ev('irNum(0)'), '0', 'cero real != no disponible');
  assert.equal(env.ev("irHM('2026-11-10T15:34:12.620-03:00')"), '10/11 15:34');
});
