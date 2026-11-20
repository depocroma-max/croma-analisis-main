'use strict';
// Capturas comparativas de la Etapa B1: referencia B0 (bandera apagada) vs. B1 apagada vs. B1 encendida, en tres momentos y dos anchos.
//   node tests/harness/capturas-b1.js --puerto=8812 --base=8813 [--salida=<carpeta>]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const U = { 'B0-referencia': 'http://127.0.0.1:' + arg('base', '8813'), 'B1-apagada': 'http://127.0.0.1:' + arg('puerto', '8812'), 'B1-encendida': 'http://127.0.0.1:' + arg('puerto', '8812') };
const OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'b1', 'capturas')); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true }); const lista = [];
  for (const w of [1280, 375]) for (const [nom, url] of Object.entries(U)) {
    const movil = w < 760, h = movil ? 812 : 900;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    await ctx.addInitScript(f => { try { localStorage.setItem('cds-v3', f); } catch (e) { /* nada */ } }, nom === 'B1-encendida' ? '1' : '0');
    const p = await ctx.newPage(); await p.goto(url + '/', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#app', { state: 'visible' }); await sleep(1200);
    await p.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await sleep(2200); await p.evaluate(() => ovElegirGrupo('todas')); await sleep(1500);
    if (movil) await p.evaluate(() => { const d = document.querySelector('details.ov-filtros-plegable'); if (d) d.open = true; });
    const foto = async momento => { const f = nom + '_' + w + '_' + momento + '.png'; await p.evaluate(() => window.scrollTo(0, 0)); await sleep(250); await p.screenshot({ path: path.join(OUT, f) }); lista.push({ nom, w, momento, f }); };
    await foto('1-inicial');
    await p.fill('#rtProdCodigo', 'producto 1003'); await sleep(250); await foto('2-escrito-sin-aplicar');
    await p.click('form.ov-filtros button.ov-aplicar'); await sleep(1800); await foto('3-aplicado');
    await ctx.close();
  }
  await b.close();
  const filas = ['1-inicial', '2-escrito-sin-aplicar', '3-aplicado'].map(m => '<h2>' + m + '</h2>' + [1280, 375].map(w => '<div class="fila">' + Object.keys(U).map(n => { const e = lista.find(x => x.nom === n && x.w === w && x.momento === m); return '<figure><figcaption>' + n + ' · ' + w + ' px</figcaption><img src="capturas/' + e.f + '" alt="' + n + ' ' + m + ' ' + w + '"></figure>'; }).join('') + '</div>').join('')).join('');
  fs.writeFileSync(path.join(OUT, '..', 'antes-y-despues-b1.html'), '<!doctype html><meta charset="utf-8"><title>B1 antes y despues</title><style>body{font-family:system-ui;margin:16px;background:#f4f4f2}h2{margin:24px 0 8px}.fila{display:flex;gap:12px;align-items:flex-start;margin-bottom:12px;overflow:auto}figure{margin:0;flex:1 1 0;min-width:0}figcaption{font-size:12px;color:#555;margin-bottom:4px}img{width:100%;border:1px solid #ccc;background:#fff}</style><h1>Etapa B1: B0 (referencia) · B1 apagada · B1 encendida</h1>' + filas);
  console.log('capturas: ' + lista.length);
})().catch(e => { console.error(e); process.exit(1); });
