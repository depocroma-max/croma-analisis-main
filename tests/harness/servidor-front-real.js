'use strict';
// Sirve el frontend en http://localhost:8771 (origen permitido por CORS de croma-api) apuntando a la API LOCAL (http://localhost:3001).
// Solo para validar contra Sysneo real en solo lectura: la copia servida relaja connect-src y simula una sesion; el index.html del repo no se toca.
//   node tests/harness/servidor-front-real.js
const path = require('path');
const fs = require('fs');
const express = require(path.join(__dirname, '..', '..', '..', 'croma-api', 'node_modules', 'express'));
const FRONT = path.join(__dirname, '..', '..');
const API = process.env.API || 'http://localhost:3001';
const app = express();
app.get(['/', '/index.html'], (req, res) => {
  let html = fs.readFileSync(path.join(FRONT, 'index.html'), 'utf8');
  html = html.replace("const STOCK_API_URL = 'https://stock-api.croma-app.com.ar';", `const STOCK_API_URL = '${API}';`).replace('connect-src https://stock-api.croma-app.com.ar;', `connect-src ${API};`);
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ id: 1, usuario: 'tester', rol: 'admin', exp: Math.floor(Date.now() / 1000) + 8 * 3600 }) + '.x'; // solo el cliente lo lee; Ingresos recientes no exige token
  res.type('html').send(html.replace('<head>', `<head><script>sessionStorage.setItem('croma_token', ${JSON.stringify(token)});</script>`));
});
app.use(express.static(FRONT));
app.listen(8771, () => console.log('frontend contra API local en http://localhost:8771 → ' + API));
