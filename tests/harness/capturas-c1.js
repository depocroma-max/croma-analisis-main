'use strict';
// Capturas de la pestaña «Talle y color» (Etapa C1) en los 7 tamaños y en sus estados, y ejemplos reales-del-contrato (datos SINTETICOS) de variantes y depósitos.
//   node tests/harness/capturas-c1.js --puerto=8812 [--salida=<carpeta>]       (harness con /__h/variantes, ver variantes-fixture.js)
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const BASE = 'http://127.0.0.1:' + arg('puerto', '8812'), OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'c1', 'capturas')); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ctl = async qs => (await fetch(BASE + '/__h/variantes?' + qs)).json();
const TAMS = [[1920, 1080], [1280, 900], [1024, 768], [768, 1024], [430, 932], [375, 812], [320, 640]];

(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  async function abrir(w, h) {
    const movil = w <= 768;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil && w <= 760, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { localStorage.setItem('cds-v3', '1'); } catch (e) { /* nada */ } });
    const page = await ctx.newPage(); await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }); await sleep(1200);
    await page.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await sleep(3000);
    return { ctx, page };
  }
  const abrirTab = async (p, cod) => { await p.evaluate(c => { [...document.querySelectorAll('[data-detalle-codigo="' + c + '"]')].find(x => x.offsetParent).click(); }, cod); await sleep(700); await p.click('#cdsTab_variantes'); };
  const espera = async p => { for (let i = 0; i < 150; i++) { if (await p.evaluate(() => !!document.querySelector('.cds-var-t, .cds-var-lista, .cds-var-error, .cds-var-vacio, .cds-var-parcial'))) break; await sleep(80); } await sleep(250); };
  const scrollA = async (p, sel, extra = 0) => { await p.evaluate(([s, e]) => { const c = document.getElementById('cdsDrCuerpo'), t = document.querySelector(s); if (c && t) c.scrollTop = t.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 8 - e; }, [sel, extra]); await sleep(150); };
  const foto = async (p, nombre) => { await p.screenshot({ path: path.join(OUT, nombre + '.png') }); console.log('foto', nombre); };

  // ---- 7 tamaños: inicio de la pestaña, tabla y distribución por sucursal (20 variantes) ----
  for (const [w, h] of TAMS) {
    await ctl('reset=1&n=20'); const { ctx, page: p } = await abrir(w, h), cod = (await p.evaluate(() => RT_OPORTUNIDADES.data.map(f => f.Codigo_producto)))[0];
    await abrirTab(p, cod); await espera(p); await foto(p, `${w}-1-inicio`);
    await scrollA(p, '.cds-var-tabla'); await foto(p, `${w}-2-tabla`);
    await p.evaluate(() => document.querySelector('.cds-var-exp').click()); await sleep(200); await scrollA(p, '.cds-var-fila', 0); await foto(p, `${w}-3-sucursales`);
    await ctx.close();
  }
  // ---- estados en escritorio y móvil ----
  for (const [w, h] of [[1280, 900], [375, 812]]) {
    const { ctx, page: p } = await abrir(w, h), cods = await p.evaluate(() => RT_OPORTUNIDADES.data.map(f => f.Codigo_producto)), inv = () => p.evaluate(() => CDS_VARIANTES.invalidar());
    const cerrar = async () => { await p.keyboard.press('Escape'); await sleep(400); };
    const esc = async (nombre, qs, i, accion, esperar = true) => { await ctl(qs); await inv(); await abrirTab(p, cods[i]); if (esperar) await espera(p); else await sleep(500); if (accion) await accion(); await foto(p, `${w}-e-${nombre}`); await cerrar(); };
    await esc('cargando', 'reset=1&n=20&retraso=5000', 1, null, false);
    await ctl('retraso=0');
    await esc('vacio', 'reset=1&n=0', 2);
    await esc('error', 'reset=1&n=20&error=500', 3);
    await esc('eco-distinto', 'reset=1&n=20&alterar=eco', 4);
    await esc('parcial-tope', 'reset=1&n=2200', 5, () => scrollA(p, '.cds-var-parcial', 40));
    await esc('parcial-falla', 'reset=1&n=1200&error=pagina2', 6, () => scrollA(p, '.cds-var-parcial', 40));
    await esc('talles-unicos', 'reset=1&modo=unicos', 7, () => scrollA(p, '.cds-var-tabla'));
    await esc('300-filtro', 'reset=1&n=300', 8, async () => { await p.fill('.cds-var-buscar', 'S'); await sleep(250); await p.click('.cds-var-chip[data-chip=sin_stock]'); await sleep(250); await scrollA(p, '.cds-var-ctl'); });
    await esc('conciliacion', 'reset=1&modo=conciliar', 9, async () => { await p.evaluate(() => { const d = document.querySelector('.cds-var-conc'); if (d) d.open = true; }); await scrollA(p, '.cds-var-resumen'); });
    await esc('universo-distinto', 'reset=1&n=20', 10, async () => { await p.evaluate(() => { const d = document.querySelector('.cds-var-conc'); if (d) d.open = true; }); await scrollA(p, '.cds-var-resumen'); });
    await ctx.close();
  }
  // ---- ejemplos de variantes y depósitos: valores crudos de la API vs lo que muestra la pestaña ----
  await ctl('reset=1&n=20'); const { ctx, page: p } = await abrir(1280, 900), cod = (await p.evaluate(() => RT_OPORTUNIDADES.data.map(f => f.Codigo_producto)))[0];
  await abrirTab(p, cod); await espera(p);
  const api = await (await fetch(BASE + '/analisis/stock-ventas?desde=2026-08-01&hasta=2026-11-21&codigo=' + cod + '&sucursales=0001,0005,0010,0012,0014&limit=500')).json();
  const dom = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.cds-var-fila')].map(tr => { const n = k => tr.querySelector('td[data-cds-campo=' + k + ']').firstChild.textContent; return [tr.dataset.cdsVar, { talle: tr.querySelector('[data-cds-campo=talle]').textContent, color: tr.querySelector('.cds-var-color').textContent, codColor: tr.querySelector('[data-cds-campo=color]').textContent, estado: tr.querySelector('.cds-var-est').textContent, ventas: n('ventas'), stockSuc: n('stock'), dep90: n('dep90'), fallados: n('fallados'), avisos: [...tr.querySelectorAll('.cds-var-flag')].map(x => x.textContent) }]; })));
  const ej = api.data.slice(0, 7).map(r => { const k = 'V:' + r.Codigo_producto + ':' + r.Codigo_talle + ':' + r.Codigo_color; return { clave: k, api: { Codigo_talle: r.Codigo_talle, Codigo_color: r.Codigo_color, Nombre_color: r.Nombre_color, Ventas_total: r.Ventas_total, Stock_total: r.Stock_total, Stock_ctro_0000: r.Stock_ctro_0000, Stock_fallados: r.Stock_fallados, stock_sucursales: Object.fromEntries(['0001', '0005', '0010', '0012', '0014'].map(c => [c, r['Stock_ctro_' + c]])) }, pantalla: dom[k] }; });
  fs.writeFileSync(path.join(OUT, '..', 'ejemplos-variantes-depositos.json'), JSON.stringify({ producto: cod, nota: 'Datos SINTETICOS del harness con la forma real del contrato (INFORME-C0)', ejemplos: ej }, null, 1));
  await ctx.close(); await ctl('reset=1'); await browser.close(); console.log('listo');
})().catch(e => { console.error('ERROR', e); process.exit(2); });
