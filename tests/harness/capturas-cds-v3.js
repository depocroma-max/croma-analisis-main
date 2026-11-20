'use strict';
// Capturas y huella del DOM de Croma Análisis contra el HARNESS local (datos SINTETICOS; no toca Sysneo ni produccion).
// Sirve para comprobar que, con la bandera cds-v3 APAGADA, la aplicacion es identica a la de antes de la Etapa A (huella del DOM + capturas),
// y para fotografiar la interfaz nueva con la bandera ENCENDIDA.
//   1) node tests/harness/servidor.js --puerto=8797
//   2) node tests/harness/capturas-cds-v3.js --bandera=off --etiqueta=antes --salida=<carpeta>
//      node tests/harness/capturas-cds-v3.js --bandera=on  --etiqueta=despues-on --salida=<carpeta>
// Requiere Playwright (p. ej. el de ../nequ-studio/node_modules/playwright-core) y Edge. No instala nada.
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const BASE = process.env.HARNESS || 'http://127.0.0.1:' + arg('puerto', '8797');
const BANDERA = arg('bandera', 'off'), ETIQ = arg('etiqueta', BANDERA === 'on' ? 'on' : 'off');
const OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'capturas')); fs.mkdirSync(OUT, { recursive: true });
const VISTAS = ['oportunidades', 'reglas', 'rotaciones', 'productos', 'dashboard'];
const TAMANOS = [['1440', 1440, 900], ['1024', 1024, 768], ['820', 820, 1180], ['375', 375, 812], ['320', 320, 640]];
const huella = {};
(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  for (const [nom, w, h] of TAMANOS) {
    const movil = w <= 760;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    if (BANDERA === 'on') await ctx.addInitScript(() => { try { localStorage.setItem('cds-v3', '1'); } catch (e) { /* sin almacenamiento */ } });
    const page = await ctx.newPage(); const errores = []; const pedidos = [];
    page.on('pageerror', e => errores.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errores.push('console ' + m.text().slice(0, 160)); });
    page.on('request', r => { const u = r.url(); if (u.startsWith(BASE)) pedidos.push(new URL(u).pathname); });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }); await page.waitForTimeout(1500);
    for (const v of VISTAS) {
      const abre = await page.evaluate(({ v, on }) => {
        const sel = on ? '[data-cds-view="' + v + '"]' : '#rtTabs .tab[data-view="' + v + '"]';
        const el = [...document.querySelectorAll(sel)].find(e => e.offsetParent !== null) || document.querySelector('#rtTabs .tab[data-view="' + v + '"]'); if (!el) return false; el.click(); return true;
      }, { v, on: BANDERA === 'on' });
      if (!abre) continue; await page.waitForTimeout(v === 'oportunidades' ? 2200 : 900);
      const masks = [page.locator('#rtUltimaActualizacion'), page.locator('.rt-dias-periodo')];
      await page.screenshot({ path: path.join(OUT, `${ETIQ}-${nom}-${v}.png`), mask: masks, maskColor: '#ff00ff' });
      const sig = await page.evaluate(() => { const c = document.getElementById('app').cloneNode(true); c.querySelectorAll('#rtUltimaActualizacion,.rt-dias-periodo,[data-cds]').forEach(n => n.remove()); return c.outerHTML.replace(/\d{1,2}[:/]\d{2}([:/]\d{2,4})?/g, '#').replace(/\s+/g, ' '); });
      huella[`${nom}-${v}`] = crypto.createHash('sha1').update(sig).digest('hex');
    }
    huella[`${nom}-errores`] = errores; huella[`${nom}-pedidos-cds`] = pedidos.filter(p => /\/cds\//.test(p)).length;
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, `${ETIQ}-huella.json`), JSON.stringify(huella, null, 1));
  console.log('listo', ETIQ, Object.keys(huella).length, 'entradas');
})().catch(e => { console.error(e); process.exit(1); });
