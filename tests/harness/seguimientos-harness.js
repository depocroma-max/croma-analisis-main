'use strict';
// Harness de «Mis seguimientos» (D1B): monta el router REAL de /seguimientos de croma-api (rama seguimientos-d1a, el MISMO que monta index.js, con su JWT real,
// su proveedor de referencia desde la cache de Oportunidades y su SQLite) sobre una base TEMPORAL. No consulta Sysneo (el pool sigue simulado por servidor.js),
// no usa ninguna ruta productiva y no habilita a nadie por defecto salvo las cuentas de prueba del harness. Se activa con --seguimientos.
//   node tests/harness/servidor.js --puerto=8830 --seguimientos [--seg-dir=<carpeta persistente>] [--seg-escrituras-por-min=N]
// Controles en caliente (solo harness):  /__h/seg?accion=...
//   estado | reset | apagar | encender | db_caida | db_ok | copia_exigir | copia_ok | habilitar=<tipo>:<id>:<usuario> | deshabilitar=<tipo>:<id> | revocar=<tipo>:<id>
const path = require('path');
const fs = require('fs');

function instalar({ app, API, argv, tmp }) {
  if (!argv.seguimientos) return null;
  const dir = argv['seg-dir'] ? path.resolve(argv['seg-dir']) : path.join(tmp, 'seguimientos');
  fs.mkdirSync(dir, { recursive: true });
  const rutaBase = n => path.join(dir, n);
  let actual = rutaBase('seguimientos.db');
  process.env.SEGUIMIENTOS_HABILITADO = '1';
  process.env.SEGUIMIENTOS_REQUIERE_HABILITACION = '1';
  process.env.SEGUIMIENTOS_REQUIERE_COPIA_EXTERNA = '0';
  process.env.SEGUIMIENTOS_COPIAS_DIR = path.join(dir, 'copias-locales');
  process.env.SEGUIMIENTOS_COPIAS_EXTERNAS_DIR = path.join(dir, 'copias-externas');
  if (argv['seg-escrituras-por-min']) process.env.SEGUIMIENTOS_ESCRITURAS_POR_MIN = String(argv['seg-escrituras-por-min']);
  process.env.SEGUIMIENTOS_DB_PATH = actual;
  const { DatabaseSync } = require('node:sqlite');
  const M = require(API + '/db/migrate-seguimientos');
  const { crearRepo } = require(API + '/motor/seguimientos-repo');

  function preparar(ruta, usuarios) { // migra (idempotente) y habilita SOLO las cuentas de prueba del harness
    const db = new DatabaseSync(ruta); db.exec('PRAGMA journal_mode = WAL;'); db.exec('PRAGMA foreign_keys = ON;'); M.aplicar(db);
    const repo = crearRepo(db); for (const u of usuarios) { try { repo.habilitarUsuario({ tipo: 'staff', sub: String(u.id) }, u.usuario, 'harness'); } catch (e) { /* ya habilitado */ } } db.close();
  }
  const USUARIOS = [{ id: 1, usuario: 'tester' }, { id: 2, usuario: 'otra' }]; // el id 3 ('sinpermiso') NO se habilita: sirve para probar el 403
  preparar(actual, USUARIOS);
  let contador = 0;

  app.get('/__h/seg', (req, res) => {
    const x = req.query, a = x.accion || 'estado';
    try {
      if (a === 'cache') return res.json({ claves: require(API + '/routes/analisis').clavesCacheOportunidades() });
      if (a === 'reset') { actual = rutaBase('seguimientos-' + (++contador) + '-' + Date.now() + '.db'); preparar(actual, USUARIOS); process.env.SEGUIMIENTOS_DB_PATH = actual; process.env.SEGUIMIENTOS_HABILITADO = '1'; process.env.SEGUIMIENTOS_REQUIERE_COPIA_EXTERNA = '0'; }
      else if (a === 'apagar') process.env.SEGUIMIENTOS_HABILITADO = '0';
      else if (a === 'encender') process.env.SEGUIMIENTOS_HABILITADO = '1';
      else if (a === 'db_caida') process.env.SEGUIMIENTOS_DB_PATH = rutaBase('no-existe-' + Date.now() + '.db');
      else if (a === 'db_ok') process.env.SEGUIMIENTOS_DB_PATH = actual;
      else if (a === 'copia_exigir') process.env.SEGUIMIENTOS_REQUIERE_COPIA_EXTERNA = '1';
      else if (a === 'copia_ok') process.env.SEGUIMIENTOS_REQUIERE_COPIA_EXTERNA = '0';
      else if (x.habilitar || x.deshabilitar || x.revocar) {
        const [tipo, sub, nombre] = String(x.habilitar || x.deshabilitar || x.revocar).split(':');
        const db = new DatabaseSync(actual); db.exec('PRAGMA foreign_keys = ON;'); const repo = crearRepo(db);
        try { if (x.habilitar) repo.habilitarUsuario({ tipo, sub }, nombre || 'u' + sub, 'harness'); else if (x.deshabilitar) repo.deshabilitarUsuario({ tipo, sub }, 'harness'); else repo.revocarTokens({ tipo, sub }, 'harness'); } finally { db.close(); }
      }
    } catch (e) { return res.status(500).json({ error: String(e.message) }); }
    res.json({ habilitado: process.env.SEGUIMIENTOS_HABILITADO, db: process.env.SEGUIMIENTOS_DB_PATH, copia: process.env.SEGUIMIENTOS_REQUIERE_COPIA_EXTERNA, dir });
  });
  // El router por defecto: exactamente el que monta index.js (proveedor de referencia incluido).
  app.use('/seguimientos', require(API + '/routes/seguimientos'));
  return { dir, ruta: () => actual };
}
module.exports = { instalar };
