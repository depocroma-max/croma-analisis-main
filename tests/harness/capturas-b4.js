'use strict';
// Capturas comparativas de la Etapa B4: B2 (bandera encendida) · B3 · prototipo A refinado, a 1280 y 375 (+320x640), lista y detalle.
//   node tests/harness/capturas-b3.js --puerto=8812 --base=8813 --proto=<ruta a v3-conceptos/A-refinado/index.html> [--salida=<carpeta>]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const B3 = 'http://127.0.0.1:' + arg('puerto', '8812'), B2 = 'http://127.0.0.1:' + arg('base', '8813'), PROTO = arg('proto', '');
const OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'b3', 'capturas')); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true }); const lista = [];
  for (const [w, h] of [[320, 640], [375, 812], [430, 932], [768, 1024], [1024, 768], [1280, 900], [1920, 1080]]) for (const [nom, url, tipo] of [['B3', B2, 'app'], ['B4', B3, 'app'], ['prototipo-A', PROTO ? 'file:///' + PROTO.split(String.fromCharCode(92)).join('/') : null, 'proto']]) {
    if (!url) continue; const movil = w < 760;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { localStorage.setItem('cds-v3', '1'); } catch (e) { /* nada */ } });
    const p = await ctx.newPage(); await p.goto(url + (tipo === 'proto' ? '' : '/'), { waitUntil: 'domcontentloaded' }); await sleep(tipo === 'proto' ? 1800 : 1400);
    if (tipo === 'app') { await p.waitForSelector('#app', { state: 'visible' }); await p.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await sleep(3000); }
    const foto = async momento => { const f = nom + '_' + w + 'x' + h + '_' + momento + '.png'; await p.screenshot({ path: path.join(OUT, f) }); lista.push({ nom, w, h, momento, f }); };
    await p.evaluate(() => window.scrollTo(0, 0)); await foto('1-inicio');
    if (tipo === 'app') { await p.evaluate(() => { const e = document.querySelector('.cds-grupo, #ovPanel'); e.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }); await sleep(300); await foto('2-lista'); await p.evaluate(() => [...document.querySelectorAll('.cds-ver, [data-detalle-codigo]')].find(x => x.offsetParent).click()); await sleep(1100); await foto('3-detalle'); }
    else { await p.evaluate(() => { const e = document.querySelector('.cds-table, .list'); if (e) e.scrollIntoView(); }); await sleep(300); await foto('2-lista'); try { await p.evaluate(() => { const r = [...document.querySelectorAll('tr.row, .cds-item button')].find(x => x.offsetParent); if (r) r.click(); }); await sleep(900); await foto('3-detalle'); } catch (e) { /* sin detalle */ } }
    await ctx.close();
  }
  await b.close();
  const filas = ['1-inicio', '2-lista', '3-detalle'].map(m => '<h2>' + m + '</h2>' + [[320, 640], [375, 812], [430, 932], [768, 1024], [1024, 768], [1280, 900], [1920, 1080]].map(([w, h]) => '<div class="fila">' + ['B3', 'B4', 'prototipo-A'].map(n => { const e = lista.find(x => x.nom === n && x.w === w && x.momento === m); return e ? '<figure><figcaption>' + n + ' · ' + w + '×' + h + '</figcaption><img src="capturas/' + e.f + '" alt="' + n + ' ' + m + ' ' + w + '"></figure>' : ''; }).join('') + '</div>').join('')).join('');
  fs.writeFileSync(path.join(OUT, '..', 'comparacion-b4.html'), '<!doctype html><meta charset="utf-8"><title>B4 comparacion</title><style>body{font-family:system-ui;margin:16px;background:#f4f4f2}h2{margin:24px 0 8px}.fila{display:flex;gap:12px;align-items:flex-start;margin-bottom:12px;overflow:auto}figure{margin:0;flex:1 1 0;min-width:0}figcaption{font-size:12px;color:#555;margin-bottom:4px}img{width:100%;border:1px solid #ccc;background:#fff}</style><h1>Etapa B4: B3 · B4 · prototipo A refinado</h1>' + filas);
  console.log('capturas: ' + lista.length);
})().catch(e => { console.error(e); process.exit(1); });
