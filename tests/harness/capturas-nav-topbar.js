'use strict';
// Capturas comparativas antes/despues de la navegacion superior (cds-v3) contra el HARNESS local (datos SINTETICOS; no toca Sysneo ni produccion).
//   1) node tests/harness/servidor.js --puerto=8797
//   2) node tests/harness/capturas-nav-topbar.js --etiqueta=antes   --salida=<carpeta>
//      node tests/harness/capturas-nav-topbar.js --etiqueta=despues --salida=<carpeta>
// Con la bandera cds-v3 ENCENDIDA. Resoluciones 320, 375, 768, 1024, 1280, 1440 y 1920 px; todas las secciones; Stock Ventas con muchas columnas
// (se fotografia la ventana y ademas se mide el ancho util de la tabla y de sus columnas). Requiere Playwright (p. ej. ../nequ-studio) y Edge.
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const BASE = process.env.HARNESS || 'http://127.0.0.1:' + arg('puerto', '8797');
const ETIQ = arg('etiqueta', 'despues'), OUT = arg('salida', path.join(__dirname, '..', '..', 'capturas-nav')); fs.mkdirSync(OUT, { recursive: true });
const VISTAS = ['dashboard', 'marcas', 'productos', 'talles-colores', 'stock-ventas', 'oportunidades', 'reglas', 'rotaciones'];
const ANCHOS = [320, 375, 768, 1024, 1280, 1440, 1920], ALTO = { 320: 640, 375: 812, 768: 1024, 1024: 768, 1280: 800, 1440: 900, 1920: 1080 };
const solo = arg('vistas', null) ? arg('vistas').split(',') : VISTAS, anchos = arg('anchos', null) ? arg('anchos').split(',').map(Number) : ANCHOS;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const medidas = {};
(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  for (const w of anchos) {
    const movil = w <= 760;
    const ctx = await browser.newContext({ viewport: { width: w, height: ALTO[w] }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { localStorage.setItem('cds-v3', '1'); } catch (e) { /* sin almacenamiento */ } });
    const page = await ctx.newPage(); const errores = [];
    page.on('pageerror', e => errores.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errores.push('console ' + m.text().slice(0, 160)); });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }); await sleep(1500);
    for (const v of solo) {
      await page.evaluate(async v => {
        if (v === 'stock-ventas') { RT_FILTRO = { marca: ['NIKE'] }; RT_COMPLETO = null; }
        rtCambiarVista(v);
      }, v);
      await sleep(v === 'oportunidades' ? 2600 : 1600);
      if (v === 'stock-ventas') await sleep(1500);
      const masks = [page.locator('#rtUltimaActualizacion'), page.locator('.rt-dias-periodo')];
      await page.screenshot({ path: path.join(OUT, `${ETIQ}-${w}-${v}.png`), mask: masks, maskColor: '#ff00ff' });
      const m = await page.evaluate(() => {
        const de = document.documentElement, r = {};
        r.desbordeHorizontalPagina = de.scrollWidth > de.clientWidth + 1; r.scrollW = de.scrollWidth; r.clientW = de.clientWidth;
        const wrap = document.querySelector('.rt-stockventas-tabla') && document.querySelector('.rt-stockventas-tabla').closest('.rt-table-wrap');
        if (wrap) { const t = wrap.querySelector('table'); r.stockVentas = { anchoWrap: Math.round(wrap.getBoundingClientRect().width), anchoTabla: Math.round(t.getBoundingClientRect().width), scrollInterno: wrap.scrollWidth > wrap.clientWidth + 1, columnas: t.querySelectorAll('thead tr:last-child th').length, filas: t.querySelectorAll('tbody tr').length }; }
        const wr = document.querySelector('.wrap'); if (wr) r.anchoContenido = Math.round(wr.getBoundingClientRect().width);
        return r;
      });
      medidas[`${w}-${v}`] = m;
    }
    medidas[`${w}-errores`] = errores; await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, `medidas-${ETIQ}.json`), JSON.stringify(medidas, null, 1));
  const malos = Object.entries(medidas).filter(([k, v]) => v && v.desbordeHorizontalPagina).map(([k]) => k);
  console.log('capturas en', OUT, '| desborde horizontal de la pagina en:', malos.length ? malos.join(', ') : 'ninguna');
})().catch(e => { console.error(e); process.exit(1); });
