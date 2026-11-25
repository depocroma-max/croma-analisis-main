'use strict';
// CROMA DESIGN SYSTEM 2.0 · navegacion nueva. Se carga SOLO con la bandera cds-v3 encendida (ver index.html).
// Navegacion HORIZONTAL SUPERIOR (reemplaza a la barra lateral fija): la marca va en el encabezado existente y las secciones en una barra
// propia (#cdsTopNav) debajo de el, que queda fija al desplazar. En movil (≤ 760 px) se conserva la barra inferior y la hoja «Más».
// NO reemplaza la logica de navegacion: crea DOM NUEVO que DELEGA en las pestañas existentes (#rtTabs .tab[data-view]) haciendo click
// sobre ellas, asi rtCambiarVista() y todo lo que ya cuelga de ese evento sigue ocurriendo igual. Refleja en espejo la pestaña activa y la
// presencia de cada pestaña (Reglas se elimina para quien no es administrador; «Mis seguimientos» solo existe si el servidor lo habilita).
// Todo el texto se inserta con textContent; los iconos son SVG estaticos propios.
(function () {
  if (!document.documentElement.classList.contains('cds-v3')) return; // doble guarda: sin bandera no hace nada

  var VISTAS = {
    'dashboard': { t: 'Dashboard', g: 'Análisis', i: 'grid' }, 'marcas': { t: 'Marcas', g: 'Análisis', i: 'tag' }, 'productos': { t: 'Productos', g: 'Análisis', i: 'box' },
    'talles-colores': { t: 'Talles y colores', g: 'Análisis', i: 'ruler' }, 'stock-ventas': { t: 'Stock Ventas', g: 'Análisis', i: 'chart' },
    'oportunidades': { t: 'Oportunidades', g: 'Decisiones', i: 'target' }, 'seguimientos': { t: 'Mis seguimientos', g: 'Decisiones', i: 'star' }, 'reglas': { t: 'Reglas', g: 'Decisiones', i: 'scale' }, 'rotaciones': { t: 'Rotaciones', g: 'Decisiones', i: 'swap' },
  };
  var ORDEN = ['dashboard', 'marcas', 'productos', 'talles-colores', 'stock-ventas', 'oportunidades', 'seguimientos', 'reglas', 'rotaciones']; // 'seguimientos' (D1B) solo aparece si la pestaña existe (el servidor lo habilita)
  var INFERIOR = ['dashboard', 'productos', 'oportunidades', 'rotaciones']; // barra inferior movil + «Más» con el resto
  var ICONOS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>', box: '<path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10"/>',
    ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M8 12l2 2M11 9l2 2M14 6l2 2"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>', scale: '<path d="M12 3v18M6 21h12M5 8h14M5 8l-3 7a3 3 0 0 0 6 0zM19 8l-3 7a3 3 0 0 0 6 0z"/>',
    swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>', star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  function icono(n) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'cds-i'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); s.innerHTML = ICONOS[n]; return s; } // innerHTML: constante propia, nunca datos
  function el(tag, props) {
    var e = document.createElement(tag); props = props || {};
    for (var k in props) { var v = props[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v); }
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return e;
  }

  var estado = { vista: null, hoja: null, foco: null };
  function pestana(v) { return document.querySelector('#rtTabs .tab[data-view="' + v + '"]'); }
  function ir(v) { var t = pestana(v); if (t) t.click(); } // delega en la navegacion existente (rtCambiarVista)

  function construir() {
    if (document.getElementById('cdsTopNav')) return;
    var app = document.getElementById('app'); if (!app) return;
    // saltar al contenido
    document.body.insertBefore(el('a', { class: 'cds-skip cds-ui', href: '#rtPanelHost', 'data-cds': '', text: 'Saltar al contenido' }), document.body.firstChild);
    var host = document.getElementById('rtPanelHost'); if (host) host.setAttribute('tabindex', '-1'); // destino del enlace anterior
    var top = document.querySelector('header.topbar');
    // marca: va al principio del encabezado existente (el resto de su contenido —estado, sucursales, Actualizar, sesion, Hub— no se toca)
    if (top) top.insertBefore(el('div', { class: 'cds-brand cds-ui', id: 'cdsBrand', 'data-cds': '' }, el('img', { src: 'tridente_solo.png', alt: '' }), el('span', null, 'Croma', el('small', { text: 'Análisis' }))), top.firstChild);
    // barra de secciones horizontal (escritorio y tablet)
    var lista = el('div', { class: 'cds-topnav-lista', id: 'cdsTopNavLista', role: 'list' }), grupo = null;
    ORDEN.forEach(function (v) {
      var d = VISTAS[v];
      if (grupo !== null && d.g !== grupo) lista.appendChild(el('span', { class: 'cds-topnav-sep', role: 'presentation', 'data-cds-grupo': d.g }));
      grupo = d.g;
      lista.appendChild(el('div', { role: 'listitem', class: 'cds-topnav-item', 'data-cds-item': v }, el('button', { class: 'cds-nav', type: 'button', 'data-cds-view': v, title: d.t }, icono(d.i), el('span', { text: d.t }))));
    });
    var nav = el('nav', { class: 'cds-topnav cds-ui', id: 'cdsTopNav', 'aria-label': 'Secciones de Croma Análisis', 'data-cds': '' }, lista);
    if (top && top.parentNode) top.parentNode.insertBefore(nav, top.nextSibling); else app.insertBefore(nav, app.firstChild);
    // barra inferior (movil)
    var bar = el('nav', { class: 'cds-tabbar cds-ui cds-on-dark', id: 'cdsTabbar', 'aria-label': 'Secciones de Croma Análisis (móvil)', 'data-cds': '' });
    INFERIOR.forEach(function (v) { var d = VISTAS[v]; bar.appendChild(el('button', { type: 'button', 'data-cds-view': v, 'aria-label': d.t }, icono(d.i), el('span', { class: 'cds-tl', text: d.t }))); });
    bar.appendChild(el('button', { type: 'button', id: 'cdsMas', 'data-cds-mas': '', 'aria-haspopup': 'dialog', 'aria-label': 'Más secciones' }, icono('more'), el('span', { class: 'cds-tl', text: 'Más' })));
    document.body.appendChild(bar);
    // titulo de seccion en el encabezado existente (solo se ve en movil, donde no hay barra de secciones arriba)
    if (top) top.insertBefore(el('div', { class: 'cds-crumb cds-ui', id: 'cdsCrumb', 'data-cds': '' }), top.querySelector('.top-actions'));
    // clicks (delegados)
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-cds-view]') : null;
      if (b && b.closest('#cdsTopNav, #cdsTabbar, #cdsHoja')) { if (estado.hoja) cerrarHoja(true); ir(b.getAttribute('data-cds-view')); return; }
      var m = e.target.closest ? e.target.closest('[data-cds-mas]') : null; if (m) abrirHoja();
    });
    // teclado en la barra superior: flechas izquierda/derecha, Inicio y Fin recorren las secciones visibles (Tab sigue entrando y saliendo de la barra)
    nav.addEventListener('keydown', function (e) {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(e.key) < 0) return;
      var btns = [].slice.call(nav.querySelectorAll('button[data-cds-view]')).filter(function (b) { return !b.hidden && !(b.parentElement && b.parentElement.hidden); });
      var i = btns.indexOf(document.activeElement); if (i < 0 || !btns.length) return; e.preventDefault();
      var n = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length; btns[n].focus();
    });
    // espejo del estado de las pestañas viejas
    var tabs = document.getElementById('rtTabs');
    if (tabs && window.MutationObserver) new MutationObserver(sincronizar).observe(tabs, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
    sincronizar();
  }

  // Deja a la vista la seccion activa dentro de la barra (si esta se desplaza en pantallas angostas). Solo mueve la barra, nunca la pagina.
  function mostrarActiva() {
    var l = document.getElementById('cdsTopNavLista'); if (!l) return;
    var a = l.querySelector('[aria-current="page"]'); if (!a || l.scrollWidth <= l.clientWidth + 1) return;
    var li = a.closest('.cds-topnav-item') || a, izq = li.offsetLeft, der = izq + li.offsetWidth;
    if (izq < l.scrollLeft + 24) l.scrollLeft = Math.max(0, izq - 24); else if (der > l.scrollLeft + l.clientWidth - 24) l.scrollLeft = der - l.clientWidth + 24;
  }

  function sincronizar() {
    var activa = null;
    ORDEN.forEach(function (v) { var t = pestana(v); if (t && t.classList.contains('active')) activa = v; });
    estado.vista = activa;
    if (activa) document.documentElement.setAttribute('data-cds-vista', activa); else document.documentElement.removeAttribute('data-cds-vista');
    var items = document.querySelectorAll('[data-cds-view]');
    for (var i = 0; i < items.length; i++) {
      var it = items[i], v = it.getAttribute('data-cds-view'), existe = !!pestana(v);
      it.hidden = !existe; // p. ej. Reglas no existe para quien no es administrador
      var cont = it.closest('.cds-topnav-item'); if (cont) cont.hidden = !existe;
      if (v === activa) it.setAttribute('aria-current', 'page'); else it.removeAttribute('aria-current');
    }
    // el separador de grupo solo se ve si hay secciones visibles en ambos lados
    var seps = document.querySelectorAll('.cds-topnav-sep');
    for (var s = 0; s < seps.length; s++) {
      var ant = seps[s].previousElementSibling, sig = seps[s].nextElementSibling, hay = false, hay2 = false;
      while (ant) { if (ant.classList.contains('cds-topnav-item') && !ant.hidden) { hay = true; break; } ant = ant.previousElementSibling; }
      while (sig) { if (sig.classList.contains('cds-topnav-item') && !sig.hidden) { hay2 = true; break; } sig = sig.nextElementSibling; }
      seps[s].hidden = !(hay && hay2);
    }
    var mas = document.getElementById('cdsMas');
    if (mas) { if (activa && INFERIOR.indexOf(activa) < 0) mas.setAttribute('aria-current', 'page'); else mas.removeAttribute('aria-current'); }
    var crumb = document.getElementById('cdsCrumb');
    if (crumb) { crumb.textContent = ''; if (activa) { crumb.appendChild(el('span', { class: 'cds-crumb-g', text: VISTAS[activa].g + ' / ' })); crumb.appendChild(el('b', { text: VISTAS[activa].t })); } }
    mostrarActiva();
  }

  // hoja «Más» (movil): resto de las secciones. Dialogo modal accesible: foco al abrir, Escape y fondo cierran, el foco vuelve al boton.
  function abrirHoja() {
    if (estado.hoja) return; estado.foco = document.activeElement;
    var lista = el('div', { class: 'cds-modal-b' });
    ORDEN.filter(function (v) { return INFERIOR.indexOf(v) < 0 && pestana(v); }).forEach(function (v) {
      var d = VISTAS[v]; lista.appendChild(el('button', { class: 'cds-btn', type: 'button', 'data-cds-view': v, style: 'justify-content:flex-start;margin-bottom:var(--cds-s-2);height:var(--cds-hit)' }, icono(d.i), d.t));
    });
    var cerrar = el('button', { class: 'cds-btn cds-btn--icon cds-btn--quiet', type: 'button', 'aria-label': 'Cerrar', 'data-cds-cerrar': '' }, icono('x'));
    var hoja = el('div', { class: 'cds-modal cds-ui', id: 'cdsHoja', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cdsHojaT', 'data-cds': '', style: 'z-index:1100' },
      el('div', { class: 'cds-modal-h' }, el('h2', { id: 'cdsHojaT', text: 'Más secciones' }), cerrar), lista);
    var velo = el('div', { class: 'cds-scrim', id: 'cdsVelo', 'data-cds': '', style: 'z-index:1090' });
    velo.addEventListener('click', function () { cerrarHoja(false); }); cerrar.addEventListener('click', function () { cerrarHoja(false); });
    hoja.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); cerrarHoja(false); return; }
      if (e.key === 'Tab') { // trampa de foco simple
        var f = hoja.querySelectorAll('button'); if (!f.length) return; var p = f[0], u = f[f.length - 1];
        if (e.shiftKey && document.activeElement === p) { e.preventDefault(); u.focus(); } else if (!e.shiftKey && document.activeElement === u) { e.preventDefault(); p.focus(); }
      }
    });
    document.body.appendChild(velo); document.body.appendChild(hoja); estado.hoja = hoja;
    var primero = hoja.querySelector('.cds-modal-b button') || cerrar; primero.focus();
  }
  function cerrarHoja(sinFoco) {
    var h = document.getElementById('cdsHoja'), v = document.getElementById('cdsVelo'); if (h) h.remove(); if (v) v.remove(); estado.hoja = null;
    if (!sinFoco && estado.foco && estado.foco.isConnected && estado.foco.focus) estado.foco.focus();
  }

  window.addEventListener('resize', mostrarActiva);
  window.CdsShell = { construir: construir, sincronizar: sincronizar, VISTAS: VISTAS };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', construir); else construir();
})();
