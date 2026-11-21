'use strict';
// Capturas comparativas de «Talle y color»: la MISMA escena en la version C2 (--ver=c2, referencia en otro puerto) y en la C3 (--ver=c3). HARNESS local, datos SINTETICOS.
//   node tests/harness/capturas-c3.js --puerto=8813 --ver=c2 --salida=<carpeta>     node tests/harness/capturas-c3.js --puerto=8812 --ver=c3 --salida=<carpeta>
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const PUERTO = arg('puerto', '8812'), VER = arg('ver', 'c3'), BASE = 'http://127.0.0.1:' + PUERTO, OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'c3', 'capturas')); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ctl = async qs => (await fetch(BASE + '/__h/variantes?' + qs)).json(), ctlR = async qs => (await fetch(BASE + '/__h/rotaciones?' + qs)).json();
const TAMS = [[1920, 1080], [1280, 900], [1024, 768], [768, 1024], [430, 932], [375, 812], [320, 640]];

(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  async function abrir(w, h, dsf) {
    const movil = w <= 768, ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf || (movil ? 2 : 1), isMobile: movil && w <= 760, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { localStorage.setItem('cds-v3', '1'); } catch (e) { /* nada */ } });
    const page = await ctx.newPage(); await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }); await sleep(1200);
    await page.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await sleep(3000); return { ctx, page };
  }
  const inyectar = (p, cod, o) => p.evaluate(([cod, o]) => { const f = RT_OPORTUNIDADES.data.find(x => x.Codigo_producto === cod); const ac = { accion: 'revisar_rotacion', estado_origen: 'posible_rotacion', principal: o.principal !== false, prioridad: 'alta', nivel: 'producto', ejecutable: false, requiere_validacion_variante: true, origen: o.origen, destino: o.destino, cantidad_orientativa: o.cantidad == null ? null : o.cantidad, cantidad_validada_por_variante: false, motivo: 'Motivo sintético' };
    f.acciones = [ac]; f.diagnostico_rotacion = { par_sugerido: { origen: { sucursal: o.origen, stock: 9 }, destino: { sucursal: o.destino, ventas: 7 }, cantidad_sugerida: o.cantidad == null ? null : o.cantidad }, pares: [{}, {}] }; }, [cod, o]);
  const espera = async p => { for (let i = 0; i < 150; i++) { if (await p.evaluate(() => !!document.querySelector('.cds-var-t, .cds-var-lista, .cds-var-error, .cds-var-vacio, .cds-var-parcial'))) break; await sleep(80); } await sleep(300); };
  const abrirTab = async (p, cod) => { await p.evaluate(() => { if (window.CDS_VARIANTES) CDS_VARIANTES.invalidar(); }); await p.evaluate(c => { [...document.querySelectorAll('[data-detalle-codigo="' + c + '"]')].find(x => x.offsetParent).click(); }, cod); await sleep(700); await p.click('#cdsTab_variantes'); await espera(p); };
  const scrollA = async (p, sel, extra = 0) => { await p.evaluate(([s, e]) => { const c = document.getElementById('cdsDrCuerpo'), t = document.querySelector(s); if (c && t) c.scrollTop = t.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 8 - e; }, [sel, extra]); await sleep(150); };
  const foto = async (p, n) => { await p.screenshot({ path: path.join(OUT, `${VER}-${n}.png`) }); console.log('foto', VER, n); };
  const cerrar = async p => { await p.keyboard.press('Escape'); await sleep(400); };
  const COD = c => p => p.evaluate(() => RT_OPORTUNIDADES.data.map(f => f.Codigo_producto));

  // ---- 7 tamaños: inicio, lista y distribución por sucursal (producto con señal, administrador) ----
  for (const [w, h] of TAMS) {
    await ctl('reset=1&modo=rotacion'); await ctlR('reset=1&modo=normal'); const { ctx, page: p } = await abrir(w, h), cod = (await COD()(p))[0];
    await inyectar(p, cod, { origen: '0001', destino: '0005', cantidad: 6 }); await abrirTab(p, cod); await foto(p, `${w}-1-inicio`);
    await scrollA(p, '.cds-var-fila', 90); await foto(p, `${w}-2-lista`);
    await p.evaluate(() => document.querySelector('.cds-var-fila[data-cds-var$=":040:02"] .cds-var-exp').click()); await sleep(250); await scrollA(p, '.cds-var-fila[data-cds-var$=":040:02"]'); await foto(p, `${w}-3-sucursales`);
    await ctx.close();
  }
  if (VER !== 'c3') { await ctl('reset=1'); await ctlR('reset=1'); await browser.close(); console.log('listo'); return; }

  // ---- estados propios de C3 ----
  for (const [w, h] of [[375, 812], [320, 640]]) {
    const { ctx, page: p } = await abrir(w, h), cods = await COD()(p); await ctl('reset=1&modo=rotacion'); await ctlR('reset=1&modo=normal');
    const esc = async (n, i, o, post) => { if (o) await inyectar(p, cods[i], o); await abrirTab(p, cods[i]); if (post) await post(); await foto(p, `${w}-e-${n}`); await cerrar(p); };
    await esc('senal-abierta', 1, { origen: '0001', destino: '0005', cantidad: 6 }, async () => { await p.click('.cds-var-senal .cds-var-alt'); await sleep(150); await scrollA(p, '.cds-var-senal', 8); });
    await esc('filtros-abiertos', 2, { origen: '0001', destino: '0005', cantidad: 6 }, async () => { await p.click('.cds-var-filtros > summary'); await sleep(150); await scrollA(p, '.cds-var-ctl', 8); });
    await esc('filtro-para-revisar', 3, { origen: '0001', destino: '0005', cantidad: 6 }, async () => { await p.click('.cds-var-filtros > summary'); await p.click('.cds-var-chip[data-chip=para_revisar]'); await sleep(200); await p.click('.cds-var-filtros > summary'); await scrollA(p, '.cds-var-ctl', 8); });
    await esc('orden-selector', 4, { origen: '0001', destino: '0005', cantidad: 6 }, async () => { await p.click('.cds-var-filtros > summary'); await p.selectOption('#cdsVarOrden', 'stockOrigen|-1'); await sleep(250); await scrollA(p, '.cds-var-ctl', 8); });
    await esc('totales-abiertos', 5, { origen: '0001', destino: '0005', cantidad: 6 }, async () => { await p.click('.cds-var-tot > summary'); await sleep(150); await scrollA(p, '.cds-var-tot', 8); });
    await esc('sugerencias-resultado', 6, { origen: '0001', destino: '0005', cantidad: 6 }, async () => { await p.click('.cds-var-sug button.cds-btn'); await sleep(900); await scrollA(p, '.cds-var-sug', 8); });
    await esc('sugerencias-en-lista', 7, { origen: '0001', destino: '0005', cantidad: 6 }, async () => { await p.click('.cds-var-sug button.cds-btn'); await sleep(900); await scrollA(p, '.cds-var-fila', 90); });
    await ctl('reset=1&n=2200'); await esc('parcial', 8, { origen: '0001', destino: '0005', cantidad: 6 }, async () => { await scrollA(p, '.cds-var-parcial', 40); });
    await ctl('reset=1&n=20&error=500'); await esc('error', 9, null, async () => { await scrollA(p, '.cds-var-error', 60); });
    await ctl('reset=1&n=0'); await esc('vacio', 10, null, async () => { await scrollA(p, '.cds-var-vacio', 80); });
    await ctl('reset=1&modo=rotacion&alterar=faltante'); await esc('datos-faltantes', 11, { origen: '0001', destino: '0005', cantidad: 6 }, async () => { await scrollA(p, '.cds-var-fila', 90); }); await ctl('alterar=0');
    await ctl('reset=1&modo=unicos'); await esc('talles-unicos', 12, null, async () => { await scrollA(p, '.cds-var-fila', 90); });
    await ctl('reset=1&n=20'); await p.evaluate(() => { window.getUser = () => ({ rol: 'jefe', usuario: 'jefe' }); }); await esc('no-admin', 13, { origen: '0001', destino: '0005', cantidad: 6 });
    await ctx.close();
  }
  // texto ampliado: 200 % y 400 % (1280 px de ancho a esos aumentos)
  for (const [w, h, n] of [[640, 450, 'zoom200'], [320, 256, 'zoom400']]) { await ctl('reset=1&modo=rotacion'); const { ctx, page: p } = await abrir(w, h, 2), cod = (await COD()(p))[0]; await inyectar(p, cod, { origen: '0001', destino: '0005', cantidad: 6 }); await abrirTab(p, cod); await foto(p, `${n}-1-inicio`); await scrollA(p, '.cds-var-fila', 60); await foto(p, `${n}-2-lista`); await ctx.close(); }
  await ctl('reset=1'); await ctlR('reset=1'); await browser.close(); console.log('listo');
})().catch(e => { console.error('ERROR', e); process.exit(2); });
