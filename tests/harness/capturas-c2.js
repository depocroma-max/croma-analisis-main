'use strict';
// Capturas de la Etapa C2 (señal de rotacion y sugerencias manuales en «Talle y color»). HARNESS local, datos SINTETICOS.
//   node tests/harness/capturas-c2.js --puerto=8812 [--salida=<carpeta>]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const BASE = 'http://127.0.0.1:' + arg('puerto', '8812'), OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'c2', 'capturas')); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ctl = async qs => (await fetch(BASE + '/__h/variantes?' + qs)).json(), ctlR = async qs => (await fetch(BASE + '/__h/rotaciones?' + qs)).json();
const TAMS = [[1920, 1080], [1280, 900], [1024, 768], [768, 1024], [430, 932], [375, 812], [320, 640]];

(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  async function abrir(w, h) {
    const movil = w <= 768, ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil && w <= 760, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { localStorage.setItem('cds-v3', '1'); } catch (e) { /* nada */ } });
    const page = await ctx.newPage(); await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }); await sleep(1200);
    await page.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await sleep(3000); return { ctx, page };
  }
  const inyectar = (p, cod, o) => p.evaluate(([cod, o]) => { const f = RT_OPORTUNIDADES.data.find(x => x.Codigo_producto === cod); const ac = { accion: 'revisar_rotacion', estado_origen: 'posible_rotacion', principal: o.principal !== false, prioridad: 'alta', nivel: 'producto', ejecutable: false, requiere_validacion_variante: true, origen: o.origen, destino: o.destino, cantidad_orientativa: o.cantidad == null ? null : o.cantidad, cantidad_validada_por_variante: false, motivo: 'Motivo sintético' };
    f.acciones = o.principal === false ? [{ accion: 'reponer_urgente', estado_origen: 'reposicion_urgente', principal: true, prioridad: 'alta', motivo: 'x' }, ac] : [ac]; f.diagnostico_rotacion = { par_sugerido: { origen: { sucursal: o.origen, stock: 9 }, destino: { sucursal: o.destino, ventas: 7 }, cantidad_sugerida: o.cantidad == null ? null : o.cantidad }, pares: [{}, {}] }; }, [cod, o]);
  const espera = async p => { for (let i = 0; i < 150; i++) { if (await p.evaluate(() => !!document.querySelector('.cds-var-t, .cds-var-lista, .cds-var-error, .cds-var-vacio, .cds-var-parcial'))) break; await sleep(80); } await sleep(300); };
  const abrirTab = async (p, cod) => { await p.evaluate(() => CDS_VARIANTES.invalidar()); await p.evaluate(c => { [...document.querySelectorAll('[data-detalle-codigo="' + c + '"]')].find(x => x.offsetParent).click(); }, cod); await sleep(700); await p.click('#cdsTab_variantes'); await espera(p); };
  const scrollA = async (p, sel, extra = 0) => { await p.evaluate(([s, e]) => { const c = document.getElementById('cdsDrCuerpo'), t = document.querySelector(s); if (c && t) c.scrollTop = t.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 8 - e; }, [sel, extra]); await sleep(150); };
  const foto = async (p, n) => { await p.screenshot({ path: path.join(OUT, n + '.png') }); console.log('foto', n); };
  const cerrar = async p => { await p.keyboard.press('Escape'); await sleep(400); };

  // ---- 7 tamaños: señal y tabla de revisión ----
  for (const [w, h] of TAMS) {
    await ctl('reset=1&modo=rotacion'); await ctlR('reset=1&modo=normal'); const { ctx, page: p } = await abrir(w, h), cod = (await p.evaluate(() => RT_OPORTUNIDADES.data.map(f => f.Codigo_producto)))[0];
    await inyectar(p, cod, { origen: '0001', destino: '0005', cantidad: 6 }); await abrirTab(p, cod); await foto(p, `${w}-1-senal`);
    await scrollA(p, '.cds-var-ctl'); await foto(p, `${w}-2-revision`);
    await p.evaluate(() => document.querySelector('.cds-var-fila[data-cds-var$=":040:02"] .cds-var-exp').click()); await sleep(200); await scrollA(p, '.cds-var-fila[data-cds-var$=":040:02"]'); await foto(p, `${w}-3-origen-destino`);
    await ctx.close();
  }
  // ---- estados (1280 y 375) ----
  for (const [w, h] of [[1280, 900], [375, 812]]) {
    const { ctx, page: p } = await abrir(w, h), cods = await p.evaluate(() => RT_OPORTUNIDADES.data.map(f => f.Codigo_producto));
    const esc = async (n, i, o, ant, post) => { if (ant) await ant(); if (o) await inyectar(p, cods[i], o); await abrirTab(p, cods[i]); if (post) await post(); await foto(p, `${w}-e-${n}`); await cerrar(p); };
    await ctl('reset=1&modo=rotacion'); await ctlR('reset=1&modo=normal');
    await esc('secundaria-sin-cantidad', 1, { origen: '0001', destino: '0005', cantidad: null, principal: false });
    await esc('filtro-para-revisar', 2, { origen: '0001', destino: '0005', cantidad: 6 }, null, async () => { await p.click('.cds-var-chip[data-chip=para_revisar]'); await sleep(250); await scrollA(p, '.cds-var-ctl'); });
    await esc('orden-stock-origen', 3, { origen: '0001', destino: '0005', cantidad: 6 }, null, async () => { await p.click('.cds-var-ord-rot[data-orden-rot=stockOrigen]'); await sleep(250); await scrollA(p, '.cds-var-ctl'); });
    await esc('sin-senal', 4, null, async () => { await p.evaluate(c => { const f = RT_OPORTUNIDADES.data.find(x => x.Codigo_producto === c); f.acciones = (f.acciones || []).filter(a => a.estado_origen !== 'posible_rotacion'); f.diagnostico_rotacion = null; }, cods[4]); });
    await ctl('alterar=faltante'); await esc('datos-faltantes', 5, { origen: '0001', destino: '0005', cantidad: 6 }, null, async () => { await scrollA(p, '.cds-var-tabla'); }); await ctl('alterar=0');
    await esc('sugerencias-boton', 6, { origen: '0001', destino: '0005', cantidad: 6 }, null, async () => { await scrollA(p, '.cds-var-sug', 8); });
    await esc('sugerencias-resultado', 7, { origen: '0001', destino: '0005', cantidad: 6 }, null, async () => { await p.click('.cds-var-sug button'); await sleep(900); await scrollA(p, '.cds-var-sug', 8); });
    await esc('sugerencias-en-tabla', 8, { origen: '0001', destino: '0005', cantidad: 6 }, null, async () => { await p.click('.cds-var-sug button'); await sleep(900); await p.click('.cds-var-chip[data-chip=sugeridas]'); await sleep(250); await scrollA(p, '.cds-var-ctl'); });
    await ctlR('modo=403'); await esc('sugerencias-sin-permiso', 9, { origen: '0001', destino: '0005', cantidad: 6 }, null, async () => { await p.click('.cds-var-sug button'); await sleep(900); await scrollA(p, '.cds-var-sug', 8); });
    await ctlR('modo=vacio'); await esc('sugerencias-vacio', 10, { origen: '0001', destino: '0005', cantidad: 6 }, null, async () => { await p.click('.cds-var-sug button'); await sleep(900); await scrollA(p, '.cds-var-sug', 8); }); await ctlR('modo=normal');
    await p.evaluate(() => rtSucursalesAplicar(['0005', '0010', '0012', '0014'])); await sleep(3500);
    const c2 = (await p.evaluate(() => RT_OPORTUNIDADES.data.map(f => f.Codigo_producto)))[0]; await inyectar(p, c2, { origen: '0001', destino: '0005', cantidad: 6 }); await abrirTab(p, c2); await foto(p, `${w}-e-sucursal-excluida`); await cerrar(p);
    await p.evaluate(() => rtSucursalesAplicar(['0001', '0005', '0010', '0012', '0014'])); await sleep(3500);
    const c3 = (await p.evaluate(() => RT_OPORTUNIDADES.data.map(f => f.Codigo_producto)))[1]; await p.evaluate(() => { window.getUser = () => ({ rol: 'jefe', usuario: 'jefe' }); }); await inyectar(p, c3, { origen: '0001', destino: '0005', cantidad: 6 }); await abrirTab(p, c3); await foto(p, `${w}-e-usuario-no-admin`); await cerrar(p);
    await ctx.close();
  }
  await ctl('reset=1'); await ctlR('reset=1'); await browser.close(); console.log('listo');
})().catch(e => { console.error('ERROR', e); process.exit(2); });
