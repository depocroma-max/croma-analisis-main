'use strict';
// Validacion de la Etapa C1 (pestaña «Talle y color» del detalle de Oportunidades, bandera cds-v3). HARNESS local con /analisis/stock-ventas SIMULADO (ver
// variantes-fixture.js; router real de croma-api), datos SINTETICOS. No consulta produccion.
//   1) node tests/harness/servidor.js --puerto=8812 (CROMA_API_DIR = croma-api compatible)   2) referencia B4 (db3c88b) en --base=8813 para comparar con la bandera apagada
//   3) node tests/harness/validacion-c1.js --puerto=8812 [--base=8813] [--salida=<carpeta>]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const BASE = 'http://127.0.0.1:' + arg('puerto', '8812'), REF = arg('base') ? 'http://127.0.0.1:' + arg('base') : null;
const OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'c1')); fs.mkdirSync(OUT, { recursive: true });
const res = []; const ok = (g, n, c, d) => { res.push({ grupo: g, nombre: n, ok: !!c, detalle: d == null ? '' : String(d).slice(0, 300) }); console.log((c ? 'PASS ' : 'FAIL ') + '[' + g + '] ' + n + (d != null && d !== '' ? '  [' + String(d).slice(0, 170) + ']' : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nf = new Intl.NumberFormat('es-AR');
const SUC = ['0001', '0005', '0010', '0012', '0014'];
let PP = null; // pagina principal: cada escenario nuevo del harness vacia la cache del cliente (si no, el escenario anterior se serviria desde la cache de 5 minutos)
const ctl = async qs => { const r = await (await fetch(BASE + '/__h/variantes?' + qs)).json(); if (PP && /reset=1|(^|&)n=|modo=|alterar=/.test(qs)) await PP.evaluate(() => { if (window.CDS_VARIANTES) CDS_VARIANTES.invalidar(); }); return r; };

(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  async function abrir(base, bandera, w = 1280, h = 900, tweak) {
    const movil = w <= 768;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil && w <= 760, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    await ctx.addInitScript(b => { try { localStorage.setItem('cds-v3', b ? '1' : '0'); } catch (e) { /* nada */ } }, bandera);
    const page = await ctx.newPage(); const o = { ctx, page, errores: [], sv: [], fallidas: [], opp: [] };
    page.on('pageerror', e => o.errores.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g|status of 5/.test(m.text())) o.errores.push('console ' + m.text().slice(0, 160)); });
    page.on('request', r => { const u = new URL(r.url()); if (u.pathname === '/analisis/stock-ventas') o.sv.push(u.searchParams); if (u.pathname === '/analisis/oportunidades') o.opp.push(u.searchParams); });
    page.on('requestfailed', r => { if (r.url().includes('stock-ventas')) o.fallidas.push(new URL(r.url()).searchParams.get('codigo')); });
    if (tweak) await tweak(page);
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }); await sleep(1200);
    await page.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await sleep(3000);
    return o;
  }
  const codigos = p => p.evaluate(() => RT_OPORTUNIDADES.data.map(f => f.Codigo_producto));
  const abrirDet = async (p, c) => { await p.evaluate(c => { [...document.querySelectorAll('[data-detalle-codigo="' + c + '"]')].find(x => x.offsetParent).click(); }, c); await sleep(700); };
  const cerrarDet = async p => { await p.keyboard.press('Escape'); await sleep(400); };
  const esperaVar = async (p, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(() => !!document.querySelector('.cds-var-t, .cds-var-error, .cds-var-vacio, .cds-var-parcial'))) { await sleep(120); return true; } await sleep(80); } return false; };
  const abrirTab = async p => { await p.click('#cdsTab_variantes'); return esperaVar(p); };
  const filas = p => p.evaluate(() => [...document.querySelectorAll('.cds-var-fila')].map(tr => { const num = k => { const td = tr.querySelector('td[data-cds-campo=' + k + ']'); return td ? td.firstChild.textContent : null; };
    return { key: tr.dataset.cdsVar, est: tr.dataset.estado, talle: tr.querySelector('[data-cds-campo=talle]').textContent, color: tr.querySelector('.cds-var-color').textContent, codColor: tr.querySelector('[data-cds-campo=color]').textContent, ventas: num('ventas'), stock: num('stock'), dep: num('dep90'), fall: num('fallados'), sub: [...tr.querySelectorAll('.cds-var-sub')].map(x => x.textContent), flags: [...tr.querySelectorAll('.cds-var-flag')].map(x => x.dataset.flag) }; }));
  const totalesDom = p => p.evaluate(() => [...document.querySelectorAll('.cds-var-totales > div')].map(d => ({ etq: d.querySelector('dt').textContent, v: d.querySelector('dd').textContent, sub: (d.querySelector('small') || {}).textContent })));
  const texto = p => p.evaluate(() => (document.getElementById('cdsDrCuerpo') || {}).innerText || '');
  async function apiTodo(cod, suc = SUC) { // lo que devuelve la API, pagina por pagina (verdad de referencia)
    let off = 0, total = null; const rows = [];
    do { const r = await (await fetch(BASE + '/analisis/stock-ventas?desde=2026-08-01&hasta=2026-11-21&codigo=' + encodeURIComponent(cod) + '&sucursales=' + suc.join(',') + '&limit=500&offset=' + off)).json(); rows.push(...r.data); total = r.paginacion.total; off += r.paginacion.devueltos; if (!r.data.length) break; } while (off < total);
    return rows;
  }
  const esperado = (rows, suc = SUC) => ({ n: rows.length, ventas: rows.reduce((a, r) => a + r.Ventas_total, 0), dep: rows.reduce((a, r) => a + Math.max(0, r.Stock_ctro_0000 - r.Stock_fallados), 0), fall: rows.reduce((a, r) => a + r.Stock_fallados, 0), sdisp: rows.reduce((a, r) => a + suc.reduce((b, c) => b + Math.max(0, r['Stock_ctro_' + c]), 0), 0) });

  // ============================ A) CONSULTA A DEMANDA Y PARAMETROS ============================
  await ctl('reset=1&n=20');
  const on = await abrir(BASE, true), P = on.page, cods = await codigos(P), c0 = cods[0]; PP = P;
  ok('Demanda', 'Con la lista cargada no hay ninguna consulta a stock-ventas', on.sv.length === 0);
  await abrirDet(P, c0); const pestanas = await P.evaluate(() => [...document.querySelectorAll('.cds-tabs [role=tab]')].map(t => t.getAttribute('aria-label')));
  ok('Demanda', 'Abrir el detalle del producto NO consulta stock-ventas', on.sv.length === 0 && (await P.$$('.cds-dr')).length === 1);
  ok('Demanda', 'La pestaña «Talle y color» está en el panel lateral junto a Resumen, Motivos, Ingreso y rendimiento y Sucursales', JSON.stringify(pestanas) === JSON.stringify(['Resumen', 'Motivos', 'Ingreso y rendimiento', 'Sucursales', 'Talle y color']), pestanas.join(' | '));
  for (const t of ['motivos', 'ingreso', 'sucursales', 'resumen']) { await P.click('#cdsTab_' + t); await sleep(200); }
  ok('Demanda', 'Recorrer las otras 4 pestañas tampoco consulta stock-ventas', on.sv.length === 0);
  ok('Demanda', 'Se conservan «Ver en Talles y colores» y «Ver este producto en Rotaciones» en Resumen', (await texto(P)).includes('Ver en Talles y colores'));
  const eco = await P.evaluate(() => ({ suc: RT_OPORTUNIDADES.sucursales, per: RT_OPORTUNIDADES.periodo }));
  const t0 = Date.now(); await abrirTab(P); const msCarga = Date.now() - t0;
  ok('Demanda', 'Al abrir la pestaña se hace UNA consulta, con las sucursales y el período de Oportunidades y límite 500', on.sv.length === 1 && on.sv[0].get('codigo') === c0 && on.sv[0].get('sucursales') === eco.suc.join(',') && on.sv[0].get('desde') === eco.per.desde && on.sv[0].get('hasta') === eco.per.hasta && on.sv[0].get('limit') === '500' && on.sv[0].get('offset') === '0', on.sv[0] && on.sv[0].toString().slice(0, 140));
  ok('Demanda', 'La nota fija dice «Variantes con actividad en el período» y que no se puede afirmar que la curva esté completa', (await texto(P)).includes('Variantes con actividad en el período') && /no se puede afirmar que la curva esté completa/.test(await texto(P)));
  ok('Demanda', 'No hay botones de seguimiento ni persistencia (solo claves y atributos)', await P.evaluate(() => ![...document.querySelectorAll('.cds-var button')].some(b => /segu|estrella|alerta/i.test(b.textContent + (b.getAttribute('aria-label') || ''))) && ![...Object.keys(localStorage), ...Object.keys(sessionStorage)].some(k => /segu|variante/i.test(k))));

  // ============================ B) CONTENIDO Y REGLAS COMERCIALES (n = 20, casos especiales) ============================
  const rows20 = await apiTodo(c0), esp = esperado(rows20), fs20 = await filas(P), tot = await totalesDom(P);
  ok('Reglas', '20 variantes, sin duplicados, una fila por cada variante de la API', fs20.length === 20 && new Set(fs20.map(f => f.key)).size === 20 && rows20.length === 20);
  ok('Reglas', 'Totales = suma de la API: variantes, ventas netas, stock de sucursales disponible, depósito 90 y fallados 93', tot[0].v === nf.format(esp.n) && tot[1].v === nf.format(esp.ventas) && tot[2].v === nf.format(esp.sdisp) && tot[3].v === nf.format(esp.dep) && tot[3].sub.includes(nf.format(esp.fall)), JSON.stringify(tot.map(t => t.v)) + ' vs ' + JSON.stringify(esp));
  const porKey = Object.fromEntries(fs20.map(f => [f.key, f])), K = (t, c) => 'V:' + c0 + ':' + t + ':' + c;
  const f0 = porKey[K('040', '02')], f1 = porKey[K('S', '02')], f2 = porKey[K('M', '02')], f3 = porKey[K('L', '02')], f4 = porKey[K('XL', '02')], f5 = porKey[K('38', '02')], f6 = porKey[K('39', 'ZZ')];
  ok('Reglas', 'Ceros iniciales conservados como texto: talle «040» y color «02» en pantalla y en la clave', f0 && f0.talle === '040' && f0.codColor === 'color 02' && f0.key === 'V:' + c0 + ':040:02', f0 && JSON.stringify(f0));
  ok('Reglas', 'Variante con stock: depósito 90 = combinado − fallados (6 − 1 = 5), fallados 1 aparte', f0 && f0.dep === '5' && f0.fall === '1' && f0.stock === '7' && f0.est === 'con_stock', f0 && JSON.stringify(f0));
  ok('Reglas', 'Saldo negativo (−2 en una sucursal): no es disponible, se marca y el stock suma solo lo positivo (1)', f1 && f1.stock === '1' && f1.flags.includes('saldo_negativo') && f1.sub.some(s => /saldo negativo/.test(s)), f1 && JSON.stringify(f1));
  ok('Reglas', 'Ventas netas negativas (devoluciones): se muestran con signo y se marcan, sin tocar el stock', f2 && f2.ventas === nf.format(-2) && f2.flags.includes('ventas_negativas') && f2.est === 'sin_stock', f2 && JSON.stringify(f2));
  ok('Reglas', 'Diferencia entre depósitos (fallados 3 > combinado 1): depósito 90 en 0 (no negativo), fallados 3 y marca', f3 && f3.dep === '0' && f3.fall === '3' && f3.flags.includes('deposito_menor_a_fallados') && f3.est === 'sin_stock', f3 && JSON.stringify(f3));
  ok('Reglas', 'Solo depósito (combinado 10, fallados 2 → 8) sin stock en sucursales', f4 && f4.est === 'solo_deposito' && f4.dep === '8' && f4.stock === '0' && f4.flags.includes('sin_ventas'), f4 && JSON.stringify(f4));
  ok('Reglas', 'Variante sin stock pero con ventas: las ventas (6) se suman y figura «Sin stock»', f5 && f5.est === 'sin_stock' && f5.ventas === '6' && f5.stock === '0', f5 && JSON.stringify(f5));
  ok('Reglas', 'Color sin mapear: conserva el código (color ZZ), muestra «Sin nombre de color» y la advertencia', f6 && f6.color === 'Sin nombre de color' && f6.codColor === 'color ZZ' && f6.flags.includes('color_sin_nombre'), f6 && JSON.stringify(f6));
  ok('Reglas', 'Nombre del color cuando está disponible (BLANCO, NEGRO) y Stock_total nunca aparece como stock', fs20.some(f => f.color === 'NEGRO') && fs20.some(f => f.color === 'BLANCO') && fs20.every(f => f.stock !== null));
  const sumaStockTotalApi = rows20.reduce((a, r) => a + r.Stock_total, 0);
  ok('Reglas', 'Stock_total de la API (que incluye fallados y negativos) no se usa: ninguna cifra mostrada lo reproduce', sumaStockTotalApi !== esp.sdisp && !(await texto(P)).includes(nf.format(sumaStockTotalApi)) || sumaStockTotalApi === esp.sdisp, 'Σ Stock_total=' + sumaStockTotalApi + ' disponible=' + esp.sdisp);
  ok('Reglas', 'Solo aparecen las 5 sucursales consideradas (no Cipo 0009)', await P.evaluate(() => { document.querySelector('.cds-var-exp').click(); return !/Cipo/.test(document.querySelector('.cds-var-det').innerText); }));
  const det = await P.evaluate(() => { const d = document.querySelector('.cds-var-det'); return { filas: d.querySelectorAll('.cds-mini > tbody > tr').length, tr: [...d.querySelectorAll('.cds-mini > tbody > tr')].map(r => r.className + ':' + r.innerText.replace(/\n/g, ' ').slice(0, 25)).join(' / '), claves: [...d.querySelectorAll('[data-cds-var-suc]')].map(x => x.dataset.cdsVarSuc), txt: d.innerText, exp: document.querySelector('.cds-var-exp').getAttribute('aria-expanded') }; });
  ok('Reglas', 'La distribución por sucursal muestra 5 sucursales + Depósito 90 derivado + Fallados 93, con claves por sucursal', det.filas === 7 && det.claves.length === 5 && det.claves[0].startsWith('VS:' + c0 + ':') && /Depósito 90 \(derivado\)/.test(det.txt) && /Fallados 93/.test(det.txt) && det.exp === 'true', det.filas + ' filas [' + det.tr + ']; ' + det.claves.length + ' claves; exp=' + det.exp + '; ' + det.txt.replace(/\n/g, ' ').slice(0, 100));
  const attrs = await P.evaluate(() => ({ prod: document.querySelector('.cds-var').dataset.cdsProd, talle: document.querySelector('.cds-var-id').dataset.cdsTalle, color: document.querySelector('.cds-var-id').dataset.cdsColor, v: document.querySelector('.cds-var-fila').dataset.cdsVar }));
  ok('Seguimiento', 'Atributos canónicos: producto (P:), talle (T:), color (C:), variante (V:) y variante por sucursal (VS:), todos cadenas', attrs.prod === 'P:' + c0 && /^T:/.test(attrs.talle) && /^C:/.test(attrs.color) && /^V:/.test(attrs.v), JSON.stringify(attrs));
  ok('Estados', 'El orden inicial es por color y talle en curva (38, 39, 040, …) y es estable', (() => { const sub = fs20.filter(f => f.color === 'BLANCO').map(f => f.talle); return sub.length > 2 && JSON.stringify(sub) === JSON.stringify(sub.slice().sort((a, b) => { const na = /^\d+$/.test(a), nb = /^\d+$/.test(b); if (na && nb) return Number(a) - Number(b) || (a < b ? -1 : 1); if (na !== nb) return na ? -1 : 1; return 0; })); })(), fs20.filter(f => f.color === 'BLANCO').map(f => f.talle).join(','));

  // ============================ C) CACHE, ACTUALIZAR, CIERRE ============================
  const antes = on.sv.length; await cerrarDet(P); await abrirDet(P, c0); await abrirTab(P);
  ok('Caché', 'Cerrar y reabrir el mismo producto dentro de 5 minutos no vuelve a consultar', on.sv.length === antes);
  await P.click('.cds-var-barra button'); await esperaVar(P); await sleep(300);
  ok('Caché', 'Actualizar vuelve a consultar una vez', on.sv.length === antes + 1);
  await P.evaluate(() => { CDS_VARIANTES.CFG.ahora = () => Date.now() + 6 * 60 * 1000; }); await cerrarDet(P); await abrirDet(P, c0); await abrirTab(P); await sleep(300);
  ok('Caché', 'Pasados 5 minutos la entrada vence y se consulta de nuevo', on.sv.length === antes + 2);
  await P.evaluate(() => { CDS_VARIANTES.CFG.ahora = () => Date.now(); });
  await cerrarDet(P); await abrirDet(P, cods[1]); const ant2 = on.sv.length; await abrirTab(P);
  ok('Caché', 'Otro producto es otra clave: consulta propia (no se mezclan filas de dos productos)', on.sv.length === ant2 + 1 && (await P.evaluate(() => document.querySelector('.cds-var').dataset.cdsProd)) === 'P:' + cods[1]);
  ok('Demanda', 'Cambiar de producto con el detalle abierto vuelve a Resumen y no consulta hasta abrir la pestaña', await (async () => { const n0 = on.sv.length; await cerrarDet(P); await abrirDet(P, cods[2]); const tabSel = await P.evaluate(() => document.querySelector('.cds-tabs [aria-selected=true]').id); return tabSel === 'cdsTab_resumen' && on.sv.length === n0; })());
  await cerrarDet(P);

  // ============================ D) ESCALAS 1 / 20 / 300 / 1200 + PARCIAL ============================
  for (const n of [1, 300, 1200]) {
    await ctl('reset=1&n=' + n); on.sv.length = 0; await abrirDet(P, cods[3]); await abrirTab(P); await sleep(400);
    const exp = await apiTodo(cods[3]), e = esperado(exp), pags = Math.ceil(n / 500);
    const inicial = (await filas(P)).length;
    let guard = 0; while (await P.$('.cds-var-mas') && guard++ < 40) await P.click('.cds-var-mas');
    const todas = await filas(P), claves = new Set(todas.map(f => f.key)), t = await totalesDom(P);
    ok('Escala ' + n, n + ' variantes: ' + pags + ' página(s) de 500 en orden (offset 0/500/1000), sin repetir ni saltear', on.sv.length === pags && on.sv.every((s, i) => s.get('offset') === String(i * 500) && s.get('limit') === '500'), on.sv.map(s => s.get('offset')).join(','));
    ok('Escala ' + n, 'Se dibujan de a 50 y «Mostrar más» llega a las ' + n + ', todas distintas', inicial === Math.min(50, n) && todas.length === n && claves.size === n, inicial + ' → ' + todas.length);
    ok('Escala ' + n, 'Totales = suma de todas las páginas de la API', t[0].v === nf.format(e.n) && t[1].v === nf.format(e.ventas) && t[2].v === nf.format(e.sdisp) && t[3].v === nf.format(e.dep), JSON.stringify(t.map(x => x.v)) + ' vs ' + JSON.stringify(e));
    ok('Escala ' + n, 'Cada fila conserva su identidad (talle y color como texto) y no hay NaN/undefined/null', todas.every(f => f.key.startsWith('V:' + cods[3] + ':') && !/NaN|undefined|null/.test(JSON.stringify(f))));
    await cerrarDet(P);
  }
  await ctl('reset=1&n=2200'); on.sv.length = 0; await abrirDet(P, cods[3]); await abrirTab(P); await sleep(500);
  const parc = await P.evaluate(() => ({ aviso: (document.querySelector('.cds-var-parcial') || {}).innerText || '', tot: !!document.querySelector('.cds-var-totales'), txt: (document.querySelector('.cds-var-resumen') || {}).innerText || '', conc: !!document.querySelector('.cds-var-conc') }));
  ok('Parcial', '2200 variantes: se cargan 4 páginas (2000), avisa resultados parciales y NO calcula totales ni conciliación', on.sv.length === 4 && /Resultados parciales/.test(parc.aviso) && /2\.000 de 2\.200/.test(parc.aviso) && !parc.tot && /Totales no disponibles/.test(parc.txt) && !parc.conc, parc.aviso.slice(0, 120));
  await cerrarDet(P);
  await ctl('reset=1&n=1200&error=pagina2'); await abrirDet(P, cods[3]); await abrirTab(P); await sleep(500);
  const parc2 = await P.evaluate(() => ({ aviso: (document.querySelector('.cds-var-parcial') || {}).innerText || '', filas: document.querySelectorAll('.cds-var-fila').length, tot: !!document.querySelector('.cds-var-totales') }));
  ok('Parcial', 'Falla la 2.ª página: se muestran las 500 cargadas con aviso, sin totales y con «Volver a cargar»', /Resultados parciales/.test(parc2.aviso) && /falló una página/.test(parc2.aviso) && parc2.filas === 50 && !parc2.tot && /Volver a cargar/.test(parc2.aviso), parc2.aviso.slice(0, 140));
  await ctl('error=0'); await P.click('[data-fk=var_recargar]'); await esperaVar(P); await sleep(400);
  ok('Parcial', '«Volver a cargar» reintenta y, con las 3 páginas, aparecen los totales', await P.evaluate(() => !!document.querySelector('.cds-var-totales') && !document.querySelector('.cds-var-parcial')));
  await cerrarDet(P);

  // ============================ E) TALLES UNICOS, VACIO, ERRORES, ECO ============================
  await ctl('reset=1&modo=unicos'); await abrirDet(P, cods[4]); await abrirTab(P); await sleep(300);
  const un = await filas(P);
  ok('Talle único', 'Talles 99, TU y U se muestran como cualquier variante; 99 y TU llevan la marca «Talle único» y U no (no se asume que sean los únicos)', un.length === 3 && un.map(f => f.talle).sort().join() === '99,TU,U' && un.find(f => f.talle === '99').flags.includes('talle_unico') && un.find(f => f.talle === 'TU').flags.includes('talle_unico') && !un.find(f => f.talle === 'U').flags.includes('talle_unico'), JSON.stringify(un.map(f => [f.talle, f.codColor, f.flags.join('/')])));
  ok('Talle único', 'El color «00» (sin mapear) de talle único conserva su código y advierte', un.find(f => f.talle === 'U').codColor === 'color 00' && un.find(f => f.talle === 'U').flags.includes('color_sin_nombre'));
  ok('Estados', 'Con 3 variantes no aparecen búsqueda ni filtros (solo con más de 12, o desde C2 si el producto tiene señal de rotación)', !(await P.$('.cds-var-buscar')) || !!(await P.$('.cds-var-senal')));
  await cerrarDet(P);
  await ctl('reset=1&n=0'); await abrirDet(P, cods[4]); await abrirTab(P); const vacio = await texto(P);
  ok('Estados', 'Sin variantes: «Sin variantes con actividad en el período seleccionado.» (y sigue la nota de alcance)', /Sin variantes con actividad en el período seleccionado/.test(vacio) && /Variantes con actividad en el período/.test(vacio));
  await cerrarDet(P);
  await ctl('reset=1&n=20&error=500'); await abrirDet(P, cods[4]); await abrirTab(P); const e1 = await P.evaluate(() => ({ t: (document.querySelector('.cds-var-error') || {}).innerText || '', tabla: !!document.querySelector('.cds-var-t') }));
  ok('Estados', 'Error de la API: mensaje, sin tabla y botón «Reintentar»', /No se pudieron cargar las variantes/.test(e1.t) && /error simulado/.test(e1.t) && /Reintentar/.test(e1.t) && !e1.tabla, e1.t.slice(0, 100));
  const nErr = on.sv.length; await ctl('error=0'); await P.click('[data-fk=var_reintentar]'); await esperaVar(P); await sleep(300);
  ok('Estados', 'Reintentar vuelve a consultar y muestra las 20 variantes (el error no se había guardado)', on.sv.length === nErr + 1 && (await filas(P)).length === 20);
  await cerrarDet(P);
  for (const [alt, patron, nombre] of [['eco', /no confirmó las sucursales/, 'eco de sucursales distinto'], ['periodo', /otro período/, 'período distinto']]) {
    await ctl('reset=1&n=20&alterar=' + alt); await abrirDet(P, cods[5]); await abrirTab(P); const x = await P.evaluate(() => ({ t: (document.querySelector('.cds-var-error') || {}).innerText || '', filas: document.querySelectorAll('.cds-var-fila').length }));
    ok('Eco', 'API con ' + nombre + ': error explícito, ninguna fila ni total', patron.test(x.t) && x.filas === 0, x.t.slice(0, 120)); await cerrarDet(P);
  }
  await ctl('reset=1&n=5&alterar=duplicados'); await abrirDet(P, cods[5]); await abrirTab(P); const dup = await P.evaluate(() => ({ n: document.querySelectorAll('.cds-var-fila').length, aviso: (document.querySelector('.cds-var-inconsistente') || {}).innerText || '', tot: !!document.querySelector('.cds-var-totales') }));
  ok('Duplicados', 'Una repetida en la respuesta: se descarta (5 filas), se avisa y no se calculan totales', dup.n === 5 && /repetida/.test(dup.aviso) && !dup.tot, dup.aviso.slice(0, 100)); await cerrarDet(P);
  await ctl('reset=1&n=5&alterar=ajena'); await abrirDet(P, cods[5]); await abrirTab(P); const aj = await P.evaluate(() => ({ n: document.querySelectorAll('.cds-var-fila').length, aviso: (document.querySelector('.cds-var-inconsistente') || {}).innerText || '' }));
  ok('Duplicados', 'Una fila de otro producto se descarta y se avisa', aj.n === 5 && /otro producto/.test(aj.aviso)); await cerrarDet(P);
  await ctl('reset=1&n=700&alterar=total'); await abrirDet(P, cods[5]); await abrirTab(P); const tc = await P.evaluate(() => ({ aviso: (document.querySelector('.cds-var-parcial') || {}).innerText || '', tot: !!document.querySelector('.cds-var-totales') }));
  ok('Parcial', 'Si el total cambia entre páginas el resultado queda parcial y sin totales', /el total cambió/.test(tc.aviso) && !tc.tot); await cerrarDet(P);

  // ============================ F) BUSQUEDA, FILTROS, ORDEN (300 variantes) ============================
  await ctl('reset=1&n=300'); await abrirDet(P, cods[6]); await abrirTab(P); await sleep(400);
  const r300 = await apiTodo(cods[6]);
  ok('Filtros', 'Con más de 12 variantes aparecen búsqueda y filtros rápidos con sus cantidades', !!(await P.$('.cds-var-buscar')) && (await P.$$('.cds-var-chip')).length >= 4);
  await P.fill('.cds-var-buscar', '040'); await sleep(250); const b040 = await filas(P); const esp040 = r300.filter(r => String(r.Codigo_talle).includes('040') || String(r.Codigo_color).includes('040') || String(r.Nombre_color || '').toLowerCase().includes('040')).length;
  ok('Filtros', 'Buscar «040» muestra solo variantes con ese texto (ceros intactos) y la cuenta coincide con la API', b040.length === Math.min(50, esp040) && b040.every(f => f.talle.includes('040')) && (await texto(P)).includes('de ' + nf.format(esp040) + ' variantes que cumplen el filtro'), b040.length + '/' + esp040);
  ok('Filtros', 'Tras filtrar, cada fila conserva su clave completa (código, talle y color)', b040.every(f => /^V:[^:]+:040:/.test(f.key)));
  await P.fill('.cds-var-buscar', 'zzzz'); await sleep(200); ok('Filtros', 'Sin coincidencias: «Ninguna variante cumple el filtro.»', /Ninguna variante cumple el filtro/.test(await texto(P)));
  await P.fill('.cds-var-buscar', ''); await sleep(200);
  const chips = await P.evaluate(() => [...document.querySelectorAll('.cds-var-chip')].map(c => c.textContent));
  const nSin = r300.filter(r => SUC.reduce((a, c) => a + Math.max(0, r['Stock_ctro_' + c]), 0) === 0 && Math.max(0, r.Stock_ctro_0000 - r.Stock_fallados) === 0).length;
  await P.click('.cds-var-chip[data-chip=sin_stock]'); await sleep(250); const sin = await filas(P);
  ok('Filtros', '«Sin stock» muestra solo variantes sin stock disponible y su cuenta coincide con la API', sin.length === Math.min(50, nSin) && sin.every(f => f.est === 'sin_stock') && chips.some(c => c === 'Sin stock (' + nSin + ')'), chips.join(' | '));
  ok('Filtros', 'El filtro activo queda marcado (aria-pressed) y las ventas se siguen sumando en las sin stock', await P.evaluate(() => document.querySelector('.cds-var-chip[data-chip=sin_stock]').getAttribute('aria-pressed') === 'true') && sin.some(f => f.ventas !== '0'));
  await P.click('.cds-var-chip[data-chip=todas]'); await sleep(200);
  await P.click('.cds-var-ord[data-orden=ventas]'); await sleep(250); const ov = await filas(P); const vals = ov.map(f => Number(String(f.ventas).replace(/\./g, '').replace(/[^\d-]/g, '')));
  ok('Orden', 'Ordenar por ventas netas deja las mayores primero (descendente) y otro clic invierte', vals.every((v, i) => i === 0 || v <= vals[i - 1]) && (await P.evaluate(() => { document.querySelector('.cds-var-ord[data-orden=ventas]').click(); return true; })) && await (async () => { await sleep(250); const v2 = (await filas(P)).map(f => Number(String(f.ventas).replace(/\./g, '').replace(/[^\d-]/g, ''))); return v2.every((v, i) => i === 0 || v >= v2[i - 1]); })());
  ok('Filtros', 'El foco queda en el campo mientras se escribe (la tabla se redibuja sin re-renderizar el panel)', await (async () => { await P.focus('.cds-var-buscar'); await P.keyboard.type('S'); await sleep(200); return P.evaluate(() => document.activeElement.classList.contains('cds-var-buscar')); })());
  await cerrarDet(P);

  // ============================ G) CONCILIACION ============================
  await ctl('reset=1&modo=conciliar'); await abrirDet(P, cods[7]); await abrirTab(P); await sleep(300);
  await P.evaluate(() => { const d = document.querySelector('.cds-var-conc'); if (d) d.open = true; });
  const cc = await P.evaluate(() => (document.querySelector('.cds-var-conc') || {}).innerText || ''); const fprod = await P.evaluate(c => RT_OPORTUNIDADES.data.find(f => f.Codigo_producto === c), cods[7]);
  ok('Conciliación', 'Mismo período, sucursales y universo (3 variantes): ventas, stock en sucursales, depósito 90 y fallados coinciden con la fila del producto', /Ventas netas: \d+ en las variantes · \d+ en el producto · coincide/.test(cc) && /Depósito 90: \d+ en las variantes · \d+ en el producto · coincide/.test(cc) && /Fallados 93: \d+ en las variantes · \d+ en el producto · coincide/.test(cc) && /Stock en sucursales[^\n]*coincide/.test(cc), cc.replace(/\n/g, ' | ').slice(0, 200));
  ok('Conciliación', 'No se corrige ninguna cifra y se aclara el alcance de la comparación', /no se corrige ninguna cifra/.test(cc) && fprod.variantes === 3);
  await cerrarDet(P);
  await ctl('reset=1&n=20'); await abrirDet(P, cods[7]); await abrirTab(P); await sleep(300);
  await P.evaluate(() => { const d = document.querySelector('.cds-var-conc'); if (d) d.open = true; }); const cu = await P.evaluate(() => (document.querySelector('.cds-var-conc') || {}).innerText || '');
  ok('Conciliación', 'Universo distinto (20 variantes vs 3 del producto): NO se concilian los totales y se explica por qué', /No se concilian los totales: el universo de variantes difiere \(20 en esta consulta, 3 en el producto\)/.test(cu) && !/coincide/.test(cu), cu.replace(/\n/g, ' ').slice(0, 160));
  await cerrarDet(P);

  // ============================ H) SUCURSALES DISTINTAS ============================
  await P.evaluate(() => rtSucursalesAplicar(['0001', '0005', '0010', '0012'])); await sleep(3500);
  await ctl('reset=1&n=20'); on.sv.length = 0; const c8 = (await codigos(P))[0]; await abrirDet(P, c8); await abrirTab(P); await sleep(300);
  const sx = await P.evaluate(() => ({ eco: RT_OPORTUNIDADES.sucursales, ctx: document.querySelector('.cds-var-ctx').innerText }));
  ok('Sucursales', 'Con 4 sucursales elegidas se mandan exactamente las del eco de Oportunidades (no las 5 ni las 6)', on.sv.length === 1 && on.sv[0].get('sucursales') === '0001,0005,0010,0012' && sx.eco.join() === '0001,0005,0010,0012' && !/Centro/.test(sx.ctx), on.sv[0] && on.sv[0].get('sucursales'));
  await P.evaluate(() => document.querySelector('.cds-var-exp').click()); const sdet = await P.evaluate(() => document.querySelectorAll('[data-cds-var-suc]').length);
  ok('Sucursales', 'La distribución por sucursal muestra solo esas 4', sdet === 4);
  const exp4 = esperado(await apiTodo(c8, ['0001', '0005', '0010', '0012']), ['0001', '0005', '0010', '0012']), t4 = await totalesDom(P);
  ok('Sucursales', 'Los totales corresponden a las 4 sucursales (ventas y stock disponible)', t4[1].v === nf.format(exp4.ventas) && t4[2].v === nf.format(exp4.sdisp), JSON.stringify(t4.map(t => t.v)) + ' vs ' + JSON.stringify(exp4));
  await cerrarDet(P); await P.evaluate(() => rtSucursalesAplicar(['0001', '0005', '0010', '0012', '0014'])); await sleep(3500);

  // ============================ I) CONSULTAS SIMULTANEAS / CANCELACION ============================
  await ctl('reset=1&n=20&retraso=1500'); on.sv.length = 0; on.fallidas.length = 0; const cA = (await codigos(P))[1], cB = (await codigos(P))[2];
  await abrirDet(P, cA); await P.click('#cdsTab_variantes'); await sleep(300); const cargando = await P.evaluate(() => !!document.querySelector('.cds-skel'));
  await cerrarDet(P); await abrirDet(P, cB); await abrirTab(P, 6000); await esperaVar(P, 8000); await sleep(300);
  const prodVisto = await P.evaluate(() => ({ prod: document.querySelector('.cds-var').dataset.cdsProd, claves: [...document.querySelectorAll('.cds-var-fila')].map(r => r.dataset.cdsVar.split(':')[1]) }));
  ok('Simultáneas', 'Se muestra «Cargando variantes…» mientras espera, y al cambiar de producto el detalle de A no se mezcla con B', cargando && prodVisto.prod === 'P:' + cB && prodVisto.claves.length === 20 && prodVisto.claves.every(c => c === cB), JSON.stringify([prodVisto.prod, prodVisto.claves.length]));
  ok('Simultáneas', 'La consulta de A en vuelo se cancela al cerrar el detalle (solicitud abortada)', on.fallidas.includes(cA), on.fallidas.join());
  ok('Simultáneas', 'Salir de la pestaña cancela la consulta en curso y volver a entrar la reanuda sin error', await (async () => { await cerrarDet(P); await ctl('reset=1&n=20&retraso=1500'); await abrirDet(P, cods[3]); await P.click('#cdsTab_variantes'); await sleep(200); await P.click('#cdsTab_resumen'); await sleep(300); const e = await P.evaluate(() => CDS_VARIANTES._estado()); await P.click('#cdsTab_variantes'); await esperaVar(P, 8000); return e.vuelo === false && (await filas(P)).length === 20; })());
  await cerrarDet(P);
  await ctl('reset=1&n=20&retraso=1500'); await abrirDet(P, cods[8]); await P.click('#cdsTab_variantes'); await sleep(300);
  await P.evaluate(() => document.querySelector('.cds-nav[data-cds-view="rotaciones"]').click()); await sleep(1200);
  ok('Simultáneas', 'Salir de Oportunidades con una consulta en vuelo la cancela y cierra el detalle', (await P.evaluate(() => CDS_VARIANTES._estado().vuelo)) === false && (await P.$$('.cds-dr')).length === 0);
  await P.evaluate(() => document.querySelector('.cds-nav[data-cds-view="oportunidades"]').click()); await sleep(3000); await ctl('reset=1&n=20');

  // ============================ J) CEROS INICIALES EN EL CODIGO DEL PRODUCTO ============================
  const ceros = await abrir(BASE, true, 1280, 900, async page => { await page.route('**/analisis/oportunidades*', async route => { const r = await route.fetch(); const t = await r.text(); await route.fulfill({ response: r, body: t.replace(/"Codigo_producto":"\d+"/, '"Codigo_producto":"00123"') }); }); });
  const Pc = ceros.page; await abrirDet(Pc, '00123'); await abrirTab(Pc); await sleep(300); const cz = await Pc.evaluate(() => ({ prod: document.querySelector('.cds-var').dataset.cdsProd, k: document.querySelector('.cds-var-fila').dataset.cdsVar }));
  ok('Ceros', 'Producto «00123»: se pide codigo=00123, la clave es P:00123 y las variantes V:00123:…:…', ceros.sv.length === 1 && ceros.sv[0].get('codigo') === '00123' && cz.prod === 'P:00123' && /^V:00123:/.test(cz.k), ceros.sv[0] && ceros.sv[0].get('codigo') + ' ' + cz.k);
  await ceros.ctx.close();

  // ============================ K) TECLADO, FOCO Y ESTADO ============================
  await ctl('reset=1&n=300'); await abrirDet(P, cods[9]); await P.focus('#cdsTab_resumen'); await P.keyboard.press('End'); await sleep(900);
  ok('Teclado', 'Con la flecha/Fin se llega a «Talle y color» y se consulta una sola vez', (await P.evaluate(() => document.activeElement.id)) === 'cdsTab_variantes' && (await P.evaluate(() => document.querySelector('.cds-tabs [aria-selected=true]').id)) === 'cdsTab_variantes');
  await esperaVar(P); await P.focus('.cds-var-exp'); await P.keyboard.press('Enter'); await sleep(250);
  ok('Teclado', 'Enter en el botón de una fila despliega la distribución por sucursal (aria-expanded) y el foco no se pierde', await P.evaluate(() => document.querySelector('.cds-var-exp').getAttribute('aria-expanded') === 'true' && document.activeElement.classList.contains('cds-var-exp')));
  let giros = 0, dentro = true; for (let i = 0; i < 40; i++) { await P.keyboard.press('Tab'); giros++; if (!(await P.evaluate(() => !!document.activeElement.closest('.cds-dr')))) { dentro = false; break; } }
  ok('Teclado', 'El foco queda atrapado en el panel mientras se recorre la pestaña con Tab', dentro, giros + ' Tab');
  await P.keyboard.press('Escape'); await sleep(400);
  ok('Teclado', 'Escape cierra el detalle y devuelve el foco al botón del producto', (await P.$$('.cds-dr')).length === 0 && (await P.evaluate(c => document.activeElement.getAttribute('data-detalle-codigo') === c, cods[9])));
  ok('Estados', 'La consola no registró errores durante toda la validación con la bandera encendida', on.errores.length === 0, on.errores.join(' | '));

  // ============================ L) BANDERA APAGADA IDENTICA A B4 ============================
  if (REF) {
    await ctl('reset=1&n=20'); const off = await abrir(BASE, false), ref = await abrir(REF, false);
    const dom = async o => o.page.evaluate(() => { const h = document.getElementById('rtPanelHost'); return { texto: h ? h.innerText.replace(/\d{1,2}:\d{2}/g, '') : '', n: h ? h.querySelectorAll('*').length : 0, cds: document.documentElement.classList.contains('cds-v3'), scripts: [...document.scripts].filter(s => /cds\//.test(s.src)).length, links: [...document.querySelectorAll('link')].filter(l => /cds\//.test(l.href)).length, tab: !!document.getElementById('cdsTab_variantes'), v: typeof window.CDS_VARIANTES }; });
    const a = await dom(off), b = await dom(ref);
    ok('Bandera apagada', 'Con la bandera apagada no se carga ningún archivo cds/ ni existe la pestaña ni el módulo', !a.cds && a.scripts === 0 && a.links === 0 && !a.tab && a.v === 'undefined');
    ok('Bandera apagada', 'La lista de Oportunidades es idéntica a la referencia B4 (texto y cantidad de nodos)', a.texto === b.texto && a.n === b.n, a.n + ' vs ' + b.n);
    const filaOn = async o => { await o.page.evaluate(() => { const b = [...document.querySelectorAll('[data-detalle-codigo]')].find(x => x.offsetParent); if (b) b.click(); }); await sleep(900); return o.page.evaluate(() => { const h = document.getElementById('rtPanelHost'); return h.innerText.replace(/\d{1,2}:\d{2}/g, '') + '|' + h.querySelectorAll('*').length; }); };
    const fa = await filaOn(off), fb = await filaOn(ref);
    ok('Bandera apagada', 'La fila expandida (detalle clásico) es idéntica a la referencia', fa === fb);
    ok('Bandera apagada', 'No se consulta stock-ventas ni se agregan consultas respecto de la referencia', off.sv.length === 0 && ref.sv.length === 0 && off.opp.length === ref.opp.length, off.opp.length + ' vs ' + ref.opp.length);
    ok('Bandera apagada', 'Sin errores de consola', off.errores.length === 0, off.errores.join('|')); await off.ctx.close(); await ref.ctx.close();
  }

  // ============================ M) MATRIZ DE TAMAÑOS ============================
  for (const [w, h] of [[320, 640], [375, 812], [430, 932], [768, 1024], [1024, 768], [1280, 900], [1920, 1080]]) {
    await ctl('reset=1&n=20'); const o = await abrir(BASE, true, w, h), p = o.page, cd = await codigos(p);
    await p.evaluate(c => { [...document.querySelectorAll('[data-detalle-codigo="' + c + '"]')].find(x => x.offsetParent).click(); }, cd[0]); await sleep(700); await p.click('#cdsTab_variantes'); await esperaVar(p); await sleep(300);
    const m = await p.evaluate(() => { const dr = document.querySelector('.cds-dr'), cu = document.getElementById('cdsDrCuerpo'), r = dr.getBoundingClientRect(), tab = document.querySelector('.cds-var-tabla'); const chicos = [...document.querySelectorAll('.cds-var button, .cds-var summary, .cds-var input')].filter(x => x.offsetParent && (x.getBoundingClientRect().width < 44 || x.getBoundingClientRect().height < 44)).map(x => (x.className || x.tagName) + ' ' + Math.round(x.getBoundingClientRect().width) + 'x' + Math.round(x.getBoundingClientRect().height)); return { pagina: document.documentElement.scrollWidth <= window.innerWidth + 1, panel: r.left >= -1 && r.right <= window.innerWidth + 1, cuerpoSinX: cu.scrollWidth <= cu.clientWidth + 1, tablaDesplaza: tab ? tab.scrollWidth > tab.clientWidth : false, chicos }; });
    ok('Tamaños ' + w + '×' + h, 'La pestaña cabe en el panel, la página no se desborda y no hay desborde horizontal fuera de la tabla', m.pagina && m.panel && m.cuerpoSinX, JSON.stringify({ tablaDesplaza: m.tablaDesplaza }));
    if (w <= 900) ok('Tamaños ' + w + '×' + h, 'Controles táctiles de al menos 44 px (chips, ordenar, expandir, actualizar)', m.chicos.filter(c => !/cds-var-ord/.test(c) || false).length === 0, m.chicos.slice(0, 4).join(' ; '));
    ok('Tamaños ' + w + '×' + h, 'Sin errores de consola', o.errores.length === 0, o.errores.join('|')); await o.ctx.close();
  }

  await ctl('reset=1'); await browser.close();
  const fallos = res.filter(r => !r.ok); fs.writeFileSync(path.join(OUT, 'validacion-c1.json'), JSON.stringify({ fecha: new Date().toISOString(), total: res.length, ok: res.length - fallos.length, resultados: res }, null, 1));
  console.log('\nRESUMEN: ' + (res.length - fallos.length) + '/' + res.length + ' correctas' + (fallos.length ? ' — FALLAN: ' + fallos.map(f => f.grupo + ': ' + f.nombre).join(' || ') : '')); process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('ERROR FATAL', e); process.exit(2); });
