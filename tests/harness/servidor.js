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
  ...Object.fromEntries(U.CENTROS.flatMap(c => [[`ventas_${c}`, p.por_sucursal[c].ventas], [`stock_${c}`, p.por_sucursal[c].stock]])),
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
        if (estado.retrasoMs) await new Promise(res => setTimeout(res, estado.retrasoMs));
        if (texto.includes('SELECT DISTINCT RTRIM(p.Descripcion_Marca) marca')) return { recordset: CATALOGO_FILAS };
        if (texto.includes('AS ventas_0001') && texto.includes('GROUP BY cod;')) return { recordset: aFilas(productosActuales()) };
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
  res.type('html').send(html.replace('<head>', '<head>' + inyeccion));
});
app.use(express.static(FRONT));
process.on('exit', () => { try { rotDb.close(); } catch (e) { /* ya cerrada */ } try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* en uso: queda en tmpdir */ } });
process.on('SIGINT', () => process.exit(0)); process.on('SIGTERM', () => process.exit(0));
// Solo se relaja connect-src EN LA COPIA QUE SIRVE ESTE HARNESS (el index.html del repo y la CSP de produccion no se tocan).
app.listen(PUERTO, () => console.log(`harness fase5 en http://localhost:${PUERTO} (db temporal: ${tmp}; senal=${process.env.OPORTUNIDADES_PERFILES_HABILITADOS || 'apagada'}; ${argv['sin-migrar'] ? 'SIN migrar' : 'migrada'})`));
