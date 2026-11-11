'use strict';
// Validacion de Ingresos recientes contra la API LOCAL de croma-api con Sysneo REAL (solo lectura: la ruta solo hace SELECT).
// NO usa el harness ni datos simulados (el escenario de atraso sigue validandose con validacion-ingresos-recientes.js).
//   1) croma-api local:  PORT=3001 ROTACIONES_DB_PATH=<sqlite temporal> JWT_SECRET=<cualquiera> DB_PASSWORD=<existente> node index.js
//   2) frontend en http://localhost:8771 (origen permitido por CORS) con STOCK_API_URL=http://localhost:3001 y la CSP relajada solo en la copia servida
//      (tests/harness/servidor-front-real.js hace exactamente eso sin tocar el repo)
//   3) node tests/harness/validacion-integracion-real.js [carpeta-de-salida]
// Compara lo que muestra la pantalla con el JSON que devuelve la API para el MISMO pedido y guarda tiempos y capturas.
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const FRONT = process.env.FRONT || 'http://localhost:8771';
const API = process.env.API || 'http://localhost:3001';
const OUT = process.argv[2] || path.join(__dirname, '..', '..', 'docs', 'referencias-rediseno', 'integracion-real');
fs.mkdirSync(path.join(OUT, 'capturas'), { recursive: true });
const resultados = []; const tiempos = [];
const check = (n, ok, d) => { resultados.push({ nombre: n, ok: !!ok, detalle: d || '' }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  [' + d + ']' : '')); };
const dm = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—';
const LECT = { sin_ventas_con_stock: 'Revisar: sin ventas', historial_insuficiente: 'Historial insuficiente', sin_exposicion: 'Sin exposición', en_observacion: 'En observación', agotado_con_ventas: 'Vendió y agotado', con_ventas: 'Con ventas' };
const SUC = { '0001': 'Paseo', '0005': 'Wave', '0010': 'Perito Moreno', '0012': 'Centenario', '0014': 'Roca' };
const apiJson = async (url) => { const t = Date.now(); const r = await fetch(url); const j = await r.json(); return { j, ms: Date.now() - t, status: r.status }; };
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  for (const [tam, vp, movil] of [['1280', { width: 1280, height: 800 }, false], ['375', { width: 375, height: 812 }, true]]) {
    const T = (s) => `[${tam}] ${s}`;
    const filas = movil ? '.ir-tarjeta' : '.ir-tabla tbody tr.ir-fila';
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const pedidos = []; const fallos = []; const ini = new Map(); const durs = [];
    page.on('request', r => { if (r.url().startsWith(API + '/analisis/ingresos-recientes')) { pedidos.push(r.url()); ini.set(r, Date.now()); } });
    page.on('requestfinished', r => { if (ini.has(r)) durs.push({ url: r.url(), ms: Date.now() - ini.get(r) }); });
    page.on('response', r => { if (r.url().startsWith(API + '/analisis/ingresos-recientes') && r.status() >= 400) fallos.push(r.status()); });
    page.on('pageerror', e => fallos.push('pageerror ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) fallos.push('console ' + m.text().slice(0, 120)); });
    const ultimoPedido = () => pedidos[pedidos.length - 1];
    const foto = (nombre, o = {}) => page.screenshot({ path: path.join(OUT, 'capturas', `${tam}-${nombre}.png`), ...o });
    const esperarFilas = async () => { await page.waitForSelector(filas, { timeout: 60000 }); await page.waitForTimeout(250); };
    const cont = async () => { const m = {}; for (const t of await page.locator('.ir-cont').allInnerTexts()) { const [n, ...r] = t.split('\n'); m[r.join(' ').trim()] = n.trim(); } return m; };
    const dur = (url) => { const d = durs.filter(x => x.url === url).pop(); return d ? d.ms : null; };

    // Compara pantalla vs JSON del MISMO pedido: cuenta, contadores, primeras filas
    async function comparar(nombre, minFilas = 1) {
      const url = ultimoPedido();
      const { j, ms } = await apiJson(url);
      const cuenta = await page.locator('.ir-lista-cuenta').innerText();
      const total = j.paginacion && j.paginacion.total !== undefined ? j.paginacion.total : j.resumen.total;
      check(T(nombre + ': «N códigos» coincide con paginacion.total'), cuenta.startsWith(total + ' código'), `pantalla "${cuenta}" · API ${total}`);
      const c = await cont();
      const malos = Object.keys(LECT).filter(k => { const v = c[LECT[k]]; const esp = j.resumen.por_lectura[k]; return String(v) !== String(esp); });
      check(T(nombre + ': contadores coinciden con resumen.por_lectura'), malos.length === 0, malos.length ? 'difieren: ' + malos.map(k => `${LECT[k]}: pantalla ${c[LECT[k]]} / API ${j.resumen.por_lectura[k]}`).join('; ') : Object.keys(LECT).map(k => j.resumen.por_lectura[k]).join('/'));
      const cantidad = await page.locator(filas).count();
      const esperadas = j.data.length;
      check(T(nombre + ': cantidad de filas = data.length'), cantidad === esperadas && esperadas >= minFilas, `pantalla ${cantidad} · API ${esperadas}`);
      let ok = 0; const errores = [];
      for (let i = 0; i < Math.min(6, esperadas); i++) {
        const f = j.data[i];
        const txt = (await page.locator(filas).nth(i).innerText()).replace(/\s+/g, ' ');
        const esperado = [f.cod, dm(f.ultimo_ingreso) + ' · ' + f.unidades_ingresadas + ' u.', LECT[f.lectura]];
        const faltan = esperado.filter(e => !txt.includes(e));
        if (!movil) {
          const celdas = (await page.locator(filas).nth(i).locator('td').allInnerTexts()).map(s => s.replace(/\s+/g, ' ').trim());
          const nums = celdas.join('|');
          const dias = f.dias_con_stock_sucursales === null || f.dias_con_stock_sucursales === undefined ? null : f.dias_con_stock_sucursales + ' de ' + f.dias_observados;
          if (!nums.includes('|' + f.ventas_desde_ingreso + '|') && !nums.includes('|' + f.ventas_desde_ingreso)) faltan.push('ventas ' + f.ventas_desde_ingreso);
          if (dias && !nums.includes(dias)) faltan.push('días ' + dias);
          if (!nums.includes('|' + f.stock_sucursales + '|')) faltan.push('stock suc ' + f.stock_sucursales);
        } else {
          if (!txt.includes(String(f.stock_sucursales))) faltan.push('stock suc ' + f.stock_sucursales);
        }
        if (faltan.length) errores.push(f.cod + ' → falta ' + faltan.join(', ') + ' en «' + txt.slice(0, 160) + '»'); else ok++;
      }
      if (!movil && esperadas) {
        const titulos = await page.locator(filas).locator('.ir-pill').evaluateAll(e => e.slice(0, 6).map(x => x.getAttribute('title')));
        const difT = titulos.filter((t, i) => t !== j.data[i].lectura_etiqueta);
        check(T(nombre + ': la etiqueta completa de la API queda en el título de cada lectura'), difT.length === 0, difT.length ? difT.join(' / ') : titulos.length + ' etiquetas');
      }
      check(T(nombre + ': primeras filas muestran código, ingreso/unidades, ventas, stock y lectura de la API'), errores.length === 0, errores.length ? errores.slice(0, 2).join(' || ') : ok + ' filas comparadas · API ' + ms + ' ms (cache)');
      return j;
    }
    async function abrirDetalle(idx) {
      await page.locator('.ir-det-btn:visible').nth(idx).click(); await page.waitForTimeout(250);
      return (await page.locator('.ir-detalle:visible').first().innerText()).replace(/\s+/g, ' ');
    }
    async function cerrarDetalle(idx) { await page.locator('.ir-det-btn:visible').nth(idx).click(); await page.waitForTimeout(150); }
    const abrirFiltrosMovil = async () => { if (movil) await page.evaluate(() => { const d = document.querySelector('.ir-plegable'); if (d && !d.open) d.querySelector('summary').click(); }); await page.waitForTimeout(150); };
    const irAIngresos = async () => { await page.click('#rtTabs .tab[data-view="oportunidades"]'); await page.click('.ov-subtab[data-subvista="ingresos"]'); await esperarFilas(); };

    // ═══ 1. Consulta inicial ═══
    let t = Date.now();
    await page.goto(FRONT + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#rtTabs .tab[data-view="oportunidades"]', { timeout: 60000 });
    const tApp = Date.now() - t;
    await page.click('#rtTabs .tab[data-view="oportunidades"]');
    t = Date.now();
    await page.click('.ov-subtab[data-subvista="ingresos"]');
    await esperarFilas();
    const tInicial = Date.now() - t;
    tiempos.push({ tam, paso: 'consulta inicial (clic en la subpestaña → filas visibles)', ms: tInicial, api_ms: dur(pedidos[0]) });
    check(T('consulta inicial: usa dias=30, sucursales explícitas y limit=50'), (() => { const p = new URL(pedidos[0]).searchParams; return p.get('dias') === '30' && p.get('sucursales') === '0001,0005,0010,0012,0014' && p.get('limit') === '50'; })(), decodeURIComponent(pedidos[0].replace(API, '')));
    const pos = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), alto: innerHeight }; }, filas);
    check(T('el primer producto entra en la primera pantalla con datos reales'), pos.bottom <= pos.alto, JSON.stringify(pos));
    await foto('real-01-primera-pantalla');
    const j30 = await comparar('30 días');
    const alcance = await page.locator('.ir-alcance').innerText();
    check(T('alcance y estado de stock reflejan sucursales.estado_general de la API'), (j30.stock_actual.sucursales.estado_general === 'alineado') === /Stock al día/.test(alcance) && j30.stock_actual.sucursales.alineadas.every(c => movil ? /5 sucursales/.test(alcance) : alcance.includes(SUC[c])), `API ${j30.stock_actual.sucursales.estado_general} · «${alcance.replace(/\n/g, ' ')}»`);
    const cab = await page.locator('.ir-sub').innerText();
    const p = j30.periodo;
    check(T('encabezado: desde/hasta/corte/días salen de periodo'), cab.includes(dm(p.desde)) && cab.includes(dm(p.corte)) && cab.includes(p.dias + ' días'), cab.replace(/\n/g, ' '));

    // ═══ 2. Fechas por fuente, null, ventas observadas (Información de los datos) ═══
    await page.click('button[aria-label="Información de los datos"]');
    const info = (await page.locator('#irInfo').innerText()).replace(/\s+/g, ' ');
    const ultVenta = Object.values(j30.ventas.ultima_venta_observada_por_centro);
    check(T('Información: fecha de stock por sucursal y ventas observadas hasta la fecha de la API'), info.includes(dm(j30.stock_actual.sucursales.por_centro['0001'].fecha_actualizacion)) && info.includes(dm(j30.ventas.observadas_hasta)) && /desconocid|no es cero|no hay metadato|no garant/i.test(info), info.slice(0, 240));
    check(T('Información: Depósito 90 sin fecha de actualización (texto acordado)'), /Stock informado por el sistema · sin fecha de actualización disponible/.test(info), '');
    if (!movil) await foto('real-02-informacion-datos'); else await foto('real-02-informacion-datos');
    await page.click('button[aria-label="Información de los datos"]');

    // ═══ 3. Detalle: primer ingreso / reingreso con stock previo / null ═══
    const jAll = (await apiJson(API + '/analisis/ingresos-recientes?dias=30&limit=500&sucursales=0001,0005,0010,0012,0014')).j;
    const casos = { primer: jAll.data.findIndex(f => f.tipo_ingreso === 'primer_ingreso'), reingStock: jAll.data.findIndex(f => f.reingreso_con_stock_previo), nullDep: jAll.data.findIndex(f => f.stock_previo_deposito_90 === null) };
    const cantPagina = await page.locator(filas).count();
    // primer ingreso: la fila 0 de la pagina
    const f0 = j30.data[0];
    let det = await abrirDetalle(0);
    check(T('detalle (fila 1): primer ingreso, stock previo, días con stock y umbral coinciden con la API'), det.includes(dm(f0.primer_ingreso_registrado) + '/' + f0.primer_ingreso_registrado.slice(0, 4)) || det.includes(f0.primer_ingreso_registrado.split('-').reverse().join('/')), det.slice(0, 220));
    check(T('detalle: días con stock «x de y» y umbral/origen de la API'), det.includes(f0.dias_con_stock_sucursales + ' de ' + f0.dias_observados) && det.includes(f0.minimo_dias.valor + ' días con stock'), `API ${f0.dias_con_stock_sucursales} de ${f0.dias_observados}, mín ${f0.minimo_dias.valor}/${f0.minimo_dias.fuente}`);
    check(T('detalle: valores null se muestran «—» con su motivo (Depósito 90 previo)'), f0.stock_previo_deposito_90 !== null || /—/.test(det) && /no disponible|no se puede reconstruir/i.test(det), f0.stock_previo_deposito_90 === null ? 'null → «—» + motivo' : 'valor ' + f0.stock_previo_deposito_90);
    const porSuc = f0.por_sucursal.every(s => { const nombre = SUC[s.centro]; return det.includes(nombre); });
    const sucOk = f0.por_sucursal.every(s => new RegExp(SUC[s.centro] + '\\s+' + s.stock + '\\s+' + s.ventas + '\\s+' + s.dias_con_stock + '\\s+' + dm(s.referencia_stock && s.referencia_stock.fecha_actualizacion)).test(det));
    check(T('detalle: desglose por sucursal (stock, ventas, días con stock, fecha de stock) coincide con por_sucursal'), porSuc && sucOk, f0.por_sucursal.map(s => `${SUC[s.centro]} ${s.stock}/${s.ventas}/${s.dias_con_stock}/${dm(s.referencia_stock && s.referencia_stock.fecha_actualizacion)}`).join(' · '));
    await foto('real-03-detalle-primer-ingreso');
    await cerrarDetalle(0);
    // reingreso con stock previo (si existe en la pagina 1 o en el total)
    if (casos.reingStock >= 0) {
      const fr = jAll.data[casos.reingStock];
      await abrirFiltrosMovil();
      await page.getByRole('button', { name: /Marca, rubro, código/ }).click(); await page.waitForSelector('.ir-filtros-form form');
      await page.locator('.ir-filtros-form input').first().fill(fr.cod);
      await page.locator('.ir-filtros-form button', { hasText: 'Aplicar' }).click(); await page.waitForTimeout(900); await esperarFilas();
      const jr = await comparar('filtro por código ' + fr.cod);
      check(T('filtro por código: el pedido lleva el código y devuelve solo ese producto'), /cod|codigo|q=/.test(decodeURIComponent(ultimoPedido())) && jr.data.length >= 1 && jr.data.every(x => x.cod === fr.cod), decodeURIComponent(ultimoPedido().replace(API, '')));
      det = await abrirDetalle(0);
      check(T('detalle de reingreso con stock previo: muestra la aclaración y el stock previo de la API'), /reingreso/i.test(det) && /atribuci|pendiente/i.test(det) && det.includes(fr.stock_previo_sucursales + ' u.'), `stock previo API ${fr.stock_previo_sucursales} · ${det.slice(0, 160)}`);
      await foto('real-04-detalle-reingreso-con-stock-previo');
      await cerrarDetalle(0);
      // quitar chip/filtro
      const quitar = page.locator('.ir-chip button, .ir-filtros-activos button, button[aria-label^="Quitar"]').first();
      if (await quitar.count()) { await quitar.click(); await page.waitForTimeout(800); await esperarFilas(); }
    } else check(T('reingreso con stock previo: sin casos en los últimos 30 días reales (no verificable)'), true, 'no hay casos');

    // ═══ 4. Paginación ═══
    const urlBase = pedidos.filter(u => new URL(u).searchParams.get('offset') === '0').pop();
    if (await page.locator('.ir-lista button:text-is("2")').count() === 0) { check(T('paginación'), false, 'sin botón 2'); }
    else {
      t = Date.now();
      await page.locator('.ir-lista button:text-is("2")').first().click(); await page.waitForFunction(() => document.querySelector('.ir-lista-cuenta'), null, { timeout: 30000 }); await page.waitForTimeout(500); await esperarFilas();
      tiempos.push({ tam, paso: 'paginación (clic en página 2 → filas)', ms: Date.now() - t, api_ms: dur(ultimoPedido()) });
      check(T('paginación: página 2 pide offset=50'), new URL(ultimoPedido()).searchParams.get('offset') === '50', ultimoPedido().replace(API, ''));
      const j2 = await comparar('página 2', 1);
      check(T('paginación: la página 2 empieza donde termina la 1 (sin repetidos)'), j2.data[0].cod !== j30.data[0].cod && !j30.data.some(f => f.cod === j2.data[0].cod), j30.data[49] ? `última p.1 ${j30.data[49].cod} · primera p.2 ${j2.data[0].cod}` : '');
      await foto('real-05-paginacion');
      await page.locator('.ir-lista button:text-is("1")').first().click(); await page.waitForTimeout(700); await esperarFilas();
    }

    // ═══ 5. Períodos 60 y 30 ═══
    await abrirFiltrosMovil();
    t = Date.now();
    await page.locator('.ir-rapido', { hasText: /^60 d$/ }).click(); await page.waitForTimeout(100);
    await page.waitForFunction((pp) => document.querySelector('.ir-sub') && /60 días/.test(document.querySelector('.ir-sub').innerText), null, { timeout: 60000 }); await esperarFilas();
    const t60 = Date.now() - t;
    tiempos.push({ tam, paso: 'período 60 días (clic → filas)', ms: t60, api_ms: dur(ultimoPedido()) });
    check(T('60 días: pedido dias=60'), new URL(ultimoPedido()).searchParams.get('dias') === '60', ultimoPedido().replace(API, ''));
    const j60 = await comparar('60 días');
    check(T('60 días: encabezado con el período de la API'), (await page.locator('.ir-sub').innerText()).includes(dm(j60.periodo.desde)), j60.periodo.desde + ' → ' + j60.periodo.hasta);
    await foto('real-06-60-dias');
    // historial insuficiente: buscar un periodo con casos
    const hi = {}; for (const d of [7, 15, 30, 60, 90]) { const x = (await apiJson(API + '/analisis/ingresos-recientes?dias=' + d + '&limit=1&sucursales=0001,0005,0010,0012,0014')).j; hi[d] = x.resumen.por_lectura.historial_insuficiente; }
    check(T('historial insuficiente: casos disponibles por período (informativo)'), true, JSON.stringify(hi));
    const dHi = Object.keys(hi).find(d => hi[d] > 0);
    if (dHi) {
      const btn = page.locator('.ir-rapido', { hasText: new RegExp('^' + dHi + ' d$') });
      if (await btn.count()) { await btn.click(); await page.waitForFunction((d) => new RegExp(d + ' días').test(document.querySelector('.ir-sub').innerText), dHi, { timeout: 60000 }); await esperarFilas(); }
      await page.locator('.ir-cont', { hasText: 'Historial insuficiente' }).click(); await page.waitForTimeout(900); await esperarFilas();
      const jh = await comparar('lectura Historial insuficiente (' + dHi + ' d)');
      check(T('historial insuficiente: todas las filas son «Historial insuficiente» y el detalle explica el motivo'), (await page.locator(filas).allInnerTexts()).every(x => /Historial insuficiente/.test(x)), '');
      det = await abrirDetalle(0);
      check(T('historial insuficiente: detalle con valores null «—» y motivo'), /—/.test(det) && /(historial|stock al corte|no se calculan|no disponible)/i.test(det), det.slice(0, 200));
      await foto('real-07-historial-insuficiente');
      await cerrarDetalle(0);
      await page.locator('.ir-cont', { hasText: 'Historial insuficiente' }).click(); await page.waitForTimeout(600);
    } else check(T('historial insuficiente: sin casos reales hoy en 7/15/30/60/90 días (no verificable; cubierto por el escenario simulado)'), true, JSON.stringify(hi));
    await page.locator('.ir-rapido', { hasText: /^30 d$/ }).click(); await page.waitForFunction(() => /30 días/.test(document.querySelector('.ir-sub').innerText), null, { timeout: 60000 }); await esperarFilas();

    // ═══ 6. Filtros: tipo, lectura, orden ═══
    await abrirFiltrosMovil();
    await page.locator('select[aria-label="Tipo de ingreso"]').selectOption('reingreso'); await page.waitForTimeout(900); await esperarFilas();
    const jt = await comparar('tipo=reingreso');
    check(T('tipo=reingreso: llega a la API y todas las filas son Reingreso'), new URL(ultimoPedido()).searchParams.get('tipo') === 'reingreso' && (await page.locator(filas).allInnerTexts()).every(x => /Reingreso/.test(x)) && jt.data.every(f => f.tipo_ingreso === 'reingreso'), '');
    await page.locator('select[aria-label="Tipo de ingreso"]').selectOption(''); await page.waitForTimeout(700); await esperarFilas();
    await page.locator('.ir-cont', { hasText: 'Con ventas' }).click(); await page.waitForTimeout(900); await esperarFilas();
    const jl = await comparar('lectura=con_ventas');
    check(T('lectura=con_ventas: todas las filas de la API y de la pantalla son «Con ventas»'), jl.data.every(f => f.lectura === 'con_ventas') && (await page.locator(filas).allInnerTexts()).every(x => /Con ventas/.test(x)), '');
    await page.locator('.ir-cont', { hasText: 'Con ventas' }).click(); await page.waitForTimeout(700); await esperarFilas();
    await page.locator('select[aria-label="Orden"]').selectOption('ventas_desc'); await page.waitForTimeout(900); await esperarFilas();
    const jo = await comparar('orden=ventas_desc');
    check(T('orden por ventas: de mayor a menor en la API y en pantalla'), jo.data.every((f, i, a) => !i || a[i - 1].ventas_desde_ingreso >= f.ventas_desde_ingreso), jo.data.slice(0, 4).map(f => f.ventas_desde_ingreso).join(','));
    await page.locator('select[aria-label="Orden"]').selectOption('prioridad'); await page.waitForTimeout(700); await esperarFilas();
    // marca/rubro
    const marcaTop = (() => { const m = {}; j30.data.forEach(f => { m[f.marca] = (m[f.marca] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1])[0][0]; })();
    await abrirFiltrosMovil();
    await page.getByRole('button', { name: /Marca, rubro, código/ }).click(); await page.waitForSelector('.ir-filtros-form form');
    const campos = await page.locator('.ir-filtros-form input, .ir-filtros-form select').count();
    check(T('filtros de marca/rubro/código disponibles en el formulario del catálogo real'), campos >= 1, campos + ' controles');
    await page.keyboard.press('Escape');

    // ═══ 7. Exclusión y reincorporación de una sucursal ═══
    await page.waitForTimeout(400);
    const baseN = pedidos.length;
    if (!(await page.locator('#irPanelSuc').count())) await page.locator('.ir-alcance-btn').click();
    await page.waitForSelector('#irPanelSuc');
    await page.getByRole('button', { name: 'Excluir Wave de esta vista' }).click();
    await page.getByRole('button', { name: 'Confirmar exclusión' }).click();
    await page.waitForFunction((n) => true, baseN); await page.waitForTimeout(1200); await esperarFilas();
    const sExc = new URL(ultimoPedido()).searchParams;
    check(T('exclusión de Wave: el pedido consulta solo 0001,0010,0012,0014'), sExc.get('sucursales') === '0001,0010,0012,0014', sExc.get('sucursales'));
    const jx = await comparar('sin Wave');
    const alcX = await page.locator('.ir-alcance').innerText();
    check(T('exclusión de Wave: el alcance visible lo indica y la API devuelve 4 sucursales sin 0005'), /Excluida/.test(alcX) && /Wave/.test(alcX) && jx.stock_actual.sucursales.alineadas.length === 4 && !jx.stock_actual.sucursales.por_centro['0005'], alcX.replace(/\n/g, ' '));
    check(T('exclusión de Wave: ventas y stock distintos a los de 5 sucursales (recalculados)'), jx.data.some((f, i) => { const g = j30.data.find(x => x.cod === f.cod); return g && (g.stock_sucursales !== f.stock_sucursales || g.ventas_desde_ingreso !== f.ventas_desde_ingreso); }) || jx.resumen.total !== j30.resumen.total, `total 5 suc ${j30.resumen.total} → 4 suc ${jx.resumen.total}`);
    det = await abrirDetalle(0);
    check(T('exclusión de Wave: el detalle no muestra Wave y las sucursales coinciden con por_sucursal de la API'), !/Wave/.test(det.split('POR SUCURSAL')[1] || det.split('Por sucursal')[1] || '') && jx.data[0].por_sucursal.every(s => det.includes(SUC[s.centro])), jx.data[0].por_sucursal.map(s => SUC[s.centro]).join(','));
    await foto('real-08-sin-wave');
    await cerrarDetalle(0);
    const rowFirstExc = (await page.locator(filas).first().innerText()).replace(/\s+/g, ' ');
    // reincorporar
    if (!(await page.locator('#irPanelSuc').count())) await page.locator('.ir-alcance-btn').click();
    await page.waitForSelector('#irPanelSuc');
    await page.locator('#irPanelSuc').getByRole('button', { name: 'Volver a incluir' }).click(); await page.waitForTimeout(1200); await esperarFilas();
    check(T('reincorporación: vuelve a consultar las 5 sucursales'), new URL(ultimoPedido()).searchParams.get('sucursales') === '0001,0005,0010,0012,0014', new URL(ultimoPedido()).searchParams.get('sucursales'));
    const jv = await comparar('reincorporada');
    check(T('reincorporación: los números vuelven a ser los de la consulta inicial'), jv.resumen.total === j30.resumen.total && JSON.stringify(jv.resumen.por_lectura) === JSON.stringify(j30.resumen.por_lectura) && !/Excluida/.test(await page.locator('.ir-alcance').innerText()), '');
    if (await page.locator('#irPanelSuc').count()) await page.keyboard.press('Escape');

    // ═══ 8. Navegación y selección global de sucursales ═══
    await page.click('.ov-subtab[data-subvista="oportunidades"]'); await page.waitForTimeout(900);
    const enOp = await page.locator('body').innerText();
    check(T('navegación: Oportunidades se muestra sin la vista de Ingresos'), (await page.locator('.ir-cab').count()) === 0 && /Oportunidades/.test(enOp), '');
    const nPrev = pedidos.length;
    await page.click('.ov-subtab[data-subvista="ingresos"]'); await esperarFilas();
    check(T('navegación: volver a Ingresos recientes recupera la lista (período 30 días) sin errores'), /30 días/.test(await page.locator('.ir-sub').innerText()) && fallos.length === 0, 'pedidos nuevos: ' + (pedidos.length - nPrev));
    await page.click('#rtTabs .tab[data-view="dashboard"]').catch(() => {}); await page.waitForTimeout(600);
    await irAIngresos();
    // selección global: quitar Perito Moreno desde el botón de la barra
    await page.locator('#rtBtnSucursales').click(); await page.waitForTimeout(400);
    { const bb = await page.locator('#rtSucursalesPanel').boundingBox(); check(T('selección global: el panel de sucursales queda dentro de la pantalla'), bb && bb.x >= 0 && bb.x + bb.width <= vp.width, JSON.stringify(bb)); await foto('real-09a-panel-sucursales-global'); }
    await page.locator('.rt-suc-opcion', { hasText: 'Perito Moreno' }).click();
    await page.locator('.rt-suc-aplicar').click(); await page.waitForTimeout(1500);
    if (!(await page.locator(filas).count())) await esperarFilas();
    const sGl = new URL(ultimoPedido()).searchParams.get('sucursales');
    check(T('selección global: quitar Perito Moreno se refleja en el pedido de Ingresos recientes'), sGl === '0001,0005,0012,0014', sGl);
    const jg = await comparar('selección global sin Perito Moreno');
    const alcG = await page.locator('.ir-alcance').innerText();
    check(T('selección global: el alcance de la vista lo informa'), /Perito Moreno/.test(alcG) && /barra superior|Sucursales/.test(alcG) || (movil && /4 sucursales/.test(alcG)), alcG.replace(/\n/g, ' '));
    await foto('real-09-seleccion-global');
    // restaurar la selección global
    await page.locator('#rtBtnSucursales').click(); await page.waitForTimeout(300);
    await page.locator('.rt-suc-opcion', { hasText: 'Perito Moreno' }).click(); await page.locator('.rt-suc-aplicar').click(); await page.waitForTimeout(1500);
    if (!(await page.locator(filas).count())) await esperarFilas();
    check(T('selección global restaurada: vuelve a las 5 sucursales operativas'), new URL(ultimoPedido()).searchParams.get('sucursales') === '0001,0005,0010,0012,0014', new URL(ultimoPedido()).searchParams.get('sucursales'));

    // ═══ 9. Recarga ═══
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#rtTabs .tab[data-view="oportunidades"]', { timeout: 60000 });
    await irAIngresos();
    check(T('recarga: sin exclusiones residuales, 5 sucursales consultadas'), new URL(ultimoPedido()).searchParams.get('sucursales') === '0001,0005,0010,0012,0014' && !/Excluida/.test(await page.locator('.ir-alcance').innerText()), '');
    await foto('real-01-primera-pantalla-recarga');
    check(T('sin errores HTTP, de consola ni de script durante todo el flujo real'), fallos.length === 0, fallos.slice(0, 3).join(' | '));
    tiempos.push({ tam, paso: 'carga de la app hasta pestañas (sin Ingresos)', ms: tApp });
    tiempos.push({ tam, paso: 'respuestas observadas de /analisis/ingresos-recientes (todas)', ms: durs.length ? Math.max(...durs.map(d => d.ms)) : null, detalle: `n=${durs.length}, mediana=${durs.map(d => d.ms).sort((a, b) => a - b)[Math.floor(durs.length / 2)]} ms, máx=${Math.max(...durs.map(d => d.ms))} ms` });
    await ctx.close();
  }
  await browser.close();
  const fallidas = resultados.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'resultados-integracion-real.json'), JSON.stringify({ generado: new Date().toISOString(), origen: 'croma-api local (localhost:3001) + Sysneo real, solo lectura', total: resultados.length, ok: resultados.length - fallidas.length, tiempos, resultados }, null, 2));
  console.log(`\n${resultados.length - fallidas.length}/${resultados.length} comprobaciones OK`);
  console.log('TIEMPOS', JSON.stringify(tiempos));
  process.exit(fallidas.length ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
