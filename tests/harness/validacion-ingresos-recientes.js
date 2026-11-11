'use strict';
// Validacion de la propuesta visual 2 de Ingresos recientes contra el HARNESS (datos SIMULADOS). No toca Sysneo ni produccion.
//   1) node tests/harness/servidor.js --puerto=8795
//   2) PLAYWRIGHT=<ruta a playwright-core> node tests/harness/validacion-ingresos-recientes.js [carpeta-de-capturas]
// Requiere Playwright (p. ej. el de ../nequ-studio/node_modules/playwright-core) y Edge/Chrome instalado (canal "msedge"). Imprime PASS/FAIL
// por comprobacion y guarda capturas a 1280x800 y 375x812 de los dos escenarios (alineado y atrasado) y de los estados.
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const BASE = process.env.HARNESS || 'http://127.0.0.1:8795';
const OUT = process.argv[2] || path.join(__dirname, '..', '..', 'docs', 'referencias-rediseno', 'propuesta-2', 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const ctl = async (qs) => (await fetch(BASE + '/__h/ir?' + qs)).json();
const resultados = [];
const check = (nombre, ok, detalle) => { resultados.push({ nombre, ok: !!ok, detalle: detalle || '' }); console.log((ok ? 'PASS ' : 'FAIL ') + nombre + (detalle ? '  [' + detalle + ']' : '')); };

(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  for (const [tam, vp, movil] of [['1280', { width: 1280, height: 800 }, false], ['375', { width: 375, height: 812 }, true]]) {
    const T = (s) => `[${tam}] ${s}`;
    const filas = movil ? '.ir-tarjeta' : '.ir-tabla tbody tr.ir-fila';
    async function nueva() {
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const pedidos = []; const fallos = [];
      page.on('request', r => { if (r.url().includes('/analisis/ingresos-recientes')) pedidos.push(new URL(r.url()).searchParams); });
      page.on('response', r => { if (r.url().includes('/analisis/ingresos-recientes') && r.status() >= 400 && !r.url().includes('error=')) fallos.push(r.status()); });
      page.on('pageerror', e => fallos.push('pageerror ' + e.message));
      return { ctx, page, pedidos, fallos };
    }
    async function abrir(page, esperar = true) {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#rtTabs .tab[data-view="oportunidades"]');
      await page.click('#rtTabs .tab[data-view="oportunidades"]');
      await page.click('.ov-subtab[data-subvista="ingresos"]');
      if (esperar) await page.waitForSelector(filas, { timeout: 15000 });
      await page.waitForTimeout(300);
    }
    const abrirFiltrosMovil = async (page) => { if (movil) await page.evaluate(() => { const d = document.querySelector('.ir-plegable'); if (d && !d.open) d.querySelector('summary').click(); }); await page.waitForTimeout(150); };
    const foto = (page, nombre, o = {}) => page.screenshot({ path: path.join(OUT, `${tam}-${nombre}.png`), ...o });
    const texto = (page, sel) => page.locator(sel).first().innerText();
    const cuantas = (page) => page.locator(filas).count();

    // ═══ ALINEADO ═══
    await ctl('escenario=alineado&vacio=0&error=0&retraso=0');
    let { ctx, page, pedidos, fallos } = await nueva();
    await abrir(page);
    const pos = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), alto: innerHeight }; }, filas);
    check(T('alineado: el primer producto entra en la primera pantalla (filtros y detalle cerrados)'), pos.bottom <= pos.alto, JSON.stringify(pos));
    await foto(page, 'alineado-01-primera-pantalla');
    await foto(page, 'alineado-01b-completa', { fullPage: true });
    const cabeceras = await page.evaluate(() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; }; return { barra: r('#rtBar'), subnav: r('.ov-subnav'), boton: r('#rtBar .btn-sm'), fondo: getComputedStyle(document.querySelector('#rtBar')).backgroundColor, borde: getComputedStyle(document.querySelector('#rtBar')).borderTopWidth }; });
    check(T('barra superior compacta: sin tarjeta vacía y altura mínima'), cabeceras.barra.h <= (movil ? 48 : 44) && /rgba\(0, 0, 0, 0\)|transparent/.test(cabeceras.fondo) && cabeceras.borde === '0px', JSON.stringify(cabeceras.barra));
    check(T('altura acumulada hasta las subpestañas'), cabeceras.subnav.bottom <= (movil ? 290 : 235), 'subpestañas terminan en ' + cabeceras.subnav.bottom + ' px');
    if (movil) check(T('controles de la barra cómodos de tocar (≥ 40 px)'), cabeceras.boton.h >= 40, 'alto ' + cabeceras.boton.h);
    // acciones en la barra superior (escritorio) o en su lugar de siempre (movil)
    const acc = await page.evaluate(() => { const top = document.querySelector('header.topbar'); const g = id => document.getElementById(id); const r = e => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; }; return { suc: !!top.querySelector('#rtBtnSucursales'), act: !!top.querySelector('#rtBtnActualizar'), hdr: Math.round(top.getBoundingClientRect().height), sucR: r(g('rtBtnSucursales')), actR: r(g('rtBtnActualizar')), barra: getComputedStyle(g('rtBar')).display, sub: Math.round(document.querySelector('.ov-subnav').getBoundingClientRect().top) }; });
    if (!movil) {
      check(T('escritorio: «Sucursales» y «Actualizar» están en la barra superior y la fila de acciones desaparece'), acc.suc && acc.act && acc.barra === 'none' && acc.sucR.b <= acc.hdr && acc.actR.b <= acc.hdr, JSON.stringify(acc));
      await page.locator('#rtBtnSucursales').click(); await page.waitForTimeout(300);
      const pn = await page.evaluate(() => { const b = document.getElementById('rtSucursalesPanel').getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), vw: innerWidth, visible: document.elementFromPoint(b.left + 20, b.top + 20)?.closest('#rtSucursalesPanel') !== null }; });
      check(T('panel de sucursales desde la barra superior: dentro de la pantalla y por encima del contenido'), pn.l >= 0 && pn.r <= pn.vw && pn.visible, JSON.stringify(pn));
      await foto(page, 'alineado-07-acciones-en-barra-superior');
      // toda la interfaz: otra pestaña mantiene las acciones arriba y muestra los dias de Desde/Hasta
      await page.keyboard.press('Escape'); await page.click('#rtTabs .tab[data-view="stock-ventas"]'); await page.waitForTimeout(400);
      const glob = await page.evaluate(() => ({ top: !!document.querySelector('header.topbar #rtBtnSucursales') && !!document.querySelector('header.topbar #rtBtnActualizar'), dias: document.getElementById('rtDiasPeriodo').innerText, barra: getComputedStyle(document.getElementById('rtBar')).display }));
      check(T('otras pestañas: acciones en la barra superior y cantidad de días junto a Desde/Hasta'), glob.top && /^[0-9]+ días$/.test(glob.dias) && glob.barra !== 'none', JSON.stringify(glob));
      await page.click('#rtTabs .tab[data-view="oportunidades"]'); await page.waitForSelector(filas, { timeout: 15000 });
      if (!(await page.locator('#rtBtnSucursales').count())) throw new Error('acciones');
      await page.keyboard.press('Escape'); await page.locator('#rtBtnSucursales').click(); await page.waitForTimeout(200);
    } else check(T('móvil: las acciones siguen bajo la barra superior (no caben en ella)'), !acc.suc && !acc.act && acc.barra !== 'none', JSON.stringify(acc));
    // teclado: el panel queda justo despues de la linea de alcance; Escape lo cierra y devuelve el foco
    await page.locator('.ir-alcance-btn').focus(); await page.keyboard.press('Enter');
    await page.waitForSelector('#irPanelSuc');
    await page.keyboard.press('Tab');
    check(T('teclado: tras abrir el panel, Tab entra a las acciones del panel'), await page.evaluate(() => !!document.activeElement.closest('#irPanelSuc')), '');
    await page.keyboard.press('Escape');
    check(T('teclado: Escape cierra el panel y devuelve el foco a la línea de alcance'), (await page.locator('#irPanelSuc').count()) === 0 && await page.evaluate(() => document.activeElement.classList.contains('ir-alcance-btn')), '');
    // alcance: el encabezado fijo no tapa la linea de alcance al abrir el panel con la pagina desplazada
    await page.evaluate(() => window.scrollTo(0, 260));
    await page.locator('.ir-alcance-btn').focus(); await page.keyboard.press('Enter');
    await page.waitForSelector('#irPanelSuc').catch(() => {});
    const vis1 = await page.evaluate(() => { const h = document.querySelector('header.topbar').getBoundingClientRect().bottom; const a = document.querySelector('.ir-alcance').getBoundingClientRect(); const f = document.activeElement.getBoundingClientRect(); return { h: Math.round(h), alcanceTop: Math.round(a.top), focoTop: Math.round(f.top), focoBottom: Math.round(f.bottom), vh: innerHeight }; });
    check(T('al abrir el panel con scroll, la línea de alcance y el control enfocado quedan bajo el encabezado fijo'), vis1.alcanceTop >= vis1.h && vis1.focoTop >= vis1.h && vis1.focoBottom <= vis1.vh, JSON.stringify(vis1));
    await foto(page, 'alineado-06-panel-sucursales');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.scrollTo(0, 0));
    const cab = await texto(page, '.ir-sub');
    const P0 = pedidos[0];
    check(T('primera consulta usa el rango inicial del contrato (dias=30) y sucursales explicitas'), P0.get('dias') === '30' && P0.get('sucursales') === '0001,0005,0010,0012,0014', P0.toString());
    check(T('encabezado muestra período y corte'), /12\/10/.test(cab) && /10\/11/.test(cab) && /30 días/.test(cab), cab);
    check(T('línea de alcance con sucursales/estado de stock'), /Stock al día/.test(await texto(page, '.ir-alcance')), await texto(page, '.ir-alcance'));
    // contadores: cero real vs no disponible
    const cont = await page.locator('.ir-cont').allInnerTexts();
    check(T('contadores: "0" real se muestra como 0 (alineado)'), cont.some(t => /^0\s+Revisar/.test(t.replace(/\n/g, ' '))), cont.join(' | '));
    if (movil) {
      const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.ir-contadores')).gridTemplateColumns.split(' ').length);
      check(T('contadores en dos columnas en móvil'), cols === 2, 'columnas=' + cols);
      const resumen = await texto(page, '.ir-plegable > summary');
      check(T('filtros plegados con resumen de filtros activos'), /Filtros/.test(resumen) && /30 días/.test(resumen), resumen);
    }
    // Información de los datos
    await page.click('button[aria-label="Información de los datos"]');
    const info = await texto(page, '#irInfo');
    check(T('"Información de los datos" agrupa fuentes, ventas observadas y datos desconocidos, sin referencias internas'), /stock de sucursales/i.test(info) && /ventas observadas/i.test(info) && /no es cero/i.test(info) && /depósito 90/i.test(info) && !/ADR-|Movimientos_Productos/.test(info), '');
    check(T('Información de los datos: Depósito 90 dice «Stock informado por el sistema · sin fecha de actualización disponible»'), /Stock informado por el sistema · sin fecha de actualización disponible/.test(info), '');
    await foto(page, 'alineado-02-informacion-datos', movil ? { fullPage: false } : {});
    await page.click('button[aria-label="Información de los datos"]');
    // detalle
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.locator('.ir-det-btn:visible').nth(movil ? 2 : 3).click();
    await page.waitForTimeout(300);
    const vis2 = await page.evaluate(() => { const h = document.querySelector('header.topbar').getBoundingClientRect().bottom; const a = document.activeElement.getBoundingClientRect(); const fila = document.activeElement.closest('[data-ir-fila]').getBoundingClientRect(); return { h: Math.round(h), filaTop: Math.round(fila.top), focoTop: Math.round(a.top), focoBottom: Math.round(a.bottom), vh: innerHeight }; });
    check(T('al abrir un detalle con scroll, el encabezado fijo deja visibles el producto y el control enfocado'), vis2.filaTop >= vis2.h && vis2.focoTop >= vis2.h && vis2.focoBottom <= vis2.vh, JSON.stringify(vis2));
    await page.keyboard.press('Escape');
    check(T('teclado: Escape cierra el detalle y el foco vuelve al botón Detalle'), (await page.locator('.ir-detalle:visible').count()) === 0 && await page.evaluate(() => document.activeElement.classList.contains('ir-det-btn')), '');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.ir-det-btn:visible').first().click();
    await page.waitForTimeout(300);
    const det = await texto(page, '.ir-detalle:visible');
    check(T('detalle: stock previo, días con stock, umbral aplicado y desglose por sucursal'), /stock previo en sucursales/i.test(det) && /días con stock/i.test(det) && /umbral aplicado/i.test(det) && /por sucursal/i.test(det), '');
    await page.locator('.ir-detalle:visible').first().scrollIntoViewIfNeeded();
    await foto(page, 'alineado-03-detalle');
    await page.locator('.ir-det-btn:visible').first().click();
    await abrirFiltrosMovil(page);
    await page.locator('.ir-rapido', { hasText: /^60 d$/ }).click();
    await page.waitForSelector(filas); await page.waitForTimeout(300);
    check(T('período 60 d reconsulta con dias=60'), pedidos.some(p => p.get('dias') === '60'), '');
    check(T('60 d: aparecen códigos "Revisar: sin ventas" con su umbral y origen'), /mín. 47 d · global/.test(await page.locator('body').innerText()), '');
    const codPrevio = await page.evaluate(async () => { const j = await (await fetch('/analisis/ingresos-recientes?dias=60&limit=500&sucursales=0001,0005,0010,0012,0014')).json(); const f = j.data.find(x => x.reingreso_con_stock_previo); return f ? f.cod : null; });
    // tipo de ingreso
    await page.locator('select[aria-label="Tipo de ingreso"]').selectOption('reingreso').catch(async () => { await page.click('.ir-plegable > summary'); await page.locator('select[aria-label="Tipo de ingreso"]').selectOption('reingreso'); });
    await page.waitForTimeout(600);
    check(T('filtro tipo=reingreso llega a la API'), pedidos.some(p => p.get('tipo') === 'reingreso'), '');
    const tipos = await page.locator(filas).allInnerTexts();
    check(T('con tipo=reingreso todas las filas son reingresos'), tipos.length > 0 && tipos.every(t => /Reingreso/.test(t)), tipos.length + ' filas');
    await page.locator('select[aria-label="Tipo de ingreso"]').selectOption('');
    await page.waitForTimeout(500);
    // lectura (contador)
    await page.locator('.ir-cont', { hasText: 'Con ventas' }).click();
    await page.waitForTimeout(600);
    check(T('contador Con ventas filtra por lectura=con_ventas'), pedidos.some(p => p.get('lectura') === 'con_ventas'), '');
    const lec = await page.locator(filas).allInnerTexts();
    check(T('con el contador activo todas las filas son "Con ventas"'), lec.length > 0 && lec.every(t => /Con ventas/.test(t)), lec.length + ' filas');
    await page.locator('.ir-cont', { hasText: 'Con ventas' }).click(); await page.waitForTimeout(500);
    // orden
    await page.locator('select[aria-label="Orden"]').selectOption('ventas_desc').catch(() => {});
    await page.waitForTimeout(500);
    check(T('orden elegido llega a la API'), pedidos.some(p => p.get('orden') === 'ventas_desc'), '');
    await page.locator('select[aria-label="Orden"]').selectOption('prioridad').catch(() => {});
    await page.waitForTimeout(400);
    // filtros por código (y marca si el control lo permite)
    if (movil) await page.evaluate(() => { const d = document.querySelector('.ir-plegable'); if (d && !d.open) d.querySelector('summary').click(); });
    await page.getByRole('button', { name: /Marca, rubro, código/ }).click();
    await page.waitForSelector('.ir-filtros-form form');
    const hayInput = await page.locator('.ir-filtros-form input[type="text"], .ir-filtros-form input:not([type])').count();
    const codigoBuscado = codPrevio || '';
    if (hayInput) {
      await page.locator('.ir-filtros-form input').first().fill(codigoBuscado || '10364');
      await page.locator('.ir-filtros-form button', { hasText: 'Aplicar' }).click();
      await page.waitForTimeout(700);
      check(T('filtro por código llega a la API'), pedidos.some(p => p.get('codigo')), pedidos[pedidos.length - 1].toString());
      check(T('con filtro por código queda una fila y aparece el chip de filtro activo'), (await cuantas(page)) === 1 && (await page.locator('.ov-chip-filtro').count()) >= 1, '');
      await page.locator('.ir-det-btn:visible').first().click(); await page.waitForTimeout(300);
      check(T('reingreso con stock previo: aclara que las ventas son del código y la atribución al lote está pendiente'), /atribución al lote nuevo está pendiente/.test(await texto(page, '.ir-detalle:visible')) && /Stock previo en sucursales/i.test(await texto(page, '.ir-detalle:visible')), codPrevio);
      await page.locator('.ir-detalle:visible').first().scrollIntoViewIfNeeded();
      await foto(page, 'alineado-04-detalle-reingreso-y-filtro-activo');
      await page.locator('.ov-chip-filtro button').first().click(); await page.waitForTimeout(600);
    } else check(T('filtro por código'), false, 'sin campo');
    // personalizado: rango inválido (> 180 días) y válido
    await page.getByRole('button', { name: 'Personalizado' }).click();
    await page.waitForSelector('#irDesde');
    await page.fill('#irDesde', '2026-03-01'); await page.fill('#irHasta', '2026-11-10');
    check(T('rango personalizado: al lado de las fechas dice cuántos días se consultan (y avisa si pasa el máximo)'), /255 días · máximo 180/.test(await texto(page, '#irDiasRango')) && await page.locator('#irDiasRango.ir-dias-excede').count() === 1, await texto(page, '#irDiasRango'));
    await page.locator('.ir-rango button[type="submit"]').click();
    check(T('rango > 180 días muestra error y no consulta'), /180 días/.test(await page.locator('.ir-error').innerText().catch(() => '')), '');
    await page.fill('#irDesde', '2026-10-20'); await page.fill('#irHasta', '2026-11-10');
    check(T('rango personalizado: 20/10 al 10/11 = 22 días, visible junto a Hasta'), (await texto(page, '#irDiasRango')).trim() === '22 días' && await page.evaluate(() => { const h = document.getElementById('irHasta').getBoundingClientRect(), d = document.getElementById('irDiasRango').getBoundingClientRect(); return d.left >= h.left && Math.abs(d.top - h.top) < 40; }), await texto(page, '#irDiasRango'));
    await foto(page, 'alineado-08-rango-personalizado-dias');
    await page.locator('.ir-rango button[type="submit"]').click(); await page.waitForTimeout(700);
    check(T('rango válido consulta con desde/hasta'), pedidos.some(p => p.get('desde') === '2026-10-20' && p.get('hasta') === '2026-11-10'), '');
    // paginación (60 d tiene > 50 códigos)
    await page.locator('.ir-rapido', { hasText: /^60 d$/ }).click(); await page.waitForTimeout(700);
    const sig = page.locator('.ov-pag-btn[aria-label="Página siguiente"]');
    check(T('paginación presente con más de 50 códigos'), (await sig.count()) === 1, '');
    await sig.click(); await page.waitForTimeout(700);
    check(T('página 2 pide offset=50'), pedidos.some(p => p.get('offset') === '50'), '');
    await page.locator('.ir-pag').scrollIntoViewIfNeeded();
    await foto(page, 'alineado-05-paginacion');
    check(T('sin errores HTTP ni de script en el flujo alineado'), fallos.length === 0, fallos.join(','));
    await ctx.close();

    // ═══ ATRASADO ═══
    await ctl('escenario=atrasado&vacio=0&error=0&retraso=0');
    ({ ctx, page, pedidos, fallos } = await nueva());
    await abrir(page);
    const aviso = await texto(page, '.ir-aviso');
    check(T('atrasado: aviso breve con local, fecha y efecto'), /Centenario/.test(aviso) && /09\/11/.test(aviso) && /Historial insuficiente/.test(aviso) && aviso.length < 330, aviso.length + ' caracteres');
    const posA = await page.evaluate(() => { const r = document.querySelector('.ir-aviso').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), alto: Math.round(r.height), vh: innerHeight }; });
    check(T('atrasado: el aviso es visible en la primera pantalla y compacto'), posA.bottom <= posA.vh && posA.alto <= (movil ? 150 : 90), JSON.stringify(posA));
    const contA = (await page.locator('.ir-cont').allInnerTexts()).map(t => t.replace(/\n/g, ' '));
    check(T('atrasado: contadores sin clasificar muestran "—" (no 0) y Historial insuficiente muestra el total'), contA.filter(t => /^—/.test(t)).length === 5 && contA.some(t => /^\d+\s+Historial insuficiente/.test(t)), contA.join(' | '));
    check(T('atrasado: la tabla/tarjetas conservan ventas y muestran "—" en días con stock'), /—/.test(await page.locator(filas).first().innerText()), '');
    await foto(page, 'atrasado-01-primera-pantalla');
    await foto(page, 'atrasado-01b-completa', { fullPage: true });
    await page.getByRole('button', { name: 'Revisar sucursales' }).click();
    await page.waitForSelector('#irPanelSuc');
    check(T('"Revisar sucursales" abre el panel con las fechas por local'), /Centenario/.test(await texto(page, '#irPanelSuc')) && /Atrasado 1 día/.test(await texto(page, '#irPanelSuc')), '');
    const est = await page.evaluate(() => { const filas = [...document.querySelectorAll('.ir-suc-fila:not(.ir-suc-cab)')]; return filas.map(f => { const n = f.querySelector('.ir-suc-nombre').getBoundingClientRect(), b = f.querySelector('.ir-suc-acc button').getBoundingClientRect(), d = f.querySelector('.ir-suc-datos').getBoundingClientRect(); return { nombreTop: Math.round(n.top), btnTop: Math.round(b.top), btnAlto: Math.round(b.height), datosTop: Math.round(d.top), nombreBottom: Math.round(n.bottom), nombreLeft: Math.round(n.left), btnLeft: Math.round(b.left), nombreRight: Math.round(n.right) }; }); });
    check(T('panel de sucursales: nombre y acción en la primera línea de cada local'), est.length === 5 && est.every(e => e.nombreLeft < e.btnLeft && Math.abs(e.nombreTop - e.btnTop) <= 14 && Math.abs((e.nombreTop + e.nombreBottom) / 2 - (e.btnTop + e.btnAlto / 2)) <= 14), JSON.stringify(est[0]));
    if (movil) check(T('panel móvil: fecha, estado y última venta debajo del nombre y botones ≥ 40 px'), est.every(e => e.datosTop >= e.nombreBottom - 2 && e.btnAlto >= 40), est.map(e => e.btnAlto).join(','));
    // nombre largo: sin desborde horizontal ni botones fuera de la pantalla
    await page.evaluate(() => { document.querySelector('.ir-suc-nombre').textContent = 'Sucursal con un nombre extraordinariamente largo de prueba 123456'; });
    const desb = await page.evaluate(() => { const p = document.querySelector('#irPanelSuc'); const b = document.querySelector('.ir-suc-acc button').getBoundingClientRect(); return { sw: p.scrollWidth, cw: p.clientWidth, docW: document.documentElement.scrollWidth, vw: innerWidth, btnRight: Math.round(b.right) }; });
    check(T('panel con nombre largo: sin desborde horizontal y el botón queda dentro de la pantalla'), desb.sw <= desb.cw + 1 && desb.docW <= desb.vw + 1 && desb.btnRight <= desb.vw, JSON.stringify(desb));
    await page.evaluate(() => { document.querySelector('.ir-suc-nombre').textContent = 'Paseo'; });
    await foto(page, 'atrasado-02-panel-sucursales', { fullPage: false });
    const antes = pedidos.length;
    await page.getByRole('button', { name: 'Excluir Centenario de esta vista' }).click();
    check(T('excluir requiere confirmación explícita y avisa que cambia ventas y stock'), /SIN esa sucursal/.test(await texto(page, '.ir-confirma')) && pedidos.length === antes, '');
    const conf = await page.evaluate(() => { const f = document.querySelector('.ir-suc-confirma'); const bs = [...f.querySelectorAll('.ir-suc-acc button')].map(b => { const r = b.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), h: Math.round(r.height) }; }); const m = document.querySelector('.ir-confirma').getBoundingClientRect(); return { bs, msgLeft: Math.round(m.left), msgRight: Math.round(m.right), vw: innerWidth, docW: document.documentElement.scrollWidth, foco: document.activeElement.textContent.trim() }; });
    check(T('confirmación de exclusión: botones y mensaje dentro de la pantalla, sin desborde, foco en Cancelar'), conf.bs.length === 2 && conf.bs.every(b => b.l >= 0 && b.r <= conf.vw && b.h >= (movil ? 40 : 28)) && conf.msgRight <= conf.vw && conf.docW <= conf.vw + 1 && conf.foco === 'Cancelar', JSON.stringify(conf));
    await foto(page, 'atrasado-03-confirmar-exclusion');
    await page.getByRole('button', { name: 'Confirmar exclusión' }).click();
    await page.waitForSelector(filas); await page.waitForTimeout(700);
    const ult = pedidos[pedidos.length - 1];
    check(T('tras confirmar se consulta SIN 0012 (respuesta coherente con el alcance)'), ult.get('sucursales') === '0001,0005,0010,0014', ult.toString());
    check(T('el alcance visible indica la exclusión y las ventas/stock dejan de depender de Centenario'), /Excluida/.test(await texto(page, '.ir-alcance')) && /Stock al día/.test(await texto(page, '.ir-alcance')) && (await page.locator('.ir-aviso').count()) === 0, await texto(page, '.ir-alcance'));
    const contB = (await page.locator('.ir-cont').allInnerTexts()).map(t => t.replace(/\n/g, ' '));
    check(T('con el alcance sin Centenario los contadores vuelven a clasificarse'), contB.every(t => /^\d+/.test(t)), contB.join(' | '));
    await foto(page, 'atrasado-04-centenario-excluida');
    await page.getByRole('button', { name: 'Volver a incluir' }).first().click(); await page.waitForTimeout(800);
    check(T('volver a incluir restituye el alcance y el aviso'), (await page.locator('.ir-aviso').count()) === 1 && pedidos[pedidos.length - 1].get('sucursales') === '0001,0005,0010,0012,0014', '');
    // recarga: la exclusion es solo de esta vista y la pantalla refleja las sucursales efectivamente consultadas
    if (!(await page.locator('#irPanelSuc').count())) await page.locator('.ir-alcance-btn').click();
    await page.getByRole('button', { name: 'Excluir Centenario de esta vista' }).click();
    await page.getByRole('button', { name: 'Confirmar exclusión' }).click(); await page.waitForSelector(filas); await page.waitForTimeout(600);
    check(T('exclusión vigente: el alcance visible lo indica'), /Excluida/.test(await texto(page, '.ir-alcance')), '');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#rtTabs .tab[data-view="oportunidades"]');
    await page.click('#rtTabs .tab[data-view="oportunidades"]');
    await page.click('.ov-subtab[data-subvista="ingresos"]');
    await page.waitForSelector(filas, { timeout: 15000 }); await page.waitForTimeout(500);
    const ultimo = pedidos[pedidos.length - 1];
    const alcance = await texto(page, '.ir-alcance');
    check(T('tras recargar: se consultan todas las sucursales y el alcance visible coincide (sin exclusión residual)'), ultimo.get('sucursales') === '0001,0005,0010,0012,0014' && !/Excluida/.test(alcance) && (movil ? /5 sucursales/.test(alcance) : /Centenario/.test(alcance)) && (await page.locator('.ir-aviso').count()) === 1, ultimo.toString() + ' | ' + alcance.replace(/\n/g, ' '));
    check(T('sin errores HTTP ni de script en el flujo atrasado'), fallos.length === 0, fallos.join(','));
    await ctx.close();

    // ═══ ESTADOS: carga, vacío, error, carrera de consultas ═══
    await ctl('escenario=alineado&vacio=0&error=0&retraso=2500');
    ({ ctx, page, pedidos, fallos } = await nueva());
    await abrir(page, false);
    await page.waitForSelector('.ir-esqueleto', { timeout: 5000 });
    check(T('carga: se ve el esqueleto con aria-busy'), (await page.locator('.ir-lista[aria-busy="true"]').count()) === 1, '');
    await foto(page, 'estado-carga');
    await page.waitForSelector(filas, { timeout: 15000 });
    // carrera: 15 d y enseguida 60 d con la API lenta; debe quedar 60 d
    await abrirFiltrosMovil(page);
    await ctl('retraso=1200');
    await page.locator('.ir-rapido', { hasText: /^15 d$/ }).click();
    await page.locator('.ir-rapido', { hasText: /^60 d$/ }).click();
    await page.waitForTimeout(3500);
    check(T('cambios rápidos: la respuesta vigente (60 d) no es reemplazada por una anterior'), /60 días/.test(await texto(page, '.ir-sub')) && (await page.locator('.ir-rapido.ir-activo').first().innerText()) === '60 d', await texto(page, '.ir-sub'));
    await ctx.close();
    await ctl('retraso=0&vacio=1');
    ({ ctx, page, pedidos, fallos } = await nueva());
    await abrir(page, false);
    await page.waitForSelector('.rt-state', { timeout: 10000 });
    check(T('vacío: mensaje claro'), /No hubo ingresos/.test(await texto(page, '.ir-lista')), '');
    await foto(page, 'estado-vacio');
    await ctx.close();
    await ctl('vacio=0&error=1');
    ({ ctx, page, pedidos, fallos } = await nueva());
    await abrir(page, false);
    await page.waitForSelector('.rt-state .btn-sm, .rt-state button', { timeout: 10000 });
    check(T('error: mensaje con botón Reintentar'), /No se pudieron consultar/.test(await texto(page, '.ir-lista')) && (await page.getByRole('button', { name: /Reintentar/ }).count()) >= 1, '');
    await foto(page, 'estado-error');
    await ctl('error=0');
    await page.getByRole('button', { name: /Reintentar/ }).first().click();
    await page.waitForSelector(filas, { timeout: 10000 });
    check(T('error: Reintentar recupera los datos'), (await cuantas(page)) > 0, '');
    await ctx.close();
  }
  await ctl('escenario=alineado&vacio=0&error=0&retraso=0');
  await browser.close();
  const fallidas = resultados.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, '..', 'resultados-validacion.json'), JSON.stringify({ fecha: new Date().toISOString(), total: resultados.length, fallidas: fallidas.length, resultados }, null, 2));
  console.log(`\n${resultados.length - fallidas.length}/${resultados.length} comprobaciones OK`);
  process.exit(fallidas.length ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message.split('\n').slice(0, 3).join(' | ')); process.exit(2); });
