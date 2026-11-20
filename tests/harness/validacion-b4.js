'use strict';
// Validacion de la Etapa B4 (cierre de Oportunidades con cds-v3): ciclo de vida del detalle, filas y pestañas, filtros de rotacion, avisos, estados de la
// interfaz, escenario sintetico con los 11 estados comerciales y valores faltantes, y matriz de 7 tamaños. HARNESS local, datos SINTETICOS.
//   1) node tests/harness/servidor.js --puerto=8812   (con CROMA_API_DIR = croma-api compatible)   2) [opcional] referencia B3 en --base=8813
//   3) node tests/harness/validacion-b4.js --puerto=8812 [--base=8813] [--salida=<carpeta>]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const BASE = 'http://127.0.0.1:' + arg('puerto', '8812'), REF = arg('base') ? 'http://127.0.0.1:' + arg('base') : null;
const OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'b4')); fs.mkdirSync(OUT, { recursive: true });
const res = []; const ok = (g, n, c, d) => { res.push({ grupo: g, nombre: n, ok: !!c, detalle: d == null ? '' : String(d).slice(0, 300) }); console.log((c ? 'PASS ' : 'FAIL ') + '[' + g + '] ' + n + (d != null && d !== '' ? '  [' + String(d).slice(0, 170) + ']' : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nf = new Intl.NumberFormat('es-AR');
const ESTADOS = ['revisar_devoluciones', 'reposicion_urgente', 'reponer_desde_deposito', 'reposicion_a_evaluar', 'posible_rotacion', 'reposicion_proxima', 'venta_destacada', 'bien_vendido', 'seguimiento', 'posible_descuento', 'stock_parado'];
const FAMILIA = { revisar_devoluciones: 'revisar_datos', reposicion_urgente: 'reposicion', reponer_desde_deposito: 'reposicion', reposicion_a_evaluar: 'reposicion', reposicion_proxima: 'reposicion', posible_rotacion: 'rotaciones', venta_destacada: 'rendimiento', bien_vendido: 'rendimiento', seguimiento: 'rendimiento', posible_descuento: 'estancados', stock_parado: 'estancados' };
const ACCION = { revisar_devoluciones: 'revisar_devoluciones', reposicion_urgente: 'reponer_urgente', reponer_desde_deposito: 'reponer_desde_deposito', reposicion_a_evaluar: 'evaluar_reposicion', posible_rotacion: 'revisar_rotacion', reposicion_proxima: 'reposicion_proxima', seguimiento: 'seguir_producto_nuevo', posible_descuento: 'evaluar_descuento', stock_parado: 'revisar_stock_parado' };

(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  async function abrir(base, bandera, w = 1280, h = 900, touch) {
    const movil = touch !== undefined ? touch : w <= 768;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil && w <= 760, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    await ctx.addInitScript(b => { try { localStorage.setItem('cds-v3', b ? '1' : '0'); } catch (e) { /* nada */ } }, bandera);
    const page = await ctx.newPage(); const o = { ctx, page, errores: [], lista: [], union: [] };
    page.on('pageerror', e => o.errores.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g|status of 5/.test(m.text())) o.errores.push('console ' + m.text().slice(0, 160)); });
    page.on('request', r => { const u = new URL(r.url()); if (u.pathname === '/analisis/oportunidades') (u.searchParams.get('limit') === '1' ? o.union : o.lista).push(u.searchParams); });
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }); await sleep(1200);
    await page.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await sleep(3000);
    o.reset = () => { o.lista.length = 0; o.union.length = 0; };
    return o;
  }
  const api = (p, params, extra) => p.evaluate(async ([q, extra]) => { const u = new URLSearchParams(q); Object.entries(extra || {}).forEach(([k, v]) => u.set(k, String(v))); const t = sessionStorage.getItem('croma_token'); const r = await fetch('/analisis/oportunidades?' + u.toString(), { headers: { Authorization: 'Bearer ' + t } }); return r.json(); }, [params.toString(), extra]);
  const cuerpo = p => p.evaluate(() => (document.getElementById('cdsDrCuerpo') || {}).innerText || '');
  const bloqueado = p => p.evaluate(() => getComputedStyle(document.documentElement).overflow === 'hidden');
  const ultima = o => o.lista[o.lista.length - 1];

  // Respuesta sintetica: copia de una real (para conservar todos los campos) con un universo propio.
  function fixture(real) {
    const tpl = real.data.find(x => x.estado_principal) || real.data[0], items = []; let n = 0;
    const clon = () => JSON.parse(JSON.stringify(tpl));
    ESTADOS.forEach((e, i) => {
      for (let k = 0; k < 2; k++) {
        const f = clon(); n++; f.Codigo_producto = 'S' + String(n).padStart(3, '0'); f.Nombre_producto = 'Sintético ' + e + ' ' + (k + 1); f.estado_principal = e; f.etiquetas_secundarias = k === 0 ? [ESTADOS[(i + 3) % 11], ESTADOS[(i + 5) % 11]].filter(x => x !== e) : []; f.estados_secundarios = f.etiquetas_secundarias;
        f.acciones = ACCION[e] ? [{ accion: ACCION[e], principal: true, prioridad: ['alta', 'media', 'baja'][(i + k) % 3], estado_origen: e, motivo: 'Motivo sintético de ' + e, requiere_validacion_variante: e === 'posible_rotacion' }] : [{ accion: 'seguir_producto_nuevo', principal: true, prioridad: 'baja', estado_origen: e, motivo: 'Motivo de ' + e }];
        f.Ventas_total = 3 + n; f.Stock_sucursales = 2 + k; f.Stock_deposito = k; f.cobertura_dias = 10 * n; f.cobertura_estado = 'calculada'; f.ratio_confiable = true;
        items.push(f);
      }
    });
    // valores faltantes y casos limite
    const m = items[0]; m.Ventas_total = -4; m.ratio_confiable = false;
    const f2 = items[3]; delete f2.Ventas_total; f2.Stock_sucursales = null; delete f2.Stock_deposito; f2.cobertura_dias = null; f2.cobertura_estado = 'sin_ventas'; delete f2.por_sucursal;
    const f3 = items[7]; f3.ratio_confiable = false; delete f3.explicacion; delete f3.motivo; delete f3.ingreso_proveedor; delete f3.rendimiento;
    for (let k = 0; k < 3; k++) { const f = clon(); n++; f.Codigo_producto = 'N' + String(k + 1).padStart(3, '0'); f.Nombre_producto = 'Sin acción ' + (k + 1); f.estado_principal = null; f.etiquetas_secundarias = []; f.estados_secundarios = []; f.acciones = []; f.Ventas_total = k; f.cobertura_dias = null; f.cobertura_estado = 'sin_ventas'; delete f.rendimiento; items.push(f); }
    const por = Object.fromEntries(ESTADOS.map(e => [e, 2])), sin = 3, total = items.length;
    return Object.assign({}, real, { data: items, paginacion: { total, limit: 50, offset: 0, devueltos: total }, resumen: Object.assign({}, real.resumen, { total_evaluados: total, total_clasificados: total - sin, total_sin_clasificacion: sin, por_estado_principal: por }) });
  }

  // ============================ A) CICLO DE VIDA DEL DETALLE ============================
  const on = await abrir(BASE, true), P = on.page;
  const real = await api(P, ultima(on)); const cod = real.data.find(x => (x.etiquetas_secundarias || []).length).Codigo_producto;
  const abrirDet = async c => { await P.evaluate(c => { [...document.querySelectorAll('[data-detalle-codigo="' + c + '"]')].find(x => x.offsetParent).click(); }, c); await sleep(900); };
  await abrirDet(cod);
  ok('Detalle', 'Abierto el detalle, la página de atrás queda bloqueada y el foco está en «Cerrar»', (await P.$$('.cds-dr')).length === 1 && await bloqueado(P) && (await P.evaluate(() => document.activeElement.getAttribute('data-fk'))) === 'x');
  await P.evaluate(() => document.querySelector('.cds-nav[data-cds-view="rotaciones"]').click()); await sleep(2200);
  ok('Detalle', 'Salir a Rotaciones con el detalle abierto lo cierra y libera la página', (await P.$$('.cds-dr')).length === 0 && !(await bloqueado(P)) && (await P.evaluate(() => RT_OPORTUNIDADES_EXPANDIDO)) === null);
  await P.evaluate(() => document.querySelector('.cds-nav[data-cds-view="oportunidades"]').click()); await sleep(3000);
  const foco0 = await P.evaluate(() => document.activeElement && document.activeElement.tagName);
  ok('Detalle', 'Al volver a Oportunidades el detalle NO se reabre y el foco no es robado', (await P.$$('.cds-dr')).length === 0 && !(await bloqueado(P)) && foco0 !== 'BUTTON', 'activo ' + foco0);
  for (const [como, accion] of [['«Cerrar»', () => P.click('.cds-dr-x')], ['Escape', () => P.keyboard.press('Escape')], ['el fondo', () => P.mouse.click(40, 400)]]) {
    await abrirDet(cod); await accion(); await sleep(700);
    ok('Foco', 'Cerrar con ' + como + ' devuelve el foco al botón «Ver detalle» de ese producto', (await P.$$('.cds-dr')).length === 0 && (await P.evaluate(() => document.activeElement.getAttribute('data-detalle-codigo'))) === cod, await P.evaluate(() => document.activeElement.tagName + ' ' + (document.activeElement.getAttribute('data-detalle-codigo') || '') + ' ' + document.activeElement.className));
  }
  for (const [txt, id] of [['Ver producto', 'productos'], ['Ver en Talles y colores', 'talles-colores']]) {
    await P.evaluate(() => { RT_OPORTUNIDADES_EXPANDIDO = null; if (RT_VIEW !== 'oportunidades') document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click(); if (RT_FILTRO) rtQuitarFiltro(); }); await sleep(2600);
    await abrirDet(cod); await P.click('.cds-dr .cds-btn:text-is("' + txt + '")'); await sleep(1500);
    ok('Navegación', '«' + txt + '» abre ' + id + ', cierra el detalle y libera la página', (await P.evaluate(() => RT_VIEW)) === id && (await P.$$('.cds-dr')).length === 0 && !(await bloqueado(P)));
    await P.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await sleep(2600);
    ok('Navegación', 'Al volver desde ' + id + ' no se reabre el detalle', (await P.$$('.cds-dr')).length === 0);
  }
  await P.evaluate(() => { RT_OPORTUNIDADES_EXPANDIDO = null; if (RT_FILTRO) rtQuitarFiltro(); rtRenderVistaActual(); }); await sleep(2500);

  // ============================ B) FILAS COMPACTAS ============================
  const medirFilas = pg => pg.evaluate(() => { const hs = [...document.querySelectorAll('.cds-fila')].map(f => f.getBoundingClientRect().height); return { max: Math.max(...hs), media: hs.reduce((a, b) => a + b, 0) / hs.length, n: hs.length }; });
  const filas = await medirFilas(P); let ref3 = null; if (REF) { const r3 = await abrir(REF, true); ref3 = await medirFilas(r3.page); await r3.ctx.close(); }
  ok('Filas', 'Las filas son más compactas que en B3 (media ' + filas.media.toFixed(1) + ' px' + (ref3 ? ' contra ' + ref3.media.toFixed(1) + ' px en B3' : '') + '; máx. ' + filas.max.toFixed(0) + ' px) sin cortar textos', ref3 ? filas.media < ref3.media - 5 && filas.max <= 90 : filas.media < 80, JSON.stringify({ b4: filas, b3: ref3 }));
  const cel = await P.evaluate(() => { const tr = [...document.querySelectorAll('.cds-fila')].find(t => t.querySelector('.cds-flag')); return tr ? { flagEnAccion: !!tr.querySelector('.c-acc .cds-flag'), mas: !!document.querySelector('.cds-state-mas'), cortes: [...tr.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline').length } : null; });
  ok('Filas', 'Las etiquetas «validar por variante / muestra chica / devoluciones» siguen visibles (bajo la acción) y los «+N» secundarios también', cel && cel.flagEnAccion && cel.mas && cel.cortes === 0, JSON.stringify(cel));

  // ============================ C) ESCENARIO SINTETICO: 11 ESTADOS + SIN ACCION + FALTANTES ============================
  const fx = fixture(real);
  await P.route('**/analisis/oportunidades?*', async route => { const u = new URL(route.request().url()); if (u.searchParams.get('limit') === '1') return route.continue(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx) }); });
  await P.evaluate(() => { RT_OPORTUNIDADES = null; rtCargarOportunidades(); }); await sleep(2500);
  const gs = await P.evaluate(() => [...document.querySelectorAll('.cds-grupo')].map(s => ({ estado: s.getAttribute('data-estado'), fam: s.getAttribute('data-cds-g'), nombre: s.querySelector('.cds-grupo-nombre').textContent, cuenta: s.querySelector('.cds-grupo-cuenta').textContent, filas: s.querySelectorAll('.cds-fila').length })));
  ok('11 estados', 'Aparecen los 12 grupos (los 11 estados del motor + «Sin acción») en el orden del motor', JSON.stringify(gs.map(g => g.estado)) === JSON.stringify([...ESTADOS, '__sin_accion__']), gs.map(g => g.estado.slice(0, 10)).join(','));
  ok('11 estados', 'Cada grupo muestra el total del resumen (2; «Sin acción» 3) y sus filas', gs.every(g => g.estado === '__sin_accion__' ? /^3 /.test(g.cuenta) && g.filas === 3 : /^2 /.test(g.cuenta) && g.filas === 2), gs.map(g => g.cuenta.slice(0, 12)).join('|'));
  ok('11 estados', 'Cada estado usa el color de su familia comercial (reposición, rotaciones, rendimiento, estancados, revisar datos); «Sin acción» es neutro', gs.every(g => g.estado === '__sin_accion__' ? g.fam === null : g.fam === FAMILIA[g.estado]), gs.map(g => g.fam).join());
  const ur = await P.evaluate(() => [...new Set([...document.querySelectorAll('.cds-fila .c-urg')].map(c => c.textContent.trim()))].sort());
  ok('11 estados', 'Las tres urgencias (Alta, Media, Baja) y «—» (sin acción) aparecen diferenciadas', JSON.stringify(ur) === JSON.stringify(['Alta', 'Baja', 'Media', '—'].sort()), ur.join());
  const tx = await P.evaluate(() => document.querySelector('.cds-grupos').innerText);
  ok('Faltantes', 'Con ventas, stock, depósito, cobertura y por-sucursal ausentes: nunca NaN, undefined ni null en toda la lista', !/NaN|undefined|null/.test(tx), (tx.match(/NaN|undefined|null/g) || []).join());
  ok('Faltantes', 'Se ven las etiquetas «devoluciones» (ventas negativas), «muestra chica» y «Sin ventas», y «Sin acción» para los productos sin acción', /devoluciones/.test(tx) && /muestra chica/.test(tx) && /Sin ventas/.test(tx) && (tx.match(/Sin acción sugerida/g) || []).length >= 3, '');
  // abrir el detalle de los 25 productos: ningun valor inventado, 4 pestañas
  const malos = [];
  for (const f of fx.data) {
    await P.evaluate(c => { RT_OPORTUNIDADES_EXPANDIDO = c; rtRenderVistaActual(); }, f.Codigo_producto); await sleep(120);
    for (const t of ['resumen', 'motivos', 'ingreso', 'sucursales']) { await P.click('#cdsTab_' + t); await sleep(60); const c = await cuerpo(P); if (/NaN|undefined|null/.test(c)) malos.push(f.Codigo_producto + ':' + t); }
    const cab = await P.evaluate(() => document.querySelector('.cds-dr-cab').innerText); if (f.estado_principal ? !cab.includes(f.Nombre_producto) : false) malos.push(f.Codigo_producto + ':cab');
  }
  ok('11 estados', 'Abriendo el detalle de los ' + fx.data.length + ' productos sintéticos (11 estados, secundarios, sin acción, datos faltantes) ninguna pestaña muestra NaN/undefined/null', malos.length === 0, malos.slice(0, 5).join(' '));
  const sec = fx.data[0]; await P.evaluate(c => { RT_OPORTUNIDADES_EXPANDIDO = c; rtRenderVistaActual(); }, sec.Codigo_producto); await sleep(300);
  const cabSec = await P.evaluate(() => document.querySelector('.cds-dr-cab').innerText);
  ok('Secundarios', 'El detalle lista los estados secundarios («También cumple») de ese producto', /También cumple/.test(cabSec) && sec.etiquetas_secundarias.length >= 1, cabSec.replace(/\s+/g, ' ').slice(0, 120));
  // espia: el rendimiento desde el ingreso se pide al armar la pestaña (mejora existente integrada)
  await P.evaluate(() => { window.__ri = 0; const o = window.riBloquesDetalle; window.riBloquesDetalle = function () { window.__ri++; return o.apply(this, arguments); }; });
  await P.click('#cdsTab_ingreso'); await sleep(300);
  ok('Rendimiento', 'La pestaña «Ingreso y rendimiento» invoca el bloque de rendimiento desde el ingreso ya existente (riBloquesDetalle)', (await P.evaluate(() => window.__ri)) >= 1);
  await P.evaluate(() => { RT_OPORTUNIDADES_EXPANDIDO = null; rtRenderVistaActual(); }); await P.unroute('**/analisis/oportunidades?*');
  // por rol
  await P.evaluate(c => { RT_OPORTUNIDADES_EXPANDIDO = c; rtRenderVistaActual(); }, sec.Codigo_producto); await sleep(300); await P.route('**/analisis/oportunidades?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx) })); await P.click('#cdsTab_motivos'); await sleep(300);
  const adm = /Explicación técnica \(solo administradores\)/.test(await cuerpo(P));
  await P.evaluate(() => { window.getUser = () => ({ rol: 'jefe' }); rtRenderVistaActual(); }); await sleep(400);
  ok('Roles', 'Detalle técnico por rol: el administrador ve la explicación técnica; otro rol no', adm && !/Explicación técnica/.test(await cuerpo(P)));
  await P.unroute('**/analisis/oportunidades?*'); await P.evaluate(() => { delete window.getUser; RT_OPORTUNIDADES_EXPANDIDO = null; RT_OPORTUNIDADES = null; rtCargarOportunidades(); }); await sleep(2500);

  // ============================ D) FILTROS DE ROTACION ============================
  on.reset(); await P.evaluate(() => ovElegirGrupo('rotaciones')); await sleep(1800);
  const rot = await P.evaluate(() => { const r = document.querySelector('.ov-rot-filtros'); return r ? { nota: /validación por talle y color/.test(r.innerText), botones: [...r.querySelectorAll('.btn-sm')].map(b => b.textContent.trim()), selects: r.querySelectorAll('select').length, nums: r.querySelectorAll('input[type=number]').length, etiquetas: [...r.querySelectorAll('select,input')].every(x => x.getAttribute('aria-label')) } : null; });
  ok('Rotación', 'En «Rotaciones» aparecen la advertencia de validación, confianza (Todos / Revisión manual), origen, destino y 3 mínimos, todos con nombre accesible', rot && rot.nota && rot.botones.length === 2 && rot.selects === 2 && rot.nums === 3 && rot.etiquetas, JSON.stringify(rot));
  on.reset(); await P.selectOption('.ov-rot-filtros select[aria-label="Sucursal origen"]', { index: 1 }); await sleep(1500);
  const qo = ultima(on); ok('Rotación', 'Elegir origen consulta una vez con rotacion_origen y vuelve a la página 1', on.lista.length === 1 && qo.get('rotacion_origen') && qo.get('offset') === '0' && qo.get('estado') === 'posible_rotacion', qo && qo.toString().slice(0, 150));
  on.reset(); await P.selectOption('.ov-rot-filtros select[aria-label="Sucursal destino"]', { index: 2 }); await sleep(1500);
  on.reset(); await P.fill('.ov-rot-filtros input[aria-label="Mín. ventas destino"]', '1'); await P.keyboard.press('Tab'); await sleep(1500);
  await P.fill('.ov-rot-filtros input[aria-label="Mín. stock origen"]', '1'); await P.keyboard.press('Tab'); await sleep(1500);
  await P.click('.ov-rot-filtros .btn-sm:text-is("Revisión manual")'); await sleep(1600);
  const qr = ultima(on), tr = await api(P, qr);
  ok('Rotación', 'Origen, destino, mínimos y confianza viajan juntos y el total mostrado coincide con la API', ['rotacion_origen', 'rotacion_destino', 'rotacion_ventas_destino_min', 'rotacion_stock_origen_min'].every(k => qr.get(k)) && qr.get('confianza') === 'manual' && (await P.evaluate(() => document.querySelector('.cds-resultados').innerText)).includes(nf.format(tr.paginacion.total)), qr.toString().slice(0, 200));
  // combinados con B1: buscar + marca + prioridad + rotacion
  on.reset(); await P.fill('#rtProdCodigo', 'producto'); await P.click('.fc:has(label:text-is("Marca")) summary'); await sleep(120); await P.locator('.fc:has(label:text-is("Marca")) label.rt-sv-filtro-opcion:has-text("NIKE") input').check(); await sleep(250);
  const pend = await P.evaluate(() => document.getElementById('cdsFiltrosEstado').textContent); await P.click('form.ov-filtros button.ov-aplicar'); await sleep(1800);
  const qc = ultima(on); ok('Combinados', 'Búsqueda + marca aplicadas con los filtros de rotación vigentes: una consulta con todos los parámetros y aviso de «cambios sin aplicar» antes', /Búsqueda, Marca/.test(pend) && on.lista.length === 1 && qc.get('buscar') === 'producto' && qc.get('marca') === 'NIKE' && qc.get('rotacion_origen') && qc.get('confianza') === 'manual', qc && qc.toString().slice(0, 200));
  const gR = await P.evaluate(() => [...document.querySelectorAll('.cds-grupo-cuenta')].map(c => c.textContent));
  ok('Combinados', 'Con filtros de rotación el total por grupo se muestra «no disponible» (la API no lo entrega) y no se inventa', gR.length === 0 || gR.every(t => /no disponible/.test(t)), gR.join('|').slice(0, 100));
  await P.evaluate(() => ovIrAPagina(2)); await sleep(1200); on.reset();
  await P.click('form.ov-filtros .btn-sm:text-is("Limpiar")'); await sleep(1800);
  ok('Combinados', 'Limpiar quita búsqueda y marca (una consulta) y conserva los filtros de rotación', !ultima(on).has('buscar') && !ultima(on).has('marca') && !!ultima(on).get('rotacion_origen'), ultima(on) && ultima(on).toString().slice(0, 140));
  await P.evaluate(() => { RT_OPORTUNIDADES_ROTACION = { origen: '', destino: '', ventasDestinoMin: '', stockOrigenMin: '', coberturaOrigenMin: '' }; RT_OPORTUNIDADES_CONFIANZA = null; ovElegirGrupo('todas'); }); await sleep(2000);

  // ============================ E) AVISOS Y ESTADOS ============================
  const mutar = async fn => { await P.unroute('**/analisis/oportunidades?*').catch(() => {}); await P.route('**/analisis/oportunidades?*', async route => { const u = new URL(route.request().url()); const r = await route.fetch(); const j = await r.json(); if (u.searchParams.get('limit') !== '1') fn(j); await route.fulfill({ response: r, json: j }); }); await P.evaluate(() => { RT_OPORTUNIDADES = null; rtCargarOportunidades(); }); await sleep(2500); };
  await mutar(j => { j.sucursales_ignoradas = ['0009']; j.sucursales = (j.sucursales || []).filter(c => c !== '0014'); j.rendimiento_ingreso = { aplicacion: { aplicado: false, motivo: 'snapshot_atrasado', suspendidas: ['bien_vendido'] } }; });
  const av = await P.evaluate(() => [...document.querySelectorAll('.ov .rr-aviso')].map(a => ({ t: a.innerText.replace(/\s+/g, ' '), rol: a.getAttribute('role'), borde: getComputedStyle(a).borderInlineStartWidth, visible: a.offsetParent !== null })));
  ok('Avisos', 'Sucursales no consideradas y rendimiento suspendido (dato atrasado) se muestran con el sistema nuevo, con rol de estado y a la vista', av.some(a => /Sucursales no consideradas/.test(a.t) && a.visible) && av.some(a => /Etiquetas de rendimiento suspendidas: el último cálculo tiene más de 2 días/.test(a.t) && a.visible) && av.every(a => a.rol && a.borde === '4px'), av.map(a => a.t.slice(0, 40)).join(' | '));
  await P.screenshot({ path: path.join(OUT, 'on-avisos-1280.png') });
  await mutar(j => { j.rendimiento_ingreso = { aplicacion: { aplicado: false, motivo: 'snapshot_vencido', suspendidas: [] } }; });
  ok('Avisos', 'Dato vencido (más de 7 días) se avisa con su propio texto', /más de 7 días/.test(await P.evaluate(() => document.querySelector('.ov-aviso-ri').innerText)));
  await P.unroute('**/analisis/oportunidades?*');
  await P.route('**/analisis/oportunidades?*', route => { const u = new URL(route.request().url()); if (u.searchParams.get('limit') === '1') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"x"}' }); return route.continue(); });
  await P.evaluate(() => { RT_OPORTUNIDADES = null; RT_OPORTUNIDADES_UNIONES = null; rtCargarOportunidades(); }); await sleep(2800);
  ok('Avisos', 'Si fallan las consultas de conteo por grupo: alerta visible con «Reintentar» y la lista sigue funcionando', !!(await P.$('.ov .rr-aviso[role=alert] button:text-is("Reintentar")')) && (await P.$$('.cds-fila')).length > 0);
  await P.unroute('**/analisis/oportunidades?*');
  const estados = {};
  await P.route('**/analisis/oportunidades?*', async route => { const u = new URL(route.request().url()); if (u.searchParams.get('limit') === '1') return route.continue(); if (estados.modo === 'error') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"Error simulado"}' }); if (estados.modo === 'demora') { await sleep(1800); return route.continue(); } if (estados.modo === 'vacio') { const r = await route.fetch(); const j = await r.json(); j.data = []; j.paginacion = { total: 0, limit: 50, offset: 0, devueltos: 0 }; return route.fulfill({ response: r, json: j }); } return route.continue(); });
  for (const modo of ['demora', 'vacio', 'error']) {
    estados.modo = modo; await P.evaluate(() => { RT_OPORTUNIDADES = null; rtCargarOportunidades(); }); await sleep(modo === 'demora' ? 500 : 2200);
    const e = await P.evaluate(() => ({ panel: document.querySelector('.ov-panel').innerText, res: (document.querySelector('.cds-resultados') || {}).innerText, grupos: document.querySelectorAll('.cds-grupo').length, ocupado: document.querySelector('.ov-panel').getAttribute('aria-busy') }));
    const esperado = { demora: /Calculando|Actualizando/, vacio: /Sin oportunidades|Ningún producto/, error: /No se pudieron calcular/ }[modo];
    ok('Estados', modo === 'demora' ? 'Carga: «Calculando…», panel ocupado, sin grupos ni cifras' : modo === 'vacio' ? 'Vacío: mensaje claro sin grupos' : 'Error: mensaje con «Reintentar», sin grupos ni cifras inventadas', esperado.test(e.panel) && e.grupos === 0 && (modo !== 'demora' || (e.ocupado === 'true' && /Consultando/.test(e.res))) && (modo !== 'error' || /no hay resultados que mostrar/.test(e.res)), e.panel.replace(/\s+/g, ' ').slice(0, 90));
    await P.screenshot({ path: path.join(OUT, 'on-estado-' + modo + '-1280.png') }); if (modo === 'demora') await sleep(1800);
  }
  estados.modo = null; await P.click('.ov-panel button:text-is("Reintentar")'); await sleep(2200);
  ok('Estados', 'Reintentar tras el error recupera la lista', (await P.$$('.cds-fila')).length > 0);
  await P.unroute('**/analisis/oportunidades?*');

  // simultaneas (B1): la ultima gana
  await P.route('**/analisis/oportunidades?*', async route => { const u = new URL(route.request().url()); if (u.searchParams.get('limit') !== '1' && u.searchParams.get('buscar') === '1003') await sleep(2200); await route.continue(); });
  await P.fill('#rtProdCodigo', '1003'); await P.click('form.ov-filtros button.ov-aplicar'); await sleep(300); await P.fill('#rtProdCodigo', '1004'); await P.click('form.ov-filtros button.ov-aplicar'); await sleep(3600);
  ok('Simultáneas', 'Dos consultas seguidas con la primera lenta: queda la última (1004) en la tabla nueva', JSON.stringify(await P.evaluate(() => [...new Set([...document.querySelectorAll('.cds-fila .cds-mono')].map(x => x.textContent))])) === '["1004"]');
  await P.unroute('**/analisis/oportunidades?*');
  ok('Consola', 'Sin errores de página ni de consola (escritorio, bandera encendida)', on.errores.length === 0, on.errores.join(' || '));
  await on.ctx.close();

  // ============================ F) PESTAÑAS DEL DETALLE EN MOVIL ============================
  for (const [w, h] of [[320, 640], [375, 812]]) {
    const mv = await abrir(BASE, true, w, h), M = mv.page, tag = 'Móvil ' + w + '×' + h;
    await M.evaluate(() => [...document.querySelectorAll('.cds-ver')].find(x => x.offsetParent).click()); await sleep(900);
    const t = await M.evaluate(() => { const tl = document.querySelector('.cds-tabs'), tabs = [...tl.querySelectorAll('.cds-tab')]; return { n: tabs.length, nombres: tabs.map(x => x.getAttribute('aria-label')), visibles: tabs.map(x => x.innerText.trim()), scroll: tl.scrollWidth > tl.clientWidth, h: Math.min(...tabs.map(x => x.getBoundingClientRect().height)) }; });
    ok(tag + ' · pestañas', 'Cuatro pestañas con texto corto en pantalla y nombre accesible completo («Ingreso y rendimiento»)', t.n === 4 && t.nombres.includes('Ingreso y rendimiento') && t.visibles.includes('Ingreso') && t.h >= 43.5, JSON.stringify(t));
    for (const id of ['sucursales', 'motivos', 'ingreso']) { await M.click('#cdsTab_' + id); await sleep(300); }
    await M.focus('#cdsTab_resumen'); await M.keyboard.press('End'); await sleep(400);
    const vis = await M.evaluate(() => { const tl = document.querySelector('.cds-tabs').getBoundingClientRect(), s = document.querySelector('.cds-tab[aria-selected=true]').getBoundingClientRect(); return { id: document.querySelector('.cds-tab[aria-selected=true]').id, dentro: s.left >= tl.left - 1 && s.right <= tl.right + 1 }; });
    ok(tag + ' · pestañas', 'La pestaña elegida con el teclado (Fin → Sucursales) queda completamente a la vista', vis.id === 'cdsTab_sucursales' && vis.dentro, JSON.stringify(vis));
    await M.keyboard.press('Escape'); await sleep(400); await mv.ctx.close();
  }

  // ============================ G) MATRIZ DE 7 TAMAÑOS ============================
  const TAM = [[320, 640], [375, 812], [430, 932], [768, 1024], [1024, 768], [1280, 900], [1920, 1080]];
  for (const [w, h] of TAM) {
    const o = await abrir(BASE, true, w, h), X = o.page, tag = w + '×' + h, tactil = w <= 900;
    const m = await X.evaluate(() => { const tabla = document.querySelector('.cds-res-tabla'), tarj = document.querySelector('.cds-res-cards'); return { tabla: !!tabla && getComputedStyle(tabla).display !== 'none', tarjetas: !!tarj && getComputedStyle(tarj).display !== 'none', sw: document.documentElement.scrollWidth, iw: innerWidth }; });
    ok(tag, 'Sin desborde horizontal y con ' + (w > 900 ? 'tabla' : 'tarjetas') + ' según el ancho (tabla > 900 px)', m.sw <= m.iw && (w > 900 ? m.tabla && !m.tarjetas : !m.tabla && m.tarjetas), JSON.stringify(m));
    const cortes = await X.evaluate(() => { const malos = []; document.querySelectorAll('.cds-grupos *:not(.cds-sr), .ov-grupo *, .cds-vista-sel *, .cds-resultados *').forEach(e => { if (e.closest('.cds-sr') || e.offsetParent === null) return; const cs = getComputedStyle(e); if (cs.textOverflow === 'ellipsis') malos.push('elipsis ' + e.className); if (e.children.length === 0 && e.textContent.trim() && e.scrollWidth > e.clientWidth + 1 && cs.display !== 'inline' && e.tagName !== 'SELECT') malos.push(e.tagName + '.' + e.className + ' ' + e.scrollWidth + '>' + e.clientWidth); }); return malos.slice(0, 4); });
    ok(tag, 'Sin textos cortados', cortes.length === 0, cortes.join(' | '));
    if (tactil) { const peq = await X.evaluate(() => { const malos = []; document.querySelectorAll('.cds-ver, .cds-vista-btn, .ov-grupo, .ov-rapido, .ov-filtros-plegable summary, #rtBar button, #rtBar input, .ov-panel-ctl select, .cds-tabbar button, .ov-subnav button, .ov-pag-btn').forEach(e => { if (e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return; const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && r.height < 43.5) malos.push((e.className || e.tagName).toString().slice(0, 22) + ' ' + Math.round(r.height)); }); return malos.slice(0, 5); }); ok(tag, 'Controles táctiles de al menos 44 px de alto', peq.length === 0, peq.join(' | ')); }
    await X.evaluate(() => document.querySelector('.cds-grupo').scrollIntoView()); await sleep(250); await X.screenshot({ path: path.join(OUT, 'on-lista-' + w + 'x' + h + '.png') });
    // teclado: Tab hasta «Ver detalle», Enter, foco atrapado, Escape y foco de vuelta
    await X.focus('.cds-ver:visible >> nth=0').catch(async () => { await X.evaluate(() => [...document.querySelectorAll('.cds-ver')].find(x => x.offsetParent).focus()); });
    const cod1 = await X.evaluate(() => document.activeElement.getAttribute('data-detalle-codigo')); await X.keyboard.press('Enter'); await sleep(900);
    let dentro = true; for (let i = 0; i < 12; i++) { await X.keyboard.press('Tab'); dentro = dentro && await X.evaluate(() => !!document.activeElement.closest('.cds-dr')); }
    const dr = await X.evaluate(() => { const a = document.querySelector('.cds-dr').getBoundingClientRect(); return { cabe: a.right <= innerWidth + 1 && a.bottom <= innerHeight + 1 && a.left >= -1, sw: document.documentElement.scrollWidth <= innerWidth }; });
    ok(tag + ' · detalle', 'Enter abre el detalle, el foco queda atrapado (12 Tab), el panel cabe en pantalla y no hay desborde', dentro && dr.cabe && dr.sw, JSON.stringify(dr));
    await X.screenshot({ path: path.join(OUT, 'on-detalle-' + w + 'x' + h + '.png') });
    await X.keyboard.press('Escape'); await sleep(600);
    ok(tag + ' · detalle', 'Escape cierra y el foco vuelve al botón del mismo producto', (await X.evaluate(() => document.activeElement.getAttribute('data-detalle-codigo'))) === cod1 && !(await bloqueado(X)));
    ok(tag, 'Sin errores de consola', o.errores.length === 0, o.errores.join(' || ')); await o.ctx.close();
  }

  // ============================ H) BANDERA APAGADA = REFERENCIA (B3) ============================
  const off = await abrir(BASE, false), Q = off.page;
  ok('Apagada', 'Sin la bandera: tabla antigua, sin objetos nuevos', (await Q.$$('.ov-tabla')).length === 1 && (await Q.$$('.cds-tabla')).length === 0 && !(await Q.evaluate(() => !!(window.CDS_RESULTADOS || window.CDS_DETALLE || window.CDS_POR_ACCION || window.CDS_FILTROS))));
  await Q.evaluate(() => document.querySelector('.ov-fila').click()); await sleep(800);
  await Q.evaluate(() => document.querySelector('#rtTabs .tab[data-view="rotaciones"]').click()); await sleep(2000); await Q.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await sleep(2500);
  ok('Apagada', 'Sin la bandera el comportamiento original se conserva: la fila expandida sigue expandida al volver (no se cierra al salir)', (await Q.$$('.rt-oport-detalle')).length >= 1);
  if (REF) {
    const huella = async base => {
      const o = await abrir(base, false); const out = {};
      for (const [nom, fn] of [['inicial', async () => {}], ['detalle', () => o.page.evaluate(() => document.querySelector('.ov-fila').click())], ['rotaciones', () => o.page.evaluate(() => ovElegirGrupo('rotaciones'))], ['pagina-2-todas', async () => { await o.page.evaluate(() => ovElegirGrupo('todas')); await sleep(1500); await o.page.evaluate(() => ovIrAPagina(2)); }], ['buscar', async () => { await o.page.fill('#rtProdCodigo', 'producto'); await o.page.click('form.ov-filtros button.ov-aplicar'); await sleep(1800); }]]) {
        await fn(); await sleep(1300);
        out[nom] = await o.page.evaluate(() => { const c = document.querySelector('.ov').cloneNode(true); return c.innerHTML.replace(/\d{1,2}[:/]\d{2}([:/]\d{2,4})?/g, '#').replace(/\s+/g, ' '); });
      }
      out.consultas = o.lista.map(q => [...q.entries()].map(e => e.join('=')).sort().join('&')).join('\n').replace(/\d{4}-\d{2}-\d{2}/g, 'F');
      await o.ctx.close(); return out;
    };
    const a = await huella(BASE), b = await huella(REF);
    for (const k of ['inicial', 'detalle', 'rotaciones', 'pagina-2-todas', 'buscar']) ok('Apagada = B3', 'DOM de Oportunidades «' + k + '» idéntico al de la referencia B3 (' + a[k].length + ' caracteres)', a[k] === b[k], a[k] === b[k] ? '' : 'difiere');
    ok('Apagada = B3', 'Consultas a la API idénticas a las de la referencia B3', a.consultas === b.consultas, a.consultas === b.consultas ? '' : 'difiere');
  }
  await Q.evaluate(() => document.querySelector('#rtTabs .tab[data-view="rotaciones"]').click()); await sleep(2500);
  ok('Rotaciones ChatGPT', 'Con la bandera apagada «Preparar correos con ChatGPT» también está', await Q.evaluate(() => !![...document.querySelectorAll('button')].find(x => /Preparar correos con ChatGPT/.test(x.textContent) && x.offsetParent)));
  ok('Consola', 'Sin errores (bandera apagada)', off.errores.length === 0, off.errores.join(' || '));
  await off.ctx.close();

  const fallan = res.filter(r => !r.ok).length;
  fs.writeFileSync(path.join(OUT, 'validacion-b4.json'), JSON.stringify({ fecha: new Date().toISOString(), total: res.length, fallan, resultados: res }, null, 1));
  console.log('\nComprobaciones: ' + res.length + ' OK: ' + (res.length - fallan) + ' FALLAN: ' + fallan);
  await browser.close(); process.exit(fallan ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
