'use strict';
// Validacion de la Etapa C2 (señal de rotacion y sugerencias manuales dentro de «Talle y color», bandera cds-v3). HARNESS local, datos SINTETICOS: /analisis/stock-ventas y
// /analisis/rotaciones SIMULADOS (variantes-fixture.js). No consulta produccion ni genera rotaciones reales.
//   1) node tests/harness/servidor.js --puerto=8812   2) referencia C1 (91111b2) en --base=8813   3) node tests/harness/validacion-c2.js --puerto=8812 [--base=8813] [--salida=<carpeta>]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const BASE = 'http://127.0.0.1:' + arg('puerto', '8812'), REF = arg('base') ? 'http://127.0.0.1:' + arg('base') : null;
const OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'c2')); fs.mkdirSync(OUT, { recursive: true });
const res = []; const ok = (g, n, c, d) => { res.push({ grupo: g, nombre: n, ok: !!c, detalle: d == null ? '' : String(d).slice(0, 300) }); console.log((c ? 'PASS ' : 'FAIL ') + '[' + g + '] ' + n + (d != null && d !== '' ? '  [' + String(d).slice(0, 170) + ']' : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let PP = null;
const ctl = async qs => { const r = await (await fetch(BASE + '/__h/variantes?' + qs)).json(); if (PP && /reset=1|(^|&)n=|modo=|alterar=|origen=/.test(qs)) await PP.evaluate(() => { if (window.CDS_VARIANTES) CDS_VARIANTES.invalidar(); }); return r; };
const ctlR = async qs => (await fetch(BASE + '/__h/rotaciones?' + qs)).json();

(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  async function abrir(base, bandera, w = 1280, h = 900, antes) {
    const movil = w <= 768;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil && w <= 760, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    await ctx.addInitScript(b => { try { localStorage.setItem('cds-v3', b ? '1' : '0'); } catch (e) { /* nada */ } }, bandera);
    const page = await ctx.newPage(); const o = { ctx, page, errores: [], sv: [], rot: [], opp: [] };
    page.on('pageerror', e => o.errores.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g|status of 5|status of 403/.test(m.text())) o.errores.push('console ' + m.text().slice(0, 160)); });
    page.on('request', r => { const u = new URL(r.url()); if (u.pathname === '/analisis/stock-ventas') o.sv.push(u.searchParams); if (u.pathname === '/analisis/rotaciones') o.rot.push(u.searchParams); if (u.pathname === '/analisis/oportunidades') o.opp.push(u.searchParams); });
    if (antes) await antes(page);
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }); await sleep(1200);
    await page.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await sleep(3000);
    return o;
  }
  const codigos = p => p.evaluate(() => RT_OPORTUNIDADES.data.map(f => f.Codigo_producto));
  const inyectar = (p, cod, o) => p.evaluate(([cod, o]) => { // solo acciones y diagnostico del producto (como los entrega Oportunidades); no se toca estado_principal
    const f = RT_OPORTUNIDADES.data.find(x => x.Codigo_producto === cod);
    const ac = { accion: 'revisar_rotacion', estado_origen: 'posible_rotacion', principal: o.principal !== false, prioridad: 'alta', nivel: 'producto', ejecutable: false, requiere_validacion_variante: true, origen: o.origen, destino: o.destino, cantidad_orientativa: o.cantidad == null ? null : o.cantidad, cantidad_validada_por_variante: false, motivo: 'Motivo sintético' };
    f.acciones = o.principal === false ? [{ accion: 'reponer_urgente', estado_origen: 'reposicion_urgente', principal: true, prioridad: 'alta', motivo: 'x' }, ac] : [ac];
    f.diagnostico_rotacion = { par_sugerido: { origen: { sucursal: o.origen, stock: 9 }, destino: { sucursal: o.destino, ventas: 7 }, cantidad_sugerida: o.cantidad == null ? null : o.cantidad }, pares: [{}, {}] };
  }, [cod, o]);
  const quitarSenal = (p, cod) => p.evaluate(cod => { const f = RT_OPORTUNIDADES.data.find(x => x.Codigo_producto === cod); f.acciones = (f.acciones || []).filter(a => a.estado_origen !== 'posible_rotacion'); f.diagnostico_rotacion = null; if (f.estados_secundarios) f.estados_secundarios = f.estados_secundarios.filter(e => e !== 'posible_rotacion'); }, cod);
  const abrirDet = async (p, c) => { await p.evaluate(c => { [...document.querySelectorAll('[data-detalle-codigo="' + c + '"]')].find(x => x.offsetParent).click(); }, c); await sleep(700); };
  const cerrarDet = async p => { await p.keyboard.press('Escape'); await sleep(400); };
  const esperaVar = async (p, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(() => !!document.querySelector('.cds-var-t, .cds-var-error, .cds-var-vacio, .cds-var-parcial'))) { await sleep(150); return true; } await sleep(80); } return false; };
  const abrirTab = async p => { await p.click('#cdsTab_variantes'); return esperaVar(p); };
  const filas = p => p.evaluate(() => [...document.querySelectorAll('.cds-var-fila')].map(tr => { const num = k => { const td = tr.querySelector('td[data-cds-campo=' + k + ']'); return td ? td.firstChild.textContent : null; };
    return { key: tr.dataset.cdsVar, talle: tr.querySelector('[data-cds-campo=talle]').textContent, stock: num('stock'), dep: num('dep90'), fall: num('fallados'), flags: [...tr.querySelectorAll('.cds-var-flag')].map(x => x.dataset.flag || x.textContent),
      rot: (tr.querySelector('.cds-var-rot-l[data-rot]') || { dataset: {} }).dataset.rot || null, rotTxt: (tr.querySelector('.cds-var-rot-l[data-rot]') || {}).innerText || '', sug: [...tr.querySelectorAll('[data-sug]')].map(x => x.innerText) }; }));
  const texto = p => p.evaluate(() => (document.getElementById('cdsDrCuerpo') || {}).innerText || '');
  const stockOrigen = f => { const m = /stock (-?[\d.]+)/.exec(f.rotTxt); return m ? Number(m[1].replace(/\./g, '')) : null; };
  const ventasDestino = f => { const m = /ventas (-?[\d.]+)/.exec(f.rotTxt); return m ? Number(m[1].replace(/\./g, '')) : null; };

  // ============================ A) SIN SEÑAL / CON SEÑAL PRINCIPAL / SECUNDARIA ============================
  await ctl('reset=1&modo=rotacion'); await ctlR('reset=1&modo=normal');
  const on = await abrir(BASE, true), P = on.page, cods = await codigos(P); PP = P;
  const hayRot = await P.evaluate(() => RT_OPORTUNIDADES.data.map(f => !!(f.acciones || []).some(a => a.estado_origen === 'posible_rotacion')));
  const sinSenal = cods[hayRot.findIndex(x => !x)];
  await abrirDet(P, sinSenal); await abrirTab(P); const ts = await texto(P);
  ok('Sin señal', 'Producto sin posible rotación: no hay aviso de rotación, ni líneas de origen/destino, ni filtros de revisión', !(await P.$('.cds-var-senal')) && (await P.$$('.cds-var-rot-l')).length === 0 && (await P.$$('.cds-var-ord-rot')).length === 0 && !/Para revisar/.test(ts));
  ok('Sin señal', 'Con 8 variantes siguen sin aparecer búsqueda ni filtros (solo con señal o más de 12)', !(await P.$('.cds-var-buscar')) && (await P.$$('.cds-var-fila')).length === 8);
  ok('Sin señal', 'Siguen estando «Ver en Talles y colores» (en la pestaña y en Resumen) y la opción de administrador, sin consulta automática', (await P.$$('.cds-var-ir')).length === 1 && !!(await P.$('.cds-var-sug button')) && on.rot.length === 0);
  await cerrarDet(P);

  const c1 = cods.find(c => c !== sinSenal);
  await inyectar(P, c1, { origen: '0001', destino: '0005', cantidad: 6, principal: true }); await abrirDet(P, c1);
  const nSv = on.sv.length; await abrirTab(P); const tp = await texto(P);
  ok('Señal', 'Señal principal: aviso con sucursal de origen (Paseo 0001), de destino (Centenario 0005) y cantidad orientativa 6', (await P.$('.cds-var-senal[data-cds-senal=principal]')) && /Sucursal de origen\s*Paseo \(0001\)/.test(tp) && /Sucursal de destino\s*Centenario \(0005\)/.test(tp) && /Cantidad orientativa\s*6 u\./.test(tp) && /acción principal/.test(tp), tp.slice(tp.indexOf('Señal'), tp.indexOf('Señal') + 160).replace(/\n/g, ' | '));
  ok('Señal', 'Aclara que es por producto, requiere validación por variante y que la cantidad NO es para transferir ni se crean envíos', /por producto y requiere validación por variante/.test(tp) && /no es una cantidad para transferir/.test(tp) && /no se crean envíos/.test(tp));
  ok('Señal', 'Dep. 90 y fallados 93 se aclaran como no-stock de origen, y «Para revisar» se define sin recomendar transferir', /depósito 90 y los fallados 93 no cuentan como stock de origen/.test(tp) && /No es una transferencia/.test(tp));
  ok('Consultas', 'Abrir la pestaña con señal hace UNA consulta a stock-ventas y NINGUNA a Rotaciones', on.sv.length === nSv + 1 && on.rot.length === 0, on.sv.length - nSv + ' sv, ' + on.rot.length + ' rot');
  await cerrarDet(P);

  await inyectar(P, c1, { origen: '0001', destino: '0005', cantidad: null, principal: false }); await P.evaluate(() => CDS_VARIANTES.invalidar()); await abrirDet(P, c1); await abrirTab(P); const t2 = await texto(P);
  ok('Señal', 'Señal secundaria sin cantidad: «acción secundaria» y «Sin cantidad orientativa»', !!(await P.$('.cds-var-senal[data-cds-senal=secundaria]')) && /acción secundaria/.test(t2) && /Sin cantidad orientativa/.test(t2));
  await cerrarDet(P);

  // ============================ B) ANALISIS POR VARIANTE (8 casos) ============================
  await inyectar(P, c1, { origen: '0001', destino: '0005', cantidad: 6, principal: true }); await P.evaluate(() => CDS_VARIANTES.invalidar()); await abrirDet(P, c1); await abrirTab(P);
  const fs8 = await filas(P), por = t => fs8.find(f => f.talle === t);
  ok('Análisis', '8 variantes, cada una con su línea «Origen … stock · Destino … ventas»', fs8.length === 8 && fs8.every(f => f.rot && /Origen Paseo: stock .* · Destino Centenario: ventas /.test(f.rotTxt)));
  ok('Análisis', 'Origen con stock positivo y destino con ventas → «Para revisar en Rotaciones» (040: 5 y 4; 38: 1 y 1; 99: 4 y 6)', ['040', '38', '99'].every(t => por(t).rot === 'revisar') && stockOrigen(por('040')) === 5 && ventasDestino(por('040')) === 4 && stockOrigen(por('99')) === 4 && ventasDestino(por('99')) === 6);
  ok('Análisis', 'Origen en CERO → «Sin stock en origen» (no se recomienda transferir desde una variante sin stock positivo)', por('S').rot === 'sin_stock_origen' && !/Para revisar/.test(por('S').rotTxt) && stockOrigen(por('S')) === 0);
  ok('Análisis', 'Saldo NEGATIVO en origen: visible (−2), marcado y NO «para revisar»', por('M').rot === 'sin_stock_origen' && /Saldo negativo en origen/.test(por('M').rotTxt) && stockOrigen(por('M')) === -2 && por('M').flags.includes('saldo_negativo'), por('M').rotTxt.replace(/\n/g, ' '));
  ok('Análisis', 'Destino SIN ventas → «Sin ventas en destino»; destino con ventas negativas (−1) → «Ventas netas negativas en destino»', por('L').rot === 'sin_ventas_destino' && ventasDestino(por('L')) === 0 && por('XL').rot === 'sin_ventas_destino' && /Ventas netas negativas en destino/.test(por('XL').rotTxt) && ventasDestino(por('XL')) === -1);
  ok('Análisis', 'Solo depósito (4 en 0000, 0 en origen): sigue sin stock en origen aunque el depósito 90 tenga unidades', por('39').rot === 'sin_stock_origen' && por('39').dep === '4' && stockOrigen(por('39')) === 0);
  ok('Análisis', 'Depósito 90 y fallados 93 separados: variante 38 → Dep. 90 = 9 − 2 = 7 y Fallados 93 = 2, sin mezclarse con el stock de origen (1)', por('38').dep === '7' && por('38').fall === '2' && stockOrigen(por('38')) === 1);
  ok('Análisis', 'Fallados visibles (variante 040: fallados 1, y «Con fallados»)', por('040').fall === '1' && por('040').flags.some(f => /fallados/.test(f)));
  const ntxt = await texto(P);
  ok('Análisis', 'Ninguna variante sin stock positivo en origen aparece como «Para revisar» (revisar = exactamente 3)', fs8.filter(f => f.rot === 'revisar').length === 3 && fs8.filter(f => f.rot === 'sin_stock_origen').length === 3 && fs8.filter(f => f.rot === 'sin_ventas_destino').length === 2);
  ok('Análisis', 'Hay búsqueda/filtros y ordenar aunque haya solo 8 variantes (porque hay señal)', !!(await P.$('.cds-var-buscar')) && (await P.$$('.cds-var-ord-rot')).length === 2);
  await P.evaluate(() => document.querySelector('.cds-var-fila[data-cds-var$=":040:02"] .cds-var-exp').click()); await sleep(250);
  const rolo = await P.evaluate(() => ({ o: !!document.querySelector('.cds-var-suc--origen[data-rol=origen]'), d: !!document.querySelector('.cds-var-suc--destino[data-rol=destino]'), t: document.querySelector('.cds-var-det').innerText, n: document.querySelectorAll('.cds-var-det [data-rol]').length }));
  ok('Distribución', 'En la distribución por sucursal se resaltan origen y destino de la señal (con texto) y solo esas dos sucursales', rolo.o && rolo.d && rolo.n === 2 && /Origen de la señal: stock de la variante/.test(rolo.t) && /Destino de la señal: ventas de la variante/.test(rolo.t));
  await P.evaluate(() => document.querySelector('.cds-var-fila[data-cds-var$=":040:02"] .cds-var-exp').click()); await sleep(200);

  // ============================ C) ORDENAR Y FILTRAR PARA REVISAR ============================
  await P.click('.cds-var-ord-rot[data-orden-rot=stockOrigen]'); await sleep(250); const so = (await filas(P)).map(stockOrigen);
  ok('Orden', 'Ordenar por «Stock en origen» deja el mayor primero (5,4,3,2,1,0,0,−2) y marca la dirección', JSON.stringify(so) === JSON.stringify([5, 4, 3, 2, 1, 0, 0, -2]) && (await P.getAttribute('.cds-var-ord-rot[data-orden-rot=stockOrigen]', 'data-dir')) === 'desc', JSON.stringify(so));
  await P.click('.cds-var-ord-rot[data-orden-rot=stockOrigen]'); await sleep(250); const so2 = (await filas(P)).map(stockOrigen);
  ok('Orden', 'Otro clic invierte el orden (de menor a mayor: −2 primero)', JSON.stringify(so2) === JSON.stringify([-2, 0, 0, 1, 2, 3, 4, 5]), JSON.stringify(so2));
  await P.click('.cds-var-ord-rot[data-orden-rot=ventasDestino]'); await sleep(250); const vd = (await filas(P)).map(ventasDestino);
  ok('Orden', 'Ordenar por «Ventas en destino» deja el mayor primero (6,4,3,2,1,0,0,−1)', JSON.stringify(vd) === JSON.stringify([6, 4, 3, 2, 1, 0, 0, -1]), JSON.stringify(vd));
  const chips = await P.evaluate(() => [...document.querySelectorAll('.cds-var-chip[data-chip]')].map(c => c.textContent));
  ok('Filtros', 'Filtros de revisión con sus cantidades: Para revisar (3), Sin stock en origen (3), Sin ventas en destino (2)', chips.includes('Para revisar (3)') && chips.includes('Sin stock en origen (3)') && chips.includes('Sin ventas en destino (2)'), chips.join(' | '));
  await P.click('.cds-var-chip[data-chip=para_revisar]'); await sleep(250); const fr = await filas(P);
  ok('Filtros', '«Para revisar» muestra solo las 3 con stock positivo en origen y ventas en destino, conservando su identidad', fr.length === 3 && fr.every(f => f.rot === 'revisar' && /^V:[^:]+:[^:]+:[^:]+$/.test(f.key)));
  await P.click('.cds-var-chip[data-chip=todas]'); await sleep(200);
  ok('Navegación', 'Se conservan «Ver este producto en Rotaciones» y «Ver en Talles y colores»', !!(await P.$('.cds-var-senal-ac button')) && /Ver este producto en Rotaciones/.test(await P.innerText('.cds-var-senal-ac')) && /Ver en Talles y colores/.test(await P.innerText('.cds-var-cab')) && /Rotaciones no permite filtrar por talle y color/.test(await texto(P)));

  // ============================ D) DATOS FALTANTES ============================
  await cerrarDet(P); await ctl('alterar=faltante'); await abrirDet(P, c1); await abrirTab(P); const ff = await filas(P);
  ok('Faltantes', 'Sin stock de sucursales en la 1.ª variante y sin ventas en la 2.ª: «Datos incompletos», con «—» en lugar de ceros inventados', ff.filter(f => f.rot === 'datos_incompletos').length === 2 && /stock —/.test(ff.map(f => f.rotTxt).join('|')) && /ventas —/.test(ff.map(f => f.rotTxt).join('|')) && ff.some(f => f.flags.includes('datos_faltantes')), ff.filter(f => f.rot === 'datos_incompletos').map(f => f.rotTxt.replace(/\n/g, ' ')).join(' // '));
  ok('Faltantes', 'El filtro «Datos incompletos (2)» las agrupa', (await P.evaluate(() => [...document.querySelectorAll('.cds-var-chip[data-chip]')].map(c => c.textContent))).includes('Datos incompletos (2)'));
  await cerrarDet(P); await ctl('alterar=0');

  // ============================ E) SUCURSALES EXCLUIDAS ============================
  for (const [excl, sel, motivo] of [['origen', ['0005', '0010', '0012', '0014'], 'sin la sucursal de origen'], ['destino', ['0001', '0010', '0012', '0014'], 'sin la sucursal de destino']]) {
    await P.evaluate(s => rtSucursalesAplicar(s), sel); await sleep(3500); await ctl('reset=1&modo=rotacion'); on.sv.length = 0;
    const cx = (await codigos(P))[0]; await inyectar(P, cx, { origen: '0001', destino: '0005', cantidad: 6 }); await abrirDet(P, cx); await abrirTab(P); const tx = await texto(P);
    ok('Excluidas', 'Consulta ' + motivo + ': se manda exactamente esa selección y la señal avisa que no se puede analizar por variante', on.sv.length === 1 && on.sv[0].get('sucursales') === sel.join(',') && /no está entre las sucursales consideradas/.test(tx) && (await P.$$('.cds-var-rot-l')).length === 0 && (await P.$$('.cds-var-ord-rot')).length === 0, on.sv[0] && on.sv[0].get('sucursales'));
    ok('Excluidas', 'Siguen visibles el aviso (origen/destino/cantidad) y las variantes sin análisis de rotación, sin chips de revisión', /Sucursal de origen/.test(tx) && (await P.$$('.cds-var-fila')).length === 8 && !(await P.evaluate(() => [...document.querySelectorAll('.cds-var-chip')].some(c => /Para revisar/.test(c.textContent)))));
    await cerrarDet(P);
  }
  await P.evaluate(() => rtSucursalesAplicar(['0001', '0005', '0010', '0012', '0014'])); await sleep(3500); await ctl('reset=1&modo=rotacion');

  // ============================ F) CONSULTA MANUAL DE SUGERENCIAS (ADMINISTRADOR) ============================
  const cm = (await codigos(P))[2]; await inyectar(P, cm, { origen: '0001', destino: '0005', cantidad: 6 }); on.rot.length = 0; on.sv.length = 0;
  await abrirDet(P, cm); await abrirTab(P); await sleep(300);
  ok('Sugerencias', 'Administrador: aparece «Consultar sugerencias de Rotaciones» con la aclaración de costo, y NO se consulta sola', /Consultar sugerencias de Rotaciones/.test(await texto(P)) && /puede tardar y no se ejecuta sola/.test(await texto(P)) && on.rot.length === 0);
  for (const t of ['resumen', 'motivos', 'ingreso', 'sucursales']) { await P.click('#cdsTab_' + t); await sleep(120); } await P.click('#cdsTab_variantes'); await esperaVar(P);
  ok('Consultas', 'Cambiar de pestaña y volver no dispara Rotaciones (0 consultas) y stock-ventas se reconsulta solo si la caché venció (no aquí)', on.rot.length === 0);
  await P.click('.cds-var-sug button'); await sleep(900);
  const logR = (await ctlR('')).log, ult = logR[logR.length - 1];
  ok('Sugerencias', 'Al pulsar: UNA consulta con desde, hasta y codigo (sin refresh, sin talle/color/sucursales) y con Authorization', on.rot.length === 1 && JSON.stringify([...on.rot[0].keys()].sort()) === JSON.stringify(['codigo', 'desde', 'hasta']) && ult && ult.autorizacion === true && on.rot[0].get('codigo') === cm, JSON.stringify([...on.rot[0].keys()]));
  const sug = await P.evaluate(() => ({ t: document.querySelector('.cds-var-sug').innerText, marcadas: [...document.querySelectorAll('[data-sug]')].length }));
  ok('Sugerencias', 'Se listan las sugerencias del motor como «sin confirmar» con origen → destino y cantidad, y se aclara que confirmar es en Rotaciones', /u\. sugeridas por Rotaciones \(sin confirmar\)/.test(sug.t) && /Paseo → Centenario/.test(sug.t) && /Confirmar o descartar se hace solo en Rotaciones/.test(sug.t) && /no se generan envíos|Son propuestas sin confirmar|sin confirmar/.test(sug.t));
  const fm = await filas(P), marcadas = fm.filter(f => f.sug.length);
  ok('Sugerencias', 'Se marcan en la tabla las variantes sugeridas que existen (040, S, 38 y 99) y se avisa si el stock de origen no es positivo (S)', marcadas.map(f => f.talle).sort().join() === '040,38,99,S' && /no es positivo/.test(marcadas.find(f => f.talle === 'S').sug.join(' ')) && !/no es positivo/.test(marcadas.find(f => f.talle === '040').sug.join(' ')), marcadas.map(f => f.talle).join());
  ok('Sugerencias', 'Una sugerencia de una variante que no está en esta pestaña (NOEXISTE) se informa en la lista sin inventar una fila', /Talle NOEXISTE/.test(sug.t) && !fm.some(f => f.talle === 'NOEXISTE'));
  ok('Sugerencias', 'Filtro «Sugeridas por Rotaciones (4)»', (await P.evaluate(() => [...document.querySelectorAll('.cds-var-chip[data-chip]')].map(c => c.textContent))).includes('Sugeridas por Rotaciones (4)'));
  await cerrarDet(P); const nr = on.rot.length; await abrirDet(P, cm); await abrirTab(P);
  ok('Sugerencias', 'Cerrar y reabrir dentro de 5 minutos conserva las sugerencias sin volver a consultar', on.rot.length === nr && /sin confirmar/.test(await texto(P)));
  await P.click('.cds-var-sug button:last-of-type'); await sleep(800);
  ok('Sugerencias', '«Volver a consultar» hace una consulta más (sin refresh)', on.rot.length === nr + 1 && ![...on.rot[on.rot.length - 1].keys()].includes('refresh'));
  await cerrarDet(P);
  // vacío / error / sin permiso
  for (const [modo, patron, nombre] of [['vacio', /no sugiere mover variantes/, 'sin sugerencias'], ['error', /No se pudieron consultar las sugerencias/, 'error 500'], ['403', /es solo para administradores/, 'sin permiso (403)']]) {
    await ctlR('modo=' + modo); await P.evaluate(() => CDS_VARIANTES.invalidar()); await abrirDet(P, cm); await abrirTab(P); await P.click('.cds-var-sug button'); await sleep(800); const tv = await P.innerText('.cds-var-sug');
    ok('Sugerencias', 'Respuesta ' + nombre + ': mensaje claro' + (modo === 'vacio' ? '' : ' y «Reintentar»') + ', sin romper la pestaña', patron.test(tv) && (modo === 'vacio' || /Reintentar/.test(tv)) && (await P.$$('.cds-var-fila')).length === 8, tv.replace(/\n/g, ' ').slice(0, 110)); await cerrarDet(P);
  }
  await ctlR('modo=normal');
  const sinCipo = await P.evaluate(() => rtSucursalesAplicar(['0001', '0005', '0010', '0012'])); await sleep(3500); await ctl('reset=1&modo=rotacion');
  const ce = (await codigos(P))[3]; await inyectar(P, ce, { origen: '0001', destino: '0005', cantidad: 6 }); await abrirDet(P, ce); await abrirTab(P); await P.click('.cds-var-sug button'); await sleep(800);
  const te = await P.innerText('.cds-var-sug'); const fe = await filas(P);
  ok('Sugerencias', 'Con 0014 fuera de la consulta, la sugerencia hacia 0014 (variante 99) no se muestra y se informa («1 sugerencia(s) fuera»)', /1 sugerencia\(s\) fuera de las sucursales consideradas no se muestran/.test(te) && !fe.some(f => f.talle === '99' && f.sug.length), te.replace(/\n/g, ' ').slice(-140));
  await cerrarDet(P); await P.evaluate(() => rtSucursalesAplicar(['0001', '0005', '0010', '0012', '0014'])); await sleep(3500); await ctl('reset=1&modo=rotacion');

  // ============================ G) ROLES ============================
  const nadm = await abrir(BASE, true, 1280, 900, async page => { await page.addInitScript(() => { window.__rol = 'jefe'; }); }), PN = nadm.page; const cn = (await codigos(PN))[0];
  await PN.evaluate(() => { window.getUser = () => ({ rol: 'jefe', usuario: 'jefe' }); }); await inyectar(PN, cn, { origen: '0001', destino: '0005', cantidad: 6 }); await abrirDet(PN, cn); await abrirTab(PN); await sleep(300);
  ok('Roles', 'Usuario NO administrador: ve la señal y el análisis por variante pero NO la opción de consultar Rotaciones, y no hay consultas a Rotaciones', (await PN.evaluate(() => rrEsAdmin())) === false && !!(await PN.$('.cds-var-senal')) && !(await PN.$('.cds-var-sug')) && (await PN.$$('.cds-var-rot-l')).length === 8 && nadm.rot.length === 0 && !/Consultar sugerencias de Rotaciones/.test(await texto(PN)));
  await nadm.ctx.close();

  // ============================ H) NAVEGACION ============================
  await ctl('reset=1&modo=rotacion'); const cv = (await codigos(P))[4]; await inyectar(P, cv, { origen: '0001', destino: '0005', cantidad: 6 }); await abrirDet(P, cv); await abrirTab(P);
  await P.click('.cds-var-senal-ac button'); await sleep(1500);
  const nv = await P.evaluate(() => ({ vista: RT_VIEW, filtro: RT_ROTACIONES_FILTRO, det: document.querySelectorAll('.cds-dr').length, vuelo: CDS_VARIANTES._estado().vuelo }));
  ok('Navegación', '«Ver este producto en Rotaciones» abre Rotaciones filtrada por el código, SIN talle ni color (la vista no los admite) y cierra el detalle', nv.vista === 'rotaciones' && nv.filtro.codigo === cv && JSON.stringify(Object.keys(nv.filtro).sort()) === JSON.stringify(['codigo', 'confianza', 'destino', 'marca', 'origen', 'rubro']) && nv.det === 0 && nv.vuelo === false, JSON.stringify(nv.filtro));
  await P.evaluate(() => document.querySelector('.cds-nav[data-cds-view="oportunidades"]').click()); await sleep(3000);
  const cz = (await codigos(P))[5]; await abrirDet(P, cz); await abrirTab(P); await P.click('.cds-var-ir'); await sleep(1500);
  const nt = await P.evaluate(() => ({ vista: RT_VIEW, filtro: RT_FILTRO }));
  ok('Navegación', '«Ver en Talles y colores» abre la vista independiente con el código del producto', nt.vista === 'talles-colores' && nt.filtro && nt.filtro.codigo === cz, JSON.stringify(nt));
  await P.evaluate(() => document.querySelector('.cds-nav[data-cds-view="oportunidades"]').click()); await sleep(3000);
  ok('Consola', 'Sin errores de consola durante toda la validación con la bandera encendida', on.errores.length === 0, on.errores.join(' | '));

  // ============================ I) BANDERA APAGADA IDENTICA A C1 ============================
  if (REF) {
    await ctl('reset=1&n=20'); await ctlR('modo=real'); const off = await abrir(BASE, false), ref = await abrir(REF, false);
    const dom = async o => o.page.evaluate(() => { const h = document.getElementById('rtPanelHost'); return { texto: h ? h.innerText.replace(/\d{1,2}:\d{2}/g, '') : '', n: h ? h.querySelectorAll('*').length : 0, cds: document.documentElement.classList.contains('cds-v3'), scripts: [...document.scripts].filter(s => /cds\//.test(s.src)).length, links: [...document.querySelectorAll('link')].filter(l => /cds\//.test(l.href)).length, v: typeof window.CDS_VARIANTES }; });
    const a = await dom(off), b = await dom(ref);
    ok('Bandera apagada', 'Con la bandera apagada no se carga ningún archivo cds/ ni existe el módulo de variantes', !a.cds && a.scripts === 0 && a.links === 0 && a.v === 'undefined');
    ok('Bandera apagada', 'La lista de Oportunidades es idéntica a la referencia C1 (texto y cantidad de nodos)', a.texto === b.texto && a.n === b.n, a.n + ' vs ' + b.n);
    const filaOn = async o => { await o.page.evaluate(() => { const b = [...document.querySelectorAll('[data-detalle-codigo]')].find(x => x.offsetParent); if (b) b.click(); }); await sleep(900); return o.page.evaluate(() => { const h = document.getElementById('rtPanelHost'); return h.innerText.replace(/\d{1,2}:\d{2}/g, '') + '|' + h.querySelectorAll('*').length; }); };
    ok('Bandera apagada', 'La fila expandida (detalle clásico) es idéntica a la referencia', (await filaOn(off)) === (await filaOn(ref)));
    ok('Bandera apagada', 'Ninguna consulta a stock-ventas ni a Rotaciones, y las mismas consultas a Oportunidades que la referencia', off.sv.length === 0 && off.rot.length === 0 && ref.sv.length === 0 && off.opp.length === ref.opp.length, off.opp.length + ' vs ' + ref.opp.length);
    ok('Bandera apagada', 'Sin errores de consola', off.errores.length === 0, off.errores.join('|')); await off.ctx.close(); await ref.ctx.close();
  }

  // ============================ J) TAMAÑOS ============================
  for (const [w, h] of [[320, 640], [375, 812], [430, 932], [768, 1024], [1024, 768], [1280, 900], [1920, 1080]]) {
    await ctl('reset=1&modo=rotacion'); const o = await abrir(BASE, true, w, h), p = o.page, cd = await codigos(p);
    await inyectar(p, cd[0], { origen: '0001', destino: '0005', cantidad: 6 }); await p.evaluate(c => { [...document.querySelectorAll('[data-detalle-codigo="' + c + '"]')].find(x => x.offsetParent).click(); }, cd[0]); await sleep(700); await p.click('#cdsTab_variantes'); await esperaVar(p); await sleep(300);
    const m = await p.evaluate(() => { const dr = document.querySelector('.cds-dr'), cu = document.getElementById('cdsDrCuerpo'), r = dr.getBoundingClientRect(); const chicos = [...document.querySelectorAll('.cds-var-senal button, .cds-var-sug button, .cds-var-ord-rot, .cds-var-chip, .cds-var-exp')].filter(x => x.offsetParent && (x.getBoundingClientRect().height < 44 || x.getBoundingClientRect().width < 44)).map(x => (x.className || x.tagName) + ' ' + Math.round(x.getBoundingClientRect().width) + 'x' + Math.round(x.getBoundingClientRect().height)); return { pagina: document.documentElement.scrollWidth <= window.innerWidth + 1, panel: r.left >= -1 && r.right <= window.innerWidth + 1, cuerpoSinX: cu.scrollWidth <= cu.clientWidth + 1, senal: !!document.querySelector('.cds-var-senal'), chicos }; });
    ok('Tamaños ' + w + '×' + h, 'Señal, filtros y tabla caben en el panel sin desbordar la página', m.pagina && m.panel && m.cuerpoSinX && m.senal);
    if (w <= 900) ok('Tamaños ' + w + '×' + h, 'Botones de la señal, filtros y orden de al menos 44 px', m.chicos.length === 0, m.chicos.slice(0, 4).join(' ; '));
    ok('Tamaños ' + w + '×' + h, 'Sin errores de consola', o.errores.length === 0, o.errores.join('|')); await o.ctx.close();
  }

  await ctl('reset=1'); await ctlR('reset=1'); await browser.close();
  const fallos = res.filter(r => !r.ok); fs.writeFileSync(path.join(OUT, 'validacion-c2.json'), JSON.stringify({ fecha: new Date().toISOString(), total: res.length, ok: res.length - fallos.length, resultados: res }, null, 1));
  console.log('\nRESUMEN: ' + (res.length - fallos.length) + '/' + res.length + ' correctas' + (fallos.length ? ' — FALLAN: ' + fallos.map(f => f.grupo + ': ' + f.nombre).join(' || ') : '')); process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('ERROR FATAL', e); process.exit(2); });
