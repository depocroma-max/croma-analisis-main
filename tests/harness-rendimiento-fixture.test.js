'use strict';
// Pruebas del FIXTURE del harness de rendimiento (tests/harness/rendimiento-fixture.js): lectura de las sucursales excluidas del SQL y
// ventas netas 30/90 que devuelve el pool simulado segun la seleccion. Cuando el repo hermano croma-api esta presente (o CROMA_API_DIR),
// el texto SQL se arma con su clausulaExcluirCentros REAL y con la misma regla de exclusion que parseSucursalesOperativas.
// Se ejecutan con:  node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('./harness/rendimiento-fixture');

const OPERATIVAS = ['0001', '0005', '0010', '0012', '0014'];
const HISTORICAS = ['0001', '0005', '0009', '0010', '0012', '0014'];
const API = process.env.CROMA_API_DIR || path.join(__dirname, '..', '..', 'croma-api');
const hayApi = fs.existsSync(path.join(API, 'motor', 'sql-comun.js'));
const sqlComun = hayApi ? require(path.join(API, 'motor', 'sql-comun.js')) : null;

// Igual que parseSucursalesOperativas: excluidas = las 6 historicas menos las operativas pedidas (Cipo 0009 siempre afuera).
const excluidasDe = seleccion => HISTORICAS.filter(c => !seleccion.includes(c));
const consultaCon = (clausula) => `SELECT RTRIM(Codigo_producto) cod, ... AS ventas_30d ... FROM dbo.Movimientos_Productos
      WHERE tipo_comprobante IN (10,11) AND fecha < DATEADD(DAY,1,@hasta)${clausula}
      GROUP BY RTRIM(Codigo_producto)`;
const conEspacios = excl => ` AND centro NOT IN (${excl.map(c => "'" + c + "'").join(', ')})`;
const sinEspacios = excl => ` AND centro NOT IN (${excl.map(c => "'" + c + "'").join(',')})`;

const CASOS = [
  { nombre: 'las cinco operativas', seleccion: OPERATIVAS, netas03113: [3, 13] },
  { nombre: 'Paseo + Wave', seleccion: ['0001', '0005'], netas03113: [1, 6] },
  { nombre: 'solo Wave', seleccion: ['0005'], netas03113: [0, 2] },
  { nombre: 'solo Roca', seleccion: ['0014'], netas03113: [0, 2] },
];
const p03113 = () => R.productosCasos(HISTORICAS, OPERATIVAS).find(p => p.Codigo_producto === '03113');

test('excluidasDelSql: devuelve códigos limpios (sin paréntesis ni comillas), con y sin espacios después de las comas', () => {
  assert.deepEqual(R.excluidasDelSql(" AND centro NOT IN ('0001', '0009', '0010')"), ['0001', '0009', '0010']);
  assert.deepEqual(R.excluidasDelSql(" AND centro NOT IN ('0001','0009','0010')"), ['0001', '0009', '0010']);
  assert.deepEqual(R.excluidasDelSql(" AND centro NOT IN ( '0001' ,'0009' )"), ['0001', '0009']);
  assert.deepEqual(R.excluidasDelSql(" AND m.centro NOT IN ('0005')"), ['0005'], 'con prefijo de tabla');
  assert.deepEqual(R.excluidasDelSql(' WHERE tipo_comprobante IN (10,11)'), [], 'sin clausula de exclusion');
  assert.deepEqual(R.excluidasDelSql(''), []);
  for (const c of R.excluidasDelSql(" AND centro NOT IN ('0001', '0005')")) assert.match(c, /^\d{4}$/);
});

for (const formato of [['con espacios', conEspacios], ['sin espacios', sinEspacios]]) {
  for (const caso of CASOS) {
    test(`pool simulado (${formato[0]}): ${caso.nombre} -> sucursales efectivas y ventas netas de 03113`, () => {
      const texto = consultaCon(formato[1](excluidasDe(caso.seleccion)));
      assert.deepEqual(R.incluidasDelSql(texto, OPERATIVAS), caso.seleccion, 'sucursales efectivas');
      assert.deepEqual(R.netasDeLaConsulta(p03113(), texto, OPERATIVAS), caso.netas03113, 'netas 30/90');
      const fila = R.respuestaVentas30d([p03113()], texto, { hasta: '2026-11-13' }, OPERATIVAS)[0];
      assert.equal(fila.cod, '03113');
      assert.deepEqual([fila.ventas_netas_30d, fila.ventas_netas_90d], caso.netas03113, 'fila que devuelve el pool');
    });
  }
}

test('pool simulado: solo Wave NO incluye a Paseo (regresión del paréntesis en el primer código)', () => {
  const texto = consultaCon(conEspacios(excluidasDe(['0005'])));
  assert.equal(R.excluidasDelSql(texto)[0], '0001');
  assert.ok(!R.incluidasDelSql(texto, OPERATIVAS).includes('0001'));
});

test('pool simulado: totales coherentes para todos los casos de revisión (suma de las sucursales efectivas)', () => {
  const productos = R.productosCasos(HISTORICAS, OPERATIVAS);
  for (const caso of CASOS) {
    const texto = consultaCon(conEspacios(excluidasDe(caso.seleccion)));
    for (const p of productos) {
      const esperado = caso.seleccion.reduce((a, c) => { const v = p._netas_por_sucursal[c] || [0, 0]; return [a[0] + v[0], a[1] + v[1]]; }, [0, 0]);
      assert.deepEqual(R.netasDeLaConsulta(p, texto, OPERATIVAS), esperado, p.Codigo_producto + ' / ' + caso.nombre);
    }
  }
});

test('pool simulado: valores deliberadamente distintos entre Paseo + Wave y las cinco operativas', () => {
  const a = R.netasDeLaConsulta(p03113(), consultaCon(conEspacios(excluidasDe(['0001', '0005']))), OPERATIVAS);
  const b = R.netasDeLaConsulta(p03113(), consultaCon(conEspacios(excluidasDe(OPERATIVAS))), OPERATIVAS);
  assert.notDeepEqual(a, b);
});

test('pool simulado: una venta posterior a "hasta" no cuenta (como fecha < hasta + 1)', () => {
  const texto = consultaCon(conEspacios(excluidasDe(OPERATIVAS)));
  assert.equal(R.respuestaVentas30d([p03113()], texto, { hasta: '2026-08-31' }, OPERATIVAS).length, 0);
  assert.equal(R.respuestaVentas30d([p03113()], texto, { hasta: new Date('2026-11-13T00:00:00Z') }, OPERATIVAS).length, 1);
});

test('integración con croma-api: la clausula REAL (clausulaExcluirCentros) se interpreta igual', { skip: !hayApi && 'sin croma-api hermano' }, () => {
  for (const caso of CASOS) {
    const texto = consultaCon(sqlComun.clausulaExcluirCentros(excluidasDe(caso.seleccion), 'centro'));
    assert.deepEqual(R.incluidasDelSql(texto, OPERATIVAS), caso.seleccion, caso.nombre);
    assert.deepEqual(R.netasDeLaConsulta(p03113(), texto, OPERATIVAS), caso.netas03113, caso.nombre);
  }
});
