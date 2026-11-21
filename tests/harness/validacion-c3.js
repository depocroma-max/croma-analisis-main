'use strict';
// Validacion de la Etapa C3 (tarjetas móviles, información progresiva y accesibilidad de «Talle y color», bandera cds-v3). HARNESS local, datos SINTETICOS:
// /analisis/stock-ventas y /analisis/rotaciones SIMULADOS (variantes-fixture.js). No consulta produccion ni genera rotaciones reales.
//   1) node tests/harness/servidor.js --puerto=8812   2) referencia C2 (213a7f2) en --base=8813   3) node tests/harness/validacion-c3.js --puerto=8812 [--base=8813] [--salida=<carpeta>]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const BASE = 'http://127.0.0.1:' + arg('puerto', '8812'), REF = arg('base') ? 'http://127.0.0.1:' + arg('base') : null;
const OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'c3')); fs.mkdirSync(OUT, { recursive: true });
const res = []; const ok = (g, n, c, d) => { res.push({ grupo: g, nombre: n, ok: !!c, detalle: d == null ? '' : String(d).slice(0, 300) }); console.log((c ? 'PASS ' : 'FAIL ') + '[' + g + '] ' + n + (d != null && d !== '' ? '  [' + String(d).slice(0, 170) + ']' : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nf = new Intl.NumberFormat('es-AR');
const SUC = ['0001', '0005', '0010', '0012', '0014'];
let PP = null;
const ctl = async qs => { const r = await (await fetch(BASE + '/__h/variantes?' + qs)).json(); if (PP && /reset=1|(^|&)n=|modo=|alterar=|origen=/.test(qs)) await PP.evaluate(() => { if (window.CDS_VARIANTES) CDS_VARIANTES.invalidar(); }); return r; };
const ctlR = async qs => (await fetch(BASE + '/__h/rotaciones?' + qs)).json();

(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  async function abrir(base, bandera, w = 375, h = 812, opts = {}) {
    const movil = w <= 768;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: opts.dsf || (movil ? 2 : 1), isMobile: movil && w <= 760, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    await ctx.addInitScript(b => { try { localStorage.setItem('cds-v3', b ? '1' : '0'); } catch (e) { /* nada */ } }, bandera);
    const page = await ctx.newPage(); const o = { ctx, page, errores: [], sv: [], rot: [], opp: [], fallidas: [] };
    page.on('pageerror', e => o.errores.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g|status of 5|status of 403/.test(m.text())) o.errores.push('console ' + m.text().slice(0, 160)); });
    page.on('request', r => { const u = new URL(r.url()); if (u.pathname === '/analisis/stock-ventas') o.sv.push(u.searchParams); if (u.pathname === '/analisis/rotaciones') o.rot.push(u.searchParams); if (u.pathname === '/analisis/oportunidades') o.opp.push(u.searchParams); });
    page.on('requestfailed', r => { if (r.url().includes('stock-ventas')) o.fallidas.push(new URL(r.url()).searchParams.get('codigo')); });
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }); await sleep(1200);
    await page.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await sleep(3000);
    return o;
  }
  const codigos = p => p.evaluate(() => RT_OPORTUNIDADES.data.map(f => f.Codigo_producto));
  const inyectar = (p, cod, o) => p.evaluate(([cod, o]) => { const f = RT_OPORTUNIDADES.data.find(x => x.Codigo_producto === cod);
    const ac = { accion: 'revisar_rotacion', estado_origen: 'posible_rotacion', principal: o.principal !== false, prioridad: 'alta', nivel: 'producto', ejecutable: false, requiere_validacion_variante: true, origen: o.origen, destino: o.destino, cantidad_orientativa: o.cantidad == null ? null : o.cantidad, cantidad_validada_por_variante: false, motivo: 'Motivo sintético' };
    f.acciones = o.principal === false ? [{ accion: 'reponer_urgente', estado_origen: 'reposicion_urgente', principal: true, prioridad: 'alta', motivo: 'x' }, ac] : [ac];
    f.diagnostico_rotacion = { par_sugerido: { origen: { sucursal: o.origen, stock: 9 }, destino: { sucursal: o.destino, ventas: 7 }, cantidad_sugerida: o.cantidad == null ? null : o.cantidad }, pares: [{}, {}] }; }, [cod, o]);
  const quitarSenal = (p, cod) => p.evaluate(cod => { const f = RT_OPORTUNIDADES.data.find(x => x.Codigo_producto === cod); f.acciones = (f.acciones || []).filter(a => a.estado_origen !== 'posible_rotacion'); f.diagnostico_rotacion = null; }, cod);
  const abrirDet = async (p, c) => { await p.evaluate(c => { [...document.querySelectorAll('[data-detalle-codigo="' + c + '"]')].find(x => x.offsetParent).click(); }, c); await sleep(700); };
  const cerrarDet = async p => { await p.keyboard.press('Escape'); await sleep(400); };
  const esperaVar = async (p, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(() => !!document.querySelector('.cds-var-t, .cds-var-lista, .cds-var-error, .cds-var-vacio, .cds-var-parcial'))) { await sleep(150); return true; } await sleep(80); } return false; };
  const abrirTab = async p => { await p.click('#cdsTab_variantes'); return esperaVar(p); };
  const texto = p => p.evaluate(() => (document.getElementById('cdsDrCuerpo') || {}).innerText || '');
  const tarjetas = p => p.evaluate(() => [...document.querySelectorAll('li.cds-var-fila')].map(li => { const dd = k => { const e = li.querySelector('dd[data-cds-campo=' + k + ']'); return e ? e.textContent : null; };
    return { key: li.dataset.cdsVar, est: li.dataset.estado, talle: li.querySelector('[data-cds-campo=talle]').textContent, color: li.querySelector('.cds-var-color').textContent, cod: li.querySelector('[data-cds-campo=color]').textContent, ventas: dd('ventas'), stock: dd('stock'), dep: dd('dep90'), fall: dd('fallados'), estTxt: li.querySelector('.cds-var-est').textContent,
      flags: [...li.querySelectorAll('.cds-var-flag')].map(x => x.dataset.flag || x.textContent), rot: (li.querySelector('.cds-var-rot-l[data-rot]') || { dataset: {} }).dataset.rot || null, rotTxt: (li.querySelector('.cds-var-rot-l[data-rot]') || {}).innerText || '', sug: [...li.querySelectorAll('[data-sug]')].map(x => x.innerText), exp: li.querySelector('.cds-var-exp').getAttribute('aria-expanded') }; }));
  async function apiTodo(cod, suc = SUC) { let off = 0, total = null; const rows = []; do { const r = await (await fetch(BASE + '/analisis/stock-ventas?desde=2026-08-01&hasta=2026-11-21&codigo=' + encodeURIComponent(cod) + '&sucursales=' + suc.join(',') + '&limit=500&offset=' + off)).json(); rows.push(...r.data); total = r.paginacion.total; off += r.paginacion.devueltos; if (!r.data.length) break; } while (off < total); return rows; }
  const stockOrigen = f => { const m = /stock (-?[\d.]+)/.exec(f.rotTxt); return m ? Number(m[1].replace(/\./g, '')) : null; };
  const ventasDestino = f => { const m = /ventas (-?[\d.]+)/.exec(f.rotTxt); return m ? Number(m[1].replace(/\./g, '')) : null; };
  const contraste = (p, sels) => p.evaluate(sels => { // contraste WCAG de texto real (color de texto frente al fondo efectivo, mezclando transparencias)
    const num = s => s.match(/[\d.]+/g).map(Number);
    const mezcla = (c, base) => { const a = c.length > 3 ? c[3] : 1; return [0, 1, 2].map(i => Math.round(c[i] * a + base[i] * (1 - a))); };
    const fondo = e => { const cadena = []; for (let x = e; x; x = x.parentElement) cadena.push(x); let bg = [255, 255, 255]; for (let i = cadena.length - 1; i >= 0; i--) { const c = getComputedStyle(cadena[i]).backgroundColor; if (c && c !== 'transparent') { const v = num(c); if (v.length < 4 || v[3] > 0) bg = mezcla(v, bg); } } return bg; };
    const lum = rgb => { const f = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
    const out = []; sels.forEach(s => { [...document.querySelectorAll(s)].filter(e => e.offsetParent && e.textContent.trim()).slice(0, 6).forEach(e => { const fg = mezcla(num(getComputedStyle(e).color), fondo(e)), bg = fondo(e), a = lum(fg), b = lum(bg), r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); out.push({ s, r: Math.round(r * 100) / 100, t: e.textContent.trim().slice(0, 24) }); }); });
    return out; }, sels);
  const CONTRASTE = ['.cds-var-est', '.cds-var-flag', '.cds-var-flag--aviso', '.cds-var-rot-est', '.cds-var-rot-d', '.cds-var-sub', '.cds-var-sub--aviso', '.cds-var-card-m dt', '.cds-var-card-m dd', '.cds-var-cod', '.cds-var-color', '.cds-var-talle', '.cds-var-senal-t', '.cds-var-senal-res', '.cds-var-senal-p', '.cds-var-senal-ref', '.cds-var-nota summary', '.cds-var-ctx', '.cds-var-hora', '.cds-var-cuenta', '.cds-var-tot summary', '.cds-var-filtros summary', '.cds-var-orden-sel label', '.cds-var-exp--txt', '.cds-var-alt', '.cds-var-ir', '.cds-var-chip', '.cds-var-suc--origen td', '.cds-var-rol', '.cds-var-t th', '.cds-var-ord'];

  // ============================ A) TARJETAS EN MÓVIL ============================
  await ctl('reset=1&modo=rotacion'); await ctlR('reset=1&modo=normal');
  const on = await abrir(BASE, true, 375, 812), P = on.page, cods = await codigos(P); PP = P;
  const c1 = cods[0]; await inyectar(P, c1, { origen: '0001', destino: '0005', cantidad: 6, principal: true }); await abrirDet(P, c1);
  const nsv = on.sv.length; await abrirTab(P); const tc = await tarjetas(P), rows8 = await apiTodo(c1);
  ok('Tarjetas', 'En 375 px cada variante es una tarjeta (lista), no una tabla horizontal comprimida', (await P.$$('li.cds-var-fila')).length === 8 && !(await P.$('.cds-var-t')) && (await P.getAttribute('.cds-var', 'data-modo')) === 'tarjetas');
  const por = t => tc.find(x => x.talle === t);
  ok('Tarjetas', 'Cada tarjeta muestra talle y color (nombre y código como texto), ventas netas, stock en sucursales, Dep. 90 y Fallados 93 separados y el estado comercial', tc.every(x => x.talle && x.color && /^color /.test(x.cod) && x.ventas !== null && x.stock !== null && x.dep !== null && x.fall !== null && x.estTxt));
  const dis = r => SUC.reduce((a, c) => a + Math.max(0, r['Stock_ctro_' + c]), 0);
  ok('Tarjetas', 'Las cifras de cada tarjeta coinciden con la API (stock disponible sin negativos, Dep. 90 = combinado − fallados recortado a 0, ventas netas)', rows8.every(r => { const t = tc.find(x => x.key === 'V:' + c1 + ':' + r.Codigo_talle + ':' + r.Codigo_color); return t && t.ventas === nf.format(r.Ventas_total) && t.stock === nf.format(dis(r)) && t.dep === nf.format(Math.max(0, r.Stock_ctro_0000 - r.Stock_fallados)) && t.fall === nf.format(r.Stock_fallados); }));
  ok('Tarjetas', 'Estado de revisión de Rotaciones en la tarjeta: «Para revisar» (040: 5 y 4), «Sin stock en origen» (S: 0; M: −2 con «Saldo negativo en origen»), «Sin ventas en destino» (L: 0; XL: −1)', por('040').rot === 'revisar' && por('S').rot === 'sin_stock_origen' && por('M').rot === 'sin_stock_origen' && /Saldo negativo en origen/.test(por('M').rotTxt) && por('L').rot === 'sin_ventas_destino' && por('XL').rot === 'sin_ventas_destino' && /Ventas netas negativas en destino/.test(por('XL').rotTxt) && stockOrigen(por('M')) === -2);
  ok('Tarjetas', 'Ceros iniciales conservados (talle «040», clave V:' + c1 + ':040:02) y color sin mapear con su código y advertencia (39 · ZZ)', por('040').key === 'V:' + c1 + ':040:02' && por('39').cod === 'color ZZ' && por('39').color === 'Sin nombre de color' && por('39').flags.includes('color_sin_nombre'));
  ok('Tarjetas', 'Depósito 90 y fallados 93 siguen separados (variante 38: Dep. 90 = 9 − 2 = 7; Fallados 93 = 2; stock en origen 1)', por('38').dep === '7' && por('38').fall === '2' && stockOrigen(por('38')) === 1);
  ok('Tarjetas', 'Ventas negativas (XL: −1) y saldo negativo (M) se ven en la tarjeta con texto y signo (no solo color)', por('XL').ventas === nf.format(-1) && por('XL').flags.includes('ventas_negativas') && por('M').flags.includes('saldo_negativo') && !tc.some(x => !x.estTxt));
  ok('Tarjetas', 'Las ventas se suman aunque el stock sea 0: la API trae variantes con stock disponible 0 y ventas netas > 0 (S: 3) y la tarjeta las muestra como «Sin stock» con sus ventas', rows8.some(r => dis(r) === 0 && r.Ventas_total > 0) && por('S').est === 'sin_stock' && por('S').ventas === '3');
  const lay = await P.evaluate(() => { const ul = document.querySelector('.cds-var-lista'), li = document.querySelector('li.cds-var-fila'), dl = li.querySelector('.cds-var-card-m'); return { lista: ul.scrollWidth <= ul.clientWidth + 1, card: li.scrollWidth <= li.clientWidth + 1, cols: getComputedStyle(dl).gridTemplateColumns.split(' ').length, pagina: document.documentElement.scrollWidth <= innerWidth + 1 }; });
  ok('Tarjetas', 'Sin desborde horizontal (lista, tarjeta y página) y las 4 métricas en una fila a 375 px', lay.lista && lay.card && lay.pagina && lay.cols === 4, JSON.stringify(lay));
  ok('Consultas', 'Abrir la pestaña en móvil hace UNA consulta a stock-ventas y ninguna a Rotaciones', on.sv.length === nsv + 1 && on.rot.length === 0);
  const y1 = await P.evaluate(() => { const c = document.getElementById('cdsDrCuerpo'), t = document.querySelector('li.cds-var-fila'); return Math.round(t.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop); });
  ok('Compacto', 'La primera variante aparece a menos de 900 px del inicio del contenido (en C2 estaba a 1.862 px con 375×812)', y1 < 900, y1 + ' px');

  // ---- información progresiva ----
  const t0 = await texto(P);
  ok('Progresiva', 'Resumen de la señal siempre visible: origen, destino, cantidad orientativa y «por producto, requiere validación por variante», sin transferir ni crear envíos', /Origen: Paseo \(0001\) → Destino: Centenario \(0005\)/.test(t0) && /Cantidad orientativa: 6 u\. \(no es una cantidad para transferir\)/.test(t0) && /por producto y requiere validación por variante/.test(t0) && /no se crean envíos/.test(t0));
  ok('Progresiva', 'La explicación larga está plegada («Cómo leer esta señal», aria-expanded=false) y no ocupa lugar hasta abrirla', (await P.getAttribute('.cds-var-senal .cds-var-alt', 'aria-expanded')) === 'false' && !/No es una transferencia/.test(t0));
  await P.click('.cds-var-senal .cds-var-alt'); await sleep(150); const t1 = await texto(P);
  ok('Progresiva', 'Al abrirla aparece la explicación completa (stock en origen, depósito 90/fallados 93 fuera del stock de origen, «No es una transferencia», Rotaciones sin filtro de talle/color) y el foco queda en el botón', /No es una transferencia/.test(t1) && /depósito 90 y los fallados 93 no cuentan como stock de origen/.test(t1) && /Rotaciones no permite filtrar por talle y color/.test(t1) && (await P.evaluate(() => document.activeElement.classList.contains('cds-var-alt'))));
  await P.click('.cds-var-senal .cds-var-alt'); await sleep(100);
  ok('Progresiva', 'La advertencia de alcance («no se puede afirmar que la curva esté completa») sigue visible y se puede ampliar', /no se puede afirmar que la curva esté completa/.test(t0) && !!(await P.$('.cds-var-nota > summary')));
  ok('Progresiva', 'Los totales se pliegan en móvil pero su resumen conserva las cifras clave (variantes, ventas, stock, Dep. 90, Fallados 93)', /Totales · 8 variantes · ventas \d+ · stock suc\. \d+ · Dep\. 90 \d+ · Fallados 93 \d+/.test(t0) && (await P.evaluate(() => !document.querySelector('.cds-var-tot').open)));
  ok('Progresiva', 'Buscador siempre visible con etiqueta accesible, indicador «Mostrando 8 de 8 variantes» y filtros secundarios plegados', !!(await P.$('#cdsVarBuscar')) && (await P.getAttribute('#cdsVarBuscar', 'aria-label')) === 'Buscar por talle, color o código de color' && /Mostrando 8 de 8 variantes/.test(t0) && (await P.evaluate(() => !document.querySelector('.cds-var-filtros').open)));
  ok('Progresiva', 'Acceso claro a las sugerencias de Rotaciones para administradores (botón visible con aclaración de costo) y sin consultas automáticas', /Consultar sugerencias de Rotaciones/.test(t0) && /puede tardar y no se ejecuta sola/.test(t0) && on.rot.length === 0);
  ok('Orden DOM', 'En móvil el orden es señal → administrador → nota → totales → buscador/filtros → tarjetas → actualizar (el orden del DOM es el del foco)', await P.evaluate(() => { const r = document.querySelector('.cds-var'), ks = [...r.children].map(e => e.className.split(' ')[0]); const i = c => ks.indexOf(c); return i('cds-var-senal') < i('cds-var-sug') && i('cds-var-sug') < i('cds-var-nota') && i('cds-var-nota') < i('cds-var-resumen') && i('cds-var-resumen') < i('cds-var-cuerpo') && i('cds-var-cuerpo') < i('cds-var-barra'); }));

  // ---- filtros y orden en móvil ----
  await P.click('.cds-var-filtros > summary'); await sleep(150);
  const ch = await P.evaluate(() => ({ abiertos: document.querySelector('.cds-var-filtros').open, chips: [...document.querySelectorAll('.cds-var-chip[data-chip]')].map(c => c.textContent), sel: [...document.querySelectorAll('#cdsVarOrden option')].map(o => o.textContent), ordRot: document.querySelectorAll('.cds-var-ordenar').length && getComputedStyle(document.querySelector('.cds-var-ordenar')).display }));
  ok('Filtros', 'Los filtros se abren con el resumen «Filtros y orden»; chips con cantidades (Para revisar 3, Sin stock en origen 3, Sin ventas en destino 2) y selector «Ordenar por» accesible', ch.abiertos && ch.chips.includes('Para revisar (3)') && ch.chips.includes('Sin stock en origen (3)') && ch.chips.includes('Sin ventas en destino (2)') && ch.sel.includes('Stock en origen (mayor a menor)') && ch.sel.includes('Ventas en destino (mayor a menor)') && ch.sel.includes('Color y talle') && ch.ordRot === 'none', ch.sel.length + ' opciones');
  await P.selectOption('#cdsVarOrden', 'stockOrigen|-1'); await sleep(250); const so = (await tarjetas(P)).map(stockOrigen);
  ok('Filtros', 'Ordenar por «Stock en origen (mayor a menor)» deja 5,4,3,2,1,0,0,−2', JSON.stringify(so) === JSON.stringify([5, 4, 3, 2, 1, 0, 0, -2]), JSON.stringify(so));
  await P.selectOption('#cdsVarOrden', 'ventasDestino|-1'); await sleep(250); const vd = (await tarjetas(P)).map(ventasDestino);
  ok('Filtros', 'Ordenar por «Ventas en destino (mayor a menor)» deja 6,4,3,2,1,0,0,−1 y por «Ventas netas (menor a mayor)» ordena de menor a mayor', JSON.stringify(vd) === JSON.stringify([6, 4, 3, 2, 1, 0, 0, -1]) && await (async () => { await P.selectOption('#cdsVarOrden', 'ventas|1'); await sleep(200); const v = (await tarjetas(P)).map(x => Number(x.ventas.replace(/\./g, '').replace('−', '-'))); return v.every((x, i) => i === 0 || x >= v[i - 1]); })());
  await P.click('.cds-var-chip[data-chip=para_revisar]'); await sleep(200); const pr = await tarjetas(P);
  ok('Filtros', '«Para revisar» muestra solo 3 tarjetas con stock positivo en origen y ventas en destino y el contador dice «3 de 3 variantes que cumplen el filtro (8 en total)»', pr.length === 3 && pr.every(x => x.rot === 'revisar') && /Mostrando 3 de 3 variantes que cumplen el filtro \(8 en total\)/.test(await texto(P)), pr.length + '');
  await P.click('.cds-var-chip[data-chip=todas]'); await P.selectOption('#cdsVarOrden', 'color|1'); await sleep(200);
  await P.fill('#cdsVarBuscar', '040'); await sleep(250); const bq = await tarjetas(P);
  ok('Filtros', 'Buscar «040» en tarjetas: solo variantes con ese texto (ceros intactos), cada una con su clave completa', bq.length >= 1 && bq.every(x => x.talle.includes('040') && /^V:[^:]+:040:/.test(x.key)));
  await P.fill('#cdsVarBuscar', ''); await sleep(200);

  // ---- distribución por sucursal ----
  await P.click('li.cds-var-fila[data-cds-var$=":040:02"] .cds-var-exp'); await sleep(250);
  const ds = await P.evaluate(() => { const li = document.querySelector('li.cds-var-fila[data-cds-var$=":040:02"]'), b = li.querySelector('.cds-var-exp'); return { exp: b.getAttribute('aria-expanded'), foco: document.activeElement === b, filas: li.querySelectorAll('.cds-mini > tbody > tr').length, claves: li.querySelectorAll('[data-cds-var-suc]').length, rol: [...li.querySelectorAll('[data-rol]')].map(x => x.dataset.rol).join(), txt: li.querySelector('.cds-var-det').innerText, desborde: li.querySelector('.cds-var-det').scrollWidth <= li.querySelector('.cds-var-det').clientWidth + 1 }; });
  ok('Sucursales', 'La distribución por sucursal se despliega dentro de la tarjeta: 5 sucursales + Depósito 90 derivado + Fallados 93, origen y destino resaltados con texto, sin desborde y con el foco en el mismo botón', ds.exp === 'true' && ds.foco && ds.filas === 7 && ds.claves === 5 && ds.rol === 'origen,destino' && /Origen de la señal: stock de la variante/.test(ds.txt) && /Destino de la señal: ventas de la variante/.test(ds.txt) && /Depósito 90 \(derivado\)/.test(ds.txt) && ds.desborde, JSON.stringify({ filas: ds.filas, rol: ds.rol }));
  await P.click('li.cds-var-fila[data-cds-var$=":040:02"] .cds-var-exp'); await sleep(150);

  // ---- sugerencias manuales ----
  await P.click('.cds-var-sug button.cds-btn'); await sleep(1000); const logR = (await ctlR('')).log;
  const sg = await tarjetas(P);
  ok('Sugerencias', 'Consulta manual en móvil: una consulta con solo desde/hasta/codigo; la lista de sugerencias aparece y se marcan 4 tarjetas «Sugerida por Rotaciones» (040, S, 38, 99), S con aviso de stock de origen no positivo', on.rot.length === 1 && JSON.stringify([...on.rot[0].keys()].sort()) === JSON.stringify(['codigo', 'desde', 'hasta']) && sg.filter(x => x.sug.length).map(x => x.talle).sort().join() === '040,38,99,S' && /no es positivo/.test(sg.find(x => x.talle === 'S').sug.join(' ')) && logR[logR.length - 1].autorizacion === true);
  ok('Sugerencias', 'Foco tras consultar: queda dentro del bloque de sugerencias (no se pierde en el documento)', await P.evaluate(() => !!document.activeElement.closest('.cds-var-sug')) );
  await cerrarDet(P);

  // ============================ B) ESCENARIOS EN MÓVIL ============================
  const rendimiento = {};
  for (const n of [1, 20, 300, 1200]) {
    await ctl('reset=1&n=' + n); on.sv.length = 0; const cod = cods[10 + [1, 20, 300, 1200].indexOf(n)]; await abrirDet(P, cod); const t = Date.now(); await abrirTab(P); rendimiento[n] = Date.now() - t;
    const exp = await apiTodo(cod), pags = Math.ceil(n / 500); let inicial = (await P.$$('li.cds-var-fila')).length, g = 0; while (await P.$('.cds-var-mas') && g++ < 40) await P.click('.cds-var-mas');
    const todas = await tarjetas(P), res0 = await P.evaluate(() => (document.querySelector('.cds-var-tot > summary') || {}).textContent || '');
    const dep = exp.reduce((a, r) => a + Math.max(0, r.Stock_ctro_0000 - r.Stock_fallados), 0), ven = exp.reduce((a, r) => a + r.Ventas_total, 0);
    ok('Escala ' + n, n + ' variantes en tarjetas: ' + pags + ' página(s) de 500, de a 50, todas distintas y totales = suma de la API', on.sv.length === pags && inicial === Math.min(50, n) && todas.length === n && new Set(todas.map(x => x.key)).size === n && res0.includes('Totales · ' + nf.format(n) + ' variantes') && res0.includes('ventas ' + nf.format(ven)) && res0.includes('Dep. 90 ' + nf.format(dep)), res0.slice(0, 80));
    await cerrarDet(P);
  }
  ok('Rendimiento', 'Carga y primer dibujo en tarjetas (ms) con 1, 20, 300 y 1.200 variantes: ' + JSON.stringify(rendimiento), Object.values(rendimiento).every(v => v < 6000), JSON.stringify(rendimiento));
  const nodos = await (async () => { await ctl('reset=1&n=1200'); await P.evaluate(() => CDS_VARIANTES.invalidar()); await abrirDet(P, cods[14]); await abrirTab(P); const x = await P.evaluate(() => document.querySelectorAll('.cds-var *').length); await cerrarDet(P); return x; })();
  ok('Rendimiento', 'Con 1.200 variantes solo se dibujan 50 tarjetas por tanda (nodos del panel acotados)', nodos < 4000, nodos + ' nodos');

  await ctl('reset=1&n=2200'); await abrirDet(P, cods[15]); await abrirTab(P); await sleep(300);
  const pa = await P.evaluate(() => ({ aviso: (document.querySelector('.cds-var-parcial') || {}).innerText || '', rol: (document.querySelector('.cds-var-parcial') || {}).getAttribute && document.querySelector('.cds-var-parcial').getAttribute('role'), tot: !!document.querySelector('.cds-var-tot'), txt: (document.querySelector('.cds-var-resumen') || {}).innerText || '', visible: !!document.querySelector('.cds-var-parcial').offsetParent }));
  ok('Parcial', 'Resultados parciales (2200 variantes): aviso visible, rotulado, con «Volver a cargar», sin totales ni conciliación, y las tarjetas cargadas siguen disponibles', /Resultados parciales/.test(pa.aviso) && /2\.000 de 2\.200/.test(pa.aviso) && pa.visible && !pa.tot && /Totales no disponibles/.test(pa.txt) && (await P.$$('li.cds-var-fila')).length === 50);
  await cerrarDet(P);
  await ctl('reset=1&n=20&error=500'); await abrirDet(P, cods[16]); await abrirTab(P); const er = await P.evaluate(() => ({ t: (document.querySelector('.cds-var-error') || {}).innerText || '', rol: (document.querySelector('.cds-var-error') || { getAttribute: () => null }).getAttribute('role') }));
  ok('Error', 'Error de la API en móvil: mensaje visible (role=alert) y botón «Reintentar»; sin tarjetas', /No se pudieron cargar las variantes/.test(er.t) && er.rol === 'alert' && /Reintentar/.test(er.t) && !(await P.$('li.cds-var-fila')));
  await ctl('error=0'); await P.click('[data-fk=var_reintentar]'); await esperaVar(P); ok('Error', 'Reintentar carga las 20 variantes', (await P.$$('li.cds-var-fila')).length === 20); await cerrarDet(P);
  await ctl('reset=1&n=0'); await abrirDet(P, cods[17]); await abrirTab(P); ok('Vacío', 'Sin variantes: mensaje en móvil, con la nota de alcance', /Sin variantes con actividad en el período seleccionado/.test(await texto(P)) && /Variantes con actividad en el período/.test(await texto(P))); await cerrarDet(P);
  await ctl('reset=1&modo=rotacion&alterar=faltante'); await abrirDet(P, cods[18]); await inyectar(P, cods[18], { origen: '0001', destino: '0005', cantidad: 6 }); await P.keyboard.press('Escape'); await abrirDet(P, cods[18]); await abrirTab(P); const fl = await tarjetas(P);
  ok('Faltantes', 'Datos faltantes en tarjetas: «Datos incompletos» con «—» (no ceros inventados)', fl.filter(x => x.rot === 'datos_incompletos').length === 2 && fl.some(x => /stock —/.test(x.rotTxt)) && fl.some(x => /ventas —/.test(x.rotTxt)) && fl.some(x => x.flags.includes('datos_faltantes'))); await cerrarDet(P);
  await ctl('reset=1&modo=unicos'); await abrirDet(P, cods[19]); await abrirTab(P); const un = await tarjetas(P);
  ok('Talle único', 'Talles únicos 99 y TU (y U) en tarjetas; 99 y TU con la marca; el color 00 sin mapear conserva su código', un.length === 3 && un.find(x => x.talle === '99').flags.includes('talle_unico') && un.find(x => x.talle === 'TU').flags.includes('talle_unico') && !un.find(x => x.talle === 'U').flags.includes('talle_unico') && un.find(x => x.talle === 'U').cod === 'color 00'); await cerrarDet(P);
  // secundaria, sin señal, usuario no administrador
  await ctl('reset=1&modo=rotacion'); await inyectar(P, cods[20], { origen: '0001', destino: '0005', cantidad: null, principal: false }); await abrirDet(P, cods[20]); await abrirTab(P);
  ok('Señal', 'Señal secundaria sin cantidad en móvil: «acción secundaria del producto» y «sin cantidad orientativa»', !!(await P.$('.cds-var-senal[data-cds-senal=secundaria]')) && /sin cantidad orientativa/.test(await texto(P))); await cerrarDet(P);
  await quitarSenal(P, cods[21]); await abrirDet(P, cods[21]); await abrirTab(P);
  ok('Señal', 'Sin señal: ni aviso ni líneas de revisión; el buscador y los filtros siguen disponibles en móvil', !(await P.$('.cds-var-senal')) && (await P.$$('.cds-var-rot-l')).length === 0 && !!(await P.$('#cdsVarBuscar'))); await cerrarDet(P);
  await P.evaluate(() => rtSucursalesAplicar(['0005', '0010', '0012', '0014'])); await sleep(3500); await ctl('reset=1&modo=rotacion'); on.sv.length = 0;
  const cx = (await codigos(P))[0]; await inyectar(P, cx, { origen: '0001', destino: '0005', cantidad: 6 }); await abrirDet(P, cx); await abrirTab(P); const ex = await tarjetas(P);
  ok('Excluidas', 'Sucursal de origen excluida: se manda exactamente la selección, la señal avisa que no se puede analizar por variante y las tarjetas no llevan línea de revisión', on.sv.length === 1 && on.sv[0].get('sucursales') === '0005,0010,0012,0014' && /no está entre las sucursales consideradas/.test(await texto(P)) && ex.length === 8 && ex.every(x => !x.rot)); await cerrarDet(P);
  await P.evaluate(() => rtSucursalesAplicar(['0001', '0005', '0010', '0012', '0014'])); await sleep(3500); await ctl('reset=1&modo=rotacion');
  const nadm = await abrir(BASE, true, 375, 812), PN = nadm.page, cn = (await codigos(PN))[0]; await PN.evaluate(() => { window.getUser = () => ({ rol: 'jefe', usuario: 'jefe' }); }); await inyectar(PN, cn, { origen: '0001', destino: '0005', cantidad: 6 }); await abrirDet(PN, cn); await abrirTab(PN);
  ok('Roles', 'Usuario no administrador en móvil: ve la señal y las tarjetas con revisión, sin la opción de consultar Rotaciones ni consultas a Rotaciones', !!(await PN.$('.cds-var-senal')) && !(await PN.$('.cds-var-sug')) && (await PN.$$('li.cds-var-fila')).length === 8 && nadm.rot.length === 0); await nadm.ctx.close();
  // consultas simultáneas y caché en móvil
  await ctl('reset=1&n=20&retraso=1500'); on.fallidas.length = 0; const cA = (await codigos(P))[22], cB = (await codigos(P))[23];
  await abrirDet(P, cA); await P.click('#cdsTab_variantes'); await sleep(300); const cargando = await P.evaluate(() => { const s = document.querySelector('.cds-skel'); return !!s && s.getAttribute('role') === 'status' && s.getAttribute('aria-busy') === 'true'; });
  await cerrarDet(P); await abrirDet(P, cB); await abrirTab(P); await sleep(300); const claves = await P.evaluate(() => [...document.querySelectorAll('li.cds-var-fila')].map(l => l.dataset.cdsVar.split(':')[1]));
  ok('Simultáneas', 'Cargando (role=status, aria-busy) y, al cambiar de producto, la consulta de A se cancela y solo se ven tarjetas de B', cargando && claves.length === 20 && claves.every(c => c === cB) && on.fallidas.includes(cA), JSON.stringify([cargando, claves.length, on.fallidas]));
  await cerrarDet(P); await ctl('reset=1&n=20'); await P.evaluate(() => CDS_VARIANTES.invalidar()); await abrirDet(P, cB); await abrirTab(P); const nC = on.sv.length; await cerrarDet(P); await abrirDet(P, cB); await abrirTab(P);
  ok('Caché', 'Cerrar y reabrir el mismo producto en móvil no vuelve a consultar (caché de 5 min) y «Actualizar» (al final de la lista) consulta una vez más', on.sv.length === nC && await (async () => { await P.click('[data-fk=var_actualizar]'); await esperaVar(P); await sleep(300); return on.sv.length === nC + 1; })()); await cerrarDet(P);

  // ============================ C) TABLET Y ESCRITORIO: TABLA ============================
  for (const [w, h] of [[768, 1024], [1024, 768], [1280, 900], [1920, 1080]]) {
    await ctl('reset=1&modo=rotacion'); const o = await abrir(BASE, true, w, h), p = o.page, cd = await codigos(p); await inyectar(p, cd[0], { origen: '0001', destino: '0005', cantidad: 6 }); await abrirDet(p, cd[0]); await abrirTab(p); await sleep(200);
    const m = await p.evaluate(() => { const tb = document.querySelector('.cds-var-tabla'), cu = document.getElementById('cdsDrCuerpo'), dr = document.querySelector('.cds-dr').getBoundingClientRect(); return { tabla: !!document.querySelector('.cds-var-t'), tarjetas: !!document.querySelector('.cds-var-lista'), scrollTabla: tb ? tb.scrollWidth > tb.clientWidth + 1 : null, cuerpoX: cu.scrollWidth > cu.clientWidth + 1, pagina: document.documentElement.scrollWidth > innerWidth + 1, panel: dr.left >= -1 && dr.right <= innerWidth + 1, totAbierto: document.querySelector('.cds-var-tot').open, filtrosAbiertos: document.querySelector('.cds-var-filtros').open, orden: !!document.querySelector('.cds-var-ord'), ordRot: !!document.querySelector('.cds-var-ord-rot'), sel: !!document.querySelector('#cdsVarOrden'), busca: !!document.querySelector('#cdsVarBuscar') }; });
    ok('Tablet/escritorio ' + w, 'Se mantiene la tabla (no tarjetas), sin desborde horizontal de página, de panel ni de tabla; filtros, búsqueda y ordenamiento por encabezados y por señal conservados y abiertos', m.tabla && !m.tarjetas && m.scrollTabla === false && !m.cuerpoX && !m.pagina && m.panel && m.totAbierto && m.filtrosAbiertos && m.orden && m.ordRot && !m.sel && m.busca, JSON.stringify(m));
    await o.ctx.close();
  }

  // ============================ D) ACCESIBILIDAD ============================
  await ctl('reset=1&modo=rotacion'); const ac = await abrir(BASE, true, 375, 812), PA = ac.page, ca = await codigos(PA); const ca0 = ca[0]; await inyectar(PA, ca0, { origen: '0001', destino: '0005', cantidad: 6 }); await abrirDet(PA, ca0); await abrirTab(PA); await sleep(300);
  const live = await PA.evaluate(() => { const r = document.querySelector('.cds-dr [data-cds-anuncio]'); return { dentro: !!r, rol: r && r.getAttribute('role'), live: r && r.getAttribute('aria-live'), txt: r ? r.textContent : '' }; });
  ok('Teclado/AT', 'Hay una región viva DENTRO del diálogo y anuncia el resultado de la carga («Variantes cargadas: 8.»)', live.dentro && live.live === 'polite' && live.rol === 'status' && /Variantes cargadas: 8\./.test(live.txt), live.txt);
  // recorrido por teclado
  await PA.focus('#cdsTab_resumen'); await PA.keyboard.press('End'); await sleep(600); await esperaVar(PA);
  const foco = []; let fueraDeDialogo = false; for (let i = 0; i < 60; i++) { await PA.keyboard.press('Tab'); const r = await PA.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { dentro: !!a.closest('.cds-dr'), tag: a.tagName + '.' + (a.className || '').toString().split(' ')[0], outline: cs.outlineStyle, ow: parseFloat(cs.outlineWidth), sombra: cs.boxShadow !== 'none', w: Math.round(a.getBoundingClientRect().width), h: Math.round(a.getBoundingClientRect().height), vis: a.getBoundingClientRect().width > 0 }; }); if (!r.dentro) fueraDeDialogo = true; foco.push(r); }
  const sinIndicador = foco.filter(f => !(f.outline !== 'none' && f.ow >= 2) && !f.sombra);
  ok('Teclado', 'Con Tab se recorre toda la pestaña (≥ 20 elementos distintos: señal, administrador, resumen, buscador, filtros, tarjetas) y el foco nunca sale del diálogo', !fueraDeDialogo && foco.some(f => /^SUMMARY/.test(f.tag)) && foco.some(f => /^INPUT\.cds-var-buscar/.test(f.tag)) && foco.some(f => /^BUTTON\.cds-var-exp/.test(f.tag)) && foco.some(f => /^BUTTON\.cds-btn/.test(f.tag)), [...new Set(foco.map(f => f.tag))].slice(0, 10).join(' '));
  ok('Foco visible', 'Todos los elementos enfocables muestran un indicador de foco visible (contorno ≥ 2 px o sombra)', sinIndicador.length === 0, sinIndicador.slice(0, 3).map(f => f.tag + ' ' + f.outline + ' ' + f.ow).join(' ; '));
  ok('Táctil', 'Todos los controles enfocables miden al menos 44 px de alto (y 44 de ancho los botones sueltos)', foco.filter(f => f.vis && (f.h < 44 || (/^BUTTON/.test(f.tag) && f.w < 44))).length === 0, foco.filter(f => f.vis && (f.h < 44 || (/^BUTTON/.test(f.tag) && f.w < 44))).slice(0, 3).map(f => f.tag + ' ' + f.w + 'x' + f.h).join(' ; '));
  // filtros con teclado
  await PA.focus('.cds-var-filtros > summary'); await PA.keyboard.press('Enter'); await sleep(150); const abierto1 = await PA.evaluate(() => document.querySelector('.cds-var-filtros').open && document.activeElement.tagName === 'SUMMARY');
  await PA.keyboard.press('Space'); await sleep(150); const cerrado2 = await PA.evaluate(() => !document.querySelector('.cds-var-filtros').open && document.activeElement.tagName === 'SUMMARY');
  ok('Teclado', 'Enter y Espacio abren y cierran «Filtros y orden» y el foco permanece en el resumen', abierto1 && cerrado2);
  await PA.focus('.cds-var-senal .cds-var-alt'); await PA.keyboard.press('Enter'); await sleep(150);
  ok('Teclado', 'Enter en «Cómo leer esta señal» la abre (aria-expanded=true) y el foco no se pierde', (await PA.getAttribute('.cds-var-senal .cds-var-alt', 'aria-expanded')) === 'true' && (await PA.evaluate(() => document.activeElement.classList.contains('cds-var-alt'))));
  await PA.keyboard.press('Enter'); await sleep(100);
  await PA.focus('li.cds-var-fila .cds-var-exp'); await PA.keyboard.press('Enter'); await sleep(250); const expF = await PA.evaluate(() => ({ exp: document.querySelector('li.cds-var-fila .cds-var-exp').getAttribute('aria-expanded'), foco: document.activeElement.classList.contains('cds-var-exp') && document.activeElement.closest('li').dataset.cdsVar === document.querySelector('li.cds-var-fila').dataset.cdsVar }));
  ok('Foco', 'Abrir la distribución con Enter conserva el foco en el botón de la misma variante tras redibujar', expF.exp === 'true' && expF.foco, JSON.stringify(expF));
  await PA.focus('#cdsVarBuscar'); await PA.keyboard.type('S'); await sleep(250); const an1 = await PA.evaluate(() => ({ foco: document.activeElement.id, anuncio: document.querySelector('.cds-dr [data-cds-anuncio]').textContent }));
  ok('Teclado/AT', 'Escribir en el buscador mantiene el foco y anuncia «Mostrando N de 8 variantes…» en la región viva', an1.foco === 'cdsVarBuscar' && /Mostrando \d+ de \d+ variantes/.test(an1.anuncio), an1.anuncio);
  await PA.fill('#cdsVarBuscar', ''); await sleep(150);
  await PA.focus('.cds-var-sug button.cds-btn'); await PA.keyboard.press('Enter'); await sleep(1000);
  ok('Teclado/AT', 'Consultar sugerencias con el teclado: el foco queda dentro del bloque y la región viva anuncia «Sugerencias de Rotaciones: 5.»', (await PA.evaluate(() => !!document.activeElement.closest('.cds-var-sug'))) && /Sugerencias de Rotaciones: 5\./.test(await PA.evaluate(() => document.querySelector('.cds-dr [data-cds-anuncio]').textContent)));
  await PA.keyboard.press('Escape'); await sleep(400);
  ok('Foco', 'Escape cierra el detalle y el foco vuelve al botón del producto en la lista', (await PA.$$('.cds-dr')).length === 0 && (await PA.evaluate(c => document.activeElement.getAttribute('data-detalle-codigo') === c, ca0)));
  // contraste
  await abrirDet(PA, ca0); await abrirTab(PA); await PA.click('.cds-var-senal .cds-var-alt'); await PA.click('.cds-var-filtros > summary'); await PA.click('li.cds-var-fila .cds-var-exp'); await PA.click('.cds-var-sug button.cds-btn').catch(() => {}); await sleep(900);
  const ct = await contraste(PA, CONTRASTE), malos = ct.filter(x => x.r < 4.5);
  ok('Contraste', 'Todo el texto de la pestaña en móvil (' + ct.length + ' muestras: estados, avisos, métricas, señal, resúmenes, botones) tiene contraste ≥ 4,5:1; mínimo ' + Math.min(...ct.map(x => x.r)), malos.length === 0 && ct.length > 40, malos.slice(0, 4).map(x => x.s + ' ' + x.r + ' «' + x.t + '»').join(' ; '));
  const sinTexto = await PA.evaluate(() => [...document.querySelectorAll('.cds-var-est, .cds-var-rot-est, .cds-var-flag, [data-rol] .cds-var-rol, .cds-var-chip[aria-pressed]')].filter(e => e.offsetParent && !e.textContent.trim()).length);
  ok('Sin color', 'Ningún estado depende solo del color: todos los indicadores (estado, revisión, avisos, filtros, origen/destino) llevan texto; los filtros activos usan aria-pressed', sinTexto === 0 && await PA.evaluate(() => [...document.querySelectorAll('.cds-var-chip[data-chip]')].every(c => c.hasAttribute('aria-pressed'))));
  await PA.keyboard.press('Escape'); await ac.ctx.close();

  // reflujo y texto ampliado al 200 % / 400 % (equivalente a 1280→640 y 1280→320 CSS px)
  for (const [w, h, nombre] of [[640, 450, '200 % (equivale a 1280 px)'], [320, 256, '400 % (equivale a 1280 px)']]) {
    await ctl('reset=1&modo=rotacion'); const z = await abrir(BASE, true, w, h, { dsf: 2 }), pz = z.page, cz = await codigos(pz); await inyectar(pz, cz[0], { origen: '0001', destino: '0005', cantidad: 6 }); await abrirDet(pz, cz[0]); await abrirTab(pz); await sleep(300);
    const r = await pz.evaluate(() => { const cu = document.getElementById('cdsDrCuerpo'), recortados = [...cu.querySelectorAll('.cds-var-card, .cds-var-senal, .cds-var-sug, .cds-var-nota, .cds-var-tot')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).length; return { pagina: document.documentElement.scrollWidth <= innerWidth + 1, cuerpo: cu.scrollWidth <= cu.clientWidth + 1, recortados, tarjetas: !!document.querySelector('.cds-var-lista'), cerrar: !!document.querySelector('.cds-dr-x') && document.querySelector('.cds-dr-x').getBoundingClientRect().width > 0 }; });
    ok('Texto ampliado', 'Reflujo al ' + nombre + ': sin desborde horizontal (página y panel), sin contenido recortado, tarjetas y «Cerrar» accesibles', r.pagina && r.cuerpo && r.recortados === 0 && r.tarjetas && r.cerrar, JSON.stringify(r));
    await pz.keyboard.press('Tab'); await pz.keyboard.press('Escape'); await z.ctx.close();
  }

  // ============================ E) BANDERA APAGADA Y REGRESIÓN ============================
  ok('Consola', 'Sin errores de consola en toda la validación con la bandera encendida', on.errores.length === 0, on.errores.join(' | '));
  if (REF) {
    await ctl('reset=1&n=20'); await ctlR('modo=real'); const off = await abrir(BASE, false), ref = await abrir(REF, false);
    const dom = async o => o.page.evaluate(() => { const h = document.getElementById('rtPanelHost'); return { texto: h ? h.innerText.replace(/\d{1,2}:\d{2}/g, '') : '', n: h ? h.querySelectorAll('*').length : 0, cds: document.documentElement.classList.contains('cds-v3'), scripts: [...document.scripts].filter(s => /cds\//.test(s.src)).length, links: [...document.querySelectorAll('link')].filter(l => /cds\//.test(l.href)).length, v: typeof window.CDS_VARIANTES }; });
    const a = await dom(off), b = await dom(ref);
    ok('Bandera apagada', 'Con la bandera apagada no se carga ningún archivo cds/ ni existe el módulo de variantes', !a.cds && a.scripts === 0 && a.links === 0 && a.v === 'undefined');
    ok('Bandera apagada', 'La lista de Oportunidades es idéntica a la referencia C2 (texto y cantidad de nodos)', a.texto === b.texto && a.n === b.n, a.n + ' vs ' + b.n);
    const filaOn = async o => { await o.page.evaluate(() => { const b = [...document.querySelectorAll('[data-detalle-codigo]')].find(x => x.offsetParent); if (b) b.click(); }); await sleep(900); return o.page.evaluate(() => { const h = document.getElementById('rtPanelHost'); return h.innerText.replace(/\d{1,2}:\d{2}/g, '') + '|' + h.querySelectorAll('*').length; }); };
    ok('Bandera apagada', 'La fila expandida (detalle clásico) es idéntica a la referencia', (await filaOn(off)) === (await filaOn(ref)));
    ok('Bandera apagada', 'Ninguna consulta a stock-ventas ni a Rotaciones, y las mismas consultas a Oportunidades que la referencia', off.sv.length === 0 && off.rot.length === 0 && ref.sv.length === 0 && off.opp.length === ref.opp.length, off.opp.length + ' vs ' + ref.opp.length);
    ok('Bandera apagada', 'Sin errores de consola', off.errores.length === 0, off.errores.join('|')); await off.ctx.close(); await ref.ctx.close();
  }

  // ============================ F) MATRIZ DE 7 TAMAÑOS ============================
  for (const [w, h] of [[320, 640], [375, 812], [430, 932], [768, 1024], [1024, 768], [1280, 900], [1920, 1080]]) {
    await ctl('reset=1&modo=rotacion'); await ctlR('reset=1&modo=normal'); const o = await abrir(BASE, true, w, h), p = o.page, cd = await codigos(p); await inyectar(p, cd[0], { origen: '0001', destino: '0005', cantidad: 6 }); await abrirDet(p, cd[0]); await abrirTab(p); await sleep(300);
    await p.click('.cds-var-filtros > summary').catch(() => {}); await p.evaluate(() => document.querySelector('.cds-var-exp').click()); await sleep(200);
    const m = await p.evaluate(() => { const dr = document.querySelector('.cds-dr'), cu = document.getElementById('cdsDrCuerpo'), r = dr.getBoundingClientRect(); const chicos = [...document.querySelectorAll('.cds-var button, .cds-var summary, .cds-var input, .cds-var select')].filter(x => x.offsetParent && x.getBoundingClientRect().height < 44).map(x => (x.className || x.tagName) + ' ' + Math.round(x.getBoundingClientRect().width) + 'x' + Math.round(x.getBoundingClientRect().height)); return { pagina: document.documentElement.scrollWidth <= innerWidth + 1, panel: r.left >= -1 && r.right <= innerWidth + 1, cuerpoSinX: cu.scrollWidth <= cu.clientWidth + 1, modo: document.querySelector('.cds-var').dataset.modo || 'tabla', chicos }; });
    ok('Tamaños ' + w + '×' + h, 'Modo ' + (w <= 700 ? 'tarjetas' : 'tabla') + ', sin desborde de página ni de panel', m.pagina && m.panel && m.cuerpoSinX && m.modo === (w <= 700 ? 'tarjetas' : 'tabla'), m.modo);
    if (w <= 900) ok('Tamaños ' + w + '×' + h, 'Controles de al menos 44 px de alto', m.chicos.length === 0, m.chicos.slice(0, 4).join(' ; '));
    ok('Tamaños ' + w + '×' + h, 'Sin errores de consola', o.errores.length === 0, o.errores.join('|')); await o.ctx.close();
  }

  await ctl('reset=1'); await ctlR('reset=1'); await browser.close();
  const fallos = res.filter(r => !r.ok); fs.writeFileSync(path.join(OUT, 'validacion-c3.json'), JSON.stringify({ fecha: new Date().toISOString(), total: res.length, ok: res.length - fallos.length, resultados: res }, null, 1));
  console.log('\nRESUMEN: ' + (res.length - fallos.length) + '/' + res.length + ' correctas' + (fallos.length ? ' — FALLAN: ' + fallos.map(f => f.grupo + ': ' + f.nombre).join(' || ') : '')); process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('ERROR FATAL', e); process.exit(2); });
