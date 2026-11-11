// HARNESS DE VERIFICACION de la interfaz (Fase 5). Sirve este frontend y los routers REALES de croma-api en UN solo origen, con un pool SQL
// SIMULADO (universo sintetico de croma-api/scripts/fixtures), SQLite TEMPORAL (en os.tmpdir(), se borra al salir) y un token admin
// de pruebas firmado con un secreto del propio harness. No usa credenciales ni toca Sysneo ni ninguna base real.
//   node tests/harness/servidor.js [--puerto=8795] [--sin-migrar] [--sin-senal]      (cerrar con Ctrl+C)
// Parametros de la pagina (solo en el harness): ?rol=jefe (sin permiso), ?expirado=1, ?sinsesion=1.
// Control en caliente: /__h/senal?valor=0|1 , /__h/retraso?ms=N , /__h/universo?n=chico|normal|vacio
// LIMITES: ver tests/harness/README.md (no es una prueba completa del entorno real).
const path = require('path');
const os = require('os');
const fs = require('fs');
const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v === undefined ? true : v]));
const PUERTO = Number(argv.puerto || 8795);
const API = process.env.CROMA_API_DIR || path.join(__dirname, '..', '..', '..', 'croma-api'); // repo hermano
const FRONT = path.join(__dirname, '..', '..');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'croma-harness-fase5-'));
process.env.ROTACIONES_DB_PATH = path.join(tmp, 'rotaciones.db');
process.env.JWT_SECRET = 'secreto-solo-para-pruebas-del-harness';
delete process.env.SNAPSHOTS_DB_PATH; delete process.env.SNAPSHOTS_GRANULAR_DB_PATH;
if (argv['sin-senal']) delete process.env.OPORTUNIDADES_PERFILES_HABILITADOS; else process.env.OPORTUNIDADES_PERFILES_HABILITADOS = '1';

const U = require(API + '/scripts/fixtures/oportunidades-universo-sintetico');
const estado = { retrasoMs: 0, universo: 'normal' };
// Ingresos recientes (propuesta visual 2): escenarios SIMULADOS con el router real de croma-api y un fixture sintetico (ver ingresos-fixture.js).
const IR = require('./ingresos-fixture');
const estadoIR = { escenario: 'alineado', vacio: false, error: false, retrasoMs: 0 };
const productosActuales = () => {
  const todos = U.universo();
  if (estado.universo === 'vacio') return [];
  if (estado.universo === 'chico') return todos.slice(0, 6);
  return todos;
};
const aFilas = ps => ps.map(p => ({
  Codigo_producto: p.Codigo_producto, Nombre_producto: p.Nombre_producto, Nombre_marca: p.Nombre_marca, Nombre_rubro: p.Nombre_rubro, Nombre_subrubro: p.Nombre_subrubro,
  Ventas_total: p.Ventas_total, Stock_sucursales: p.Stock_sucursales, Stock_deposito: p.Stock_deposito, Stock_fallados: p.Stock_fallados, Ultimo_ingreso: p.Ultimo_ingreso,
  variantes: p.variantes, variantes_con_stock: p.variantes_con_stock, variantes_sin_stock: p.variantes_sin_stock,
  // El SQL real excluye a Cipo (0009, cerrada) de stock y ventas: sus columnas llegan en 0 (el fixture las trae a proposito para otras pruebas).
  ...Object.fromEntries(U.CENTROS.flatMap(c => [[`ventas_${c}`, U.OPERATIVAS.includes(c) ? p.por_sucursal[c].ventas : 0], [`stock_${c}`, U.OPERATIVAS.includes(c) ? p.por_sucursal[c].stock : 0]])),
}));
const CATALOGO_FILAS = [
  { marca: 'NIKE', rubro: 'REMERAS', subrubro: 'MANGA CORTA', talle: 'M' }, { marca: 'BILLABONG', rubro: 'REMERAS', subrubro: 'MANGA CORTA', talle: 'L' },
  { marca: 'VANS', rubro: 'REMERAS', subrubro: 'MANGA LARGA', talle: 'L' }, { marca: 'VANS', rubro: 'ZAPAS', subrubro: 'URBANAS', talle: '42' },
  { marca: 'NIKE', rubro: 'ZAPAS', subrubro: 'URBANAS', talle: '41' }, { marca: 'NIKE', rubro: 'BUZOS', subrubro: null, talle: 'M' },
  { marca: 'BILLABONG', rubro: 'GORRAS', subrubro: 'VISERA', talle: 'U' },
];
const fakePool = {
  request() {
    const inputs = {};
    const r = {
      input(n, t, v) { inputs[n] = v; return r; },
      async query(texto) {
        if (texto.includes('#ref_ir')) { // GET /analisis/ingresos-recientes
          if (estadoIR.retrasoMs) await new Promise(res => setTimeout(res, estadoIR.retrasoMs));
          if (estadoIR.error) throw new Error('error simulado del harness (Ingresos recientes)');
          const recordsets = IR.consultar(texto, inputs, estadoIR);
          return { recordsets, recordset: recordsets[0] };
        }
        if (estado.retrasoMs) await new Promise(res => setTimeout(res, estado.retrasoMs));
        if (texto.includes('SELECT DISTINCT RTRIM(p.Descripcion_Marca) marca')) return { recordset: CATALOGO_FILAS };
        if (texto.includes('AS ventas_0001') && texto.includes('GROUP BY cod;')) return { recordset: aFilas(productosActuales()) };
        // Ingresos de proveedor (Deposito 90): sinteticos, derivados del Ultimo_ingreso del fixture (los pares impares no tienen ingreso)
        if (texto.includes('AS ingreso_prov_fecha')) return { recordset: productosActuales().filter((p, i) => p.Ultimo_ingreso && i % 7 !== 3).map((p, i) => ({ cod: p.Codigo_producto, ingreso_prov_fecha: p.Ultimo_ingreso, ingreso_prov_cantidad: 6 + (i % 5) * 6, ingreso_prov_unidades_periodo: i % 3 === 0 ? 6 + (i % 5) * 6 : 0, ingreso_prov_dias_periodo: i % 3 === 0 ? 1 : 0 })) };
        if (texto.includes('AS ventas_30d')) return { recordset: productosActuales().filter(p => p.Ultima_venta).map(p => ({ cod: p.Codigo_producto, ultima_venta: p.Ultima_venta, ventas_30d: p.Ventas_ultimos_30_dias })) };
        return { recordset: [] }; // otras pestanas: vacias (el harness no simula Sysneo completo)
      },
    };
    return r;
  },
};
require(API + '/config/db').getPool = async () => fakePool;

const express = require(API + '/node_modules/express');
const cors = require(API + '/node_modules/cors');
const jwt = require(API + '/node_modules/jsonwebtoken');
const rotDb = require(API + '/db/rotaciones-db');
if (!argv['sin-migrar']) {
  require(API + '/db/migrate-oportunidad-perfiles').migrar(rotDb);
  require(API + '/db/migrate-oportunidad-simulaciones').migrar(rotDb);
  require(API + '/db/migrate-oportunidad-activaciones').migrar(rotDb);
}
const app = express();
app.use(cors());
app.use(express.json());
app.get('/__h/senal', (q, s) => { if (q.query.valor === '1') process.env.OPORTUNIDADES_PERFILES_HABILITADOS = '1'; else delete process.env.OPORTUNIDADES_PERFILES_HABILITADOS; s.json({ senal: process.env.OPORTUNIDADES_PERFILES_HABILITADOS || null }); });
app.get('/__h/retraso', (q, s) => { estado.retrasoMs = Number(q.query.ms || 0); s.json(estado); });
app.get('/__h/universo', (q, s) => { estado.universo = q.query.n || 'normal'; require(API + '/routes/analisis').invalidarCacheOportunidades(); s.json(estado); });
// Control en caliente de Ingresos recientes: /__h/ir?escenario=alineado|atrasado&vacio=0|1&error=0|1&retraso=ms (sin parametros: devuelve el estado)
const irRouter = require(API + '/routes/ingresos-recientes');
const t0IR = Date.now();
irRouter.__fijarReloj(() => new Date(Date.parse(IR.HOY_ISO) + (Date.now() - t0IR))); // "hoy" fijo (2026-11-11 12:00 AR) que avanza: la cache de 3 min / 30 s sigue funcionando
app.get('/__h/ir', (q, s) => {
  if (q.query.escenario) estadoIR.escenario = q.query.escenario === 'atrasado' ? 'atrasado' : 'alineado';
  if (q.query.vacio !== undefined) estadoIR.vacio = q.query.vacio === '1';
  if (q.query.error !== undefined) estadoIR.error = q.query.error === '1';
  if (q.query.retraso !== undefined) estadoIR.retrasoMs = Number(q.query.retraso) || 0;
  if (Object.keys(q.query).length) irRouter.__limpiarCache();
  s.json(estadoIR);
});
app.use('/analisis/ingresos-recientes', irRouter);
app.use('/analisis/oportunidades/perfiles', require(API + '/routes/oportunidades-perfiles'));
app.use('/analisis/oportunidades/simulaciones', require(API + '/routes/oportunidades-simulaciones'));
app.use('/analisis/oportunidades/activaciones', require(API + '/routes/oportunidades-activaciones'));
app.use('/analisis', require(API + '/routes/analisis'));
app.use('/analisis/rotaciones', require(API + '/routes/rotaciones-envios'));

// Frontend: STOCK_API_URL pasa a ser el mismo origen y se inyecta el token segun ?rol= / ?expirado= / ?sinsesion=
app.get(['/', '/index.html'], (req, res) => {
  let html = fs.readFileSync(path.join(FRONT, 'index.html'), 'utf8');
  html = html.replace("const STOCK_API_URL = 'https://stock-api.croma-app.com.ar';", "const STOCK_API_URL = '';").replace('connect-src https://stock-api.croma-app.com.ar;', "connect-src 'self';");
  let inyeccion = '';
  if (!req.query.sinsesion) {
    const rol = req.query.rol || 'admin';
    const exp = Math.floor(Date.now() / 1000) + (req.query.expirado ? -60 : 8 * 3600);
    const token = jwt.sign({ id: 1, usuario: 'tester', rol, exp }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    inyeccion = `<script>sessionStorage.setItem('croma_token', ${JSON.stringify(token)});</script>`;
  } else inyeccion = '<script>sessionStorage.removeItem("croma_token");localStorage.removeItem("croma_token");</script>';
  // Aviso fijo SOLO del harness: identifica que los datos de Ingresos recientes son simulados y en que escenario esta.
  const aviso = '<script>(function(){var b=document.createElement("div");b.id="harnessAviso";b.setAttribute("role","note");b.style.cssText="position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#111;color:#fff;font:10px/14px sans-serif;padding:0 8px;text-align:center;opacity:.9;pointer-events:none";document.addEventListener("DOMContentLoaded",function(){document.body.appendChild(b);});function t(){fetch("/__h/ir").then(function(r){return r.json()}).then(function(e){b.textContent="HARNESS · Ingresos recientes: datos SIMULADOS · escenario "+e.escenario+(e.vacio?" · vacio":"")+(e.error?" · error":"")}).catch(function(){})}t();setInterval(t,2000);})();</script>';
  res.type('html').send(html.replace('<head>', '<head>' + inyeccion + aviso));
});
app.use(express.static(FRONT));
process.on('exit', () => { try { rotDb.close(); } catch (e) { /* ya cerrada */ } try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* en uso: queda en tmpdir */ } });
process.on('SIGINT', () => process.exit(0)); process.on('SIGTERM', () => process.exit(0));
// Solo se relaja connect-src EN LA COPIA QUE SIRVE ESTE HARNESS (el index.html del repo y la CSP de produccion no se tocan).
app.listen(PUERTO, () => console.log(`harness fase5 en http://localhost:${PUERTO} (db temporal: ${tmp}; senal=${process.env.OPORTUNIDADES_PERFILES_HABILITADOS || 'apagada'}; ${argv['sin-migrar'] ? 'SIN migrar' : 'migrada'})`));
