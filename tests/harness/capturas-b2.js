'use strict';
// Capturas comparativas de la Etapa B2: referencia B1 (bandera apagada) · B2 apagada · B2 «Por acción» · B2 «Lista», a 1280 y 375.
//   node tests/harness/capturas-b2.js --puerto=8812 --base=8813 [--salida=<carpeta>]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const B = 'http://127.0.0.1:' + arg('puerto', '8812'), R = 'http://127.0.0.1:' + arg('base', '8813');
const CASOS = [['B1-referencia-apagada', R, '0', null], ['B2-apagada', B, '0', null], ['B2-por-accion', B, '1', 'accion'], ['B2-lista', B, '1', 'lista']];
const OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'b2', 'capturas')); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true }); const lista = [];
  for (const w of [1280, 375]) for (const [nom, url, flag, vista] of CASOS) {
    const movil = w < 760, h = movil ? 812 : 900;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    await ctx.addInitScript(f => { try { localStorage.setItem('cds-v3', f); } catch (e) { /* nada */ } }, flag);
    const p = await ctx.newPage(); await p.goto(url + '/', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#app', { state: 'visible' }); await sleep(1200);
    await p.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await sleep(3000);
    if (vista === 'lista') { await p.click('.cds-vista-btn[data-vista=lista]'); await sleep(600); }
    const foto = async (momento, desplazar) => { const f = nom + '_' + w + '_' + momento + '.png'; await p.evaluate(d => { if (d) document.getElementById('ovPanel').scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0); }, desplazar); await sleep(300); await p.screenshot({ path: path.join(OUT, f) }); lista.push({ nom, w, momento, f }); };
    await foto('1-arriba', false); await foto('2-panel', true);
    await ctx.close();
  }
  await b.close();
  const filas = ['1-arriba', '2-panel'].map(m => '<h2>' + m + '</h2>' + [1280, 375].map(w => '<div class="fila">' + CASOS.map(([n]) => { const e = lista.find(x => x.nom === n && x.w === w && x.momento === m); return '<figure><figcaption>' + n + ' · ' + w + ' px</figcaption><img src="capturas/' + e.f + '" alt="' + n + ' ' + m + ' ' + w + '"></figure>'; }).join('') + '</div>').join('')).join('');
  fs.writeFileSync(path.join(OUT, '..', 'comparacion-b2.html'), '<!doctype html><meta charset="utf-8"><title>B2 comparacion</title><style>body{font-family:system-ui;margin:16px;background:#f4f4f2}h2{margin:24px 0 8px}.fila{display:flex;gap:12px;align-items:flex-start;margin-bottom:12px;overflow:auto}figure{margin:0;flex:1 1 0;min-width:0}figcaption{font-size:12px;color:#555;margin-bottom:4px}img{width:100%;border:1px solid #ccc;background:#fff}</style><h1>Etapa B2: B1 (referencia) · B2 apagada · Por acción · Lista</h1>' + filas);
  console.log('capturas: ' + lista.length);
})().catch(e => { console.error(e); process.exit(1); });
