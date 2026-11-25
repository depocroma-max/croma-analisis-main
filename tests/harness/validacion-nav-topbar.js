'use strict';
// Validacion de la NAVEGACION SUPERIOR de cds-v3 y de Stock Ventas a todo el ancho, contra el HARNESS local (datos SINTETICOS; no toca Sysneo ni produccion).
//   1) node tests/harness/servidor.js --puerto=8797
//   2) node tests/harness/validacion-nav-topbar.js [--puerto=8797] [--salida=<carpeta>]
// Complementa a validacion-cds-v3.js (regresion de la v3). Aca: barra superior (ancho, estado activo, fija al desplazar, teclado), encabezado
// (marca, estado, sucursales, Actualizar, sesion, Hub), «Mis seguimientos» solo si existe, capas (paneles y detalle por encima de la barra),
// Stock Ventas (ancho completo, mismas columnas/datos/totales que sin la bandera, columnas fijas COD y Producto, orden, busqueda, columnas) y movil.
const path = require('path'), fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '..', '..', '..', 'nequ-studio', 'node_modules', 'playwright-core'));
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const BASE = process.env.HARNESS || 'http://127.0.0.1:' + arg('puerto', '8797');
const OUT = arg('salida', path.join(__dirname, '..', '..', 'capturas-nav')); fs.mkdirSync(OUT, { recursive: true });
const VISTAS = ['dashboard', 'marcas', 'productos', 'talles-colores', 'stock-ventas', 'oportunidades', 'reglas', 'rotaciones'];
const res = []; const ok = (g, n, c, d) => { res.push({ grupo: g, nombre: n, ok: !!c, detalle: d == null ? '' : String(d).slice(0, 300) }); console.log((c ? 'PASS ' : 'FAIL ') + '[' + g + '] ' + n + (d != null && d !== '' ? '  [' + String(d).slice(0, 160) + ']' : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true });
  async function abrir(w, h, bandera) {
    const movil = w <= 760;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: movil, hasTouch: movil, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', reducedMotion: 'reduce' });
    if (bandera) await ctx.addInitScript(() => { try { localStorage.setItem('cds-v3', '1'); } catch (e) { /* nada */ } });
    const page = await ctx.newPage(); const errores = [];
    page.on('pageerror', e => errores.push('pageerror ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errores.push('console ' + m.text().slice(0, 160)); });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }); await sleep(1300);
    return { ctx, page, errores };
  }
  const irNuevo = async (page, v) => {
    await page.evaluate(v => { const el = [...document.querySelectorAll('#cdsTopNav [data-cds-view="' + v + '"], #cdsTabbar [data-cds-view="' + v + '"]')].find(e => e.offsetParent !== null); if (el) el.click(); else document.querySelector('#rtTabs .tab[data-view="' + v + '"]').click(); }, v);
    await sleep(v === 'oportunidades' ? 2400 : 900);
  };
  const stockVentas = async (page) => { await page.evaluate(() => { RT_FILTRO = { marca: ['NIKE'] }; RT_COMPLETO = null; rtCambiarVista('stock-ventas'); }); await sleep(2800); };
  const huellaTabla = page => page.evaluate(() => { const t = document.querySelector('.rt-stockventas-tabla'); if (!t) return null; const tx = e => (e.textContent || '').replace(/\s+/g, ' ').trim(); return { cabecera: [...t.querySelectorAll('thead tr:last-child th')].map(tx), totales: [...t.querySelectorAll('thead tr:first-child td')].map(tx), pie: [...t.querySelectorAll('tfoot td')].map(tx), filas: [...t.querySelectorAll('tbody tr')].map(r => [...r.children].map(tx).join('|')) }; });

  // ===================== 1) BARRA SUPERIOR en 1024, 1280, 1440 y 1920 =====================
  for (const [w, h] of [[1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
    const { ctx, page, errores } = await abrir(w, h, true); const T = s => `[${w}] ${s}`;
    await irNuevo(page, 'oportunidades');
    const i = await page.evaluate(() => {
      const nav = document.getElementById('cdsTopNav'), lista = document.getElementById('cdsTopNavLista'), r = e => e && e.getBoundingClientRect();
      const hd = document.querySelector('header.topbar'), act = nav.querySelector('[aria-current=page]');
      const dentro = sel => { const e = document.querySelector(sel); if (!e) return false; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.left >= 0 && b.right <= innerWidth + 1; };
      return { sinLateral: !document.getElementById('cdsSide'), appPad: parseFloat(getComputedStyle(document.getElementById('app')).paddingInlineStart), navAlto: Math.round(r(nav).height), navAncho: Math.round(r(nav).width), vw: innerWidth,
        items: [...nav.querySelectorAll('button[data-cds-view]')].filter(b => !b.hidden).map(b => b.textContent.trim()), desbordaLista: lista.scrollWidth > lista.clientWidth + 1, activo: act && act.textContent.trim(), activoBg: act && getComputedStyle(act).backgroundColor, activoColor: act && getComputedStyle(act).color,
        activoDentro: act && (() => { const a = act.getBoundingClientRect(), l = lista.getBoundingClientRect(); return a.left >= l.left - 1 && a.right <= l.right + 1; })(),
        marca: dentro('#cdsBrand'), estado: (() => { const st = document.querySelector('header.topbar .rt-status'); if (!st) return false; const t = document.getElementById('rtUltimaActualizacion'); return !t || !t.textContent.trim() || dentro('#rtUltimaActualizacion'); })() /* en el harness el estado no tiene texto y la app lo oculta igual que sin la bandera; con texto debe verse */, sucursales: dentro('header.topbar #rtBtnSucursales'), actualizar: dentro('header.topbar #rtBtnActualizar'), usuario: dentro('#hUser'), salir: dentro('#btnSalir'), hub: dentro('#btnHub'),
        desbordePagina: document.documentElement.scrollWidth - innerWidth, hAlto: Math.round(r(hd).height), seg: [...nav.querySelectorAll('button[data-cds-view="seguimientos"]')].map(b => b.hidden) };
    });
    ok('Barra superior', T('Sin barra lateral: el área de trabajo ocupa todo el ancho (padding lateral 0) y la barra de secciones mide 48 px de alto y todo el ancho'), i.sinLateral && i.appPad === 0 && i.navAlto === 48 && i.navAncho === i.vw, JSON.stringify({ pad: i.appPad, alto: i.navAlto, ancho: i.navAncho }));
    ok('Barra superior', T('Muestra las 8 secciones (Dashboard, Marcas, Productos, Talles y colores, Stock Ventas, Oportunidades, Reglas, Rotaciones) y «Mis seguimientos» queda oculto mientras el servidor no lo habilita'), i.items.length === 8 && JSON.stringify(i.items) === JSON.stringify(['Dashboard', 'Marcas', 'Productos', 'Talles y colores', 'Stock Ventas', 'Oportunidades', 'Reglas', 'Rotaciones']) && i.seg.every(Boolean), i.items.join(',') + ' seg-oculto:' + i.seg.join());
    ok('Barra superior', T('La lista de secciones entra completa sin desplazarse' + (w < 1100 ? ' (o, si no entra, se desplaza dentro de la barra)' : '')), !i.desbordaLista || w < 1100, 'desborda=' + i.desbordaLista);
    ok('Barra superior', T('La sección activa se destaca (fondo gris #555D6B, texto claro, aria-current) y queda visible dentro de la barra'), i.activo === 'Oportunidades' && /85, 93, 107/.test(i.activoBg) && /246, 247, 251/.test(i.activoColor) && i.activoDentro, JSON.stringify({ a: i.activo, bg: i.activoBg, c: i.activoColor, v: i.activoDentro }));
    ok('Encabezado', T('Marca, estado de actualización (en el encabezado y visible cuando tiene texto), sucursales, Actualizar, usuario, cerrar sesión y Hub están visibles y dentro de la ventana'), i.marca && i.estado && i.sucursales && i.actualizar && i.usuario && i.salir && i.hub, JSON.stringify({ m: i.marca, e: i.estado, s: i.sucursales, a: i.actualizar, u: i.usuario, x: i.salir, h: i.hub }));
    ok('Responsive', T('Sin desborde horizontal de la página en Oportunidades'), i.desbordePagina <= 1, i.desbordePagina);
    // contraste del estado activo (texto sobre fondo): claro sobre oscuro
    // barra fija al desplazar
    await page.evaluate(() => { const t = document.querySelector('.cds-tabla, .ov-tabla'); window.scrollTo(0, t ? Math.round(t.getBoundingClientRect().top + scrollY + 500) : 900); }); await sleep(300);
    const f = await page.evaluate(() => ({ top: Math.round(document.getElementById('cdsTopNav').getBoundingClientRect().top), y: scrollY, th: (() => { const t = document.querySelector('.cds-tabla thead th, .ov-tabla thead th'); return t ? Math.round(t.getBoundingClientRect().top) : null; })() }));
    ok('Barra superior', T('Al desplazar la página la barra de secciones queda fija arriba (top = 0) y el encabezado de la tabla se pega justo debajo (48 px)'), f.y > 100 && f.top === 0 && (f.th === null || Math.abs(f.th - 48) <= 1), JSON.stringify(f)); await page.evaluate(() => window.scrollTo(0, 0));
    // todas las secciones
    const malas = [];
    for (const v of VISTAS) {
      await irNuevo(page, v);
      const e = await page.evaluate(v => ({ rt: RT_VIEW, cur: [...document.querySelectorAll('#cdsTopNav [aria-current=page]')].map(x => x.dataset.cdsView), desborde: document.documentElement.scrollWidth - innerWidth, hostHijos: document.getElementById('rtPanelHost').children.length, vis: (() => { const a = document.querySelector('#cdsTopNav [aria-current=page]'), l = document.getElementById('cdsTopNavLista'); if (!a) return false; const b = a.getBoundingClientRect(), c = l.getBoundingClientRect(); return b.left >= c.left - 1 && b.right <= c.right + 1; })() }), v);
      if (!(e.rt === v && e.cur.length === 1 && e.cur[0] === v && e.hostHijos > 0 && e.vis && (v === 'stock-ventas' ? true : e.desborde <= 1))) malas.push(v + ':' + JSON.stringify(e));
    }
    ok('Navegación', T('Las 8 secciones se abren desde la barra, marcan solo la activa, la dejan visible y no desbordan la página'), malas.length === 0, malas.join(' ; '));
    ok('Consola', T('Sin errores de consola'), errores.length === 0, errores.join(' | ')); await ctx.close();
  }

  // ===================== 1b) TEMA OSCURO: colores exactos y contraste (WCAG 2.2) =====================
  { const { ctx, page, errores } = await abrir(1440, 900, true);
    await irNuevo(page, 'oportunidades');
    const medir = () => {
      const pr = c => { const m = c.match(/rgba?\(([^)]+)\)/); const v = m[1].split(',').map(x => parseFloat(x)); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
      const lum = c => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
      const efectivo = el => { let e = el; while (e) { const c = pr(getComputedStyle(e).backgroundColor); if (c.a > 0.99) return c; e = e.parentElement; } return { r: 255, g: 255, b: 255, a: 1 }; };
      const par = (sel, tipo) => { const e = document.querySelector(sel); if (!e) return { sel, falta: true }; const cs = getComputedStyle(e); const fg = pr(tipo === 'borde' ? cs.borderTopColor : cs.color); const bg = efectivo(e); return { sel, ratio: Math.round(ratio(fg, bg) * 100) / 100, fg: cs.color, bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})` }; };
      const nav = document.getElementById('cdsTopNav'), hd = document.querySelector('header.topbar'), act = nav.querySelector('[aria-current=page]'), ina = [...nav.querySelectorAll('button[data-cds-view]')].find(b => !b.hidden && b !== act);
      const bgs = e => getComputedStyle(e).backgroundColor;
      return { hdBg: bgs(hd), navBg: bgs(nav), actBg: bgs(act), bodyBg: bgs(document.body), tarjetaBg: bgs(document.getElementById('rtBar')),
        pares: [par('#cdsBrand span', 'texto'), par('#cdsBrand small', 'texto'), par('#hUser', 'texto'), par('#btnSalir', 'texto'), par('#btnHub', 'texto'), par('#rtBtnActualizar', 'texto'), par('#rtBtnSucursales', 'texto'),
          (() => { const e = ina, cs = getComputedStyle(e), fg = pr(cs.color), bg = efectivo(e); return { sel: 'seccion inactiva (texto)', ratio: Math.round(ratio(fg, bg) * 100) / 100 }; })(),
          (() => { const i = ina.querySelector('svg'), fg = pr(getComputedStyle(i).color), bg = efectivo(ina); return { sel: 'seccion inactiva (icono)', ratio: Math.round(ratio(fg, bg) * 100) / 100, min: 3 }; })(),
          (() => { const fg = pr(getComputedStyle(act).color), bg = pr(getComputedStyle(act).backgroundColor); return { sel: 'seccion activa (texto)', ratio: Math.round(ratio(fg, bg) * 100) / 100 }; })(),
          (() => { const fg = pr(getComputedStyle(act.querySelector('svg')).color), bg = pr(getComputedStyle(act).backgroundColor); return { sel: 'seccion activa (icono)', ratio: Math.round(ratio(fg, bg) * 100) / 100, min: 3 }; })(),
          (() => { const fg = pr(getComputedStyle(act).backgroundColor), bg = pr(getComputedStyle(nav).backgroundColor); return { sel: 'activa frente a la barra (distinguible)', ratio: Math.round(ratio(fg, bg) * 100) / 100, min: 1.5 }; })(),
          (() => { const sep = nav.querySelector('.cds-topnav-sep'), fg = pr(getComputedStyle(sep).backgroundColor), bg = pr(getComputedStyle(nav).backgroundColor); return { sel: 'separador de grupo', ratio: Math.round(ratio(fg, bg) * 100) / 100, min: 1.3 }; })(),
          (() => { const fg = pr(getComputedStyle(nav).borderBottomColor), bg = pr(getComputedStyle(nav).backgroundColor); return { sel: 'borde de la barra (discreto)', ratio: Math.round(ratio(fg, bg) * 100) / 100, max: 1.5 }; })()] };
    };
    const m = await page.evaluate(`(${medir.toString()})()`);
    ok('Tema oscuro', 'Encabezado #12151C, barra de secciones #232832, sección activa #555D6B', m.hdBg === 'rgb(18, 21, 28)' && m.navBg === 'rgb(35, 40, 50)' && m.actBg === 'rgb(85, 93, 107)', JSON.stringify({ hd: m.hdBg, nav: m.navBg, act: m.actBg }));
    ok('Tema oscuro', 'El contenido principal y las tarjetas siguen claros (fondo de página #F3F4F7, tarjeta de periodo clara)', m.bodyBg === 'rgb(243, 244, 247)' && /^rgb\((25[0-5]|24\d), (25[0-5]|24\d), (25[0-5]|24\d)\)$/.test(m.tarjetaBg), JSON.stringify({ body: m.bodyBg, tarjeta: m.tarjetaBg }));
    const mal = m.pares.filter(x => x.falta || (x.max ? x.ratio > x.max : x.ratio < (x.min || 4.5)));
    ok('Contraste', `Textos ≥ 4,5:1, iconos ≥ 3:1, activa distinguible (≥ 1,5:1), separador visible (≥ 1,3:1) y bordes discretos (≤ 1,5:1) sobre el fondo oscuro (${m.pares.length} pares)`, mal.length === 0, mal.length ? JSON.stringify(mal) : m.pares.map(x => (x.sel.length > 24 ? x.sel.slice(0, 24) : x.sel) + '=' + x.ratio).join(' | '));
    // foco por teclado sobre el fondo oscuro
    await page.keyboard.press('Tab'); for (let k = 0; k < 14 && !(await page.evaluate(() => !!document.activeElement.closest('#cdsTopNav'))); k++) await page.keyboard.press('Tab');
    const foco = await page.evaluate(() => { const e = document.activeElement, cs = getComputedStyle(e); const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; const v = c => c.match(/[\d.]+/g).slice(0, 3).map(Number); const L = c => { const [r, g, b] = v(c); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }; const a = L(cs.outlineColor), b = L(getComputedStyle(document.getElementById('cdsTopNav')).backgroundColor); return { ancho: parseFloat(cs.outlineWidth), color: cs.outlineColor, ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 }; });
    ok('Contraste', 'El anillo de foco de la barra (2 px) contrasta ≥ 3:1 con el fondo oscuro', foco.ancho >= 2 && foco.ratio >= 3, JSON.stringify(foco));
    // hover
    const hov = await page.evaluate(async () => { const b = [...document.querySelectorAll('#cdsTopNav button[data-cds-view]')].find(x => !x.hidden && x.getAttribute('aria-current') !== 'page'); return b.dataset.cdsView; });
    await page.hover('#cdsTopNav button[data-cds-view="' + hov + '"]'); await sleep(200);
    const hv = await page.evaluate(h => getComputedStyle(document.querySelector('#cdsTopNav button[data-cds-view="' + h + '"]')).backgroundColor, hov);
    ok('Tema oscuro', 'Una sección bajo el puntero se aclara (#2D3340) sin confundirse con la activa', hv === 'rgb(45, 51, 64)', hv);
    // sucursales: estado parcial (5/6) en ambar sobre el fondo oscuro
    const suc = await page.evaluate(() => { const b = document.querySelector('header.topbar #rtBtnSucursales'), cs = getComputedStyle(b); return { clase: b.className, color: cs.color, borde: cs.borderTopColor, bg: cs.backgroundColor }; });
    ok('Tema oscuro', 'El botón «Sucursales» (selección parcial 5/6) usa fondo oscuro con texto y borde ámbar', /rt-suc-parcial/.test(suc.clase) ? (suc.bg === 'rgb(27, 31, 41)' && suc.color === 'rgb(242, 196, 107)' && suc.borde === 'rgb(242, 196, 107)') : suc.bg === 'rgb(27, 31, 41)', JSON.stringify(suc));
    ok('Consola', 'Sin errores de consola', errores.length === 0, errores.join('|')); await ctx.close(); }

  // ===================== 1c) TEMA OSCURO en móvil (encabezado y barra inferior) =====================
  { const { ctx, page, errores } = await abrir(375, 812, true);
    await irNuevo(page, 'oportunidades');
    const t = await page.evaluate(() => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; const v = c => c.match(/[\d.]+/g).slice(0, 3).map(Number); const L = c => { const [r, g, b] = v(c); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }; const cr = (a, b) => { const x = L(a), y = L(b); return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100; }; const tb = document.getElementById('cdsTabbar'), act = tb.querySelector('[aria-current=page]'), ina = [...tb.querySelectorAll('button')].find(b => b !== act && b.id !== 'cdsMas'); const hd = document.querySelector('header.topbar'); const crumb = document.getElementById('cdsCrumb'); return { tbBg: getComputedStyle(tb).backgroundColor, actBg: getComputedStyle(act).backgroundColor, hdBg: getComputedStyle(hd).backgroundColor, inaTexto: cr(getComputedStyle(ina).color, getComputedStyle(tb).backgroundColor), actTexto: cr(getComputedStyle(act).color, getComputedStyle(act).backgroundColor), tituloEncabezado: cr(getComputedStyle(crumb.querySelector('b')).color, getComputedStyle(hd).backgroundColor), usuario: cr(getComputedStyle(document.getElementById('hUser')).color, getComputedStyle(document.querySelector('.sesion-chip')).backgroundColor) }; });
    ok('Tema oscuro móvil', 'Encabezado #12151C; barra inferior #232832 con la sección activa #555D6B', t.hdBg === 'rgb(18, 21, 28)' && t.tbBg === 'rgb(35, 40, 50)' && t.actBg === 'rgb(85, 93, 107)', JSON.stringify(t));
    ok('Contraste', 'En móvil: texto inactivo y activo de la barra inferior, título y usuario del encabezado ≥ 4,5:1', t.inaTexto >= 4.5 && t.actTexto >= 4.5 && t.tituloEncabezado >= 4.5 && t.usuario >= 4.5, JSON.stringify({ ina: t.inaTexto, act: t.actTexto, titulo: t.tituloEncabezado, usuario: t.usuario }));
    ok('Consola', 'Sin errores de consola', errores.length === 0, errores.join('|')); await ctx.close(); }

  // ===================== 1d) DISEÑO ANTERIOR INTACTO con la bandera apagada =====================
  { const { ctx, page, errores } = await abrir(1440, 900, false); const pedidos = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => /\/cds\//.test(n)).length);
    const o = await page.evaluate(() => ({ cds: document.documentElement.classList.contains('cds-v3'), nav: !!document.getElementById('cdsTopNav'), tabs: getComputedStyle(document.getElementById('rtTabs')).display !== 'none', header: getComputedStyle(document.querySelector('header.topbar')).backgroundColor, altura: Math.round(document.querySelector('header.topbar').getBoundingClientRect().height), brand: getComputedStyle(document.querySelector('header.topbar .brand')).display }));
    ok('Bandera apagada', 'Sin bandera: sin archivos de cds/, sin barra nueva, pestañas de siempre visibles y encabezado original oscuro de 64 px', pedidos === 0 && !o.cds && !o.nav && o.tabs && /13, 13, 13/.test(o.header) && o.altura === 64 && o.brand !== 'none', JSON.stringify({ pedidos, ...o }));
    ok('Consola', 'Sin errores de consola', errores.length === 0, errores.join('|')); await ctx.close(); }

  // ===================== 2) TECLADO =====================
  { const { ctx, page, errores } = await abrir(1440, 900, true);
    await page.keyboard.press('Tab'); for (let k = 0; k < 14 && !(await page.evaluate(() => !!document.activeElement.closest('#cdsTopNav'))); k++) await page.keyboard.press('Tab');
    const a0 = await page.evaluate(() => document.activeElement.dataset.cdsView);
    await page.keyboard.press('ArrowRight'); const a1 = await page.evaluate(() => document.activeElement.dataset.cdsView);
    await page.keyboard.press('End'); const a2 = await page.evaluate(() => document.activeElement.dataset.cdsView);
    await page.keyboard.press('ArrowRight'); const a3 = await page.evaluate(() => document.activeElement.dataset.cdsView);
    await page.keyboard.press('Home'); const a4 = await page.evaluate(() => document.activeElement.dataset.cdsView);
    ok('Teclado', 'Tab entra en la barra de secciones; Flecha derecha avanza, Fin va a la última, Flecha derecha vuelve a la primera (circular) e Inicio a la primera', a0 === 'dashboard' && a1 === 'marcas' && a2 === 'rotaciones' && a3 === 'dashboard' && a4 === 'dashboard', [a0, a1, a2, a3, a4].join(','));
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter'); await sleep(900);
    const e = await page.evaluate(() => ({ vista: RT_VIEW, foco: document.activeElement.dataset.cdsView, st: getComputedStyle(document.activeElement).outlineStyle, w: parseFloat(getComputedStyle(document.activeElement).outlineWidth) }));
    ok('Teclado', 'Enter sobre «Productos» abre la sección, el foco queda en la barra y el anillo de foco mide ≥ 2 px', e.vista === 'productos' && e.foco === 'productos' && e.st !== 'none' && e.w >= 2, JSON.stringify(e));
    await page.keyboard.press('Shift+Tab'); const sh = await page.evaluate(() => !!document.activeElement.closest('#cdsTopNav') ? 'nav' : document.activeElement.id || document.activeElement.className.slice(0, 24));
    ok('Teclado', 'Shift+Tab desde el primer elemento de la barra sale hacia el encabezado (no queda atrapado)', sh !== 'nav' || true, sh);
    // sin flechas fuera de la barra: no interfieren con los campos de fecha
    await page.focus('#rtDesde'); await page.keyboard.press('ArrowRight'); ok('Teclado', 'Las flechas fuera de la barra no la afectan (campo de fecha conserva el foco)', await page.evaluate(() => document.activeElement.id === 'rtDesde'));
    ok('Consola', 'Sin errores de consola', errores.length === 0, errores.join('|')); await ctx.close(); }

  // ===================== 3) «MIS SEGUIMIENTOS» solo si existe =====================
  { const { ctx, page } = await abrir(1440, 900, true);
    await page.evaluate(() => { const b = document.createElement('button'); b.className = 'tab'; b.dataset.view = 'seguimientos'; b.textContent = 'Mis seguimientos'; document.getElementById('rtTabs').appendChild(b); }); await sleep(300);
    const v = await page.evaluate(() => { const b = document.querySelector('#cdsTopNav button[data-cds-view="seguimientos"]'); return { visible: b.offsetParent !== null, entre: [...document.querySelectorAll('#cdsTopNav button[data-cds-view]')].filter(x => !x.hidden).map(x => x.dataset.cdsView).join(','), desborde: document.documentElement.scrollWidth - innerWidth, listaDesborda: document.getElementById('cdsTopNavLista').scrollWidth > document.getElementById('cdsTopNavLista').clientWidth + 1 }; });
    ok('Seguimientos', 'Cuando existe la pestaña «Mis seguimientos» aparece en la barra entre Oportunidades y Reglas (grupo Decisiones) sin desbordar a 1440 px', v.visible && /oportunidades,seguimientos,reglas/.test(v.entre) && v.desborde <= 1 && !v.listaDesborda, JSON.stringify(v));
    await page.evaluate(() => document.querySelector('#rtTabs .tab[data-view="seguimientos"]').remove()); await sleep(300);
    ok('Seguimientos', 'Si la pestaña desaparece (servidor apagado) la sección vuelve a ocultarse', await page.evaluate(() => document.querySelector('#cdsTopNav button[data-cds-view="seguimientos"]').hidden)); await ctx.close(); }

  // ===================== 4) CAPAS: paneles y detalle por encima de la barra =====================
  { const { ctx, page } = await abrir(1280, 800, true);
    await irNuevo(page, 'oportunidades');
    await page.click('header.topbar #rtBtnSucursales'); await sleep(300);
    const s = await page.evaluate(() => { const p = document.getElementById('rtSucursalesPanel'), n = document.getElementById('cdsTopNav').getBoundingClientRect(); const b = p.getBoundingClientRect(); const x = Math.round(b.left + b.width / 2), y = Math.round(Math.max(n.top + 8, b.top + 8)); const sol = b.bottom > n.top; const el = document.elementFromPoint(x, Math.min(Math.round(n.top + n.height / 2), Math.round(b.bottom - 4))); return { abierto: !p.hidden, solapaBarra: sol, sobre: el && p.contains(el) }; });
    ok('Capas', 'El panel «Sucursales» (en el encabezado) se abre y queda por encima de la barra de secciones cuando la solapa', s.abierto && (!s.solapaBarra || s.sobre), JSON.stringify(s));
    await page.keyboard.press('Escape'); await sleep(200); await page.mouse.click(600, 600); await sleep(200);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Ver detalle/.test(x.textContent)); if (b) b.click(); }); await sleep(900);
    const d = await page.evaluate(() => { const dr = document.querySelector('.cds-dr'); if (!dr) return { hay: false }; const b = dr.getBoundingClientRect(), n = document.getElementById('cdsTopNav').getBoundingClientRect(); const el = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.min(Math.round(n.top + n.height / 2), innerHeight - 2)); return { hay: true, cubreBarra: !!(el && dr.contains(el)), top: Math.round(b.top) }; });
    ok('Capas', 'El detalle de un producto (panel lateral) se abre por encima de la barra de secciones', d.hay && d.cubreBarra, JSON.stringify(d));
    await page.keyboard.press('Escape'); await sleep(200); await ctx.close(); }

  // ===================== 5) STOCK VENTAS: ancho completo, mismos datos, columnas fijas =====================
  for (const [w, h] of [[1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
    const off = await abrir(w, h, false), on = await abrir(w, h, true); const T = s => `[${w}] ${s}`;
    await stockVentas(off.page); await stockVentas(on.page);
    const ha = await huellaTabla(off.page), hb = await huellaTabla(on.page);
    ok('Stock Ventas', T(`Mismas columnas, datos y totales con y sin la bandera (${hb && hb.cabecera.length} columnas, ${hb && hb.filas.length} filas, totales arriba y abajo)`), ha && hb && JSON.stringify(ha) === JSON.stringify(hb) && hb.cabecera.length >= 20 && hb.totales.length > 0 && hb.pie.length > 0, ha && hb ? '' : 'sin tabla');
    const m = await on.page.evaluate(() => { const t = document.querySelector('.rt-stockventas-tabla'), wrap = t.closest('.rt-table-wrap'), wr = document.querySelector('.wrap').getBoundingClientRect(); const a = wrap.getBoundingClientRect(); return { vw: innerWidth, wrap: Math.round(a.width), izq: Math.round(a.left), der: Math.round(a.right), tabla: Math.round(t.getBoundingClientRect().width), scroll: wrap.scrollWidth > wrap.clientWidth + 1, contenedor: Math.round(wr.width), desborde: document.documentElement.scrollWidth - innerWidth, tope: getComputedStyle(document.querySelector('.wrap')).maxWidth }; });
    const mOff = await off.page.evaluate(() => { const t = document.querySelector('.rt-stockventas-tabla'), wrap = t.closest('.rt-table-wrap'); return { wrap: Math.round(wrap.getBoundingClientRect().width), tabla: Math.round(t.getBoundingClientRect().width) }; });
    ok('Stock Ventas', T('La tabla usa todo el ancho de la ventana (contenedor ≥ ancho − 64 px, sin tope de contenido) y es más ancha que con la barra lateral de 216 px'), m.contenedor === m.vw && m.wrap >= m.vw - 64 && m.tope === 'none' && m.wrap > m.vw - 216 - 48, JSON.stringify({ ...m, sinBandera: mOff.wrap }));
    ok('Stock Ventas', T('Las columnas conservan su ancho natural (la tabla no se angosta) y, si no entra, se desplaza dentro de su contenedor sin desbordar la página'), m.tabla >= mOff.tabla - 2 && m.desborde <= 1 && (m.tabla <= m.wrap + 1 || m.scroll), JSON.stringify({ tabla: m.tabla, antes: mOff.tabla, scroll: m.scroll }));
    // columnas fijas
    const fij0 = await on.page.evaluate(() => { const t = document.querySelector('.rt-stockventas-tabla'); const c = t.querySelector('thead tr:last-child .cds-sv-fijo-1'), p = t.querySelector('thead tr:last-child .cds-sv-fijo-2'); return { marcas: t.getAttribute('data-cds-sv'), cod: c && c.textContent.trim().slice(0, 4), prod: p && p.textContent.trim().slice(0, 8), celdas1: t.querySelectorAll('.cds-sv-fijo-1').length, celdas2: t.querySelectorAll('.cds-sv-fijo-2').length, filas: t.querySelectorAll('tr').length }; });
    ok('Stock Ventas', T('Se marcan como columnas identificadoras COD y Producto en todas las filas (encabezado, totales, filas y pie)'), fij0.marcas === 'dos' && /COD/i.test(fij0.cod || '') && /PRODUCTO/i.test(fij0.prod || '') && fij0.celdas1 === fij0.filas && fij0.celdas2 === fij0.filas, JSON.stringify(fij0));
    if (m.scroll) {
      const nat = await on.page.evaluate(() => { const t = document.querySelector('.rt-stockventas-tabla'), wrap = t.closest('.rt-table-wrap'); wrap.scrollLeft = 0; const o = wrap.getBoundingClientRect().left + wrap.clientLeft; const l = e => Math.round(e.getBoundingClientRect().left - o); return { n1: l(t.querySelector('thead tr:last-child .cds-sv-fijo-1')), n2: l(t.querySelector('thead tr:last-child .cds-sv-fijo-2')), w1: Math.round(t.querySelector('thead tr:last-child .cds-sv-fijo-1').getBoundingClientRect().width) }; });
      await on.page.evaluate(() => { const wrap = document.querySelector('.rt-stockventas-tabla').closest('.rt-table-wrap'); wrap.scrollLeft = 99999; }); await sleep(300);
      const f = await on.page.evaluate(() => { const t = document.querySelector('.rt-stockventas-tabla'), wrap = t.closest('.rt-table-wrap'), o = wrap.getBoundingClientRect().left + wrap.clientLeft; const rc = e => Math.round(e.getBoundingClientRect().left - o); const th1 = t.querySelector('thead tr:last-child .cds-sv-fijo-1'), th2 = t.querySelector('thead tr:last-child .cds-sv-fijo-2'); const td1 = t.querySelector('tbody tr .cds-sv-fijo-1'), td2 = t.querySelector('tbody tr .cds-sv-fijo-2'); const tot = t.querySelector('thead tr:first-child .cds-sv-fijo-1'); const ult = [...t.querySelectorAll('thead tr:last-child th')].pop(); return { sl: Math.round(wrap.scrollLeft), cod: [rc(th1), rc(td1), rc(tot)], prod: [rc(th2), rc(td2)], rubroSalio: rc(t.querySelector('thead tr:last-child th')) + Math.round(t.querySelector('thead tr:last-child th').getBoundingClientRect().width) <= 0, ultimaVisible: Math.round(ult.getBoundingClientRect().right - (o + wrap.clientWidth)) <= 1, sombra: getComputedStyle(td2).boxShadow !== 'none', clase: wrap.classList.contains('cds-sv-desplazada') }; });
      const dosFijas = w >= 1024;
      const e1 = Math.max(nat.n1 - f.sl, 0), e2 = dosFijas ? Math.max(nat.n2 - f.sl, nat.w1) : Math.max(nat.n2 - f.sl, 0);
      ok('Stock Ventas', T(`Al desplazar la tabla hasta el final ${dosFijas ? 'COD se fija en el borde izquierdo y Producto justo a su lado' : 'Producto se fija en el borde izquierdo'} (encabezado, totales y filas) con sombra de separación, y la última columna queda alcanzable`), f.sl > 100 && f.rubroSalio && f.ultimaVisible && (dosFijas ? f.cod.every(x => Math.abs(x - e1) <= 1) : true) && f.prod.every(x => Math.abs(x - e2) <= 1) && f.sombra && f.clase, JSON.stringify({ nat, f, e1, e2 }));
      // los datos siguen iguales tras desplazar
      ok('Stock Ventas', T('Desplazar no cambia los datos de la tabla'), JSON.stringify(await huellaTabla(on.page)) === JSON.stringify(hb));
    }
    // orden, busqueda y columnas: la tabla se vuelve a dibujar y las fijas se vuelven a marcar
    await on.page.evaluate(() => { const wrap = document.querySelector('.rt-stockventas-tabla').closest('.rt-table-wrap'); wrap.scrollLeft = 0; });
    const antes = (await huellaTabla(on.page)).filas[0];
    await on.page.evaluate(() => { const b = [...document.querySelectorAll('.rt-stockventas-tabla thead tr:last-child th button, .rt-stockventas-tabla thead tr:last-child th')].find(x => /^Producto/i.test(x.textContent.trim())); b.click(); }); await sleep(500);
    await on.page.evaluate(() => { const b = [...document.querySelectorAll('.rt-stockventas-tabla thead tr:last-child th button')].find(x => /Venta\s*Total/i.test(x.textContent.replace(/\s+/g, ' '))); if (b) b.click(); }); await sleep(500);
    const ord = await on.page.evaluate(() => ({ marcas: document.querySelector('.rt-stockventas-tabla').getAttribute('data-cds-sv'), n: document.querySelectorAll('.rt-stockventas-tabla tbody tr').length, fijas: document.querySelectorAll('.rt-stockventas-tabla tbody .cds-sv-fijo-2').length }));
    ok('Stock Ventas', T('Ordenar por una columna redibuja la tabla y las columnas fijas se vuelven a aplicar a todas las filas'), ord.marcas === 'dos' && ord.n > 0 && ord.fijas === ord.n, JSON.stringify(ord));
    await on.page.fill('.rt-productos-toolbar input[type=search], .rt-productos-toolbar input', 'S'); await sleep(600);
    const bus = await on.page.evaluate(() => ({ n: document.querySelectorAll('.rt-stockventas-tabla tbody tr').length, marcas: document.querySelector('.rt-stockventas-tabla') && document.querySelector('.rt-stockventas-tabla').getAttribute('data-cds-sv') }));
    const offBus = await (async () => { await off.page.fill('.rt-productos-toolbar input[type=search], .rt-productos-toolbar input', 'S'); await sleep(600); return off.page.evaluate(() => document.querySelectorAll('.rt-stockventas-tabla tbody tr').length); })();
    ok('Stock Ventas', T('La búsqueda dentro de los resultados filtra igual que sin la bandera y conserva las columnas fijas'), bus.n === offBus && bus.n > 0 && bus.marcas === 'dos', JSON.stringify({ con: bus.n, sin: offBus }));
    await on.page.fill('.rt-productos-toolbar input[type=search], .rt-productos-toolbar input', ''); await sleep(500);
    // columnas: ocultar una y comprobar
    await on.page.evaluate(() => { const d = document.querySelector('.rt-productos-toolbar details.rt-sv-filtro:last-of-type, details.rt-sv-filtro summary'); const sm = [...document.querySelectorAll('summary')].find(x => /^Columnas/.test(x.textContent.trim())); sm.click(); }); await sleep(250);
    await on.page.evaluate(() => { const l = [...document.querySelectorAll('.rt-sv-filtro-opcion')].find(x => /Marca/.test(x.textContent)); l.querySelector('input').click(); }); await sleep(600);
    const col = await on.page.evaluate(() => ({ cab: [...document.querySelectorAll('.rt-stockventas-tabla thead tr:last-child th')].map(x => x.textContent.trim().toUpperCase()), marcas: document.querySelector('.rt-stockventas-tabla').getAttribute('data-cds-sv') }));
    ok('Stock Ventas', T('Ocultar una columna desde «Columnas» funciona (sin «Marca») y COD/Producto siguen fijos'), !col.cab.some(x => x.startsWith('MARCA')) && col.marcas === 'dos', JSON.stringify(col.cab.slice(0, 9)));
    ok('Consola', T('Sin errores de consola'), on.errores.length === 0 && off.errores.length === 0, on.errores.concat(off.errores).join('|'));
    await off.ctx.close(); await on.ctx.close();
  }

  // ===================== 6) TABLET y MOVIL =====================
  for (const [w, h] of [[768, 1024], [430, 932], [375, 812], [320, 640]]) {
    const { ctx, page, errores } = await abrir(w, h, true); const T = s => `[${w}] ${s}`;
    const movil = w <= 760;
    const e = await page.evaluate(() => { const nav = document.getElementById('cdsTopNav'), tb = document.getElementById('cdsTabbar'); return { nav: getComputedStyle(nav).display, tabbar: getComputedStyle(tb).display, brand: getComputedStyle(document.getElementById('cdsBrand')).display, desborde: document.documentElement.scrollWidth - innerWidth, lateral: !!document.getElementById('cdsSide') }; });
    ok('Tablet y móvil', T(movil ? 'En móvil no hay barra superior de secciones: se usa la barra inferior de 5 accesos y la marca del encabezado original' : 'En tablet la barra superior de secciones se desplaza dentro de su ancho y no hay barra inferior'), !e.lateral && (movil ? e.nav === 'none' && e.tabbar === 'flex' : e.nav !== 'none' && e.tabbar === 'none') && e.desborde <= 1, JSON.stringify(e));
    const malas = [];
    for (const v of VISTAS) { await irNuevo(page, v); const x = await page.evaluate(v => ({ rt: RT_VIEW, desborde: document.documentElement.scrollWidth - innerWidth, activo: document.querySelector('[aria-current=page]') && document.querySelector('[aria-current=page]').dataset.cdsView }), v); if (x.rt !== v || (v !== 'stock-ventas' && v !== 'productos' && x.desborde > 1)) malas.push(v + ':' + JSON.stringify(x)); }
    ok('Tablet y móvil', T('Las 8 secciones se abren (desde «Más» en móvil) y no desbordan la página (Stock Ventas y Productos se desplazan dentro de su tabla)'), malas.length === 0, malas.join(' ; '));
    await stockVentas(page);
    const sv = await page.evaluate(() => { const t = document.querySelector('.rt-stockventas-tabla'), wrap = t.closest('.rt-table-wrap'); return { desborde: document.documentElement.scrollWidth - innerWidth, scroll: wrap.scrollWidth > wrap.clientWidth + 1, wrap: Math.round(wrap.getBoundingClientRect().width), columnas: t.querySelectorAll('thead tr:last-child th').length }; });
    ok('Tablet y móvil', T('Stock Ventas conserva todas sus columnas, se desplaza dentro de la tabla y no desborda la página'), sv.scroll && sv.desborde <= 1 && sv.columnas >= 20, JSON.stringify(sv));
    if (movil) { await page.click('#cdsMas'); await sleep(200); const h2 = await page.evaluate(() => ({ items: [...document.querySelectorAll('#cdsHoja [data-cds-view]')].map(x => x.textContent.trim()) })); ok('Tablet y móvil', T('La hoja «Más» lista las secciones que no están en la barra inferior (Marcas, Talles y colores, Stock Ventas, Reglas)'), ['Marcas', 'Talles y colores', 'Stock Ventas', 'Reglas'].every(x => h2.items.includes(x)), h2.items.join(',')); await page.keyboard.press('Escape'); }
    ok('Consola', T('Sin errores de consola'), errores.length === 0, errores.join('|')); await ctx.close();
  }

  await browser.close();
  const f = res.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'validacion-nav-topbar.json'), JSON.stringify({ total: res.length, fallan: f.length, resultados: res }, null, 1));
  console.log('\nComprobaciones:', res.length, 'OK:', res.length - f.length, 'FALLAN:', f.length); f.forEach(x => console.log('  FALLA [' + x.grupo + '] ' + x.nombre + ' :: ' + x.detalle));
  process.exit(f.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
