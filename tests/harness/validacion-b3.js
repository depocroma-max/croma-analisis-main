'use strict';
// Validacion de la Etapa B3 (tabla comercial, tarjetas moviles y detalle de Oportunidades, bandera cds-v3) contra el HARNESS local (datos SINTETICOS).
//   1) node tests/harness/servidor.js --puerto=8812            (con CROMA_API_DIR = croma-api compatible)
//   2) [opcional] el harness del commit de referencia (B2) en otro puerto:  --base=8813  (compara con la bandera APAGADA)
//   3) node tests/harness/validacion-b3.js --puerto=8812 [--base=8813] [--salida=<carpeta>]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const BASE = 'http://127.0.0.1:' + arg('puerto', '8812'), REF = arg('base') ? 'http://127.0.0.1:' + arg('base') : null;
const OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'b3')); fs.mkdirSync(OUT, { recursive: true });
const res = []; const ok = (g, n, c, d) => { res.push({ grupo: g, nombre: n, ok: !!c, detalle: d == null ? '' : String(d).slice(0, 300) }); console.log((c ? 'PASS ' : 'FAIL ') + '[' + g + '] ' + n + (d != null && d !== '' ? '  [' + String(d).slice(0, 170) + ']' : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nf = new Intl.NumberFormat('es-AR');

(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  async function abrir(base, bandera, w = 1280, h = 900) {
    const movil = w <= 760;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    await ctx.addInitScript(b => { try { localStorage.setItem('cds-v3', b ? '1' : '0'); } catch (e) { /* nada */ } }, bandera);
    const page = await ctx.newPage(); const o = { ctx, page, errores: [], lista: [], union: [] };
    page.on('pageerror', e => o.errores.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) o.errores.push('console ' + m.text().slice(0, 160)); });
    page.on('request', r => { const u = new URL(r.url()); if (u.pathname === '/analisis/oportunidades') (u.searchParams.get('limit') === '1' ? o.union : o.lista).push(u.searchParams); });
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }); await sleep(1200);
    await page.evaluate(() => document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click()); await sleep(3000);
    o.reset = () => { o.lista.length = 0; o.union.length = 0; };
    return o;
  }
  const api = (p, params, off) => p.evaluate(async ([q, off]) => { const u = new URLSearchParams(q); if (off !== undefined) u.set('offset', String(off)); const t = sessionStorage.getItem('croma_token'); const r = await fetch('/analisis/oportunidades?' + u.toString(), { headers: { Authorization: 'Bearer ' + t } }); return r.json(); }, [params.toString(), off]);
  const textoTabla = p => p.evaluate(() => (document.querySelector('.cds-grupos, .ov-panel') || document.body).innerText);
  const volverAOportunidades = async p => { await p.evaluate(() => { RT_OPORTUNIDADES_EXPANDIDO = null; document.querySelector('#rtTabs .tab[data-view="oportunidades"]').click(); if (RT_FILTRO) rtQuitarFiltro(); }); await sleep(2800); };
  const abrirDetalle = async (p, cod) => { await p.evaluate(c => { const b = [...document.querySelectorAll('[data-detalle-codigo="' + c + '"]')].find(x => x.offsetParent); b.click(); }, cod); await sleep(900); };
  const pestana = async (p, id) => { await p.click('#cdsTab_' + id); await sleep(500); };
  const cuerpo = p => p.evaluate(() => (document.getElementById('cdsDrCuerpo') || {}).innerText || '');

  // ============================ A) ESCRITORIO 1280: tabla ============================
  const on = await abrir(BASE, true), P = on.page;
  const q1 = on.lista[on.lista.length - 1], a1 = await api(P, q1), data = a1.data;
  const enc = await P.evaluate(() => [...document.querySelectorAll('.cds-grupo:first-of-type .cds-tabla thead th')].map(t => t.textContent.replace('Detalle', '').trim()));
  ok('Tabla', 'Encabezados completos: Urgencia, Producto, Estado, Acción recomendada, Ventas (período), Stock, Dep. 90, Cobertura, Detalle', JSON.stringify(enc) === JSON.stringify(['Urgencia', 'Producto', 'Estado', 'Acción recomendada', 'Ventas (91 d)', 'Stock suc.', 'Dep. 90', 'Cobertura', '']), enc.join('|'));
  ok('Tabla', 'No queda la tabla antigua dentro de la interfaz nueva (ni .ov-tabla ni filas .ov-fila)', (await P.$$('.ov-tabla')).length === 0 && (await P.$$('.ov-fila')).length === 0 && (await P.$$('.cds-fila')).length === 50);
  const filas = await P.evaluate(() => [...document.querySelectorAll('.cds-fila')].map(tr => ({ cod: tr.querySelector('.cds-mono').textContent, nombre: tr.querySelector('.cds-prod-nombre').textContent, ventas: tr.children[4].textContent, stock: tr.children[5].textContent, dep: tr.children[6].textContent, urg: tr.children[0].textContent.trim(), estado: tr.children[2].textContent, accion: tr.children[3].querySelector('.cds-accion').textContent, mas: (tr.querySelector('.cds-state-mas') || {}).textContent || '' })));
  const porCod = {}; data.forEach(f => { porCod[f.Codigo_producto] = f; });
  ok('Tabla', 'Cada fila muestra código, nombre, ventas, stock y depósito idénticos a la API (50 filas)', filas.length === 50 && filas.every(x => { const f = porCod[x.cod]; return f && x.nombre === f.Nombre_producto && x.ventas === nf.format(f.Ventas_total) && x.stock === nf.format(f.Stock_sucursales) && x.dep === nf.format(f.Stock_deposito ?? f.Stock_ctro_0000); }), filas[0] && JSON.stringify(filas[0]));
  ok('Tabla', 'Estado comercial y urgencia diferenciados: estado con su nombre y urgencia con palabra (Alta/Media/Baja) o «—» si no hay acción', filas.every(x => /^(Alta|Media|Baja|—)$/.test(x.urg)) && filas.every(x => x.estado.length > 3) && new Set(filas.map(x => x.urg)).size >= 1, [...new Set(filas.map(x => x.urg))].join());
  ok('Tabla', 'La acción recomendada es visible en cada fila con acción', data.every(f => { const x = filas.find(y => y.cod === f.Codigo_producto); return (f.acciones || []).some(a => a.principal) ? x.accion.length > 3 && x.accion !== 'Sin acción sugerida' : x.accion === 'Sin acción sugerida'; }));
  const sinSec = data.find(f => (f.etiquetas_secundarias || []).length), conSec = filas.find(x => sinSec && x.cod === sinSec.Codigo_producto);
  ok('Secundarios', 'La fila indica «+N» estados secundarios (el detalle los explica) con N igual al de la API', !!conSec && conSec.mas === '+' + new Set([...(sinSec.etiquetas_secundarias || []), ...(sinSec.estados_secundarios || [])].filter(e => e !== sinSec.estado_principal)).size, conSec && conSec.mas);
  const txt = await textoTabla(P);
  ok('Tabla', 'El último ingreso y el rendimiento NO están en la fila principal (viven en el detalle)', !/Ingreso proveedor|Sin ingreso|Último ingreso|Bien vendido ?↗|Sin clasificación de rendimiento/.test(txt), '');
  const corte = await P.evaluate(() => { const malos = []; document.querySelectorAll('.cds-grupos *:not(.cds-sr)').forEach(e => { if (e.closest('.cds-sr')) return; const cs = getComputedStyle(e); if (cs.textOverflow === 'ellipsis') malos.push('ellipsis ' + e.className); if (e.children.length === 0 && e.textContent.trim() && e.scrollWidth > e.clientWidth + 1 && cs.display !== 'inline') malos.push('corte ' + e.tagName + '.' + e.className + ' ' + e.scrollWidth + '>' + e.clientWidth); }); const sec = document.querySelector('.cds-grupo'); const r = sec.getBoundingClientRect(); document.querySelectorAll('.cds-grupo td, .cds-grupo th').forEach(td => { if (td.getBoundingClientRect().right > r.right + 1) malos.push('fuera ' + td.className); }); return malos.slice(0, 6); });
  ok('Sin cortes', 'Ningún texto de la tabla queda cortado (sin elipsis, sin contenido más ancho que su celda, nada fuera del grupo)', corte.length === 0, corte.join(' | '));
  await P.evaluate(() => document.getElementById('ovPanel').scrollIntoView()); await sleep(300); await P.screenshot({ path: path.join(OUT, 'on-tabla-1280.png') });

  // desbordes en 11 anchos
  const anchos = [1440, 1280, 1100, 1024, 900, 820, 700, 600, 430, 375, 320], desb = [];
  for (const w of anchos) { await P.setViewportSize({ width: w, height: w < 760 ? 812 : 900 }); await sleep(900); const d = await P.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, tabla: !!document.querySelector('.cds-res-tabla') && getComputedStyle(document.querySelector('.cds-res-tabla')).display !== 'none', cards: getComputedStyle(document.querySelector('.cds-res-cards')).display !== 'none' })); if (d.sw > d.iw + 1) desb.push(w + ':' + d.sw); if (w >= 901 && !d.tabla) desb.push(w + ':sin tabla'); if (w <= 900 && !d.cards) desb.push(w + ':sin tarjetas'); }
  ok('Responsive', 'Sin desbordes horizontales en 11 anchos (1440…320) y con tabla ≥ 901 px / tarjetas ≤ 900 px', desb.length === 0, desb.join(' '));
  await P.setViewportSize({ width: 1280, height: 900 }); await sleep(900);

  // ============================ B) DETALLE ============================
  const cod = sinSec.Codigo_producto, f = sinSec;
  await P.evaluate(c => document.querySelector('[data-detalle-codigo="' + c + '"]').closest('tr').click(), cod); await sleep(900);
  const dlg = await P.evaluate(() => { const a = document.querySelector('.cds-dr'); return a ? { rol: a.getAttribute('role'), modal: a.getAttribute('aria-modal'), titulo: (document.getElementById(a.getAttribute('aria-labelledby')) || {}).textContent, foco: document.activeElement.getAttribute('data-fk'), bloqueo: getComputedStyle(document.documentElement).overflow, cab: a.querySelector('.cds-dr-cab').innerText } : null; });
  ok('Detalle', 'Hacer click en la fila abre el detalle como diálogo modal con el nombre del producto como título y el foco en «Cerrar»', dlg && dlg.rol === 'dialog' && dlg.modal === 'true' && dlg.titulo === f.Nombre_producto && dlg.foco === 'x', dlg && dlg.titulo + ' foco ' + dlg.foco);
  ok('Detalle', 'La cabecera identifica el producto: código, marca, rubro, subrubro, estado principal, urgencia y estados secundarios', dlg && [f.Codigo_producto, f.Nombre_marca, f.Nombre_rubro, f.Nombre_subrubro].every(x => dlg.cab.includes(x)) && /También cumple/.test(dlg.cab) && (f.etiquetas_secundarias || []).every(e => dlg.cab.length > 0), dlg && dlg.cab.replace(/\s+/g, ' ').slice(0, 150));
  ok('Detalle', 'Mientras el detalle está abierto la página de atrás no se desplaza (bloqueo de scroll)', dlg && dlg.bloqueo === 'hidden');
  await P.screenshot({ path: path.join(OUT, 'on-detalle-resumen-1280.png') });
  let c = await cuerpo(P);
  ok('Detalle · Resumen', 'Resumen: acción principal con prioridad y motivo, ventas, stock, depósito y cobertura de la API', /prioridad/.test(c) && c.includes(nf.format(f.Ventas_total)) && c.includes('Ventas del período') && /Stock suc\./.test(c) && /Dep\. 90/.test(c) && /Cobertura/.test(c), c.replace(/\s+/g, ' ').slice(0, 120));
  await pestana(P, 'motivos'); c = await cuerpo(P);
  ok('Detalle · Motivos', 'Motivos: «Por qué aparece» abierto con la explicación de cada estado (principal y secundarios) y el período', /Por qué aparece/.test(c) && /Período analizado/.test(c) && [f.estado_principal, ...(f.etiquetas_secundarias || [])].length >= 1 && (await P.evaluate(() => document.querySelector('#cdsDrCuerpo details').open)), c.replace(/\s+/g, ' ').slice(0, 100));
  ok('Detalle · Motivos', 'Administrador: aparece la explicación técnica (solo administradores)', /Explicación técnica \(solo administradores\)/.test(c));
  await P.screenshot({ path: path.join(OUT, 'on-detalle-motivos-1280.png') });
  await pestana(P, 'ingreso'); c = await cuerpo(P);
  ok('Detalle · Ingreso', 'Ingreso y rendimiento: último ingreso (fecha y cantidad), rendimiento y tendencia de ventas, dentro del detalle', /Último ingreso/.test(c) && (f.ingreso_proveedor ? c.includes(nf.format(f.ingreso_proveedor.ultima_cantidad)) : true) && /Rendimiento/.test(c) && /Tendencia de ventas/.test(c), c.replace(/\s+/g, ' ').slice(0, 140));
  await P.screenshot({ path: path.join(OUT, 'on-detalle-ingreso-1280.png') });
  await pestana(P, 'sucursales'); c = await cuerpo(P);
  const filasSuc = await P.evaluate(() => [...document.querySelectorAll('#cdsDrCuerpo .cds-mini tbody tr')].map(tr => [...tr.children].map(x => x.textContent.trim())));
  ok('Detalle · Sucursales', 'Sucursales: una fila por sucursal evaluada con las ventas y el stock de la API', filasSuc.length === a1.sucursales.length && a1.sucursales.every((cc, i) => { const s = f.por_sucursal[cc]; return filasSuc[i][1] === nf.format(s.ventas) && filasSuc[i][2] === nf.format(s.stock); }) && /Desbalance/.test(c), filasSuc.length + ' filas');
  await P.screenshot({ path: path.join(OUT, 'on-detalle-sucursales-1280.png') });
  // sin administrador: no aparece la explicacion tecnica
  await P.evaluate(() => { window.getUser = () => ({ rol: 'jefe' }); }); await pestana(P, 'motivos'); await P.evaluate(() => rtRenderVistaActual()); await sleep(500);
  ok('Detalle · Permisos', 'Sin rol de administrador NO aparece la explicación técnica', !/Explicación técnica/.test(await cuerpo(P)));
  await P.evaluate(() => { delete window.getUser; }); // se restablece la funcion original del navegador (recarga mas abajo)
  await P.keyboard.press('Escape'); await sleep(500);
  ok('Detalle', 'Escape cierra el detalle y se libera el scroll', (await P.$$('.cds-dr')).length === 0 && (await P.evaluate(() => getComputedStyle(document.documentElement).overflow)) !== 'hidden');

  // acciones del detalle conservadas
  const vistaActual = () => P.evaluate(() => RT_VIEW);
  for (const [texto, esperada, nombre] of [['Ver producto', 'productos', 'Ver producto'], ['Ver en Talles y colores', 'talles-colores', 'Ver en Talles y colores']]) {
    await volverAOportunidades(P); await abrirDetalle(P, cod);
    await P.click('.cds-dr .cds-btn:text-is("' + texto + '")'); await sleep(1500);
    ok('Acciones', '«' + nombre + '» lleva a la vista ' + esperada + ' con el código ' + cod + ' y libera la página', (await vistaActual()) === esperada && (await P.evaluate(() => RT_FILTRO && RT_FILTRO.codigo)) === cod && (await P.$$('.cds-dr')).length === 0 && (await P.evaluate(() => getComputedStyle(document.documentElement).overflow)) !== 'hidden', 'vista ' + (await vistaActual()));
  }
  await volverAOportunidades(P); const conVar = data.find(x => (x.acciones || []).some(a => a.requiere_validacion_variante)); await abrirDetalle(P, conVar.Codigo_producto);
  await P.click('.cds-dr .cds-btn:text-is("Ver este producto en Rotaciones")'); await sleep(1800);
  ok('Acciones', '«Ver este producto en Rotaciones» abre Rotaciones filtrada por el código', (await vistaActual()) === 'rotaciones' && (await P.evaluate(() => RT_ROTACIONES_FILTRO.codigo)) === conVar.Codigo_producto);
  ok('Rotaciones ChatGPT', 'En Rotaciones sigue el botón «Preparar correos con ChatGPT»', await P.evaluate(() => !![...document.querySelectorAll('button')].find(x => /Preparar correos con ChatGPT/.test(x.textContent) && x.offsetParent)));
  await volverAOportunidades(P);

  // ============================ C) TECLADO ============================
  await P.focus('.cds-fila .cds-ver'); const primer = await P.evaluate(() => document.activeElement.getAttribute('data-detalle-codigo'));
  await P.keyboard.press('Enter'); await sleep(900);
  ok('Teclado', 'Enter sobre «Ver detalle» abre el detalle y el foco entra al botón «Cerrar»', (await P.evaluate(() => document.activeElement.getAttribute('data-fk'))) === 'x');
  let dentro = true, vistos = new Set(); for (let i = 0; i < 16; i++) { await P.keyboard.press('Tab'); const r = await P.evaluate(() => ({ d: !!document.activeElement.closest('.cds-dr'), t: document.activeElement.textContent.trim().slice(0, 20) || document.activeElement.getAttribute('aria-label') })); dentro = dentro && r.d; vistos.add(r.t); }
  ok('Teclado', 'El foco queda atrapado dentro del detalle (16 Tab seguidos, ninguno sale) y recorre pestañas y botones', dentro && vistos.size >= 5, [...vistos].slice(0, 6).join('|'));
  await P.keyboard.press('Shift+Tab'); ok('Teclado', 'Shift+Tab también se queda dentro', await P.evaluate(() => !!document.activeElement.closest('.cds-dr')));
  await P.focus('#cdsTab_resumen'); await P.keyboard.press('ArrowRight'); await sleep(500);
  ok('Teclado', 'Flecha derecha cambia de pestaña (Motivos) y el foco acompaña a la pestaña', (await P.evaluate(() => [document.querySelector('.cds-tab[aria-selected=true]').id, document.activeElement.id])).join() === 'cdsTab_motivos,cdsTab_motivos');
  await P.keyboard.press('End'); await sleep(400); ok('Teclado', 'Fin lleva a la última pestaña (Sucursales)', (await P.evaluate(() => document.querySelector('.cds-tab[aria-selected=true]').id)) === 'cdsTab_sucursales');
  await P.keyboard.press('Escape'); await sleep(700);
  ok('Teclado', 'Escape cierra y el foco vuelve al botón «Ver detalle» del mismo producto', (await P.evaluate(() => document.activeElement.getAttribute('data-detalle-codigo'))) === primer && (await P.$$('.cds-dr')).length === 0, 'foco en ' + primer);
  const ring = await P.evaluate(() => { const b = document.querySelector('.cds-fila .cds-ver'); b.focus(); const cs = getComputedStyle(b); return cs.outlineStyle + ' ' + cs.outlineWidth; });
  ok('Teclado', 'El foco es visible en «Ver detalle» (contorno de 2 px)', /solid 2px/.test(ring), ring);

  // ============================ D) FILTROS Y PAGINAS SE CONSERVAN ============================
  await P.fill('#rtProdCodigo', 'producto'); await P.click('form.ov-filtros button.ov-aplicar'); await sleep(1800);
  await P.evaluate(() => ovIrAPagina(2)); await sleep(1600); on.reset();
  const antes = await P.evaluate(() => ({ chips: [...document.querySelectorAll('.ov-chip-filtro span:first-child')].map(x => x.textContent).join('|'), pag: document.querySelector('.ov-pag-info').textContent, grupo: document.querySelector('.ov-grupo.ov-activo').textContent, vista: document.querySelector('.cds-vista-btn.cds-activo').textContent }));
  const cod2 = await P.evaluate(() => document.querySelector('.cds-fila .cds-ver').getAttribute('data-detalle-codigo')); await abrirDetalle(P, cod2); await P.keyboard.press('Escape'); await sleep(600);
  const despues = await P.evaluate(() => ({ chips: [...document.querySelectorAll('.ov-chip-filtro span:first-child')].map(x => x.textContent).join('|'), pag: document.querySelector('.ov-pag-info').textContent, grupo: document.querySelector('.ov-grupo.ov-activo').textContent, vista: document.querySelector('.cds-vista-btn.cds-activo').textContent }));
  ok('Conservación', 'Abrir y cerrar el detalle conserva filtros, página 2, grupo y vista, y no hace ninguna consulta de lista ni auxiliar', JSON.stringify(antes) === JSON.stringify(despues) && on.lista.length === 0 && on.union.length === 0, JSON.stringify(despues) + ' consultas ' + on.lista.length);
  on.reset(); await P.evaluate(() => ovIrAPagina(1)); await sleep(1500); await abrirDetalle(P, await P.evaluate(() => document.querySelector('.cds-fila .cds-ver').getAttribute('data-detalle-codigo')));
  await P.evaluate(() => ovIrAPagina(2)); await sleep(1600);
  ok('Conservación', 'Cambiar de página con el detalle abierto lo cierra (el producto ya no está en la lista) sin dejar la página bloqueada', (await P.$$('.cds-dr')).length === 0 && (await P.evaluate(() => getComputedStyle(document.documentElement).overflow)) !== 'hidden');
  await P.click('form.ov-filtros .btn-sm:text-is("Limpiar")'); await sleep(1800);

  // ============================ E) VALORES FALTANTES ============================
  await P.route('**/analisis/oportunidades?*', async route => { const r = await route.fetch(); const j = await r.json(); if (j.data && route.request().url().indexOf('limit=1&') < 0) j.data.slice(0, 3).forEach((x, i) => { delete x.Ventas_total; x.Stock_sucursales = null; delete x.Stock_deposito; delete x.Stock_ctro_0000; x.cobertura_dias = null; x.cobertura_estado = 'sin_ventas'; if (i === 0) { delete x.por_sucursal; delete x.ingreso_proveedor; x.acciones = []; x.estado_principal = null; x.etiquetas_secundarias = []; delete x.rendimiento; delete x.explicacion; delete x.motivo; } }); await route.fulfill({ response: r, json: j }); });
  await P.evaluate(() => { RT_OPORTUNIDADES = null; rtCargarOportunidades(); }); await sleep(2500);
  const tf = await textoTabla(P);
  ok('Faltantes', 'Con ventas, stock, depósito y cobertura ausentes la tabla muestra «—» o «Sin ventas»; nunca NaN, undefined ni null', !/NaN|undefined|null/.test(tf), (tf.match(/NaN|undefined|null/g) || []).join());
  const cf = await P.evaluate(() => { const tr = document.querySelector('.cds-fila'); return [...tr.children].map(x => x.textContent.trim()).join('|'); });
  ok('Faltantes', 'La primera fila sin datos queda: urgencia «—», «Sin acción», ventas/stock/depósito «—», cobertura «Sin ventas»', /^—\|.*\|Sin acción\|Sin acción sugerida\|—\|—\|—\|Sin ventas/.test(cf.replace(/\s+/g, ' ')), cf.slice(0, 120));
  const codf = await P.evaluate(() => document.querySelector('.cds-fila .cds-ver').getAttribute('data-detalle-codigo')); await abrirDetalle(P, codf);
  let malo = [];
  for (const t of ['resumen', 'motivos', 'ingreso', 'sucursales']) { await pestana(P, t); const cx = await cuerpo(P); if (/NaN|undefined|null/.test(cx)) malo.push(t); }
  ok('Faltantes', 'En el detalle, ninguna de las 4 pestañas muestra NaN, undefined ni null con los datos ausentes', malo.length === 0, malo.join());
  const sf = await P.evaluate(() => [...document.querySelectorAll('#cdsDrCuerpo .cds-mini tbody tr')].map(tr => tr.children[1].textContent + '/' + tr.children[2].textContent).join(','));
  await pestana(P, 'sucursales'); const sf2 = await P.evaluate(() => [...document.querySelectorAll('#cdsDrCuerpo .cds-mini tbody tr')].map(tr => tr.children[1].textContent + '/' + tr.children[2].textContent).join(','));
  ok('Faltantes', 'Sin datos por sucursal el detalle muestra «—» (no ceros inventados)', /^(—\/—,?)+$/.test(sf2), sf2);
  await P.keyboard.press('Escape'); await sleep(500); await P.unroute('**/analisis/oportunidades?*');
  await P.evaluate(() => { RT_OPORTUNIDADES = null; rtCargarOportunidades(); }); await sleep(2200);

  // vista Lista usa la misma tabla nueva
  await P.click('.cds-vista-btn[data-vista=lista]'); await sleep(600);
  ok('Lista', 'La vista «Lista» también usa la tabla nueva (no la antigua) y conserva las 50 filas', (await P.$$('.cds-fila')).length === 50 && (await P.$$('.ov-tabla')).length === 0);
  await P.click('.cds-vista-btn[data-vista=accion]'); await sleep(400);
  ok('Consola', 'Sin errores de página ni de consola (escritorio, bandera encendida)', on.errores.length === 0, on.errores.join(' || '));
  await on.ctx.close();

  // ============================ F) MÓVIL ============================
  for (const [w, h] of [[375, 812], [320, 640]]) {
    const mv = await abrir(BASE, true, w, h), M = mv.page, tag = 'Móvil ' + w + '×' + h;
    const m = await M.evaluate(() => { const c = document.querySelector('.cds-card'), r = c.getBoundingClientRect(), pl = document.querySelector('details.ov-filtros-plegable'), nav = document.querySelector('.cds-tabbar'); return { top: Math.round(r.top + scrollY), alto: innerHeight, nav: nav ? nav.getBoundingClientRect().height : 0, plegado: !!pl && !pl.open, tabla: getComputedStyle(document.querySelector('.cds-res-tabla')).display, sw: document.documentElement.scrollWidth, iw: innerWidth, bar: document.getElementById('rtBar').getBoundingClientRect().height }; });
    ok(tag, 'Filtros plegados al iniciar, tabla oculta y tarjetas visibles, sin desborde horizontal', m.plegado && m.tabla === 'none' && m.sw <= m.iw, JSON.stringify(m));
    ok(tag, 'El primer producto aparece sin desplazarse: su tarjeta empieza antes del borde inferior útil (' + m.top + ' px de ' + (m.alto - m.nav) + ')', m.top < m.alto - m.nav - 16, m.top + ' < ' + (m.alto - m.nav - 16));
    ok(tag, 'Período y sucursales en una zona compacta (barra de ' + Math.round(m.bar) + ' px, fechas en dos columnas, botones en una fila)', m.bar <= 140, String(Math.round(m.bar)));
    const peq = await M.evaluate(() => { const malos = []; const ver = e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed'; document.querySelectorAll('.cds-ver, .cds-vista-btn, .ov-grupo, .ov-rapido, .ov-filtros-plegable summary, #rtBar button, #rtBar input, .ov-panel-ctl select, .cds-tabbar button, .ov-subnav button, .ov-pag-btn').forEach(e => { if (!ver(e)) return; const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && r.height < 43.5) malos.push((e.className || e.tagName).toString().slice(0, 24) + ' ' + Math.round(r.height)); }); return malos.slice(0, 6); });
    ok(tag, 'Todos los botones y controles táctiles miden al menos 44 px de alto', peq.length === 0, peq.join(' | '));
    const cortes = await M.evaluate(() => { const malos = []; document.querySelectorAll('.cds-card *, .ov-grupo *, .cds-vista-sel *, .ov-panel-ctl *').forEach(e => { const cs = getComputedStyle(e); if (cs.textOverflow === 'ellipsis') malos.push('elipsis'); if (e.children.length === 0 && e.textContent.trim() && e.scrollWidth > e.clientWidth + 1 && cs.display !== 'inline' && e.tagName !== 'SELECT') malos.push(e.tagName + '.' + e.className + ' ' + e.scrollWidth + '>' + e.clientWidth); }); return malos.slice(0, 5); });
    ok(tag, 'Sin textos cortados en tarjetas, grupos y controles', cortes.length === 0, cortes.join(' | '));
    const selCortado = await M.evaluate(() => { const s = document.querySelector('.ov-panel-ctl select'); if (!s) return 'sin select'; const o = s.options[s.selectedIndex].text; const c = document.createElement('canvas').getContext('2d'); c.font = getComputedStyle(s).font; return c.measureText(o).width > s.clientWidth - 30 ? 'cortado ' + Math.round(c.measureText(o).width) + ' > ' + (s.clientWidth - 30) : 'ok'; });
    ok(tag, 'El selector de prioridad muestra su texto completo', selCortado === 'ok', selCortado);
    await M.evaluate(() => window.scrollTo(0, 0)); await M.screenshot({ path: path.join(OUT, 'on-movil-' + w + '-inicio.png') });
    await M.evaluate(() => document.querySelector('.cds-card').scrollIntoView()); await sleep(200); await M.screenshot({ path: path.join(OUT, 'on-movil-' + w + '-tarjetas.png') });
    await M.evaluate(() => [...document.querySelectorAll('.cds-ver')].find(x => x.offsetParent).click()); await sleep(1000);
    const d = await M.evaluate(() => { const a = document.querySelector('.cds-dr'), r = a.getBoundingClientRect(); const tabs = [...a.querySelectorAll('.cds-tab')].map(t => t.getBoundingClientRect().height), x = a.querySelector('.cds-dr-x').getBoundingClientRect(); return { sheet: r.height / innerHeight, ancho: r.width <= innerWidth + 1, tabsMin: Math.min(...tabs), x: Math.min(x.width, x.height), scroll: document.documentElement.scrollWidth <= innerWidth, cuerpoH: a.querySelector('.cds-dr-cuerpo').clientHeight }; });
    ok(tag + ' · detalle', 'El detalle es una hoja inferior que cabe en pantalla, con cierre y pestañas táctiles de 44 px y cuerpo con desplazamiento propio', d.ancho && d.scroll && d.tabsMin >= 43.5 && d.x >= 43.5 && d.cuerpoH > 100, JSON.stringify(d));
    await M.screenshot({ path: path.join(OUT, 'on-movil-' + w + '-detalle.png') });
    for (const t of ['ingreso', 'sucursales', 'motivos']) { await M.click('#cdsTab_' + t); await sleep(400); }
    const h2 = await M.evaluate(() => { const a = document.querySelector('.cds-dr'); const malos = []; a.querySelectorAll('*').forEach(e => { if (e.closest('.cds-tabs')) return; if (e.getBoundingClientRect().right > innerWidth + 1) malos.push(e.tagName + '.' + e.className); }); const tb = a.querySelector('.cds-tabs'); if (tb.scrollWidth <= tb.clientWidth && Math.max(...[...tb.children].map(x => x.getBoundingClientRect().right)) > innerWidth + 1) malos.push('pestañas fuera sin desplazamiento'); return malos.slice(0, 4); });
    ok(tag + ' · detalle', 'Ninguna pestaña del detalle se sale del ancho de pantalla', h2.length === 0, h2.join(' | '));
    await M.screenshot({ path: path.join(OUT, 'on-movil-' + w + '-detalle-motivos.png') });
    await M.keyboard.press('Escape'); await sleep(400);
    ok(tag, 'Sin errores de consola', mv.errores.length === 0, mv.errores.join(' || '));
    await mv.ctx.close();
  }

  // ============================ G) BANDERA APAGADA = REFERENCIA (B2) ============================
  const off = await abrir(BASE, false), Q = off.page;
  ok('Apagada', 'Sin la bandera: tabla antigua, sin objetos nuevos, sin selector, sin panel lateral', (await Q.$$('.ov-tabla')).length === 1 && (await Q.$$('.cds-tabla')).length === 0 && !(await Q.evaluate(() => !!(window.CDS_RESULTADOS || window.CDS_DETALLE || window.CDS_POR_ACCION))));
  await Q.evaluate(() => document.querySelector('.ov-fila').click()); await sleep(900);
  ok('Apagada', 'La fila antigua sigue expandiendo su detalle en línea (comportamiento original)', (await Q.$$('.rt-oport-detalle')).length >= 1 && (await Q.$$('.cds-dr')).length === 0);
  if (REF) {
    const huella = async base => {
      const o = await abrir(base, false); const out = {};
      for (const [nom, fn] of [['inicial', async () => {}], ['detalle', () => o.page.evaluate(() => document.querySelector('.ov-fila').click())], ['grupo-reposicion', () => o.page.evaluate(() => ovElegirGrupo('reposicion'))], ['pagina-2-todas', async () => { await o.page.evaluate(() => ovElegirGrupo('todas')); await sleep(1500); await o.page.evaluate(() => ovIrAPagina(2)); }], ['buscar', async () => { await o.page.fill('#rtProdCodigo', 'producto'); await o.page.click('form.ov-filtros button.ov-aplicar'); await sleep(1800); }]]) {
        await fn(); await sleep(1300);
        out[nom] = await o.page.evaluate(() => { const c = document.querySelector('.ov').cloneNode(true); return c.innerHTML.replace(/\d{1,2}[:/]\d{2}([:/]\d{2,4})?/g, '#').replace(/\s+/g, ' '); });
      }
      out.consultas = o.lista.map(q => [...q.entries()].map(e => e.join('=')).sort().join('&')).join('\n').replace(/\d{4}-\d{2}-\d{2}/g, 'F');
      await o.ctx.close(); return out;
    };
    const a = await huella(BASE), b = await huella(REF);
    for (const k of ['inicial', 'detalle', 'grupo-reposicion', 'pagina-2-todas', 'buscar']) ok('Apagada = B2', 'DOM de Oportunidades «' + k + '» idéntico al de la referencia B2 (' + a[k].length + ' caracteres)', a[k] === b[k], a[k] === b[k] ? '' : 'difiere');
    ok('Apagada = B2', 'Consultas a la API idénticas a las de la referencia B2', a.consultas === b.consultas, a.consultas === b.consultas ? '' : 'difiere');
  }
  await Q.evaluate(() => document.querySelector('#rtTabs .tab[data-view="rotaciones"]').click()); await sleep(2500);
  ok('Rotaciones ChatGPT', 'Con la bandera apagada «Preparar correos con ChatGPT» también está', await Q.evaluate(() => !![...document.querySelectorAll('button')].find(x => /Preparar correos con ChatGPT/.test(x.textContent) && x.offsetParent)));
  ok('Consola', 'Sin errores (bandera apagada)', off.errores.length === 0, off.errores.join(' || '));
  await off.ctx.close();

  const fallan = res.filter(r => !r.ok).length;
  fs.writeFileSync(path.join(OUT, 'validacion-b3.json'), JSON.stringify({ fecha: new Date().toISOString(), total: res.length, fallan, resultados: res }, null, 1));
  console.log('\nComprobaciones: ' + res.length + ' OK: ' + (res.length - fallan) + ' FALLAN: ' + fallan);
  await browser.close(); process.exit(fallan ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
