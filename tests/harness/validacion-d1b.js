'use strict';
// Validacion E2E de la Etapa D1B («Mis seguimientos»): navegador real (Playwright) + croma-api REAL (rama seguimientos-d1a) + SQLite TEMPORAL. Sin Sysneo, sin produccion.
//   1) CROMA_API_DIR=<worktree seguimientos-d1a> node tests/harness/servidor.js --puerto=8830 --seguimientos
//   2) node tests/harness/validacion-d1b.js --puerto=8830 [--salida=<carpeta>]
// Los pasos que reinician el servidor o hacen copias levantan su PROPIA instancia en otro puerto y base temporal.
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const PUERTO = arg('puerto', '8830'), BASE = 'http://127.0.0.1:' + PUERTO;
const API = process.env.CROMA_API_DIR || path.join(__dirname, '..', '..', '..', 'croma-api-seguimientos-d1a');
const OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'd1b')); fs.mkdirSync(OUT, { recursive: true });
const SECRETO = 'secreto-solo-para-pruebas-del-harness';
const res = []; const ok = (g, n, c, d) => { res.push({ grupo: g, nombre: n, ok: !!c, detalle: d == null ? '' : String(d).slice(0, 300) }); console.log((c ? 'PASS ' : 'FAIL ') + '[' + g + '] ' + n + (d != null && d !== '' ? '  [' + String(d).slice(0, 190) + ']' : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function tokenDe({ id = 1, usuario = 'tester', rol = 'admin', exp, iat } = {}) { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ id, usuario, rol, iat: iat || Math.floor(Date.now() / 1000), exp: exp || Math.floor(Date.now() / 1000) + 3600 }); return h + '.' + p + '.' + crypto.createHmac('sha256', SECRETO).update(h + '.' + p).digest('base64url'); }
const ctl = async (base, qs) => (await fetch(base + '/__h/seg?' + qs)).json();
const api = async (base, metodo, ruta, { token = tokenDe(), body, crudo, headers = {} } = {}) => { const h = { ...headers }; if (token) h.Authorization = 'Bearer ' + token; if (body !== undefined || crudo !== undefined) h['Content-Type'] = 'application/json'; const r = await fetch(base + '/seguimientos' + ruta, { method: metodo, headers: h, body: crudo !== undefined ? crudo : body !== undefined ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch (e) { /* sin cuerpo */ } return { status: r.status, json: j, h: r.headers }; };

(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  const errores = [];
  async function abrir(w = 1280, h = 800, { usuario = 'tester', id = 1, rol = 'admin', bandera = true, base = BASE } = {}) {
    const movil = w <= 768;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: movil ? 2 : 1, isMobile: w <= 760, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    await ctx.addInitScript(b => { try { localStorage.setItem('cds-v3', b ? '1' : '0'); } catch (e) { /* nada */ } }, bandera);
    const page = await ctx.newPage(); const o = { ctx, page, errs: [], reqs: [], segReqs: [] };
    page.on('pageerror', e => o.errs.push('pageerror ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g|status of/.test(m.text())) o.errs.push('console ' + m.text().slice(0, 160)); });
    page.on('request', r => { const u = new URL(r.url()); o.reqs.push(u.pathname); if (u.pathname.startsWith('/seguimientos')) o.segReqs.push({ m: r.method(), p: u.pathname, q: u.search }); });
    await page.goto(base + '/?usuario=' + usuario + '&id=' + id + '&rol=' + rol, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }).catch(() => {}); await sleep(1500);
    return o;
  }
  const irOpp = async p => { await p.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await p.waitForSelector('.cds-fila', { timeout: 30000 }); await sleep(900); };
  const visibles = (p, sel) => p.evaluate(s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length).length, sel);
  const clickVisible = (p, sel, i = 0) => p.evaluate(([s, i]) => { const l = [...document.querySelectorAll(s)].filter(e => e.getClientRects().length); if (!l[i]) throw new Error('no hay ' + s + ' #' + i); l[i].click(); }, [sel, i]);
  const codigos = p => p.evaluate(() => RT_OPORTUNIDADES.data.map(f => f.Codigo_producto));
  const abrirDet = async (p, c) => { await p.evaluate(c => { [...document.querySelectorAll('[data-detalle-codigo="' + c + '"]')].find(x => x.offsetParent).click(); }, c); await p.waitForSelector('.cds-dr-fila1', { timeout: 8000 }); await sleep(500); };
  const abrirVariantes = async p => { await p.click('#cdsTab_variantes'); await p.waitForSelector('.cds-var-fila', { timeout: 20000 }); await sleep(500); };
  const dlgAbierto = p => p.evaluate(() => !!document.getElementById('cdsSegDlg'));
  const nivelesDlg = p => p.evaluate(() => [...document.querySelectorAll('#cdsSegDlg input[name=cdsSegNivel]')].map(i => ({ v: i.value, dis: i.disabled, chk: i.checked })));
  const avisosDlg = p => p.evaluate(() => (document.getElementById('cdsSegDlgAvisos') || {}).innerText || '');
  const elegirNivel = (p, v) => p.evaluate(v => { const i = document.querySelector('#cdsSegDlg input[name=cdsSegNivel][value=' + v + ']'); i.click(); }, v);
  const seguirDlg = async (p, { nivel, motivo } = {}) => { if (nivel) await elegirNivel(p, nivel); if (motivo !== undefined) await p.fill('#cdsSegMotivo', motivo); await p.click('#cdsSegDlgOk'); };
  const esperarCierreDlg = async p => { for (let i = 0; i < 60; i++) { if (!(await dlgAbierto(p))) return true; await sleep(100); } return false; };
  const toastTxt = p => p.evaluate(() => (document.getElementById('cdsSegToast') || {}).textContent || '');
  const listaSeg = async (token, qs = '') => (await api(BASE, 'GET', '/' + qs, { token })).json;
  const irMis = async p => { await p.evaluate(() => document.querySelector('#rtTabs .tab[data-view="seguimientos"]').click()); await p.waitForSelector('#cdsSegZona', { timeout: 8000 }); for (let i = 0; i < 50; i++) { if (await p.evaluate(() => !document.querySelector('#cdsSegZona [aria-busy=true]'))) break; await sleep(100); } await sleep(300); };
  const sinScrollH = p => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const foto = (p, n, o = {}) => p.screenshot({ path: path.join(OUT, n + '.png'), ...o });
  const T1 = tokenDe({ id: 1, usuario: 'tester' }), T2 = tokenDe({ id: 2, usuario: 'otra' });

  // =================== 0) interfaz intacta con la bandera apagada y con el servidor apagado ===================
  await ctl(BASE, 'accion=reset');
  { const o = await abrir(1280, 800, { bandera: false }); await irOpp(o.page).catch(() => {});
    ok('apagado', 'bandera cds-v3 apagada: no se pide NINGUN archivo ni endpoint de seguimientos', !o.reqs.some(r => /seguimientos/.test(r)) && !(await o.page.evaluate(() => !!document.getElementById('rtTabSeguimientos') || !!document.querySelector('.cds-seg-estrella'))), o.segReqs.length + ' pedidos');
    ok('apagado', 'bandera apagada: la pestaña «Mis seguimientos» no existe y la barra superior tiene las 8 pestañas de siempre', await o.page.evaluate(() => document.querySelectorAll('#rtTabs .tab').length) === 8); await o.ctx.close(); }
  await ctl(BASE, 'accion=apagar');
  { const o = await abrir(); await irOpp(o.page); await sleep(800);
    ok('apagado', 'servidor con seguimientos APAGADO (404 global): ni pestaña ni estrellas, y la pantalla funciona sin errores', await o.page.evaluate(() => !document.getElementById('rtTabSeguimientos') && !document.querySelector('.cds-seg-estrella') && document.documentElement.getAttribute('data-cds-seg') === null) && o.errs.length === 0, o.errs.join('|'));
    ok('apagado', 'apagado: solo se hizo el sondeo (una solicitud), sin consultas de claves', o.segReqs.length === 1 && o.segReqs[0].p === '/seguimientos/', JSON.stringify(o.segReqs.map(r => r.p)));
    await o.ctx.close(); }
  await ctl(BASE, 'accion=encender');
  { const o = await abrir(1280, 800, { usuario: 'sinpermiso', id: 3 }); await irOpp(o.page); await sleep(800);
    ok('permisos', 'usuario admin NO habilitado (403): sin pestaña ni estrellas, sin errores en pantalla', await o.page.evaluate(() => !document.getElementById('rtTabSeguimientos') && !document.querySelector('.cds-seg-estrella')) && o.errs.length === 0, o.errs.join('|')); await o.ctx.close(); }
  { const o = await abrir(1280, 800, { rol: 'encargado' }); ok('permisos', 'rol no administrador: la aplicacion ya bloquea el acceso (sin pestaña ni estrellas)', await o.page.evaluate(() => !document.getElementById('rtTabSeguimientos') && !document.querySelector('.cds-seg-estrella'))); await o.ctx.close(); }

  // =================== 1) escritorio: estrellas por lote, cinco niveles, ceros, doble clic ===================
  await ctl(BASE, 'accion=reset');
  const o = await abrir(1280, 800), P = o.page; await irOpp(P);
  const cods = await codigos(P), c1 = cods[0], c2 = cods[1], c3 = cods[2];
  const nEstrellas = await visibles(P, '.cds-fila .cds-seg-estrella');
  ok('estrellas', 'las filas de la tabla tienen su estrella «Seguir» (una por producto)', nEstrellas === (await visibles(P, '.cds-fila')) && nEstrellas > 5, nEstrellas + ' estrellas');
  const claves = o.segReqs.filter(r => r.p === '/seguimientos/claves');
  ok('estrellas', 'el estado de todas las estrellas se pide POR LOTE (una solicitud), no una por producto', claves.length >= 1 && claves.length <= 3 && nEstrellas > 20, claves.length + ' solicitudes para ' + nEstrellas + ' estrellas');
  ok('estrellas', 'sin seguimientos todavia: ninguna estrella marcada y cada una tiene nombre accesible', await P.evaluate(() => [...document.querySelectorAll('.cds-seg-estrella')].every(b => b.getAttribute('aria-pressed') === 'false' && /^Seguir /.test(b.getAttribute('aria-label')))));
  ok('estrellas', 'sin localStorage comercial: la unica clave de almacenamiento es la preferencia de interfaz cds-v3', await P.evaluate(() => Object.keys(localStorage).every(k => k === 'cds-v3') && !JSON.stringify(Object.assign({}, sessionStorage)).match(/seguimiento/i)));
  await foto(P, 'd1b-01-oportunidades-estrellas-1280');

  // --- nivel 1: producto desde la fila ---
  await clickVisible(P, '.cds-fila .cds-seg-estrella', 0); await P.waitForSelector('#cdsSegDlg'); await sleep(500);
  let nv = await nivelesDlg(P);
  ok('dialogo', 'el dialogo muestra los 5 niveles; desde una fila solo «Producto completo» esta disponible y los demas explican por que no', nv.length === 5 && nv[0].v === 'producto' && !nv[0].dis && nv[0].chk && nv.slice(1).every(n => n.dis), JSON.stringify(nv.map(n => n.v + (n.dis ? '✗' : '✓'))));
  ok('dialogo', 'el dialogo dice con claridad que se va a seguir (producto completo + codigo + nombre)', (await P.evaluate(() => document.getElementById('cdsSegDlgQue').textContent)).includes('Producto completo ' + c1));
  ok('dialogo', 'accesibilidad: rol dialog, modal, titulo asociado y foco dentro', await P.evaluate(() => { const d = document.getElementById('cdsSegDlg'); return d.getAttribute('role') === 'dialog' && d.getAttribute('aria-modal') === 'true' && !!document.getElementById(d.getAttribute('aria-labelledby')) && d.contains(document.activeElement); }));
  await foto(P, 'd1b-02-dialogo-seguir-1280');
  await P.keyboard.press('Escape'); await sleep(200);
  ok('dialogo', 'Escape cierra el dialogo y el foco vuelve a la estrella', !(await dlgAbierto(P)) && await P.evaluate(() => document.activeElement && document.activeElement.classList.contains('cds-seg-estrella')));
  await clickVisible(P, '.cds-fila .cds-seg-estrella', 0); await P.waitForSelector('#cdsSegDlg'); await sleep(400);
  // doble clic real sobre «Seguir»
  await P.fill('#cdsSegMotivo', 'Producto de prueba D1B');
  await P.dblclick('#cdsSegDlgOk'); await esperarCierreDlg(P); await sleep(500);
  let lst = await listaSeg(T1);
  ok('doble-clic', 'doble clic en «Seguir»: se crea UN solo seguimiento', lst.total === 1 && lst.seguimientos[0].cod === c1 && lst.seguimientos[0].nivel === 'producto', 'total ' + lst.total);
  ok('doble-clic', 'hubo un solo POST al servidor (el segundo clic no hace nada)', o.segReqs.filter(r => r.m === 'POST').length === 1, o.segReqs.filter(r => r.m === 'POST').length + ' POST');
  ok('estrellas', 'la estrella pasa a «marcada» y el aviso de confirmacion se anuncia', await P.evaluate(c => document.querySelector('.cds-fila [data-detalle-codigo="' + c + '"]').parentNode.querySelector('.cds-seg-estrella').getAttribute('aria-pressed') === 'true', c1) && /Seguimiento creado/.test(await toastTxt(P)));
  const s1 = lst.seguimientos[0];
  if (s1.referencia.estado !== 'capturada') console.log('DIAG', JSON.stringify(s1.referencia), JSON.stringify(await ctl(BASE, 'accion=cache')), JSON.stringify(await P.evaluate(() => CDS_SEGUIMIENTOS.contextoConsulta())));
  ok('referencia', 'producto creado desde Oportunidades: la referencia queda CAPTURADA por el servidor desde su cache (fuente, periodo, sucursales, alcance)', s1.referencia.estado === 'capturada' && s1.referencia.datos.fuente === 'oportunidades_cache' && s1.referencia.datos.periodo && Array.isArray(s1.referencia.datos.sucursales) && /producto_completo/.test(s1.referencia.datos.valores.alcance), JSON.stringify(s1.referencia.datos).slice(0, 220));
  ok('referencia', 'el nombre del producto lo pone el servidor (desde su cache), no el navegador', typeof s1.producto.nombre === 'string' && s1.producto.nombre.length > 0, s1.producto.nombre);
  // estrella ya marcada: el dialogo avisa y no deja crear otro
  await clickVisible(P, '.cds-fila .cds-seg-estrella', 0); await P.waitForSelector('#cdsSegDlg'); await sleep(500);
  ok('duplicados', 'sobre un producto ya seguido el dialogo AVISA y bloquea «Seguir» (ofrece ver el existente)', /Ya seguís esto/.test(await avisosDlg(P)) && await P.evaluate(() => document.getElementById('cdsSegDlgOk').disabled));
  await P.keyboard.press('Escape'); await sleep(200);

  // --- detalle de Oportunidades: estrella en la cabecera ---
  await abrirDet(P, c2);
  ok('estrellas', 'el detalle de un producto tiene su estrella en la cabecera', await visibles(P, '.cds-dr-fila1 .cds-seg-estrella') === 1);
  await clickVisible(P, '.cds-dr-fila1 .cds-seg-estrella'); await P.waitForSelector('#cdsSegDlg'); await sleep(400);
  await seguirDlg(P, { motivo: 'desde el detalle' }); await esperarCierreDlg(P); await sleep(400);
  ok('estrellas', 'creado desde el detalle (producto 2); el foco vuelve a la estrella', (await listaSeg(T1)).total === 2 && await P.evaluate(() => document.activeElement && document.activeElement.classList.contains('cds-seg-estrella')));

  // --- variantes: color, talle, variante, variante por sucursal ---
  await abrirDet(P, c3); await abrirVariantes(P);
  ok('estrellas', 'cada variante (fila/tarjeta) tiene su estrella', await visibles(P, '.cds-var-fila[data-cds-var] .cds-seg-estrella') >= 5);
  const v1 = await P.evaluate(() => { const li = [...document.querySelectorAll('.cds-var-fila[data-cds-var]')].filter(e => e.getClientRects().length)[0]; return { clave: li.getAttribute('data-cds-var'), colorK: li.getAttribute('data-cds-color'), talleK: li.getAttribute('data-cds-talle') }; });
  await clickVisible(P, '.cds-var-fila[data-cds-var] .cds-seg-estrella', 0); await P.waitForSelector('#cdsSegDlg'); await sleep(500);
  nv = await nivelesDlg(P);
  ok('dialogo', 'desde una variante estan disponibles producto, color, talle y variante; «variante por sucursal» no (explica que se elige en la distribucion)', nv.filter(n => !n.dis).map(n => n.v).join() === 'producto,color,talle,variante' && nv.find(n => n.v === 'variante_sucursal').dis && nv.find(n => n.v === 'variante').chk, JSON.stringify(nv.map(n => n.v + (n.dis ? '✗' : '✓'))));
  await foto(P, 'd1b-03-dialogo-niveles-variante-1280');
  const clavesDel = k => { const a = require('../../cds/seguimientos-api.js'); return a.parsearClave(k); };
  const pv = clavesDel(v1.clave);
  await seguirDlg(P, { nivel: 'variante', motivo: 'variante exacta' }); await esperarCierreDlg(P); await sleep(400);
  await clickVisible(P, '.cds-var-fila[data-cds-var] .cds-seg-estrella', 0); await P.waitForSelector('#cdsSegDlg'); await sleep(500);
  await seguirDlg(P, { nivel: 'color' }); await esperarCierreDlg(P); await sleep(400);
  await clickVisible(P, '.cds-var-fila[data-cds-var] .cds-seg-estrella', 0); await P.waitForSelector('#cdsSegDlg'); await sleep(500);
  await seguirDlg(P, { nivel: 'talle' }); await esperarCierreDlg(P); await sleep(400);
  lst = await listaSeg(T1, '?limit=100');
  const nivelesCreados = lst.seguimientos.map(s => s.nivel).sort().join();
  ok('niveles', 'quedaron creados los niveles producto, color, talle y variante', nivelesCreados === 'color,producto,producto,talle,variante', nivelesCreados);
  const sv = lst.seguimientos.find(s => s.nivel === 'variante');
  ok('ceros', 'la variante conserva talle y color como TEXTO (ceros iniciales intactos): clave canonica V:cod:talle:color', sv.clave === v1.clave && sv.talle === pv.talle && sv.color === pv.color && /^V:/.test(sv.clave), sv.clave + ' · color ' + JSON.stringify(sv.color));
  ok('referencia', 'a nivel variante/color/talle la referencia NO se deriva: no_disponible con motivo «alcance_no_cubierto» y el nombre del producto se conserva', lst.seguimientos.filter(s => s.nivel !== 'producto').every(s => s.referencia.estado === 'no_disponible' && s.referencia.motivo === 'alcance_no_cubierto' && s.producto.nombre), JSON.stringify(lst.seguimientos.filter(s => s.nivel !== 'producto').map(s => [s.nivel, s.referencia.motivo, s.producto.nombre])));
  // aviso de nivel superior: ya se sigue «color» y se elige «variante» sobre esa misma fila
  await clickVisible(P, '.cds-var-fila[data-cds-var] .cds-seg-estrella', 0); await P.waitForSelector('#cdsSegDlg'); await sleep(600);
  await elegirNivel(P, 'color'); await sleep(200);
  ok('duplicados', 'al elegir un nivel que ya se sigue el dialogo lo dice; el boton queda bloqueado', /Ya seguís esto/.test(await avisosDlg(P)) && await P.evaluate(() => document.getElementById('cdsSegDlgOk').disabled), (await avisosDlg(P)).slice(0, 90));
  await P.keyboard.press('Escape'); await sleep(200);
  // sucursal: expandir y seguir una sucursal
  const exp = await P.evaluate(() => { const b = [...document.querySelectorAll('.cds-var-fila .cds-var-exp')].filter(e => e.getClientRects().length)[1]; b.click(); return true; }); await sleep(600);
  const nSuc = await visibles(P, 'tr[data-cds-var-suc] .cds-seg-estrella');
  ok('estrellas', 'la distribucion por sucursal tiene una estrella por cada sucursal operativa (5), sin Cipo (0009)', nSuc === 5 && await P.evaluate(() => ![...document.querySelectorAll('tr[data-cds-var-suc]')].some(t => /:0009$/.test(t.getAttribute('data-cds-var-suc')))), nSuc + '');
  await clickVisible(P, 'tr[data-cds-var-suc] .cds-seg-estrella', 1); await P.waitForSelector('#cdsSegDlg'); await sleep(500);
  nv = await nivelesDlg(P);
  ok('dialogo', 'desde una sucursal estan disponibles los 5 niveles y el preseleccionado es «variante por sucursal»', nv.every(n => !n.dis) && nv.find(n => n.chk).v === 'variante_sucursal', JSON.stringify(nv.map(n => n.v + (n.chk ? '●' : ''))));
  await seguirDlg(P, { motivo: 'solo Wave' }); await esperarCierreDlg(P); await sleep(500);
  lst = await listaSeg(T1, '?limit=100'); const vs = lst.seguimientos.find(s => s.nivel === 'variante_sucursal');
  ok('niveles', 'quedo creado el quinto nivel: variante por sucursal (centro operativo)', !!vs && /^VS:/.test(vs.clave) && ['0001', '0005', '0010', '0012', '0014'].includes(vs.centro), vs && vs.clave);
  // el servidor rechaza Cipo y valores manipulados aunque el navegador los mandara
  let r = await api(BASE, 'POST', '/', { token: T1, body: { nivel: 'variante_sucursal', cod: c3, talle: 'M', color: '01', centro: '0009' } }); ok('seguridad', 'Cipo (0009) rechazada por el servidor para seguimientos nuevos (400)', r.status === 400 && /CENTRO_NO_SEGUIBLE/.test(r.json.code), r.json.code);
  r = await api(BASE, 'POST', '/', { token: T1, body: { nivel: 'producto', cod: '099', referencia: { estado: 'capturada' } } }); ok('seguridad', 'valores comerciales enviados por el navegador: rechazados (400, CAMPO_DEL_SERVIDOR)', r.status === 400 && r.json.code === 'CAMPO_DEL_SERVIDOR', r.json.code);
  r = await api(BASE, 'POST', '/', { token: T1, body: { nivel: 'producto', cod: '099', propietario: 'otra' } }); ok('seguridad', 'propietario enviado por el navegador: rechazado (400)', r.status === 400, r.json.code);
  await foto(P, 'd1b-04-estrellas-marcadas-variantes-1280');

  // =================== 2) Mis seguimientos ===================
  await irMis(P);
  const resumen = await P.evaluate(() => [...document.querySelectorAll('.cds-seg-tile')].map(t => t.innerText.replace(/\s+/g, ' ')));
  ok('mis-seguimientos', 'la seccion existe en la navegacion superior (visible entre Oportunidades y Reglas) y muestra el resumen de activos y finalizados', await P.evaluate(() => { const b = document.querySelector('#cdsTopNav [data-cds-view="seguimientos"]'); return !!b && !b.hidden && b.offsetParent !== null; }) && /^6 Activos/.test(resumen[0]) && /^0 Finalizados/.test(resumen[1]), resumen.join(' | '));
  ok('mis-seguimientos', 'lista con 6 seguimientos (tabla) con inicio, motivo, estado y referencia', await visibles(P, '.cds-seg-tabla tbody tr') === 6 && await P.evaluate(() => { const t = document.querySelector('.cds-seg-tabla tbody').innerText; return /Activo/.test(t) && /Referencia no disponible/.test(t) && /\d{2}\/\d{2}\/\d{4}/.test(t) && /Producto de prueba D1B/.test(t); }));
  ok('mis-seguimientos', 'sin graficos historicos ni novedades ficticias (canvas/svg de datos/«evolucion»)', await P.evaluate(() => !document.querySelector('#cdsSegZona canvas, #cdsSegZona .cds-chart, #cdsSegZona .cds-spark') && !/novedad|variaci[oó]n|evoluci[oó]n:/i.test(document.getElementById('cdsSegZona').innerText)));
  await foto(P, 'd1b-05-mis-seguimientos-1280');
  // buscador y filtros
  await P.fill('#cdsSegBuscar', c1); await sleep(900); ok('filtros', 'buscar por codigo filtra la lista', await visibles(P, '.cds-seg-tabla tbody tr') === 1, await visibles(P, '.cds-seg-tabla tbody tr') + ' filas');
  const nombre1 = s1.producto.nombre.split(' ')[0]; await P.fill('#cdsSegBuscar', nombre1); await sleep(900); ok('filtros', 'buscar por nombre encuentra el producto', await visibles(P, '.cds-seg-tabla tbody tr') >= 1, nombre1);
  await P.fill('#cdsSegBuscar', ''); await sleep(800);
  await P.selectOption('#cdsSegNivel', 'variante'); await sleep(700); ok('filtros', 'filtrar por nivel «Variante exacta»', await visibles(P, '.cds-seg-tabla tbody tr') === 1);
  await P.selectOption('#cdsSegNivel', ''); await P.selectOption('#cdsSegCentro', vs.centro); await sleep(700); ok('filtros', 'filtrar por sucursal', await visibles(P, '.cds-seg-tabla tbody tr') === 1);
  await P.selectOption('#cdsSegCentro', ''); await sleep(700);
  await P.fill('#cdsSegBuscar', 'zzzz-no-existe'); await sleep(900); ok('filtros', 'sin coincidencias: estado vacio explicado (no una tabla en blanco)', await P.evaluate(() => /Ningún seguimiento coincide/.test(document.getElementById('cdsSegZona').innerText)));
  await P.fill('#cdsSegBuscar', ''); await sleep(800);

  // =================== 3) detalle: informacion, notas, historial, motivo, finalizar, reabrir ===================
  const filaProd = await P.evaluate(c => { const b = [...document.querySelectorAll('.cds-seg-tabla [data-cds-seg-id]')].find(x => x.closest('tr').innerText.includes(c)); return b.getAttribute('data-cds-seg-id'); }, c1);
  await P.evaluate(id => document.querySelector('.cds-seg-tabla [data-cds-seg-id="' + id + '"]').click(), filaProd); await P.waitForSelector('#cdsSegDet .cds-sec', { timeout: 8000 }); await sleep(500);
  const det = await P.evaluate(() => document.getElementById('cdsSegDet').innerText);
  ok('detalle', 'el detalle muestra informacion inicial, motivo, referencia al iniciar (valores, fuente, periodo), notas e historial', /Información inicial/.test(det) && /Producto de prueba D1B/.test(det) && /Ventas netas del período/.test(det) && /Oportunidades \(datos ya calculados/.test(det) && /Seguimiento creado/.test(det) && /Agregar una nota/.test(det), det.slice(0, 120).replace(/\n/g, ' '));
  await foto(P, 'd1b-06-detalle-seguimiento-1280');
  // nota con doble clic (idempotente)
  await P.fill('#cdsSegNota', 'Primera nota de prueba'); await P.dblclick('[data-fk=nota_ok]'); for (let i = 0; i < 40; i++) { if (await P.evaluate(() => /Primera nota de prueba/.test(document.getElementById('cdsSegDet').innerText))) break; await sleep(100); } await sleep(200);
  let d1 = await api(BASE, 'GET', '/' + filaProd, { token: T1 }); const notas = d1.json.eventos.filter(e => e.tipo === 'nota');
  ok('notas', 'una nota con doble clic se guarda UNA sola vez y aparece en el historial', notas.length === 1 && notas[0].texto === 'Primera nota de prueba' && /Primera nota de prueba/.test(await P.evaluate(() => document.getElementById('cdsSegDet').innerText)), notas.length + ' notas; ' + (await P.evaluate(() => (document.querySelector('#cdsSegDet [role=alert]') || {}).innerText || '')) + ' | ' + (await P.evaluate(() => document.getElementById('cdsSegDet').innerText)).split(String.fromCharCode(10)).join(' ').slice(-260));
  // editar motivo
  await P.click('[data-fk=motivo_editar]'); await P.fill('#cdsSegMotivoEd', 'Motivo editado'); await P.click('[data-fk=motivo_ok]'); await sleep(900);
  d1 = await api(BASE, 'GET', '/' + filaProd, { token: T1 }); ok('motivo', 'editar el motivo funciona, sube la version y queda en el historial', d1.json.seguimiento.motivo === 'Motivo editado' && d1.json.seguimiento.version === 2 && d1.json.eventos.some(e => e.tipo === 'motivo_editado'));
  // version desactualizada (412): otra sesion cambia el motivo y la UI (con la version vieja) intenta editar
  await P.click('[data-fk=motivo_editar]'); await P.fill('#cdsSegMotivoEd', 'Cambio desde la pantalla');
  const rr = await api(BASE, 'PATCH', '/' + filaProd, { token: T1, body: { motivo: 'Cambio desde otra sesion' }, headers: { 'If-Match': '"2"' } });
  await P.click('[data-fk=motivo_ok]'); await sleep(1000);
  const txt412 = await P.evaluate(() => (document.querySelector('#cdsSegDet [role=alert]') || {}).innerText || '');
  ok('412', 'version desactualizada: el servidor responde 412 y la pantalla lo explica y recarga la version vigente (sin pisar el cambio ajeno)', rr.status === 200 && /cambió en otra pestaña o sesión/.test(txt412) && (await api(BASE, 'GET', '/' + filaProd, { token: T1 })).json.seguimiento.motivo === 'Cambio desde otra sesion', txt412.slice(0, 80));
  await P.evaluate(() => { const b = document.querySelector('[data-fk=motivo_no]'); if (b) b.click(); });
  // 428/400 a nivel API
  r = await api(BASE, 'PATCH', '/' + filaProd, { token: T1, body: { motivo: 'x' } }); ok('errores', '428 sin If-Match', r.status === 428, r.json.code);
  r = await api(BASE, 'PATCH', '/' + filaProd, { token: T1, body: { motivo: 'x' }, headers: { 'If-Match': '"2"' } }); ok('errores', '412 con version vieja (API)', r.status === 412, r.json.code);
  // finalizar con confirmacion
  await P.click('[data-fk=finalizar]'); await sleep(300); ok('finalizar', 'finalizar pide confirmacion con motivo de cierre opcional', await P.evaluate(() => !!document.getElementById('cdsSegMotivoFin') && !!document.querySelector('[data-fk=fin_ok]')));
  await P.fill('#cdsSegMotivoFin', 'Ya no hace falta'); await P.click('[data-fk=fin_ok]'); await sleep(1100);
  d1 = await api(BASE, 'GET', '/' + filaProd, { token: T1 }); ok('finalizar', 'finalizado: estado, quien/cuando y motivo de cierre; el historial lo registra', d1.json.seguimiento.estado === 'finalizado' && d1.json.seguimiento.finalizado.motivo === 'Ya no hace falta' && d1.json.eventos.some(e => e.tipo === 'finalizado'));
  ok('finalizar', 'en pantalla: pildora «Finalizado» y boton «Reabrir» (ya no «Finalizar»)', await P.evaluate(() => /Finalizado/.test(document.getElementById('cdsSegDet').innerText) && !!document.querySelector('[data-fk=reabrir]') && !document.querySelector('[data-fk=finalizar]')));
  await P.click('[data-fk=reabrir]'); await sleep(1100);
  d1 = await api(BASE, 'GET', '/' + filaProd, { token: T1 }); ok('reabrir', 'reabrir devuelve el seguimiento a activo y lo registra en el historial', d1.json.seguimiento.estado === 'activo' && d1.json.eventos.some(e => e.tipo === 'reabierto'));
  // foco y Escape
  await P.keyboard.press('Escape'); await sleep(300); ok('accesibilidad', 'Escape cierra el detalle y el foco vuelve al boton «Ver» de la fila', !(await P.evaluate(() => !!document.getElementById('cdsSegDet'))) && await P.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-cds-seg-id')));
  // finalizar uno y verificar el resumen y el filtro
  await P.evaluate(() => document.querySelectorAll('.cds-seg-tabla [data-cds-seg-id]')[1].click()); await P.waitForSelector('[data-fk=finalizar]'); await P.click('[data-fk=finalizar]'); await P.click('[data-fk=fin_ok]'); await sleep(1200); await P.keyboard.press('Escape'); await sleep(900);
  const res2 = await P.evaluate(() => [...document.querySelectorAll('.cds-seg-tile')].map(t => t.innerText.replace(/\s+/g, ' ')));
  ok('mis-seguimientos', 'el resumen se actualiza al finalizar (5 activos / 1 finalizado)', /^5 Activos/.test(res2[0]) && /^1 Finalizados/.test(res2[1]), res2.join(' | '));
  await P.click('#cdsSegTile_finalizado'); await sleep(900); ok('filtros', 'el recuadro «Finalizados» filtra la lista', await visibles(P, '.cds-seg-tabla tbody tr') === 1);
  await P.click('#cdsSegTile_finalizado'); await sleep(700);

  // =================== 4) otra persona: aislamiento, lectura de ajenos, IDOR ===================
  const o2 = await abrir(1280, 800, { usuario: 'otra', id: 2 }), P2 = o2.page; await irOpp(P2); await irMis(P2);
  ok('usuarios', 'otra persona ve SOLO lo suyo (lista vacia) y sus estrellas no heredan las marcas de tester', await P2.evaluate(() => /Todavía no seguís nada/.test(document.getElementById('cdsSegZona').innerText)) && (await P2.evaluate(() => document.querySelector('.cds-seg-tile').innerText.replace(/\s+/g, ' '))).startsWith('0 Activos'));
  await P2.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await P2.waitForSelector('.cds-fila'); await sleep(900);
  ok('usuarios', 'la estrella del producto que tester sigue NO aparece marcada para otra persona', await P2.evaluate(c => document.querySelector('.cds-fila [data-detalle-codigo="' + c + '"]').parentNode.querySelector('.cds-seg-estrella').getAttribute('aria-pressed') === 'false', c1));
  await clickVisible(P2, '.cds-fila .cds-seg-estrella', 0); await P2.waitForSelector('#cdsSegDlg'); await sleep(500); ok('usuarios', 'otra persona puede seguir el MISMO producto que tester (seguimientos personales, sin choque)', !(await P2.evaluate(() => document.getElementById('cdsSegDlgOk').disabled)));
  await seguirDlg(P2, { motivo: 'de la otra persona' }); await esperarCierreDlg(P2); await sleep(500);
  ok('usuarios', 'quedo un seguimiento propio de la otra persona', (await listaSeg(T2)).total === 1);
  await irMis(P2); await P2.selectOption('#cdsSegProp', 'todos'); await sleep(1000);
  ok('admin-lee', 'el administrador puede listar seguimientos ajenos (modo «todos») con aviso de solo lectura', await visibles(P2, '.cds-seg-tabla tbody tr') >= 5 && await P2.evaluate(() => /solo lectura|no modificarlos/i.test(document.getElementById('cdsSegZona').innerText)));
  const idAjeno = filaProd;
  await P2.evaluate(id => document.querySelector('.cds-seg-tabla [data-cds-seg-id="' + id + '"]').click(), idAjeno); await P2.waitForSelector('#cdsSegDet .cds-sec'); await sleep(600);
  ok('admin-lee', 'detalle ajeno: SOLO lectura (sin editar motivo, sin notas, sin finalizar/reabrir) y avisa que la consulta queda registrada', await P2.evaluate(() => { const t = document.getElementById('cdsSegDet').innerText; return /Solo lectura/.test(t) && /quedó registrada/.test(t) && !document.querySelector('[data-fk=motivo_editar]') && !document.getElementById('cdsSegNota') && !document.querySelector('[data-fk=finalizar]') && !document.querySelector('[data-fk=reabrir]'); }));
  await foto(P2, 'd1b-07-detalle-ajeno-solo-lectura-1280');
  const dbSeg = await ctl(BASE, 'accion=estado'); const { DatabaseSync } = require('node:sqlite'); const dbr = new DatabaseSync(dbSeg.db, { readOnly: true });
  const accesos = dbr.prepare('SELECT COUNT(*) n FROM seg_acceso_admin').get().n; dbr.close();
  ok('admin-lee', 'la lectura de un seguimiento ajeno quedo REGISTRADA en el servidor (seg_acceso_admin)', Number(accesos) >= 1, accesos + ' registros');
  await P2.keyboard.press('Escape'); await sleep(300);
  r = await api(BASE, 'PATCH', '/' + idAjeno, { token: T2, body: { motivo: 'intento ajeno' }, headers: { 'If-Match': '"1"' } }); ok('idor', 'IDOR: modificar el seguimiento de otra persona -> 403 SOLO_LECTURA_AJENO', r.status === 403 && r.json.code === 'SOLO_LECTURA_AJENO', r.status + ' ' + (r.json && r.json.code));
  for (const [m, rt, b] of [['POST', '/' + idAjeno + '/notas', { texto: 'x' }], ['POST', '/' + idAjeno + '/finalizar', {}], ['POST', '/' + idAjeno + '/reabrir', {}]]) { r = await api(BASE, m, rt, { token: T2, body: b, headers: { 'If-Match': '"1"' } }); ok('idor', 'IDOR ' + m + ' ' + rt.split('/').pop() + ' sobre un seguimiento ajeno -> 403', r.status === 403, r.status + ''); }
  r = await api(BASE, 'GET', '/99999', { token: T1 }); ok('errores', '404 seguimiento inexistente', r.status === 404, r.json.code);
  // 404 en pantalla
  await P2.evaluate(() => CDS_SEGUIMIENTOS.irASeguimiento(99999)); await sleep(1000);
  ok('errores', '404 en pantalla: «No se encontró el seguimiento» (sin tecnicismos)', await P2.evaluate(() => /No se encontró el seguimiento/.test((document.getElementById('cdsSegDet') || {}).innerText || '')));
  await P2.keyboard.press('Escape'); await sleep(300);

  // =================== 5) accesos no autorizados y errores del servidor ===================
  r = await api(BASE, 'GET', '/', { token: null }); ok('errores', '401 sin token', r.status === 401);
  r = await api(BASE, 'GET', '/', { token: tokenDe({ exp: Math.floor(Date.now() / 1000) - 60 }) }); ok('errores', '401 token vencido', r.status === 401);
  r = await api(BASE, 'GET', '/', { token: tokenDe({ id: 3, usuario: 'sinpermiso' }) }); ok('errores', '403 usuario admin no habilitado (USUARIO_NO_HABILITADO)', r.status === 403 && r.json.code === 'USUARIO_NO_HABILITADO');
  r = await api(BASE, 'GET', '/', { token: tokenDe({ rol: 'encargado' }) }); ok('errores', '403 rol no administrador', r.status === 403);
  r = await api(BASE, 'POST', '/', { token: T1, crudo: '{"nivel":' }); ok('errores', '400 JSON mal formado (JSON_INVALIDO), sin detalles internos', r.status === 400 && r.json.code === 'JSON_INVALIDO' && !/Unexpected|position/.test(JSON.stringify(r.json)), r.status + ' ' + JSON.stringify(r.json).slice(0, 100));
  r = await api(BASE, 'POST', '/', { token: T1, body: { nivel: 'inventado', cod: '1' } }); ok('errores', '400 nivel inexistente', r.status === 400);
  r = await api(BASE, 'POST', '/', { token: T1, body: { nivel: 'producto', cod: c1 } }); ok('errores', '409 duplicado (YA_SEGUIDO) con el id existente', r.status === 409 && r.json.code === 'YA_SEGUIDO' && r.json.id_existente > 0);
  // 409 en pantalla: otra pestaña ya creo lo mismo mientras el dialogo estaba abierto
  await P2.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await P2.waitForSelector('.cds-fila'); await sleep(900);
  const cx = (await codigos(P2))[5]; await clickVisible(P2, '.cds-fila .cds-seg-estrella', 5); await P2.waitForSelector('#cdsSegDlg'); await sleep(500);
  await api(BASE, 'POST', '/', { token: T2, body: { nivel: 'producto', cod: cx } });
  await seguirDlg(P2, {}); await sleep(900);
  ok('errores', '409 en pantalla: el dialogo avisa que ya existe, ofrece «Ver seguimiento» y no se pierde la ventana', await dlgAbierto(P2) && /Ya seguís esto/.test(await avisosDlg(P2)) && await P2.evaluate(() => !![...document.querySelectorAll('#cdsSegDlgAvisos button')].find(b => /Ver seguimiento/.test(b.textContent))));
  await P2.keyboard.press('Escape'); await sleep(300);
  // 429: se llena el limitador de la otra persona y la pantalla lo explica
  let n429 = 0; for (let i = 0; i < 70; i++) { const q = await api(BASE, 'POST', '/' + (await listaSeg(T2)).seguimientos[0].id + '/notas', { token: T2, body: { texto: 'n' + i } }); if (q.status === 429) { n429++; if (n429 === 1) ok('errores', '429 con Retry-After y codigo LIMITE_ESCRITURAS', q.json.code === 'LIMITE_ESCRITURAS' && Number(q.h.get('retry-after')) >= 1, q.h.get('retry-after')); } }
  ok('errores', 'el limitador de escrituras corta el exceso (429) por usuario', n429 >= 1, n429 + ' rechazos');
  await irMis(P2); await P2.selectOption('#cdsSegProp', ''); await sleep(800); await P2.evaluate(() => document.querySelector('.cds-seg-tabla [data-cds-seg-id]').click()); await P2.waitForSelector('#cdsSegNota'); await P2.fill('#cdsSegNota', 'nota bajo limite');
  { const idp = (await listaSeg(T2)).seguimientos[0].id; for (let i = 0; i < 80; i++) { const q = await api(BASE, 'POST', '/' + idp + '/notas', { token: T2, body: { texto: 'h' + i } }); if (q.status === 429) break; } } // bucket vacio justo antes de la accion de la pantalla
  await P2.click('[data-fk=nota_ok]'); await sleep(900);
  ok('errores', '429 en pantalla: mensaje claro de espera y el texto de la nota NO se pierde', await P2.evaluate(() => /muchas acciones seguidas/.test((document.querySelector('#cdsSegDet [role=alert]') || {}).innerText || '') && document.getElementById('cdsSegNota').value === 'nota bajo limite'));
  await foto(P2, 'd1b-08-error-429-1280'); await P2.keyboard.press('Escape'); await sleep(300);
  // revocacion: la sesion vieja ya no sirve
  await ctl(BASE, 'revocar=staff:2'); await sleep(1100);
  r = await api(BASE, 'GET', '/', { token: T2 }); ok('errores', '401 TOKEN_REVOCADO tras revocar la sesion (en el servidor, sin esperar al vencimiento)', r.status === 401 && r.json.code === 'TOKEN_REVOCADO', r.status + ' ' + (r.json && r.json.code));
  await P2.evaluate(() => { document.querySelector('#rtTabs .tab[data-view="seguimientos"]').click(); }); await sleep(1500);
  ok('errores', '401 en pantalla: mensaje «sesión revocada» sin errores de consola no controlados', await P2.evaluate(() => /sesión|Reintentar|habilitado|disponible/i.test(document.getElementById('cdsSegZona') ? document.getElementById('cdsSegZona').innerText : (document.getElementById('rtPanelHost') || {}).innerText)), '');
  await o2.ctx.close();

  // =================== 6) 503 (base caida) y compuerta de copia externa ===================
  await P.evaluate(() => { document.querySelector('#rtTabs .tab[data-view="seguimientos"]').click(); }); await sleep(1000);
  await ctl(BASE, 'accion=db_caida'); await P.evaluate(() => CDS_SEGUIMIENTOS.sondear(true)); await sleep(900);
  ok('503', '503 (base no disponible): la seccion muestra un estado de error explicado con «Reintentar» (no una pantalla en blanco)', await P.evaluate(() => /no está disponible por ahora/.test(document.getElementById('rtPanelHost').innerText) && !![...document.querySelectorAll('#rtPanelHost button')].find(b => /Reintentar/.test(b.textContent))));
  await foto(P, 'd1b-09-error-503-1280');
  await ctl(BASE, 'accion=db_ok'); await P.evaluate(() => [...document.querySelectorAll('#rtPanelHost button')].find(b => /Reintentar/.test(b.textContent)).click()); await sleep(1500);
  ok('503', 'al volver la base, «Reintentar» recupera la seccion', await P.evaluate(() => !!document.getElementById('cdsSegZona')));
  await ctl(BASE, 'accion=copia_exigir');
  await P.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await P.waitForSelector('.cds-fila'); await sleep(800);
  await clickVisible(P, '.cds-fila .cds-seg-estrella', 7); await P.waitForSelector('#cdsSegDlg'); await sleep(500); await seguirDlg(P, {}); await sleep(900);
  ok('copias', 'sin copia externa verificada (compuerta de produccion): crear devuelve 503 SIN_COPIA_EXTERNA_VERIFICADA y la pantalla lo explica; no se crea nada', /pausa/.test(await avisosDlg(P)) && (await listaSeg(T1)).total === 6, (await avisosDlg(P)).slice(0, 100));
  r = await api(BASE, 'GET', '/', { token: T1 }); ok('copias', 'con la compuerta cerrada las LECTURAS siguen funcionando', r.status === 200);
  await P.keyboard.press('Escape'); await ctl(BASE, 'accion=copia_ok'); await sleep(300);

  // =================== 7) referencia no disponible por falta de cache ===================
  await fetch(BASE + '/__h/universo?n=normal'); await sleep(300); // invalida la cache de Oportunidades del servidor
  r = await api(BASE, 'POST', '/', { token: T1, body: { nivel: 'producto', cod: cods[10], contexto: { desde: '2026-08-23', hasta: '2026-11-24', sucursales: ['0001', '0005', '0010', '0012', '0014'] } } });
  ok('referencia', 'si la cache de Oportunidades no tiene esos datos el seguimiento se guarda igual con referencia no_disponible y el motivo (sin consultas pesadas)', r.status === 201 && r.json.seguimiento.referencia.estado === 'no_disponible' && r.json.seguimiento.referencia.motivo === 'cache_no_disponible', r.json.seguimiento && r.json.seguimiento.referencia.motivo);
  r = await api(BASE, 'POST', '/', { token: T1, body: { nivel: 'producto', cod: cods[11] } }); ok('referencia', 'sin contexto de periodo/sucursales: no_disponible (contexto_incompleto)', r.status === 201 && r.json.seguimiento.referencia.motivo === 'contexto_incompleto');
  await irMis(P); await P.fill('#cdsSegBuscar', cods[10]); await sleep(900); await P.evaluate(() => document.querySelector('.cds-seg-tabla [data-cds-seg-id]').click()); await P.waitForSelector('#cdsSegDet .cds-sec'); await sleep(500);
  ok('referencia', 'el detalle explica en lenguaje claro por que no hay referencia', await P.evaluate(() => /Referencia no disponible/.test(document.getElementById('cdsSegDet').innerText) && /no estaban disponibles/.test(document.getElementById('cdsSegDet').innerText)));
  await foto(P, 'd1b-10-referencia-no-disponible-1280'); await P.keyboard.press('Escape'); await sleep(300);
  ok('consola', 'escritorio: sin errores de JavaScript en toda la sesion', o.errs.length === 0, o.errs.join(' | '));
  await o.ctx.close();

  // =================== 8) responsive y accesibilidad ===================
  for (const [w, h, nom] of [[768, 1024, 'tablet'], [375, 812, 'movil']]) {
    const om = await abrir(w, h); const pm = om.page; await irOpp(pm).catch(async () => { await sleep(1500); });
    ok('responsive-' + nom, nom + ': sin scroll horizontal en Oportunidades con estrellas', await sinScrollH(pm));
    const ts = await pm.evaluate(() => [...document.querySelectorAll('.cds-seg-estrella')].filter(b => b.getClientRects().length).map(b => { const r = b.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); }));
    ok('responsive-' + nom, nom + ': estrellas tactiles de al menos 44 px', ts.length > 3 && Math.min.apply(null, ts) >= 44, 'min ' + Math.min.apply(null, ts));
    await foto(pm, 'd1b-11-oportunidades-estrellas-' + nom);
    await clickVisible(pm, '.cds-card .cds-seg-estrella, .cds-fila .cds-seg-estrella', 2); await pm.waitForSelector('#cdsSegDlg'); await sleep(500);
    ok('responsive-' + nom, nom + ': el dialogo cabe en pantalla (sin scroll horizontal) y los niveles son tocables', await sinScrollH(pm) && await pm.evaluate(() => [...document.querySelectorAll('#cdsSegDlg .cds-seg-nivel')].every(l => l.getBoundingClientRect().height >= 44 - 1)));
    await foto(pm, 'd1b-12-dialogo-' + nom); await pm.keyboard.press('Escape'); await sleep(200);
    await irMis(pm); await sleep(500);
    ok('responsive-' + nom, nom + ': «Mis seguimientos» sin scroll horizontal', await sinScrollH(pm));
    if (w <= 760) ok('responsive-' + nom, 'movil: la lista se muestra como TARJETAS (la tabla se oculta)', await visibles(pm, '.cds-seg-cards .cds-seg-card') >= 1 && await visibles(pm, '.cds-seg-tabla') === 0);
    else ok('responsive-' + nom, 'tablet: la lista sigue siendo tabla legible', await visibles(pm, '.cds-seg-tabla tbody tr') >= 1);
    await foto(pm, 'd1b-13-mis-seguimientos-' + nom);
    await pm.evaluate(() => [...document.querySelectorAll('[data-cds-seg-id]')].filter(e => e.getClientRects().length)[0].click()); await pm.waitForSelector('#cdsSegDet .cds-sec'); await sleep(500);
    ok('responsive-' + nom, nom + ': el detalle ocupa la pantalla sin desbordar', await sinScrollH(pm) && await pm.evaluate(() => { const r = document.getElementById('cdsSegDet').getBoundingClientRect(); return r.right <= window.innerWidth + 1 && r.left >= -1; }));
    await foto(pm, 'd1b-14-detalle-' + nom);
    ok('accesibilidad-' + nom, nom + ': el foco queda atrapado dentro del detalle (Tab ciclico)', await (async () => { for (let i = 0; i < 40; i++) await pm.keyboard.press('Tab'); return pm.evaluate(() => document.getElementById('cdsSegDet').contains(document.activeElement)); })());
    ok('consola', nom + ': sin errores de JavaScript', om.errs.length === 0, om.errs.join(' | ')); await om.ctx.close();
  }
  { // accesibilidad estatica sobre escritorio
    const oa = await abrir(1280, 800); const pa = oa.page; await irOpp(pa); await irMis(pa);
    const audit = await pa.evaluate(() => {
      const z = document.getElementById('cdsSegZona'), fallos = [];
      z.querySelectorAll('input,select,textarea').forEach(c => { if (!c.getAttribute('aria-label') && !(c.id && document.querySelector('label[for="' + c.id + '"]'))) fallos.push('sin etiqueta: ' + (c.id || c.tagName)); });
      z.querySelectorAll('button').forEach(b => { if (!b.textContent.trim() && !b.getAttribute('aria-label')) fallos.push('boton sin nombre'); });
      z.querySelectorAll('table').forEach(t => { if (!t.querySelector('caption')) fallos.push('tabla sin caption'); t.querySelectorAll('th').forEach(h => { if (!h.getAttribute('scope')) fallos.push('th sin scope'); }); });
      if (!z.closest('section').getAttribute('aria-labelledby')) fallos.push('seccion sin titulo');
      return fallos;
    });
    ok('accesibilidad', 'Mis seguimientos: controles con etiqueta, botones con nombre, tablas con caption y scope, seccion con titulo', audit.length === 0, audit.join(' | '));
    const ctr = await pa.evaluate(() => {
      const num = s => s.match(/[\d.]+/g).map(Number); const mez = (c, b) => { const a = c.length > 3 ? c[3] : 1; return [0, 1, 2].map(i => Math.round(c[i] * a + b[i] * (1 - a))); };
      const fondo = e => { const ch = []; for (let x = e; x; x = x.parentElement) ch.push(x); let bg = [255, 255, 255]; for (let i = ch.length - 1; i >= 0; i--) { const c = getComputedStyle(ch[i]).backgroundColor; if (c && c !== 'transparent') { const v = num(c); if (v.length < 4 || v[3] > 0) bg = mez(v, bg); } } return bg; };
      const lum = rgb => { const f = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
      const out = []; ['.cds-seg-sub', '.cds-seg-tile-l', '.cds-seg-tile-n', '.cds-seg-tabla th', '.cds-seg-tabla td', '.cds-status', '.cds-tag', '.cds-prod-meta', '.cds-seg-ref', '.cds-notice'].forEach(s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length && e.textContent.trim()).slice(0, 4).forEach(e => { const bg = fondo(e), fg = mez(num(getComputedStyle(e).color), bg), a = lum(fg), b = lum(bg); out.push({ s, r: Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 100) / 100 }); })); return out; });
    ok('accesibilidad', 'contraste WCAG AA (≥ 4.5:1) del texto de Mis seguimientos', ctr.length > 5 && ctr.every(c => c.r >= 4.5), 'min ' + Math.min.apply(null, ctr.map(c => c.r)) + ' · ' + ctr.filter(c => c.r < 4.5).map(c => c.s + ' ' + c.r).join(','));
    await oa.ctx.close();
  }

  // =================== 9) servidor REINICIADO: los seguimientos persisten ===================
  const dirR = fs.mkdtempSync(path.join(os.tmpdir(), 'croma-d1b-reinicio-')), portR = '8832', baseR = 'http://127.0.0.1:' + portR;
  const lanzar = () => { const p = spawn(process.execPath, [path.join(__dirname, 'servidor.js'), '--puerto=' + portR, '--seguimientos', '--seg-dir=' + dirR], { env: { ...process.env, CROMA_API_DIR: API }, stdio: 'ignore' }); return p; };
  const esperarUp = async () => { for (let i = 0; i < 80; i++) { try { const x = await fetch(baseR + '/__h/seg'); if (x.ok) return true; } catch (e) { /* aun no */ } await sleep(250); } return false; };
  let srv = lanzar(); const up1 = await esperarUp(); ok('reinicio', 'instancia independiente del backend (base temporal propia) levantada', up1);
  if (up1) {
    const antes = await api(baseR, 'POST', '/', { token: T1, body: { nivel: 'producto', cod: 'R0001', motivo: 'persistencia' } }); const nota = await api(baseR, 'POST', '/' + antes.json.seguimiento.id + '/notas', { token: T1, body: { texto: 'nota previa al reinicio' } });
    srv.kill(); await sleep(1200); srv = lanzar(); const up2 = await esperarUp();
    const despues = await api(baseR, 'GET', '/' + antes.json.seguimiento.id, { token: T1 });
    ok('reinicio', 'backend reiniciado: el seguimiento, su version, la nota y el historial siguen ahi', up2 && despues.status === 200 && despues.json.seguimiento.motivo === 'persistencia' && despues.json.eventos.some(e => e.texto === 'nota previa al reinicio') && nota.status === 201);
    const or = await abrir(1280, 800, { base: baseR }); await irOpp(or.page); await irMis(or.page);
    ok('reinicio', 'tras el reinicio la interfaz vuelve a listar el seguimiento (el navegador no guardaba nada)', await or.page.evaluate(() => /R0001/.test(document.getElementById('cdsSegZona').innerText)));
    await or.ctx.close();
    // =================== 10) copias verificadas y restauracion ===================
    const ext = path.join(dirR, 'copias-externas'), loc = path.join(dirR, 'copias-locales'); const envC = { ...process.env, SEGUIMIENTOS_DB_PATH: path.join(dirR, 'seguimientos.db'), SEGUIMIENTOS_COPIAS_DIR: loc, SEGUIMIENTOS_COPIAS_EXTERNAS_DIR: ext, SEGUIMIENTOS_HABILITADO: '1' };
    fs.mkdirSync(ext, { recursive: true }); fs.mkdirSync(loc, { recursive: true }); // la unidad externa debe EXISTIR (conectada): el script no la inventa
    const cp = spawnSync(process.execPath, [path.join(API, 'scripts', 'seguimientos-copia.js'), '--ejecutar'], { env: envC, encoding: 'utf8' });
    ok('copias', 'copia verificada con copia externa re-verificada (script del backend), codigo de salida 0', cp.status === 0 && /externa/i.test(cp.stdout + cp.stderr) && fs.existsSync(path.join(loc, 'copias.json')), (cp.stdout || cp.stderr).slice(0, 160).replace(/\n/g, ' '));
    srv.kill(); await sleep(1000);
    const manif = JSON.parse(fs.readFileSync(path.join(loc, 'copias.json'), 'utf8')); const ultima = (manif.copias || manif)[0] || (manif.copias || manif).slice(-1)[0]; const idc = ultima.id || ultima.nombre;
    const destino = path.join(dirR, 'restaurada.db');
    const rs = spawnSync(process.execPath, [path.join(API, 'scripts', 'seguimientos-restaurar.js'), '--id', String(idc), '--externa', '--destino', destino, '--ejecutar'], { env: envC, encoding: 'utf8' });
    const rdb = fs.existsSync(destino) ? new DatabaseSync(destino, { readOnly: true }) : null;
    ok('copias', 'restauracion desde la copia EXTERNA a un archivo NUEVO: los datos coinciden (seguimiento y nota)', rs.status === 0 && !!rdb && Number(rdb.prepare("SELECT COUNT(*) n FROM seg_seguimiento WHERE cod = 'R0001'").get().n) === 1 && Number(rdb.prepare("SELECT COUNT(*) n FROM seg_evento WHERE texto = 'nota previa al reinicio'").get().n) === 1, (rs.stdout || rs.stderr).slice(0, 140).replace(/\n/g, ' '));
    if (rdb) rdb.close();
    const rs2 = spawnSync(process.execPath, [path.join(API, 'scripts', 'seguimientos-restaurar.js'), '--id', String(idc), '--externa', '--destino', destino, '--ejecutar'], { env: envC, encoding: 'utf8' }); ok('copias', 'restaurar NUNCA pisa un archivo existente', rs2.status !== 0);
  } else srv.kill();
  try { srv.kill(); } catch (e) { /* ya */ }

  await browser.close();
  const fallos = res.filter(x => !x.ok);
  fs.writeFileSync(path.join(OUT, 'resultados-d1b.json'), JSON.stringify({ total: res.length, fallos: fallos.length, resultados: res }, null, 1));
  console.log('\nRESUMEN D1B: ' + (res.length - fallos.length) + '/' + res.length + ' comprobaciones OK' + (fallos.length ? ' · FALLAN: ' + fallos.map(f => f.grupo + ':' + f.nombre.slice(0, 60)).join(' || ') : ''));
  process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error('ERROR FATAL', e); process.exit(2); });
