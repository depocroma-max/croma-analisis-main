'use strict';
// Validacion de la Etapa B2 (Oportunidades «Por acción» y «Lista», bandera cds-v3) contra el HARNESS local (datos SINTETICOS; no toca Sysneo ni produccion).
//   1) node tests/harness/servidor.js --puerto=8812            (con CROMA_API_DIR = croma-api compatible)
//   2) [opcional] el harness del commit de referencia (B1) en otro puerto:  --base=8813  (compara el DOM y las consultas con la bandera APAGADA)
//   3) node tests/harness/validacion-b2.js --puerto=8812 [--base=8813] [--salida=<carpeta>]
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const BASE = 'http://127.0.0.1:' + arg('puerto', '8812'), REF = arg('base') ? 'http://127.0.0.1:' + arg('base') : null;
const OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'b2')); fs.mkdirSync(OUT, { recursive: true });
const ORDEN = ['revisar_devoluciones', 'reposicion_urgente', 'reponer_desde_deposito', 'reposicion_a_evaluar', 'posible_rotacion', 'reposicion_proxima', 'venta_destacada', 'bien_vendido', 'seguimiento', 'posible_descuento', 'stock_parado', '__sin_accion__'];
const res = []; const ok = (g, n, c, d) => { res.push({ grupo: g, nombre: n, ok: !!c, detalle: d == null ? '' : String(d).slice(0, 300) }); console.log((c ? 'PASS ' : 'FAIL ') + '[' + g + '] ' + n + (d != null && d !== '' ? '  [' + String(d).slice(0, 170) + ']' : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nums = t => (String(t || '').match(/\d[\d.]*/g) || []).map(x => parseInt(x.replace(/\./g, ''), 10));

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
  const grupos = p => p.evaluate(() => [...document.querySelectorAll('.cds-grupo')].map(s => { const c = s.querySelector('.cds-grupo-cuenta'); return { estado: s.getAttribute('data-estado'), nombre: s.querySelector('.cds-grupo-nombre').textContent, cuenta: c.textContent, continua: c.getAttribute('data-continua'), codigos: [...new Set([...s.querySelectorAll('.cds-tabla [data-detalle-codigo]')].map(x => x.getAttribute('data-detalle-codigo')))] }; }));
  const filasLista = p => p.evaluate(() => [...document.querySelectorAll('.ov-panel .cds-tabla tbody tr')].map(tr => (tr.querySelector('[data-detalle-codigo]') || {}).getAttribute ? tr.querySelector('[data-detalle-codigo]').getAttribute('data-detalle-codigo') : null).filter(Boolean));
  const info = p => p.evaluate(() => { const r = document.querySelector('.cds-resultados'); return { res: r ? r.textContent : null, nota: !!document.querySelector('.cds-grupos-nota'), notaTxt: (document.querySelector('.cds-grupos-nota') || {}).textContent || '', chips: [...document.querySelectorAll('.ov-chip-filtro span:first-child')].map(x => x.textContent), panel: (document.querySelector('.ov-panel') || {}).textContent || '', vista: (document.querySelector('.cds-vista-btn.cds-activo') || {}).textContent || null, offsetInfo: (document.querySelector('.ov-pag-info') || {}).textContent || '', grupoActivo: (document.querySelector('.ov-grupo.ov-activo .ov-grupo-rot') || {}).textContent || '', inputBusca: (document.getElementById('rtProdCodigo') || {}).value }; });
  const api = (p, params, off) => p.evaluate(async ([q, off]) => { const u = new URLSearchParams(q); if (off !== undefined) u.set('offset', String(off)); const t = sessionStorage.getItem('croma_token'); const r = await fetch('/analisis/oportunidades?' + u.toString(), { headers: { Authorization: 'Bearer ' + t } }); return r.json(); }, [params.toString(), off]);
  const aplicar = async (p, ms = 1700) => { await p.click('form.ov-filtros button.ov-aplicar'); await sleep(ms); };
  const pagina = async (p, n) => { await p.evaluate(n => ovIrAPagina(n), n); await sleep(1500); };

  // ======================= A) POR ACCIÓN: orden, paginas, totales, sin acción =======================
  const on = await abrir(BASE, true), P = on.page;
  let g = await grupos(P), inf = await info(P);
  ok('Por acción', 'La vista predeterminada es «Por acción» y hay selector con las dos opciones', inf.vista === 'Por acción' && (await P.$$('.cds-vista-btn')).length === 2, inf.vista);
  const q1 = on.lista[on.lista.length - 1]; const a1 = await api(P, q1);
  ok('Por acción', 'La consulta de «Todos» no envía `estado` (incluye los productos sin acción) y mantiene limit/offset', !q1.has('estado') && q1.get('limit') === '50' && q1.get('offset') === '0', q1.toString().slice(0, 120));
  ok('Orden', 'Los grupos aparecen en el orden del motor (urgencia descendente), sin reordenar', g.length >= 3 && g.map(x => ORDEN.indexOf(x.estado)).every((v, i, a) => v >= 0 && (i === 0 || v >= a[i - 1])), g.map(x => x.estado).join(' > '));
  ok('Orden', 'El orden de los grupos coincide exactamente con el de la API (primera aparición de estado_principal)', JSON.stringify(g.map(x => x.estado)) === JSON.stringify([...new Set(a1.data.map(f => f.estado_principal || '__sin_accion__'))]), '');
  ok('Totales', 'Cada grupo muestra el total de resumen.por_estado_principal (no el de la página) y «Sin acción» muestra total_sin_clasificacion', g.every(x => { const t = x.estado === '__sin_accion__' ? a1.resumen.total_sin_clasificacion : a1.resumen.por_estado_principal[x.estado]; return nums(x.cuenta)[0] === t; }), g.map(x => x.estado + ':' + nums(x.cuenta)[0]).join(' '));
  ok('Totales', 'Las cifras de la consulta: total = paginacion.total, resumen = total_clasificados, sin acción = total_sin_clasificacion, en esta página = devueltos', JSON.stringify(nums(inf.res)) === JSON.stringify([a1.paginacion.total, a1.resumen.total_clasificados, a1.resumen.total_sin_clasificacion, a1.paginacion.devueltos]), inf.res);
  ok('Totales', 'total_clasificados + total_sin_clasificacion = total de la lista (los números cierran)', a1.resumen.total_clasificados + a1.resumen.total_sin_clasificacion === a1.paginacion.total, '');
  await P.screenshot({ path: path.join(OUT, 'on-por-accion-1280.png') });

  // recorrer todas las paginas y reconstruir cada grupo
  const total = a1.paginacion.total, npag = Math.ceil(total / 50), vistos = new Set(), suma = {}, secuencia = []; let cruces = 0, sinAccionVisible = false, iguales = true, ordenOk = true;
  for (let n = 1; n <= npag; n++) {
    if (n > 1) await pagina(P, n);
    const gp = await grupos(P), ap = await api(P, q1, (n - 1) * 50);
    const esperado = {}; ap.data.forEach(f => { const k = f.estado_principal || '__sin_accion__'; (esperado[k] = esperado[k] || []).push(f.Codigo_producto); });
    gp.forEach(x => { x.codigos.forEach(c => { if (vistos.has(c)) ordenOk = false; vistos.add(c); }); suma[x.estado] = (suma[x.estado] || 0) + x.codigos.length; secuencia.push(x.estado); if (x.continua === 'si') cruces++; if (x.estado === '__sin_accion__') sinAccionVisible = true; if (JSON.stringify(esperado[x.estado] || []) !== JSON.stringify(x.codigos)) iguales = false; });
    if (JSON.stringify(Object.keys(esperado)) !== JSON.stringify(gp.map(x => x.estado))) iguales = false;
    if (n === npag) { inf = await info(P); await P.screenshot({ path: path.join(OUT, 'on-por-accion-ultima-pagina-1280.png') }); ok('Páginas', 'En la última página «En esta página» = productos que quedan (' + (total - 50 * (npag - 1)) + ')', nums(inf.res).pop() === total - 50 * (npag - 1), inf.res); }
  }
  ok('Páginas', 'Recorriendo las ' + npag + ' páginas: ' + total + ' productos distintos, ninguno repetido', vistos.size === total && ordenOk, vistos.size + ' de ' + total);
  ok('Páginas', 'En cada página los grupos y sus productos coinciden uno a uno con lo que devuelve la API (mismo orden)', iguales);
  ok('Páginas', 'La suma por grupo en todas las páginas coincide con el total del resumen', Object.keys(suma).every(k => suma[k] === (k === '__sin_accion__' ? a1.resumen.total_sin_clasificacion : a1.resumen.por_estado_principal[k])), JSON.stringify(suma));
  ok('Páginas', 'Hay grupos que cruzan páginas y se marcan («el resto en otras páginas»)', cruces >= 2, 'marcados: ' + cruces);
  ok('Sin acción', 'El grupo «Sin acción» aparece (al final) y su total es el de la API', sinAccionVisible && secuencia.filter(e => e === '__sin_accion__').length >= 1 && secuencia[secuencia.length - 1] === '__sin_accion__', secuencia.join(','));
  await pagina(P, 1);

  // ======================= B) CAMBIO ENTRE VISTAS =======================
  const antes = await grupos(P), cabAntes = await info(P); on.reset();
  await P.click('.cds-vista-btn[data-vista=lista]'); await sleep(700);
  const lista = await filasLista(P); inf = await info(P);
  ok('Vistas', 'Cambiar a «Lista» NO consulta nada (ni lista ni auxiliares) y no cambia filtros ni página', on.lista.length === 0 && on.union.length === 0 && inf.vista === 'Lista' && inf.offsetInfo === cabAntes.offsetInfo && JSON.stringify(inf.chips) === JSON.stringify(cabAntes.chips), 'consultas ' + on.lista.length + '/' + on.union.length);
  ok('Vistas', '«Lista» conserva el orden y los resultados del motor (mismos productos, mismo orden que los grupos y que la API)', JSON.stringify(lista) === JSON.stringify(antes.flatMap(x => x.codigos)) && JSON.stringify(lista) === JSON.stringify(a1.data.map(f => f.Codigo_producto)), lista.length + ' filas');
  ok('Vistas', 'En «Lista» no hay secciones de grupo ni encabezados repetidos', (await P.$$('.cds-grupo')).length === 0 && (await P.$$('.ov-panel .cds-tabla thead')).length === 1);
  await P.screenshot({ path: path.join(OUT, 'on-lista-1280.png') });
  await pagina(P, 2); const lista2 = await filasLista(P);
  ok('Vistas', 'La paginación funciona igual en «Lista» (página 2: otros productos, offset 50)', lista2.length > 0 && lista2.every(c => !lista.includes(c)) && on.lista[on.lista.length - 1].get('offset') === '50');
  on.reset(); await P.click('.cds-vista-btn[data-vista=accion]'); await sleep(700); const gp2 = await grupos(P);
  ok('Vistas', 'Volver a «Por acción» tampoco consulta y mantiene la página 2', on.lista.length === 0 && gp2.flatMap(x => x.codigos).join() === lista2.join(), 'consultas ' + on.lista.length);
  await pagina(P, 1);

  // detalle dentro de un grupo
  await P.evaluate(() => { const b = document.querySelector('.cds-grupo .cds-tabla [data-detalle-codigo]'); b.click(); }); await sleep(900);
  ok('Funciones', 'El detalle de un producto se abre (panel lateral) y se cierra con Escape', await P.evaluate(() => !!document.querySelector('.cds-dr[role=dialog]'))); await P.keyboard.press('Escape'); await sleep(500);
  await sleep(200);

  // ======================= C) FILTROS COMBINADOS (B1) =======================
  on.reset(); await P.fill('#rtProdCodigo', 'producto'); await sleep(100);
  const pend = await P.evaluate(() => ({ t: document.getElementById('cdsFiltrosEstado').textContent, pend: document.querySelector('form.ov-filtros button.ov-aplicar').classList.contains('cds-pendiente') }));
  ok('Filtros', 'B1 sigue activo: escribir marca cambios sin aplicar y no consulta', pend.pend && /Búsqueda/.test(pend.t) && on.lista.length === 0);
  await P.click('.fc:has(label:text-is("Marca")) summary'); await sleep(120); await P.locator('.fc:has(label:text-is("Marca")) label.rt-sv-filtro-opcion:has-text("NIKE") input').check(); await sleep(250);
  await aplicar(P); const qf = on.lista[0], nf = on.lista.length; const af = await api(P, qf); g = await grupos(P); inf = await info(P);
  ok('Filtros', 'Aplicar busca + marca en UNA consulta; la vista queda en «Por acción»', nf === 1 && qf.get('buscar') === 'producto' && qf.get('marca') === 'NIKE' && inf.vista === 'Por acción', qf.toString().slice(0, 130));
  const sumaHeaders = g.reduce((a, x) => a + nums(x.cuenta)[0], 0);
  ok('Filtros', 'Con filtros de catálogo los totales por grupo vienen del resumen filtrado y cierran con el total de la lista', af.resumen.total_clasificados + af.resumen.total_sin_clasificacion === af.paginacion.total && g.every(x => nums(x.cuenta)[0] === (x.estado === '__sin_accion__' ? af.resumen.total_sin_clasificacion : af.resumen.por_estado_principal[x.estado])) && sumaHeaders <= af.paginacion.total, 'total ' + af.paginacion.total + ' · ' + g.map(x => x.estado + ':' + nums(x.cuenta)[0]).join(' '));
  on.reset(); await aplicar(P, 800);
  ok('Filtros', 'Aplicar sin cambios no consulta (también en «Por acción»)', on.lista.length === 0 && on.union.length === 0);

  // alcance restringido: el total por grupo NO esta disponible
  on.reset(); await P.evaluate(() => ovElegirPrioridad('alta')); await sleep(1500); g = await grupos(P); inf = await info(P);
  ok('No disponible', 'Con prioridad elegida el total de cada grupo se muestra como no disponible (solo «en esta página») y hay una nota', g.length > 0 && g.every(x => /no disponible/.test(x.cuenta) && /en esta página/.test(x.cuenta)) && inf.nota, g[0] && g[0].cuenta);
  ok('No disponible', 'El resumen y «sin acción» siguen siendo los del catálogo y se avisa que no cambian con la prioridad', /no cambian con el grupo, el estado ni la prioridad/.test(inf.res), inf.res);
  await P.screenshot({ path: path.join(OUT, 'on-no-disponible-1280.png') });
  await P.evaluate(() => ovElegirPrioridad('')); await sleep(900);
  on.reset(); await P.evaluate(() => ovElegirGrupo('rotaciones')); await sleep(1600); g = await grupos(P); inf = await info(P);
  ok('No disponible', 'En el grupo «Rotaciones» la consulta envía estado=posible_rotacion y los totales por grupo no se inventan', on.lista[0] && on.lista[0].get('estado') === 'posible_rotacion' && g.length >= 1 && g.every(x => /no disponible/.test(x.cuenta)), on.lista[0] && on.lista[0].get('estado'));
  ok('No disponible', 'En «Rotaciones» no aparece «Sin acción» (la API solo la entrega sin filtrar por estado)', !g.some(x => x.estado === '__sin_accion__'));
  await P.evaluate(() => ovElegirGrupo('todas')); await sleep(1600);

  // ======================= D) CARGA, VACIO, ERROR, RESPUESTAS FUERA DE ORDEN =======================
  await P.route('**/analisis/oportunidades?*', async route => { const u = new URL(route.request().url()); if (u.searchParams.get('limit') !== '1' && u.searchParams.get('buscar') === 'demora') await sleep(1500); await route.continue(); });
  await P.click('form.ov-filtros .btn-sm:text-is("Limpiar")'); await sleep(1500);
  await P.fill('#rtProdCodigo', 'demora'); await P.click('form.ov-filtros button.ov-aplicar'); await sleep(450); inf = await info(P);
  ok('Carga', 'Mientras consulta no hay grupos ni cifras: estado de carga', (await P.$$('.cds-grupo')).length === 0 && /Consultando/.test(inf.res) && /Calculando|Actualizando/.test(inf.panel), inf.res);
  await P.screenshot({ path: path.join(OUT, 'on-cargando-1280.png') });
  await sleep(1800); await P.unroute('**/analisis/oportunidades?*');
  await P.fill('#rtProdCodigo', 'Cámara ÑANDÚ'); await aplicar(P); inf = await info(P);
  ok('Vacío', 'Sin resultados: mensaje de vacío claro, sin grupos, en «Por acción»', (await P.$$('.cds-grupo')).length === 0 && /Sin oportunidades|Ningún producto/.test(inf.panel), inf.panel.slice(0, 120));
  await P.click('.cds-vista-btn[data-vista=lista]'); await sleep(500); inf = await info(P);
  ok('Vacío', 'También en «Lista» (mismo mensaje)', /Sin oportunidades|Ningún producto/.test(inf.panel));
  await P.screenshot({ path: path.join(OUT, 'on-vacio-1280.png') });
  await P.click('.cds-vista-btn[data-vista=accion]'); await sleep(300);
  await P.route('**/analisis/oportunidades?*', route => { const u = new URL(route.request().url()); if (u.searchParams.get('limit') !== '1' && u.searchParams.get('buscar') === 'falla') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Error simulado' }) }); return route.continue(); });
  await P.fill('#rtProdCodigo', 'falla'); await aplicar(P, 1600); inf = await info(P);
  ok('Error', 'Con error de la API: mensaje de error con reintento, sin grupos ni cifras inventadas', (await P.$$('.cds-grupo')).length === 0 && /No se pudieron calcular/.test(inf.panel) && /no hay resultados que mostrar/.test(inf.res) && !!(await P.$('.ov-panel button:text-is("Reintentar")')), inf.panel.slice(0, 100));
  await P.screenshot({ path: path.join(OUT, 'on-error-1280.png') });
  await P.unroute('**/analisis/oportunidades?*'); await P.click('.ov-panel button:text-is("Reintentar")'); await sleep(1700); inf = await info(P);
  ok('Error', 'Reintentar tras el error vuelve a la consulta (resultado vacío legítimo para «falla»)', !/No se pudieron calcular/.test(inf.panel), inf.panel.slice(0, 80));
  await P.route('**/analisis/oportunidades?*', async route => { const u = new URL(route.request().url()); if (u.searchParams.get('limit') !== '1' && u.searchParams.get('buscar') === '1003') await sleep(2200); await route.continue(); });
  on.reset(); await P.fill('#rtProdCodigo', '1003'); await P.click('form.ov-filtros button.ov-aplicar'); await sleep(300);
  await P.fill('#rtProdCodigo', '1004'); await P.click('form.ov-filtros button.ov-aplicar'); await sleep(3600); g = await grupos(P); inf = await info(P);
  ok('Fuera de orden', 'Dos consultas seguidas con la primera lenta: los grupos muestran solo la última (1004) y las cifras son las suyas', JSON.stringify(g.flatMap(x => x.codigos)) === '["1004"]' && nums(inf.res)[0] === 1, g.flatMap(x => x.codigos).join() + ' | ' + inf.res);
  await P.unroute('**/analisis/oportunidades?*');
  ok('Consola', 'Sin errores de página ni de consola (bandera encendida, escritorio)', on.errores.length === 0, on.errores.join(' || '));
  const chat = await (async () => { await P.evaluate(() => document.querySelector('#rtTabs .tab[data-view="rotaciones"]').click()); await sleep(2500); return P.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Preparar correos con ChatGPT/.test(x.textContent)); return !!(b && b.offsetParent); }); })();
  ok('Compatibilidad', 'Rotaciones ChatGPT sigue presente con la bandera encendida', chat);
  await on.ctx.close();

  // ======================= E) BANDERA APAGADA = REFERENCIA (B1) =======================
  const off = await abrir(BASE, false), Q = off.page; inf = await info(Q); const qo = off.lista[off.lista.length - 1];
  ok('Apagada', 'Sin la bandera: no hay selector, ni grupos, ni `window.CDS_POR_ACCION`; la consulta lleva `estado` con los 11 estados como siempre', !(await Q.$('.cds-vista-sel')) && !(await Q.$('.cds-grupo')) && !(await Q.evaluate(() => !!window.CDS_POR_ACCION)) && (qo.get('estado') || '').split(',').length === 11, (qo.get('estado') || '').slice(0, 40));
  const tOff = await Q.evaluate(() => [document.querySelector('.ov-grupo .ov-grupo-rot').textContent, document.querySelector('.ov-grupo .ov-grupo-num').textContent]);
  ok('Apagada', 'La tarjeta sigue llamándose «Todas» y cuenta solo los productos con acción (como siempre)', /Todas/.test(tOff[0]) && tOff[1] === '61', tOff.join(' '));
  if (REF) {
    const huella = async base => {
      const o = await abrir(base, false); const out = {};
      for (const [nom, fn] of [['inicial', async () => {}], ['grupo-reposicion', () => o.page.evaluate(() => ovElegirGrupo('reposicion'))], ['pagina-2-todas', async () => { await o.page.evaluate(() => ovElegirGrupo('todas')); await sleep(1500); await o.page.evaluate(() => ovIrAPagina(2)); }], ['prioridad', () => o.page.evaluate(() => ovElegirPrioridad('alta'))], ['buscar', async () => { await o.page.evaluate(() => ovElegirPrioridad('')); await sleep(900); await o.page.fill('#rtProdCodigo', 'producto'); await o.page.click('form.ov-filtros button.ov-aplicar'); await sleep(1800); }]]) {
        await fn(); await sleep(1300);
        out[nom] = await o.page.evaluate(() => { const c = document.querySelector('.ov').cloneNode(true); return c.innerHTML.replace(/\d{1,2}[:/]\d{2}([:/]\d{2,4})?/g, '#').replace(/\s+/g, ' '); });
      }
      out.consultas = o.lista.map(q => [...q.entries()].map(e => e.join('=')).sort().join('&')).join('\n').replace(/\d{4}-\d{2}-\d{2}/g, 'F');
      await o.ctx.close(); return out;
    };
    const a = await huella(BASE), b = await huella(REF);
    for (const k of ['inicial', 'grupo-reposicion', 'pagina-2-todas', 'prioridad', 'buscar']) ok('Apagada = B1', 'DOM de Oportunidades «' + k + '» idéntico al de la referencia B1 (' + a[k].length + ' caracteres)', a[k] === b[k], a[k] === b[k] ? '' : 'difiere');
    ok('Apagada = B1', 'Consultas a la API (cantidad y parámetros) idénticas a las de la referencia B1', a.consultas === b.consultas, a.consultas === b.consultas ? '' : 'difiere');
  }
  await Q.evaluate(() => document.querySelector('#rtTabs .tab[data-view="rotaciones"]').click()); await sleep(2500);
  ok('Rotaciones ChatGPT', 'Con la bandera apagada el botón «Preparar correos con ChatGPT» también está', await Q.evaluate(() => !!([...document.querySelectorAll('button')].find(x => /Preparar correos con ChatGPT/.test(x.textContent) && x.offsetParent))));
  ok('Consola', 'Sin errores de página ni de consola (bandera apagada)', off.errores.length === 0, off.errores.join(' || '));
  await off.ctx.close();

  // ======================= F) MÓVIL 375 =======================
  const mv = await abrir(BASE, true, 375, 812), M = mv.page;
  const m1 = await M.evaluate(() => { const t = document.querySelector('.cds-grupo .cds-tabla'), c = document.querySelector('.cds-grupo .cds-res-cards'), btn = document.querySelector('.cds-vista-btn'); return { tabla: t && getComputedStyle(t.closest('.cds-res-tabla')).display, tarjetas: c && getComputedStyle(c).display, alto: btn && btn.getBoundingClientRect().height, scroll: document.documentElement.scrollWidth <= innerWidth, grupos: document.querySelectorAll('.cds-grupo').length, cab: document.querySelector('.cds-grupo-cab').getBoundingClientRect().right <= innerWidth }; });
  ok('Móvil 375', 'Por acción en móvil: grupos con tarjetas (no tabla), sin desborde horizontal, selector táctil ≥ 44 px', m1.grupos >= 3 && m1.tabla === 'none' && m1.tarjetas !== 'none' && m1.scroll && m1.cab && m1.alto >= 44, JSON.stringify(m1));
  await M.evaluate(() => document.querySelector('.cds-grupos').scrollIntoView()); await sleep(300); await M.screenshot({ path: path.join(OUT, 'on-por-accion-375.png') });
  mv.reset(); await M.click('.cds-vista-btn[data-vista=lista]'); await sleep(600); await M.evaluate(() => document.querySelector('.ov-panel').scrollIntoView()); await M.screenshot({ path: path.join(OUT, 'on-lista-375.png') });
  ok('Móvil 375', 'En móvil cambiar de vista tampoco consulta', mv.lista.length === 0 && mv.union.length === 0);
  ok('Consola', 'Sin errores en móvil', mv.errores.length === 0, mv.errores.join(' || '));
  await mv.ctx.close();

  const fallan = res.filter(r => !r.ok).length;
  fs.writeFileSync(path.join(OUT, 'validacion-b2.json'), JSON.stringify({ fecha: new Date().toISOString(), total: res.length, fallan, resultados: res }, null, 1));
  console.log('\nComprobaciones: ' + res.length + ' OK: ' + (res.length - fallan) + ' FALLAN: ' + fallan);
  await browser.close(); process.exit(fallan ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
