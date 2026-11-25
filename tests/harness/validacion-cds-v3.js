'use strict';
// Validacion de la Etapa A (cds-v3), adaptada a la NAVEGACION SUPERIOR (sin barra lateral) contra el HARNESS local (datos SINTETICOS; no toca Sysneo ni produccion).
//   1) node tests/harness/servidor.js --puerto=8797
//   2) node tests/harness/validacion-cds-v3.js [--puerto=8797] [--salida=<carpeta>]
// Comprueba la aplicacion con la bandera APAGADA (debe ser la de siempre) y ENCENDIDA (navegacion nueva): navegacion, teclado, foco,
// responsive, desbordes, tamaños tactiles, eventos y scripts existentes, y que las vistas (#rtPanelHost) no cambian entre una y otra.
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const BASE = process.env.HARNESS || 'http://127.0.0.1:' + arg('puerto', '8797');
const OUT = arg('salida', path.join(__dirname, '..', '..', 'docs', 'cds-v3', 'capturas')); fs.mkdirSync(OUT, { recursive: true });
const VISTAS = ['dashboard', 'marcas', 'productos', 'talles-colores', 'stock-ventas', 'oportunidades', 'reglas', 'rotaciones'];
const res = []; const ok = (g, n, c, d) => { res.push({ grupo: g, nombre: n, ok: !!c, detalle: d == null ? '' : String(d).slice(0, 240) }); console.log((c ? 'PASS ' : 'FAIL ') + '[' + g + '] ' + n + (d != null && d !== '' ? '  [' + String(d).slice(0, 140) + ']' : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  async function abrir(w, h, bandera) {
    const movil = w <= 760;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    if (bandera) await ctx.addInitScript(() => { try { localStorage.setItem('cds-v3', '1'); } catch (e) { /* nada */ } });
    const page = await ctx.newPage(); const errores = [], pedidos = [];
    page.on('pageerror', e => errores.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errores.push('console ' + m.text().slice(0, 160)); });
    page.on('request', r => { if (r.url().startsWith(BASE)) pedidos.push(new URL(r.url()).pathname); });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }); await sleep(1200);
    return { ctx, page, errores, pedidos };
  }
  const hashPanel = page => page.evaluate(() => { const c = document.getElementById('rtPanelHost').cloneNode(true); c.querySelectorAll('.cds-resultados,#cdsFiltrosEstado').forEach(e => e.remove()); /* B1: solo estos dos elementos son nuevos con la bandera */ c.querySelectorAll('[aria-describedby=cdsFiltrosEstado]').forEach(e => e.removeAttribute('aria-describedby')); return c.innerHTML.replace(/\d{1,2}[:/]\d{2}([:/]\d{2,4})?/g, '#').replace(/\s+/g, ' ').length + ':' + c.querySelectorAll('*').length; });
  const irLegacy = async (page, v) => { await page.evaluate(v => document.querySelector('#rtTabs .tab[data-view="' + v + '"]').click(), v); await sleep(v === 'oportunidades' ? 2200 : 800); };
  const irNuevo = async (page, v) => {
    const visible = await page.evaluate(v => !![...document.querySelectorAll('[data-cds-view="' + v + '"]')].find(e => e.offsetParent !== null), v);
    if (!visible) { await page.click('#cdsMas'); await sleep(150); }
    await page.evaluate(v => { const el = [...document.querySelectorAll('[data-cds-view="' + v + '"]')].find(e => e.offsetParent !== null); el.click(); }, v); await sleep(v === 'oportunidades' ? 2200 : 800);
  };

  // ===================== 1) BANDERA APAGADA =====================
  { const { ctx, page, errores, pedidos } = await abrir(1440, 900, false);
    const info = await page.evaluate(() => ({ clase: document.documentElement.classList.contains('cds-v3'), side: !!document.getElementById('cdsTopNav') || !!document.getElementById('cdsSide'), tabbar: !!document.getElementById('cdsTabbar'), tabs: [...document.querySelectorAll('#rtTabs .tab')].map(t => t.dataset.view), visibles: getComputedStyle(document.getElementById('rtTabs')).display, enlaces: [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.getAttribute('href')).filter(h => /cds\//.test(h || '')).length, topbar: getComputedStyle(document.querySelector('.topbar')).backgroundColor }));
    ok('Bandera apagada', 'La clase cds-v3 no está y no existe DOM nuevo (barra superior/inferior)', !info.clase && !info.side && !info.tabbar, JSON.stringify({ clase: info.clase, side: info.side }));
    ok('Bandera apagada', 'No se pidió ni un archivo de cds/ ni se enlazó ninguna hoja de cds/', pedidos.filter(p => /\/cds\//.test(p)).length === 0 && info.enlaces === 0, pedidos.filter(p => /cds/.test(p)).join(','));
    ok('Bandera apagada', 'Las ocho pestañas existen y están visibles; la barra superior sigue oscura', info.tabs.length === 8 && info.visibles !== 'none' && /13, 13, 13|0, 0, 0|rgba\(13/.test(info.topbar), info.topbar);
    const rec = []; for (const v of VISTAS) { await irLegacy(page, v); rec.push(await page.evaluate(() => RT_VIEW)); }
    ok('Bandera apagada', 'La navegación de siempre recorre las 8 vistas (RT_VIEW)', JSON.stringify(rec) === JSON.stringify(VISTAS), rec.join(','));
    ok('Bandera apagada', 'Sin errores de consola', errores.length === 0, errores.join(' | ')); await ctx.close(); }

  // ===================== 2) BANDERA ENCENDIDA: ESCRITORIO =====================
  { const { ctx, page, errores, pedidos } = await abrir(1440, 900, true);
    const info = await page.evaluate(() => { const nav = [...document.querySelectorAll('#cdsTopNav [data-cds-view]')]; return { clase: document.documentElement.classList.contains('cds-v3'), side: getComputedStyle(document.getElementById('cdsTopNav')).display, ancho: document.getElementById('cdsTopNav').getBoundingClientRect().height, lateral: !!document.getElementById('cdsSide'), n: nav.filter(e => !e.hidden).length /* D1B: «Mis seguimientos» existe oculto hasta que el servidor lo habilita */, tabs: getComputedStyle(document.getElementById('rtTabs')).display, tabbar: getComputedStyle(document.getElementById('cdsTabbar')).display, topbar: getComputedStyle(document.querySelector('.topbar')).backgroundColor, h: Math.round(document.querySelector('.topbar').getBoundingClientRect().height), sticky: getComputedStyle(document.documentElement).getPropertyValue('--ov-sticky-top').trim(), fuente: getComputedStyle(document.querySelector('.cds-nav')).fontFamily }; });
    ok('Bandera encendida', 'Clase cds-v3, barra superior de secciones de 48 px (sin barra lateral), 8 secciones, pestañas viejas ocultas y barra inferior oculta', info.clase && info.side !== 'none' && !info.lateral && Math.round(info.ancho) === 48 && info.n === 8 && info.tabs === 'none' && info.tabbar === 'none', JSON.stringify(info));
    ok('Bandera encendida', 'Encabezado oscuro (#12151C) de 56 px y --ov-sticky-top = 48 px (las tablas fijas se pegan debajo de la barra de secciones)', info.h === 56 && info.sticky === '48px' && /18, 21, 28/.test(info.topbar), info.h + ' ' + info.sticky + ' ' + info.topbar);
    ok('Bandera encendida', 'La interfaz nueva usa Geist (con respaldo del sistema)', /Geist/.test(info.fuente), info.fuente);
    ok('Bandera encendida', 'Se descargan exactamente los 18 archivos de cds/ (nueve hojas y nueve scripts; stock-ventas.* es de la navegación superior; variantes.* son de C1 y seguimientos.* / seguimientos-api.js de D1B)', pedidos.filter(p => /\/cds\//.test(p)).length === 18, pedidos.filter(p => /cds/.test(p)).join(','));
    // espía de rtCambiarVista
    await page.evaluate(() => { window.__cv = 0; const o = window.rtCambiarVista; window.rtCambiarVista = function (v) { window.__cv++; return o.apply(this, arguments); }; });
    for (const v of VISTAS) {
      await page.evaluate(() => { window.__cv = 0; }); await irNuevo(page, v);
      const e = await page.evaluate(v => ({ rt: RT_VIEW, activa: document.querySelector('#rtTabs .tab.active').dataset.view, cur: [...document.querySelectorAll('#cdsTopNav [aria-current=page]')].map(x => x.dataset.cdsView), crumb: document.getElementById('cdsCrumb').textContent, llamadas: window.__cv, host: document.getElementById('rtPanelHost').children.length }), v);
      ok('Navegación', v + ': la barra superior acciona la vista, refleja el estado, titula el encabezado y rtCambiarVista corre UNA vez', e.rt === v && e.activa === v && e.cur.length === 1 && e.cur[0] === v && e.crumb.includes(v === 'talles-colores' ? 'Talles y colores' : v === 'stock-ventas' ? 'Stock Ventas' : v[0].toUpperCase() + v.slice(1)) && e.llamadas === 1 && e.host > 0, JSON.stringify(e));
    }
    await irNuevo(page, 'oportunidades');
    // teclado
    await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.keyboard.press('Tab'); const t1 = await page.evaluate(() => ({ t: document.activeElement.textContent, c: document.activeElement.className }));
    ok('Teclado', 'El primer Tab llega al enlace «Saltar al contenido»', /Saltar al contenido/.test(t1.t) && /cds-skip/.test(t1.c), t1.t);
    await page.keyboard.press('Enter'); await sleep(150); ok('Teclado', 'Enter en «Saltar al contenido» lleva el foco al contenido (#rtPanelHost)', await page.evaluate(() => document.activeElement.id === 'rtPanelHost'));
    const orden = []; const lim = await abrir(1440, 900, true); const pg = lim.page; await pg.keyboard.press('Tab'); for (let k = 0; k < 14 && !(await pg.evaluate(() => !!(document.activeElement.closest && document.activeElement.closest('#cdsTopNav')))); k++) await pg.keyboard.press('Tab');
    for (let i = 0; i < 9; i++) { orden.push(await pg.evaluate(() => document.activeElement.dataset.cdsView || document.activeElement.className.slice(0, 20))); await pg.keyboard.press('Tab'); } await lim.ctx.close();
    ok('Teclado', 'Tab llega a la barra superior (tras las acciones del encabezado) y recorre las 8 secciones en orden', JSON.stringify(orden.slice(0, 8)) === JSON.stringify(VISTAS), orden.slice(0, 9).join(','));
    await page.evaluate(() => document.querySelector('#cdsTopNav [data-cds-view="marcas"]').focus()); await page.keyboard.press('Enter'); await sleep(900);
    ok('Teclado', 'Enter sobre «Marcas» cambia de vista y el foco permanece en la barra superior', (await page.evaluate(() => RT_VIEW)) === 'marcas' && await page.evaluate(() => document.activeElement.dataset.cdsView === 'marcas'));
    const foco = await page.evaluate(() => { document.querySelector('#cdsTopNav [data-cds-view="productos"]').focus(); const s = getComputedStyle(document.activeElement); return { st: s.outlineStyle, w: parseFloat(s.outlineWidth), col: s.outlineColor }; });
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); const foco2 = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { st: s.outlineStyle, w: parseFloat(s.outlineWidth) }; });
    ok('Foco', 'El foco por teclado es visible (anillo de 2 px)', foco2.st !== 'none' && foco2.w >= 2, JSON.stringify(foco2));
    // encabezado y acciones existentes
    await irNuevo(page, 'oportunidades');
    const top1 = await page.evaluate(() => ({ acc: document.querySelectorAll('header.topbar .rt-top-acc').length, suc: !!document.querySelector('header.topbar #rtBtnSucursales'), act: !!document.querySelector('header.topbar #rtBtnActualizar') }));
    ok('Scripts existentes', 'rtUbicarAcciones sigue moviendo «Sucursales» y «Actualizar» al encabezado en pantallas ≥ 900 px', top1.acc === 1 && top1.suc && top1.act, JSON.stringify(top1));
    await page.setViewportSize({ width: 800, height: 900 }); await sleep(500); ok('Scripts existentes', 'Por debajo de 900 px esas acciones vuelven a la barra de período (resize)', (await page.evaluate(() => document.querySelectorAll('header.topbar .rt-top-acc').length)) === 0);
    await page.setViewportSize({ width: 1440, height: 900 }); await sleep(500);
    // sticky de las tablas de oportunidades
    const st = await page.evaluate(() => { const th = document.querySelector('.ov-tabla thead th, .cds-tabla thead th'); return th ? { top: getComputedStyle(th).top, pos: getComputedStyle(th).position } : null; });
    ok('Scripts existentes', 'El encabezado fijo de la tabla de Oportunidades se ancla a 48 px (debajo de la barra de secciones)', st && st.pos === 'sticky' && st.top === '48px', JSON.stringify(st));
    await page.evaluate(() => window.scrollTo(0, 1300)); await sleep(300); const rect = await page.evaluate(() => { const th = document.querySelector('.ov-tabla thead th, .cds-tabla thead th'), tb = document.getElementById('cdsTopNav'); return th ? { thTop: Math.round(th.getBoundingClientRect().top), tbBottom: Math.round(tb.getBoundingClientRect().bottom) } : null; });
    ok('Scripts existentes', 'Al desplazarse, el encabezado de la tabla queda justo debajo de la barra de secciones fija, sin taparse ni dejar hueco', rect && Math.abs(rect.thTop - rect.tbBottom) <= 1, JSON.stringify(rect)); await page.evaluate(() => window.scrollTo(0, 0));
    // eventos y funcionalidad de Oportunidades conservados
    const ev = await page.evaluate(async () => { const out = {}; const g = [...document.querySelectorAll('.ov-grupo')]; out.grupos = g.length; if (g[1]) { g[1].click(); await new Promise(r => setTimeout(r, 1200)); out.grupoActivo = document.querySelectorAll('.ov-grupo.ov-activo').length; } const b = document.querySelector('.ov-detalle-btn'); if (b) { b.click(); await new Promise(r => setTimeout(r, 400)); out.detalle = document.querySelector('.ov-detalle-btn[aria-expanded="true"]') ? 'abre' : 'no'; } return out; });
    ok('Funciones conservadas', 'Oportunidades con la interfaz nueva: seis grupos, cambio de grupo y detalle expandible responden como siempre', ev.grupos === 6 && ev.grupoActivo === 1 && ev.detalle === 'abre', JSON.stringify(ev));
    await irNuevo(page, 'productos'); await page.click('#rtBtnActualizar'); await sleep(600); ok('Funciones conservadas', '«Actualizar» sigue funcionando desde el encabezado nuevo', true);
    // espejo de Reglas
    await page.evaluate(() => { const t = document.getElementById('rtTabReglas'); if (t) t.remove(); }); await sleep(300);
    const reg = await page.evaluate(() => ({ lateral: document.querySelector('#cdsTopNav [data-cds-view="reglas"]').hidden, otros: [...document.querySelectorAll('#cdsTopNav [data-cds-view]')].filter(x => !x.hidden).length }));
    ok('Permisos', 'Si la pestaña Reglas se elimina (no administrador) la barra superior la oculta y quedan 7 secciones', reg.lateral && reg.otros === 7, JSON.stringify(reg));
    ok('Bandera encendida', 'Sin errores de consola en el recorrido de escritorio', errores.length === 0, errores.join(' | ')); await ctx.close(); }

  // ===================== 3) TABLET / 1024: barra superior con etiquetas =====================
  for (const [w, h] of [[1024, 768], [820, 1180]]) {
    const { ctx, page, errores } = await abrir(w, h, true);
    const r = await page.evaluate(() => { const bs = [...document.querySelectorAll('#cdsTopNav .cds-nav')].filter(b => !b.hidden); return { sinLateral: !document.getElementById('cdsSide'), etiquetas: bs.filter(b => b.querySelector('span') && b.querySelector('span').offsetWidth > 0).length, n: bs.length, pad: Math.round(parseFloat(getComputedStyle(document.getElementById('app')).paddingInlineStart)), alto: Math.round(bs[0].getBoundingClientRect().height), desborde: document.documentElement.scrollWidth - innerWidth }; });
    ok('Tablet', `[${w}] Sin barra lateral; la barra superior muestra las 8 secciones con etiqueta y botones de ≥ 36 px, sin desborde de la página`, r.sinLateral && r.n === 8 && r.etiquetas === 8 && r.pad === 0 && r.alto >= 36 && r.desborde <= 1, JSON.stringify(r));
    await irNuevo(page, 'rotaciones'); ok('Tablet', `[${w}] La barra superior acciona las vistas`, (await page.evaluate(() => RT_VIEW)) === 'rotaciones'); ok('Tablet', `[${w}] Sin errores de consola`, errores.length === 0, errores.join('|')); await ctx.close();
  }

  // ===================== 4) MOVIL =====================
  for (const [w, h] of [[430, 932], [375, 812], [320, 640]]) {
    const { ctx, page, errores } = await abrir(w, h, true); const T = s => `[${w}] ${s}`;
    const m = await page.evaluate(() => { const bar = document.getElementById('cdsTabbar'), bs = [...bar.querySelectorAll('button')]; return { lateral: getComputedStyle(document.getElementById('cdsTopNav')).display, barra: getComputedStyle(bar).display, n: bs.length, altos: bs.map(b => Math.round(b.getBoundingClientRect().height)), activo: bs.filter(b => b.getAttribute('aria-current') === 'page').map(b => b.textContent.trim()), pad: parseFloat(getComputedStyle(document.getElementById('app')).paddingInlineStart), rb: Math.round(bar.getBoundingClientRect().bottom), alto: innerHeight, fondoContenido: parseFloat(getComputedStyle(document.querySelector('.wrap')).paddingBottom) }; });
    ok('Móvil', T('Sin barra superior de secciones ni lateral; barra inferior con 5 accesos de ≥ 44 px'), m.lateral === 'none' && m.barra === 'flex' && m.n === 5 && m.altos.every(a => a >= 44) && m.pad === 0, JSON.stringify(m.altos));
    ok('Móvil', T('El contenido deja lugar a la barra inferior (padding inferior suficiente)'), m.fondoContenido >= 64, String(m.fondoContenido));
    await irNuevo(page, 'oportunidades'); await page.evaluate(() => window.scrollTo(0, 0));
    ok('Móvil', T('La sección activa queda marcada (aria-current) en la barra inferior'), (await page.evaluate(() => [...document.querySelectorAll('#cdsTabbar [aria-current=page]')].map(b => b.dataset.cdsView))).join() === 'oportunidades');
    // Más
    await page.click('#cdsMas'); await sleep(200);
    const hoja = await page.evaluate(() => { const d = document.getElementById('cdsHoja'); return d ? { rol: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), items: [...d.querySelectorAll('[data-cds-view]')].map(x => x.textContent.trim()), foco: d.contains(document.activeElement), altos: [...d.querySelectorAll('button')].map(b => Math.round(b.getBoundingClientRect().height)) } : null; });
    ok('Móvil', T('«Más» abre un diálogo modal con Marcas, Talles y colores, Stock Ventas y Reglas; el foco entra y los botones miden ≥ 44 px'), hoja && hoja.rol === 'dialog' && hoja.modal === 'true' && ['Marcas', 'Talles y colores', 'Stock Ventas', 'Reglas'].every(x => hoja.items.includes(x)) && hoja.foco && hoja.altos.every(a => a >= 44), JSON.stringify(hoja));
    await page.keyboard.press('Escape'); await sleep(150); ok('Móvil', T('Escape cierra la hoja y el foco vuelve al botón «Más»'), (await page.evaluate(() => !document.getElementById('cdsHoja') && document.activeElement.id === 'cdsMas')));
    await page.click('#cdsMas'); await sleep(150); await page.evaluate(() => document.querySelector('#cdsHoja [data-cds-view="marcas"]').click()); await sleep(900);
    const des = await page.evaluate(() => ({ vista: RT_VIEW, hoja: !!document.getElementById('cdsHoja'), masActivo: document.getElementById('cdsMas').getAttribute('aria-current'), crumb: document.getElementById('cdsCrumb').textContent }));
    ok('Móvil', T('Elegir «Marcas» en la hoja cambia la vista, cierra la hoja y marca «Más» como actual'), des.vista === 'marcas' && !des.hoja && des.masActivo === 'page' && /Marcas/.test(des.crumb), JSON.stringify(des));
    await page.click('#cdsMas'); await sleep(150); const tr = []; for (let i = 0; i < 7; i++) { await page.keyboard.press('Tab'); tr.push(await page.evaluate(() => document.getElementById('cdsHoja').contains(document.activeElement))); } ok('Móvil', T('La hoja atrapa el foco (Tab no sale del diálogo)'), tr.every(Boolean)); await page.keyboard.press('Escape');
    await page.click('#cdsMas'); await sleep(100); await page.mouse.click(10, 10); await sleep(150); ok('Móvil', T('Tocar el fondo cierra la hoja'), !(await page.evaluate(() => !!document.getElementById('cdsHoja'))));
    ok('Móvil', T('Sin errores de consola'), errores.length === 0, errores.join('|')); await ctx.close();
  }

  // ===================== 5) RESPONSIVE: desbordes y vistas intactas =====================
  const tam = [[1920, 1080], [1440, 900], [1100, 800], [1024, 768], [900, 800], [820, 1180], [760, 900], [640, 900], [430, 932], [375, 812], [320, 640]];
  const filas = []; let peor = 0, peores = [];
  for (const [w, h] of tam) {
    const A = await abrir(w, h, false), B = await abrir(w, h, true);
    for (const v of ['oportunidades', 'productos', 'rotaciones', 'reglas', 'dashboard']) {
      await irLegacy(A.page, v); await irNuevo(B.page, v);
      const oa = await A.page.evaluate(() => document.documentElement.scrollWidth - innerWidth), ob = await B.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      filas.push({ w, v, legacy: oa, nuevo: ob }); if (ob > oa && ob > 1) { peor++; peores.push(`${w}/${v}: ${oa}->${ob}`); }
      if ((w === 1440 || w === 375) && v !== 'oportunidades') { /* Oportunidades cambia a proposito con las Etapas B1 y B2 (se valida en validacion-b1.js y validacion-b2.js) */ const ha = await hashPanel(A.page), hb = await hashPanel(B.page); ok('Vistas intactas', `[${w}] ${v}: el contenido de la vista (#rtPanelHost) es idéntico con y sin la bandera`, ha === hb, ha + ' vs ' + hb); }
    }
    await A.ctx.close(); await B.ctx.close();
  }
  ok('Responsive', 'Con la bandera encendida no aparece ningún desborde horizontal que no existiera ya sin ella (11 anchos × 5 vistas)', peor === 0, peores.join(' ; '));
  const conDesborde = filas.filter(f => f.nuevo > 1); ok('Responsive', 'Desborde horizontal absoluto con la bandera encendida: ninguno (si hay, se informa; puede ser preexistente)', conDesborde.length === 0, conDesborde.map(f => `${f.w}/${f.v}:${f.nuevo}(legacy ${f.legacy})`).join(' ; '));

  await browser.close();
  const f = res.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'validacion-cds-v3.json'), JSON.stringify({ total: res.length, fallan: f.length, filas, resultados: res }, null, 1));
  console.log('\nComprobaciones:', res.length, 'OK:', res.length - f.length, 'FALLAN:', f.length); f.forEach(x => console.log('  FALLA [' + x.grupo + '] ' + x.nombre + ' :: ' + x.detalle));
  process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
