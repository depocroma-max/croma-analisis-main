'use strict';
// HARNESS · Rendimiento desde el ingreso (etapa I2). Conecta la ruta REAL de croma-api a un snapshot SQLite REAL (solo lectura) y suma al
// universo sintetico seis productos con los codigos de los casos de revision (03010, 03113, 03183, R0001, T0783, T0847). Los productos
// (nombre, stock, ventas del periodo) son SINTETICOS; el bloque de rendimiento sale del snapshot. Nunca escribe la base.
//   node tests/harness/servidor.js --rendimiento=<snapshot.db> [--rendimiento-incompatible=<snapshot sin huella.db>]
// Control: /__h/rend?escenario=vigente|atrasado|vencido|incompatible|ausente|error|publicada&cadena=normal|caida  (sin parametros: estado)
//   vigente: hoy simulado 2026-11-11 (1 dia desde el corte 10/11) · atrasado: 2026-11-14 (4 dias) · vencido: 2026-11-20 (10 dias)
//   incompatible: snapshot sin huella de calculo · ausente: sin base (API I1 sin RENDIMIENTO_DB_PATH) · error: la lectura falla
//   publicada: la API desplegada hoy (sin I1): se quitan los campos nuevos y la ruta de cadena no existe
//   cadena=caida: la consulta de cadena corta la conexion (error de red) · cadena_retraso=<ms>: demora la respuesta (respuestas tardias)
// Ventas NETAS 30/90 por SUCURSAL (netas): la demanda de la seleccion depende de las sucursales pedidas, como en el SQL real (centro NOT IN
// (...)). Valores deliberadamente distintos entre Paseo + Wave y las cinco operativas (p. ej. 03113: 1/6 contra 3/13; cambia el criterio 2/6/30).
const CASOS = [
  { Codigo_producto: '03010', Nombre_producto: 'VOL TE MC OVER NEARLY OVER', Nombre_marca: 'VOLCOM', Nombre_rubro: 'REM MC AD', netas: { '0001': [1, 1], '0005': [0, 0], '0010': [1, 1], '0012': [0, 1], '0014': [0, 0] }, ultima: 5, ventas: 9, stock: 4 },
  { Codigo_producto: '03113', Nombre_producto: 'RC TE MC OVERSIZE WETTY', Nombre_marca: 'RIP CURL', Nombre_rubro: 'REM MC AD', netas: { '0001': [1, 4], '0005': [0, 2], '0010': [1, 3], '0012': [1, 2], '0014': [0, 2] }, ultima: 10, ventas: 18, stock: 2 },
  { Codigo_producto: '03183', Nombre_producto: 'SC TE MC REG ROSKOPP DISSECT', Nombre_marca: 'SANTA CRUZ', Nombre_rubro: 'REM MC AD', netas: { '0001': [0, 0], '0005': [0, 0], '0010': [1, 1], '0012': [1, 1], '0014': [0, 0] }, ultima: 3, ventas: 8, stock: 2 },
  { Codigo_producto: 'R0001', Nombre_producto: 'CAP FLAT RVCA TWILL', Nombre_marca: 'RVCA', Nombre_rubro: 'ACCES GORRAS AD', netas: { '0001': [0, 2], '0005': [0, 1], '0010': [0, 0], '0012': [0, 0], '0014': [0, 0] }, ultima: 40, ventas: 6, stock: 1, deposito: 0 },
  { Codigo_producto: 'T0783', Nombre_producto: 'DC K STAG (WG5)', Nombre_marca: 'DC', Nombre_rubro: 'ZAPAS K DC', netas: { '0001': [0, 2], '0005': [0, 0], '0010': [0, 1], '0012': [0, 0], '0014': [0, 0] }, ultima: 54, ventas: 1, stock: 24 },
  { Codigo_producto: 'T0847', Nombre_producto: 'CAP TRK FLAT RVCA NEO TRUCKER', Nombre_marca: 'RVCA', Nombre_rubro: 'ACCES GORRAS AD', netas: {}, ultima: null, ventas: 0, stock: 6 },
];
// Suma de las ventas netas [30, 90] de las sucursales incluidas.
const netasDe = (porSucursal, incluidas) => incluidas.reduce((a, k) => { const v = (porSucursal || {})[k] || [0, 0]; return [a[0] + v[0], a[1] + v[1]]; }, [0, 0]);
// Sucursales que deja afuera el SQL (" AND centro NOT IN ('0009', '0010')"), como hace clausulaExcluirCentros en croma-api.
// Toma la lista entre parentesis y extrae SOLO los codigos de 4 digitos entre comillas (con o sin espacios despues de las comas).
// Sin clausula (las cinco operativas en la API real, que solo excluye a Cipo 0009 por defecto): lista vacia.
function excluidasDelSql(texto) {
  const m = /centro\s+NOT\s+IN\s*\(([^)]*)\)/i.exec(String(texto || ''));
  if (!m) return [];
  return [...m[1].matchAll(/'(\d{4})'/g)].map(x => x[1]);
}
// Sucursales operativas que efectivamente entran en la consulta (las que el SQL no excluye).
const incluidasDelSql = (texto, operativas) => operativas.filter(c => !excluidasDelSql(texto).includes(c));
// Ventas netas [30, 90] de un producto para las sucursales que deja el SQL. Casos de revision: por sucursal (CASOS.netas); universo
// sintetico: derivadas de sus ventas por sucursal (netas 30 = ventas % 3, netas 90 = ventas).
function netasDeLaConsulta(p, texto, operativas) {
  const incluidas = incluidasDelSql(texto, operativas);
  if (p._netas_por_sucursal) return netasDe(p._netas_por_sucursal, incluidas);
  return incluidas.reduce((acc, c) => { const v = ((p.por_sucursal || {})[c] || {}).ventas || 0; return [acc[0] + (v % 3), acc[1] + v]; }, [0, 0]);
}
// Respuesta SIMULADA de la consulta "AS ventas_30d" de croma-api (routes/analisis.js): como el SQL real, una venta posterior a "hasta"
// no cuenta (fecha < hasta + 1) y las ventas netas 30/90 son solo de las sucursales incluidas (centro NOT IN (...)).
function respuestaVentas30d(productos, texto, inputs, operativas) {
  const hasta = inputs && inputs.hasta ? String(inputs.hasta instanceof Date ? inputs.hasta.toISOString() : inputs.hasta).slice(0, 10) : null;
  return productos.filter(p => p.Ultima_venta && (!hasta || new Date(p.Ultima_venta).toISOString().slice(0, 10) <= hasta)).map(p => {
    const [n30, n90] = netasDeLaConsulta(p, texto, operativas);
    return { cod: p.Codigo_producto, ultima_venta: p.Ultima_venta, ventas_30d: p.Ventas_ultimos_30_dias, ventas_netas_30d: n30, ventas_netas_90d: n90 };
  });
}
const DIA = 86400000;
const BASE = Date.UTC(2026, 9, 30);

function productosCasos(CENTROS, OPERATIVAS) {
  return CASOS.map((c, i) => {
    const por_sucursal = {};
    CENTROS.forEach((k, j) => {
      const op = OPERATIVAS.includes(k);
      por_sucursal[k] = { ventas: op ? Math.floor(c.ventas / OPERATIVAS.length) + (j === 0 ? c.ventas % OPERATIVAS.length : 0) : 0, stock: op ? Math.floor(c.stock / OPERATIVAS.length) + (j === 0 ? c.stock % OPERATIVAS.length : 0) : 0 };
    });
    return {
      Codigo_producto: c.Codigo_producto, Nombre_producto: c.Nombre_producto, Nombre_marca: c.Nombre_marca, Nombre_rubro: c.Nombre_rubro, Nombre_subrubro: 'NO DISPONIBLE',
      Ventas_total: c.ventas, Stock_sucursales: c.stock, Stock_deposito: c.deposito ?? 2, Stock_fallados: 0,
      Ultimo_ingreso: new Date(BASE - (120 + i * 10) * DIA), Ultima_venta: c.ultima === null ? null : new Date(BASE - c.ultima * DIA),
      Ventas_ultimos_30_dias: netasDe(c.netas, OPERATIVAS)[0], variantes: 4, variantes_con_stock: c.stock > 0 ? 3 : 0, variantes_sin_stock: c.stock > 0 ? 1 : 4,
      por_sucursal, _netas_por_sucursal: c.netas,
    };
  });
}

const HOY = { vigente: '2026-11-11', atrasado: '2026-11-14', vencido: '2026-11-20', incompatible: '2026-11-11', ausente: '2026-11-11', error: '2026-11-11', publicada: '2026-11-11' };

function instalar({ app, API, argv }) {
  const ruta = argv.rendimiento;
  if (!ruta) return null;
  const analisis = require(API + '/routes/analisis');
  const rdb = require(API + '/db/rendimiento-db');
  const final = rdb.crearProveedor(ruta);
  if (!final) throw new Error('no se pudo abrir el snapshot de rendimiento: ' + ruta);
  const incompatible = argv['rendimiento-incompatible'] ? rdb.crearProveedor(argv['rendimiento-incompatible']) : null;
  const fallido = { leer: () => ({ error: 'lectura simulada fallida (harness)' }), cerrar() {} };
  const estado = { escenario: 'vigente', cadena: 'normal', cadenaRetrasoMs: 0, snapshot: final.meta.ejecucion, incompatible: incompatible ? incompatible.meta.ejecucion || '(sin ejecucion)' : null };
  const aplicar = () => {
    const prov = { vigente: final, atrasado: final, vencido: final, incompatible: incompatible || final, ausente: null, error: fallido, publicada: null }[estado.escenario];
    analisis.configurarProveedorRendimiento(prov);
    analisis.fijarHoyRendimiento(() => HOY[estado.escenario]);
    analisis.invalidarCacheOportunidades();
  };
  aplicar();
  app.get('/__h/rend', (q, s) => {
    if (q.query.escenario && HOY[q.query.escenario]) estado.escenario = q.query.escenario;
    if (q.query.cadena) estado.cadena = q.query.cadena === 'caida' ? 'caida' : 'normal';
    if (q.query.cadena_retraso !== undefined) estado.cadenaRetrasoMs = Number(q.query.cadena_retraso) || 0;
    if (Object.keys(q.query).length) aplicar();
    s.json(estado);
  });
  // API publicada: sin los campos de I1 en Oportunidades y sin la ruta de cadena (404 de Express, como en produccion hoy).
  app.use('/analisis/oportunidades', (req, res, next) => {
    if (estado.escenario !== 'publicada' || req.path !== '/') return next();
    const json = res.json.bind(res);
    res.json = body => {
      if (body && Array.isArray(body.data)) {
        delete body.rendimiento_ingreso;
        body.data = body.data.map(d => { const x = { ...d }; delete x.demanda_reciente_seleccion; delete x.rendimiento_ingreso; delete x.Ventas_netas_ultimos_30_dias; delete x.Ventas_netas_ultimos_90_dias; return x; });
      }
      return json(body);
    };
    next();
  });
  app.use('/analisis/rendimiento-ingreso', async (req, res, next) => {
    if (estado.cadenaRetrasoMs) await new Promise(r => setTimeout(r, estado.cadenaRetrasoMs));
    if (estado.cadena === 'caida') return req.socket.destroy();
    if (estado.escenario === 'publicada') return res.status(404).type('html').send('<pre>Cannot GET ' + req.originalUrl + '</pre>');
    next();
  });
  app.use('/analisis/rendimiento-ingreso', require(API + '/routes/rendimiento-ingreso'));
  return { estado, cerrar() { try { final.cerrar(); } catch (_) { /* nada */ } try { if (incompatible) incompatible.cerrar(); } catch (_) { /* nada */ } } };
}

module.exports = { CASOS, productosCasos, instalar, netasDe, excluidasDelSql, incluidasDelSql, netasDeLaConsulta, respuestaVentas30d };
