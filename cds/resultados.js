/* CROMA DESIGN SYSTEM 2.0 · Etapa B3: tabla comercial (escritorio) y tarjetas (movil) de Oportunidades. Se carga SOLO con la bandera cds-v3 encendida.
   Reemplaza la presentacion de las filas: no consulta la API, no clasifica y no calcula nada de negocio. Cada celda sale de los mismos campos que
   ya entrega el motor (acciones, estado_principal, etiquetas secundarias, ventas, stock, cobertura). El ultimo ingreso y el rendimiento NO van en la
   fila: viven en el detalle (cds/detalle.js). Ganchos: ovTabla() y ovTarjetas() de oportunidades-vista.js consultan window.CDS_RESULTADOS. */
(function () {
  'use strict';
  if (!document.documentElement.classList.contains('cds-v3')) return;

  var nf = new Intl.NumberFormat('es-AR');
  var URGENCIA = { alta: 'Alta', media: 'Media', baja: 'Baja' };

  function el(tag, cls, texto, attrs) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  // Un valor ausente se muestra «—», nunca 0 ni NaN.
  function num(v) { return typeof v === 'number' && isFinite(v) ? nf.format(v) : '—'; }
  function familia(estado) { return estado && typeof ogGrupoDeEstado === 'function' ? ogGrupoDeEstado(estado) : null; }

  // Estados secundarios (etiquetas que el motor agrega al principal), sin repetidos y sin el principal.
  function secundarios(f) {
    var vistos = {}, out = [];
    [].concat(f.etiquetas_secundarias || [], f.estados_secundarios || []).forEach(function (e) { if (e && e !== f.estado_principal && !vistos[e]) { vistos[e] = true; out.push(e); } });
    return out;
  }
  function urgenciaDe(f) { var a = rrAccionPrincipal(f); return a && URGENCIA[a.prioridad] ? a.prioridad : null; }

  function celdaUrgencia(f) {
    var u = urgenciaDe(f);
    if (!u) return el('span', 'cds-nd', '—', { title: 'Sin urgencia: el producto no tiene una acción sugerida' });
    var s = el('span', 'cds-urg cds-urg--' + u, null, { title: 'Urgencia de la acción principal: ' + URGENCIA[u].toLowerCase() });
    var b = el('span', 'cds-bars'); b.setAttribute('aria-hidden', 'true'); b.appendChild(el('i')); b.appendChild(el('i')); b.appendChild(el('i')); s.appendChild(b);
    s.appendChild(el('span', 'cds-urg-txt', URGENCIA[u]));
    return s;
  }
  function etiquetasProducto(f) {
    var t = [];
    if (typeof f.Ventas_total === 'number' && f.Ventas_total < 0) t.push('devoluciones'); else if (f.ratio_confiable === false) t.push('muestra chica');
    var a = rrAccionPrincipal(f); if (a && a.requiere_validacion_variante) t.push('validar por variante');
    return t;
  }
  function celdaProducto(f, sinEtiquetas) {
    var w = el('div', 'cds-prod');
    w.appendChild(el('b', 'cds-prod-nombre', f.Nombre_producto || f.Codigo_producto));
    var meta = el('div', 'cds-prod-meta');
    meta.appendChild(el('span', 'cds-mono', f.Codigo_producto));
    if (!sinEtiquetas) etiquetasProducto(f).forEach(function (x) { meta.appendChild(el('span', 'cds-flag', x)); });
    var mr = [f.Nombre_marca, f.Nombre_rubro].filter(Boolean).join(' · '); if (mr) meta.appendChild(el('span', null, mr));
    w.appendChild(meta);
    return w;
  }
  function celdaEstado(f) {
    var s = el('span', 'cds-state'); var fam = familia(f.estado_principal); if (fam) s.setAttribute('data-cds-g', fam);
    var punto = el('span', 'cds-dot'); punto.setAttribute('aria-hidden', 'true'); s.appendChild(punto);
    s.appendChild(document.createTextNode(f.estado_principal ? rrTextoEstado(f.estado_principal) : 'Sin acción'));
    var sec = secundarios(f);
    if (sec.length) s.appendChild(el('span', 'cds-state-mas', '+' + sec.length, { title: 'También cumple: ' + sec.map(function (e) { return rrTextoEstado(e); }).join(', ') + '. El detalle explica cada uno.', 'aria-label': 'y ' + sec.length + (sec.length === 1 ? ' estado secundario' : ' estados secundarios') }));
    return s;
  }
  function celdaAccion(f, conEtiquetas) {
    var a = rrAccionPrincipal(f), fam = familia(f.estado_principal);
    var s = el('span', a ? 'cds-accion' : 'cds-accion cds-accion--ninguna', a ? rrTextoAccion(a) : 'Sin acción sugerida'); if (fam && a) s.setAttribute('data-cds-g', fam);
    if (!conEtiquetas) return s;
    var w = el('div', 'cds-accion-col'); w.appendChild(s); // tabla: las etiquetas de calidad van bajo la acción para que el producto ocupe 2 líneas
    var et = etiquetasProducto(f); if (et.length) { var fl = el('div', 'cds-prod-flags'); et.forEach(function (x) { fl.appendChild(el('span', 'cds-flag', x)); }); w.appendChild(fl); }
    return w;
  }
  function stock(f) { return typeof f.Stock_sucursales === 'number' ? f.Stock_sucursales : null; }
  function deposito(f) { var d = f.Stock_deposito !== undefined ? f.Stock_deposito : f.Stock_ctro_0000; return typeof d === 'number' ? d : null; }
  function cobertura(f, resp) { return ovCeldaCobertura(f, resp); } // conserva los umbrales y el «Sin ventas» (no es 0 días)

  function fila(f, resp) {
    var abierto = RT_OPORTUNIDADES_EXPANDIDO === f.Codigo_producto;
    var tr = el('tr', 'cds-fila' + (abierto ? ' cds-fila--abierta' : '')); var fam = familia(f.estado_principal); if (fam) tr.setAttribute('data-cds-g', fam);
    tr.addEventListener('click', function () { rtOportunidadesToggleDetalle(f.Codigo_producto); });
    function td(cls, nodo) { var c = el('td', cls); c.appendChild(nodo); tr.appendChild(c); }
    td('c-urg', celdaUrgencia(f)); td('c-prod', celdaProducto(f, true)); td('c-est', celdaEstado(f)); td('c-acc', celdaAccion(f, true));
    td('c-n', el('span', 'cds-num', num(f.Ventas_total))); td('c-n', el('span', 'cds-num', num(stock(f)))); td('c-n c-dep', el('span', 'cds-num', num(deposito(f))));
    td('c-cob', cobertura(f, resp));
    var b = ovBotonDetalle(f, abierto); b.classList.add('cds-ver'); b.setAttribute('aria-haspopup', 'dialog'); td('c-det', b);
    return tr;
  }

  function tabla(datos, resp, dias) {
    var wrap = el('div', 'cds-res-tabla'), t = el('table', 'cds-tabla');
    t.appendChild(el('caption', 'cds-sr', 'Oportunidades ordenadas por urgencia'));
    var cg = el('colgroup'); ['urg', 'prod', 'est', 'acc', 'v', 's', 'd', 'cob', 'det'].forEach(function (c) { cg.appendChild(el('col', 'col-' + c)); }); t.appendChild(cg);
    var th = el('thead'), tr = el('tr');
    [['Urgencia', 'c-urg'], ['Producto', 'c-prod'], ['Estado', 'c-est'], ['Acción recomendada', 'c-acc'], ['Ventas' + (dias ? ' (' + dias + ' d)' : ''), 'c-n'], ['Stock suc.', 'c-n'], ['Dep. 90', 'c-n c-dep'], ['Cobertura', 'c-cob'], ['', 'c-det']].forEach(function (c) {
      var h = el('th', c[1], c[0] || null, { scope: 'col' }); if (!c[0]) h.appendChild(el('span', 'cds-sr', 'Detalle')); tr.appendChild(h);
    });
    th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody'); datos.forEach(function (f) { tb.appendChild(fila(f, resp)); }); t.appendChild(tb); wrap.appendChild(t);
    return wrap;
  }

  function tarjetas(datos, resp) {
    var wrap = el('div', 'cds-res-cards');
    datos.forEach(function (f) {
      var abierto = RT_OPORTUNIDADES_EXPANDIDO === f.Codigo_producto, c = el('article', 'cds-card' + (abierto ? ' cds-card--abierta' : '')); var fam = familia(f.estado_principal); if (fam) c.setAttribute('data-cds-g', fam);
      var top = el('div', 'cds-card-top'); top.appendChild(celdaProducto(f)); top.appendChild(celdaUrgencia(f)); c.appendChild(top);
      var fa = el('div', 'cds-card-acc'), ft = el('div', 'cds-card-acc-txt'); ft.appendChild(celdaAccion(f)); ft.appendChild(celdaEstado(f)); fa.appendChild(ft);
      var b = ovBotonDetalle(f, abierto); b.classList.add('cds-ver'); b.setAttribute('aria-haspopup', 'dialog'); fa.appendChild(b); c.appendChild(fa);
      var m = el('dl', 'cds-card-m');
      [['Ventas', num(f.Ventas_total)], ['Stock', num(stock(f))], ['Dep. 90', num(deposito(f))]].forEach(function (p) { var d = el('div'); d.appendChild(el('dt', null, p[0])); d.appendChild(el('dd', null, p[1])); m.appendChild(d); });
      var dc = el('div'); dc.appendChild(el('dt', null, 'Cobertura')); var dd = el('dd'); dd.appendChild(cobertura(f, resp)); dc.appendChild(dd); m.appendChild(dc);
      c.appendChild(m);
      c.addEventListener('click', function (e) { if (e.target.closest('button,a')) return; rtOportunidadesToggleDetalle(f.Codigo_producto); });
      wrap.appendChild(c);
    });
    return wrap;
  }

  window.CDS_RESULTADOS = { tabla: tabla, tarjetas: tarjetas, num: num, secundarios: secundarios, urgenciaDe: urgenciaDe, familia: familia, celdaUrgencia: celdaUrgencia, celdaEstado: celdaEstado, etiquetasProducto: etiquetasProducto };
})();
