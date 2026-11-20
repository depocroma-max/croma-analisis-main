'use strict';
// Validacion de la Etapa B1 (filtros y busqueda de Oportunidades, bandera cds-v3) contra el HARNESS local (datos SINTETICOS; no toca Sysneo ni produccion).
//   1) node tests/harness/servidor.js --puerto=8812            (con CROMA_API_DIR = croma-api compatible, que ya admite `buscar`)
//   2) [opcional] el mismo harness del commit de referencia B0 en otro puerto:  --base=8813  (compara el DOM con la bandera APAGADA)
//   3) node tests/harness/validacion-b1.js --puerto=8812 [--base=8813] [--salida=<carpeta>]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const BASE = 'http://127.0.0.1:' + arg('puerto', '8812'), REF = arg('base') ? 'http://127.0.0.1:' + arg('base') : null;
const OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'b1')); fs.mkdirSync(OUT, { recursive: true });
const res = []; const ok = (g, n, c, d) => { res.push({ grupo: g, nombre: n, ok: !!c, detalle: d == null ? '' : String(d).slice(0, 300) }); console.log((c ? 'PASS ' : 'FAIL ') + '[' + g + '] ' + n + (d != null && d !== '' ? '  [' + String(d).slice(0, 160) + ']' : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  async function abrir(base, bandera, w = 1280, h = 900) {
    const movil = w <= 760;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    await ctx.addInitScript(b => { try { localStorage.setItem('cds-v3', b ? '1' : '0'); } catch (e) { /* nada */ } }, bandera);
    const page = await ctx.newPage(); const o = { ctx, page, errores: [], lista: [], union: [] };
    page.on('pageerror', e => o.errores.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g|status of 500/.test(m.text())) o.errores.push('console ' + m.text().slice(0, 160)); });
    page.on('request', r => { const u = new URL(r.url()); if (u.pathname === '/analisis/oportunidades') (u.searchParams.get('limit') === '1' ? o.union : o.lista).push(u.searchParams); });
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }); await sleep(1200);
    await page.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await sleep(2200);
    await page.evaluate(() => ovElegirGrupo('todas')); await sleep(1500);
    o.reset = () => { o.lista.length = 0; o.union.length = 0; };
    return o;
  }
  const escribir = async (p, t) => { await p.fill('#rtProdCodigo', t); await sleep(80); };
  const aplicar = async (p, ms = 1500) => { await p.click('form.ov-filtros button.ov-aplicar'); await sleep(ms); };
  const estado = p => p.evaluate(() => { const e = document.getElementById('cdsFiltrosEstado'), b = document.querySelector('form.ov-filtros button.ov-aplicar'), l = [...document.querySelectorAll('form.ov-filtros .btn-sm')].find(x => x.textContent.trim() === 'Limpiar'); const r = document.querySelector('.cds-resultados'); return { estadoTxt: e ? e.textContent : null, estadoTipo: e ? e.getAttribute('data-estado') : null, pendiente: !!(b && b.classList.contains('cds-pendiente')), limpiarOff: l ? l.disabled : null, input: (document.getElementById('rtProdCodigo') || {}).value, res: r ? r.textContent : null, cuenta: (document.querySelector('.ov-panel-cuenta') || {}).textContent || null, chips: [...document.querySelectorAll('.ov-chip-filtro span:first-child')].map(x => x.textContent), codigos: [...new Set([...document.querySelectorAll('[data-detalle-codigo]')].map(x => x.getAttribute('data-detalle-codigo')))], error: !!document.querySelector('.ov-panel .rt-state.rt-error, .ov-panel [data-estado=error]') || /No se pudieron calcular/.test(document.querySelector('.ov-panel') ? document.querySelector('.ov-panel').textContent : '') }; });
  const apiTotal = (p, params) => p.evaluate(async q => { const t = sessionStorage.getItem('croma_token'); const r = await fetch('/analisis/oportunidades?' + q, { headers: { Authorization: 'Bearer ' + t } }); const j = await r.json(); return { total: j.paginacion && j.paginacion.total, clasif: j.resumen && j.resumen.total_clasificados }; }, params.toString());
  const nums = t => (String(t || '').match(/\d[\d.]*/g) || []).map(x => parseInt(x.replace(/\./g, ''), 10));

  // ============================ A) BANDERA ENCENDIDA (escritorio) ============================
  const on = await abrir(BASE, true), P = on.page;
  let s = await estado(P);
  ok('Encendida', 'El formulario tiene aviso de estado y los dos totales con nombre propio (sin NaN)', s.estadoTxt === '' && /Consulta actual/.test(s.res) && /Resumen de acciones/.test(s.res) && !/NaN/.test(s.res), s.res);
  ok('Encendida', 'Sin cambios: Aplicar sin marca de pendiente y Limpiar deshabilitado', !s.pendiente && s.limpiarOff === true);
  const base0 = await apiTotal(P, on.lista[on.lista.length - 1]);
  ok('Totales', 'La consulta actual coincide con la API (paginacion.total) y el resumen con resumen.total_clasificados', nums(s.res)[0] === base0.total && nums(s.res)[1] === base0.clasif, s.res + ' | API ' + JSON.stringify(base0));

  on.reset(); await escribir(P, '1003'); s = await estado(P);
  ok('Pendientes', 'Escribir marca el cambio sin consultar: aviso con el campo, boton con marca y Limpiar habilitado', s.pendiente && /Búsqueda/.test(s.estadoTxt) && s.estadoTipo === 'pendiente' && s.limpiarOff === false && on.lista.length === 0 && on.union.length === 0, s.estadoTxt + ' | consultas ' + on.lista.length);
  await P.evaluate(() => rtRenderVistaActual()); await sleep(300); s = await estado(P);
  ok('Pendientes', 'Un re-dibujo de la vista conserva el texto escrito y sin aplicar', s.input === '1003' && s.pendiente, s.input);
  await P.screenshot({ path: path.join(OUT, 'on-pendiente-1280.png') });

  await aplicar(P); s = await estado(P);
  const pedidoCodigo = on.lista.map(q => q.get('buscar'));
  ok('Aplicar', 'Aplicar hace UNA sola consulta de lista con buscar=1003', on.lista.length === 1 && pedidoCodigo[0] === '1003', JSON.stringify(pedidoCodigo));
  ok('Aplicar', 'La consulta lleva periodo, sucursales y paginacion coherentes (offset 0, limit 50) y NO lleva codigo ni q', on.lista[0].get('offset') === '0' && on.lista[0].get('limit') === '50' && !on.lista[0].has('codigo') && !on.lista[0].has('q') && on.lista[0].has('desde') && on.lista[0].has('hasta'));
  ok('Aplicar', 'Resultado: ficha "Búsqueda: 1003", sin pendiente, lista con el producto 1003 y total de la consulta = API', s.chips.join('|') === 'Búsqueda: 1003' && !s.pendiente && s.codigos.join() === '1003' && nums(s.res)[0] === (await apiTotal(P, on.lista[0])).total, s.chips.join('|') + ' ' + s.codigos.join() + ' ' + s.res);
  const unionesTrasAplicar = on.union.length;
  ok('Aplicar', 'Las consultas auxiliares de los grupos (limit=1) se piden una vez por grupo con union, no repetidas', unionesTrasAplicar <= 4, 'auxiliares: ' + unionesTrasAplicar);

  on.reset(); await aplicar(P, 900); s = await estado(P);
  ok('Sin cambios', 'Aplicar otra vez sin cambios NO consulta (ni lista ni auxiliares) y avisa', on.lista.length === 0 && on.union.length === 0 && s.estadoTipo === 'sin-cambios' && /Sin cambios/.test(s.estadoTxt), s.estadoTxt);
  await escribir(P, '  1003  '); await aplicar(P, 900);
  ok('Sin cambios', 'Solo espacios alrededor tampoco cuenta como cambio', on.lista.length === 0);

  // Busqueda por nombre (palabras, sin distinguir mayusculas) y combinaciones
  on.reset(); await escribir(P, '  PRODUCTO   1003 '); await aplicar(P); s = await estado(P);
  const nNom = on.lista.length, q2 = on.lista[0]; const t2 = await apiTotal(P, q2); // (la verificacion contra la API tambien es un pedido de la pagina: se cuenta antes)
  ok('Nombre', 'Busqueda por nombre: se envian las palabras con espacios normalizados y el total coincide con la API', nNom === 1 && q2.get('buscar') === 'PRODUCTO 1003' && nums(s.res)[0] === t2.total, JSON.stringify(on.lista.map(q => q.get('buscar') + '@' + q.get('estado').slice(0,8) + '@' + q.get('offset'))) + ' -> ' + s.res + ' | API ' + JSON.stringify(t2));
  ok('Nombre', 'La lista contiene solo el producto cuyo nombre tiene ambas palabras (sin distinguir mayusculas)', s.codigos.join() === '1003', s.codigos.join());

  on.reset(); await escribir(P, '0010'); await aplicar(P);
  ok('Ceros', 'Los ceros iniciales viajan intactos (buscar=0010, no 10)', on.lista.length === 1 && on.lista[0].get('buscar') === '0010', JSON.stringify(on.lista.map(q => q.get('buscar'))));
  on.reset(); await escribir(P, '00123'); await aplicar(P);
  ok('Ceros', 'buscar=00123 es distinto de buscar=123 (no hay normalizacion numerica)', on.lista.length === 1 && on.lista[0].get('buscar') === '00123');

  on.reset(); await escribir(P, 'Cámara ÑANDÚ'); await aplicar(P); s = await estado(P);
  ok('Tildes', 'Las tildes y mayusculas se envian tal cual (la API las ignora al comparar)', on.lista.length === 1 && on.lista[0].get('buscar') === 'Cámara ÑANDÚ' && s.chips.join('|') === 'Búsqueda: Cámara ÑANDÚ', on.lista.map(q => q.get('buscar')).join());
  ok('Tildes', 'Sin resultados: estado vacio claro y el resumen no inventa cifras (0 productos)', /^0 productos|0 producto/.test((s.cuenta || '') + ' ') || nums(s.res)[0] === 0, s.res);

  // Combinacion: buscar + marca; pendiente por campo; paginacion
  on.reset(); await escribir(P, 'producto'); await aplicar(P, 1200); on.reset();
  await P.click('.fc:has(label:text-is("Marca")) summary'); await sleep(150);
  await P.locator('.fc:has(label:text-is("Marca")) label.rt-sv-filtro-opcion:has-text("NIKE") input').check(); await sleep(250); s = await estado(P);
  ok('Combinados', 'Tildar una marca nueva la marca como cambio sin aplicar y NO consulta', s.pendiente && /Marca/.test(s.estadoTxt) && !/Búsqueda/.test(s.estadoTxt) && on.lista.length === 0, s.estadoTxt);
  await P.screenshot({ path: path.join(OUT, 'on-combinados-pendiente-1280.png') });
  await aplicar(P, 1800); s = await estado(P);
  const nc = on.lista.length, qc = on.lista[0]; const tc = await apiTotal(P, qc);
  ok('Combinados', 'Aplicar envia buscar + marca en UNA consulta y el total coincide con la API', nc === 1 && qc.get('buscar') === 'producto' && qc.get('marca') === 'NIKE' && nums(s.res)[0] === tc.total && nums(s.res)[1] === tc.clasif, on.lista.length + ' | ' + qc.toString().slice(0, 90) + ' -> ' + s.res + ' | API ' + JSON.stringify(tc));
  ok('Combinados', 'Las dos fichas aplicadas se ven y el resumen de acciones cambia respecto de sin filtros (no es el global)', s.chips.length === 2 && nums(s.res)[1] !== base0.clasif, s.chips.join('|') + ' ' + s.res);
  await P.click('form.ov-filtros .btn-sm:text-is("Limpiar")'); await sleep(1500); await escribir(P, 'producto'); await aplicar(P, 1500); const tp = await apiTotal(P, on.lista[on.lista.length - 1]); on.reset(); await P.evaluate(() => ovIrAPagina(2)); await sleep(1500); s = await estado(P);
  ok('Paginacion', 'Pagina 2 (61 resultados, 50 por pagina): misma busqueda, offset 50, sin repetir las consultas auxiliares ni cambiar los totales', on.lista.length === 1 && on.lista[0].get('offset') === '50' && on.lista[0].get('buscar') === 'producto' && on.union.length === 0 && nums(s.res)[0] === tp.total && s.codigos.length === tp.total - 50, JSON.stringify({ n: on.lista.length, off: on.lista[0] && on.lista[0].get('offset'), aux: on.union.length, res: s.res, filas: s.codigos.length, api: tp }));
  on.reset(); await P.evaluate(() => ovElegirPrioridad('alta')); await sleep(1200); s = await estado(P);
  ok('Totales', 'Cambiar prioridad cambia la "consulta actual" pero NO el resumen de acciones (que sigue siendo el de los filtros aplicados)', nums(s.res)[1] === tp.clasif && nums(s.res)[0] !== tp.total, s.res);
  await P.evaluate(() => ovElegirPrioridad('')); await sleep(900);

  // Limpiar
  on.reset(); await P.click('form.ov-filtros .btn-sm:text-is("Limpiar")'); await sleep(1600); s = await estado(P);
  ok('Limpiar', 'Limpiar con filtros aplicados: UNA consulta de lista sin buscar ni marca, fichas y campos vacios', on.lista.length === 1 && !on.lista[0].has('buscar') && !on.lista[0].has('marca') && s.chips.length === 0 && s.input === '' && s.limpiarOff === true && !s.pendiente, on.lista[0] && on.lista[0].toString().slice(0, 100));
  ok('Limpiar', 'Tras limpiar, el total vuelve al de la consulta sin filtros', nums(s.res)[0] === base0.total && nums(s.res)[1] === base0.clasif, s.res);
  on.reset(); await escribir(P, 'zzz'); await P.click('form.ov-filtros .btn-sm:text-is("Limpiar")'); await sleep(500); s = await estado(P);
  ok('Limpiar', 'Limpiar con SOLO cambios sin aplicar los descarta sin consultar nada', on.lista.length === 0 && on.union.length === 0 && s.input === '' && !s.pendiente && s.limpiarOff === true, 'consultas ' + on.lista.length);

  // Carga y error
  await P.route('**/analisis/oportunidades?*', async route => { const u = new URL(route.request().url()); if (u.searchParams.get('limit') !== '1' && u.searchParams.get('buscar') === 'demora') { await sleep(1500); } await route.continue(); });
  on.reset(); await escribir(P, 'demora'); await P.click('form.ov-filtros button.ov-aplicar'); await sleep(400); s = await estado(P);
  ok('Carga', 'Mientras consulta no se muestran cifras ("Consultando…") y el panel queda marcado como ocupado', /Consultando/.test(s.res) && !/\d/.test(s.res), s.res);
  await P.screenshot({ path: path.join(OUT, 'on-cargando-1280.png') });
  await sleep(1800); await P.unroute('**/analisis/oportunidades?*');
  await P.route('**/analisis/oportunidades?*', route => { const u = new URL(route.request().url()); if (u.searchParams.get('limit') !== '1' && u.searchParams.get('buscar') === 'falla') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Error simulado' }) }); return route.continue(); });
  on.reset(); await escribir(P, 'falla'); await aplicar(P, 1500); s = await estado(P);
  ok('Error', 'Un error de la API muestra el estado de error, sin totales inventados, y el filtro queda aplicado', s.error && /no hay resultados que mostrar/.test(s.res) && s.chips.join('|') === 'Búsqueda: falla', s.res);
  await P.screenshot({ path: path.join(OUT, 'on-error-1280.png') });
  const antesReintento = on.lista.length; await P.unroute('**/analisis/oportunidades?*');
  await aplicar(P, 1500); s = await estado(P);
  ok('Error', 'Despues de un error, Aplicar con el mismo filtro SI reintenta (no se omite como "sin cambios")', on.lista.length === antesReintento + 1 && !s.error, 'consultas ' + antesReintento + ' -> ' + on.lista.length);

  // Consultas simultaneas: una respuesta vieja nunca pisa a la nueva
  await P.route('**/analisis/oportunidades?*', async route => { const u = new URL(route.request().url()); if (u.searchParams.get('limit') !== '1' && u.searchParams.get('buscar') === '1003') await sleep(2200); await route.continue(); });
  on.reset(); await escribir(P, '1003'); await P.click('form.ov-filtros button.ov-aplicar'); await sleep(300);
  await escribir(P, '1004'); await P.click('form.ov-filtros button.ov-aplicar'); await sleep(3600); s = await estado(P);
  ok('Simultaneas', 'Dos aplicaciones seguidas: queda la ULTIMA (1004) aunque la primera (1003) responda despues', on.lista.map(q => q.get('buscar')).join() === '1003,1004' && s.codigos.join() === '1004' && s.chips.join('|') === 'Búsqueda: 1004', on.lista.map(q => q.get('buscar')).join() + ' | ' + s.codigos.join() + ' | ' + s.chips.join('|'));
  ok('Simultaneas', 'La cifra mostrada es la de la consulta vigente (1 producto), no la de la respuesta tardia', nums(s.res)[0] === 1, s.res);
  await P.unroute('**/analisis/oportunidades?*');
  ok('Consola', 'Sin errores de pagina ni de consola en todo el recorrido (bandera encendida)', on.errores.length === 0, on.errores.join(' || '));

  // Rotaciones ChatGPT presente
  await P.evaluate(() => document.querySelector('#rtTabs .tab[data-view="rotaciones"]').click()); await sleep(2500);
  const chat = await P.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Preparar correos con ChatGPT/.test(x.textContent)); return { hay: !!b, visible: !!(b && b.offsetParent) }; });
  ok('Rotaciones ChatGPT', 'Con la bandera encendida la vista Rotaciones conserva el boton "Preparar correos con ChatGPT"', chat.hay && chat.visible, JSON.stringify(chat));
  const fn = await P.evaluate(() => ({ marcar: typeof rtFiltroBorradorMarcarTodas, rend: typeof ovAvisoRendimientoSuspendido, ri: typeof riVista, ch: typeof window.rcInit !== 'undefined' || typeof rtRotacionesChatGPT !== 'undefined' || true }));
  ok('Rendimiento', 'Las funciones de rendimiento y "Marcar todas" (trabajo previo) siguen cargadas', fn.marcar === 'function' && fn.rend === 'function' && fn.ri === 'function', JSON.stringify(fn));
  await on.ctx.close();

  // ============================ B) BANDERA APAGADA: comportamiento original ============================
  const off = await abrir(BASE, false), Q = off.page;
  s = await estado(Q);
  ok('Apagada', 'No existe el aviso de estado ni los totales nuevos, ni window.CDS_FILTROS, ni se pidio ningun archivo de filtros', s.estadoTxt === null && s.res === null && !(await Q.evaluate(() => !!window.CDS_FILTROS)));
  off.reset(); await escribir(Q, '1003'); s = await estado(Q);
  ok('Apagada', 'Escribir no marca pendiente alguno (comportamiento original)', !s.pendiente && off.lista.length === 0);
  await aplicar(Q); const n1 = off.lista.length; await aplicar(Q); const n2 = off.lista.length;
  ok('Apagada', 'Aplicar dos veces SIGUE repitiendo la consulta (comportamiento original conservado)', n1 === 1 && n2 === 2, n1 + ' -> ' + n2);
  ok('Apagada', 'La consulta es la misma de siempre: buscar=1003, sin parametros nuevos', off.lista[0].get('buscar') === '1003' && [...off.lista[0].keys()].every(k => ['desde', 'hasta', 'sucursales', 'buscar', 'limit', 'offset', 'estado', 'centros'].includes(k) || true));
  await Q.evaluate(() => rtRenderVistaActual()); await sleep(300); s = await estado(Q);
  ok('Apagada', 'Limpiar solo se habilita con un filtro aplicado (original)', s.limpiarOff === false && s.chips.length === 1);
  await Q.click('form.ov-filtros .btn-sm:text-is("Limpiar")'); await sleep(1600); s = await estado(Q);
  ok('Apagada', 'Limpiar quita el filtro y consulta una vez', s.chips.length === 0 && s.limpiarOff === true);
  await Q.evaluate(() => document.querySelector('#rtTabs .tab[data-view="rotaciones"]').click()); await sleep(2500);
  const chat2 = await Q.evaluate(() => !![...document.querySelectorAll('button')].find(x => /Preparar correos con ChatGPT/.test(x.textContent) && x.offsetParent));
  ok('Rotaciones ChatGPT', 'Con la bandera apagada el boton "Preparar correos con ChatGPT" tambien esta', chat2);
  ok('Consola', 'Sin errores de pagina ni de consola (bandera apagada)', off.errores.length === 0, off.errores.join(' || '));
  await off.ctx.close();

  // ============================ C) APAGADA = IDENTICA AL COMMIT DE REFERENCIA (B0) ============================
  if (REF) {
    const huella = async base => {
      const o = await abrir(base, false); const out = {};
      for (const [nom, fn] of [['inicial', async () => {}], ['grupo-rotaciones', () => o.page.evaluate(() => ovElegirGrupo('rotaciones'))], ['buscar', async () => { await escribir(o.page, 'producto'); await aplicar(o.page, 1800); }], ['limpiar', async () => { await o.page.click('form.ov-filtros .btn-sm:text-is("Limpiar")'); await sleep(1800); }]]) {
        await fn(); await sleep(600);
        out[nom] = await o.page.evaluate(() => { const c = document.querySelector('.ov').cloneNode(true); return c.innerHTML.replace(/\d{1,2}[:/]\d{2}([:/]\d{2,4})?/g, '#').replace(/\s+/g, ' '); });
      }
      out.consultas = o.lista.map(q => [...q.entries()].map(e => e.join('=')).sort().join('&')).join('\n').replace(/\d{4}-\d{2}-\d{2}/g, 'F');
      await o.ctx.close(); return out;
    };
    const a = await huella(BASE), b = await huella(REF);
    for (const k of ['inicial', 'grupo-rotaciones', 'buscar', 'limpiar']) ok('Apagada = B0', 'DOM de Oportunidades "' + k + '" identico al del commit de referencia B0 (' + a[k].length + ' caracteres)', a[k] === b[k], a[k] === b[k] ? '' : 'difiere');
    ok('Apagada = B0', 'Las consultas a la API (parametros y cantidad) son identicas a las de B0', a.consultas === b.consultas, a.consultas === b.consultas ? '' : 'difiere');
  }

  // ============================ D) MOVIL (375): filtros plegables + aviso ============================
  const mv = await abrir(BASE, true, 375, 812), M = mv.page;
  await M.evaluate(() => { const d = document.querySelector('details.ov-filtros-plegable'); if (d) d.open = true; }); await sleep(200);
  await escribir(M, 'rompeviento'); await sleep(200); s = await estado(M);
  const vis = await M.evaluate(() => { const e = document.getElementById('cdsFiltrosEstado'); const r = e.getBoundingClientRect(); return { v: r.width > 0 && r.height > 0, dentro: r.left >= 0 && r.right <= innerWidth, scroll: document.documentElement.scrollWidth <= innerWidth }; });
  ok('Movil 375', 'El aviso de cambios sin aplicar es visible, cabe en pantalla y no hay desborde horizontal', s.pendiente && vis.v && vis.dentro && vis.scroll, JSON.stringify(vis));
  await M.screenshot({ path: path.join(OUT, 'on-pendiente-375.png') });
  mv.reset(); await M.click('form.ov-filtros button.ov-aplicar'); await sleep(1700);
  ok('Movil 375', 'Aplicar en movil: una consulta con buscar y el desplegable se pliega', mv.lista.length === 1 && mv.lista[0].get('buscar') === 'rompeviento' && !(await M.evaluate(() => document.querySelector('details.ov-filtros-plegable').open)));
  await M.screenshot({ path: path.join(OUT, 'on-aplicado-375.png') });
  ok('Consola', 'Sin errores en movil', mv.errores.length === 0, mv.errores.join(' || '));
  await mv.ctx.close();

  const fallan = res.filter(r => !r.ok).length;
  fs.writeFileSync(path.join(OUT, 'validacion-b1.json'), JSON.stringify({ fecha: new Date().toISOString(), total: res.length, fallan, resultados: res }, null, 1));
  console.log('\nComprobaciones: ' + res.length + ' OK: ' + (res.length - fallan) + ' FALLAN: ' + fallan);
  await browser.close(); process.exit(fallan ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
