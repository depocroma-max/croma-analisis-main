/* CROMA DESIGN SYSTEM 2.0 · Etapa B3: detalle comercial de un producto (panel lateral, en movil hoja inferior). Solo con la bandera cds-v3.
   Reemplaza el detalle desplegable de la fila. No consulta ni calcula nada nuevo: reutiliza los mismos bloques y funciones que ya construyen el detalle
   actual (explicacion, ingresos, rendimiento desde el ingreso, demanda reciente, tendencia, desbalance, rotacion). El estado abierto sigue siendo
   RT_OPORTUNIDADES_EXPANDIDO, asi que abrir, cerrar, cambiar de pagina o de filtro funcionan igual que antes. La incorporacion de variantes (talle y
   color) es de la Etapa C: aqui solo queda el acceso existente «Ver en Talles y colores». */
(function () {
  'use strict';
  if (!document.documentElement.classList.contains('cds-v3')) return;

  var nf = new Intl.NumberFormat('es-AR'), nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
  var TABS = [['resumen', 'Resumen', ''], ['motivos', 'Motivos', ''], ['ingreso', 'Ingreso', ' y rendimiento'], ['sucursales', 'Sucursales', '']]; // el 3.er texto se oculta en pantallas chicas (sigue en el DOM y en el nombre accesible)
  var tab = 'resumen', ultimoCodigo = null, scrollGuardado = 0, focoGuardado = null, pendientesTabs = null;

  function el(tag, cls, texto, attrs) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function R() { return window.CDS_RESULTADOS; }
  function num(v) { return R().num(v); }
  function deposito(f) { var d = f.Stock_deposito !== undefined ? f.Stock_deposito : f.Stock_ctro_0000; return typeof d === 'number' ? d : null; }
  function sec(titulo, contenido) {
    var s = el('section', 'cds-sec'); s.appendChild(el('h3', null, titulo));
    if (contenido instanceof Node) s.appendChild(contenido); else if (contenido != null) s.appendChild(el('p', null, contenido));
    return s;
  }
  function bloque(etiqueta, valor) { return sec(etiqueta, valor); } // misma firma que el `bloque` del detalle anterior (lo usan riBloquesDetalle y otros)
  function kv(pares) {
    var d = el('dl', 'cds-kv'); pares.forEach(function (p) { d.appendChild(el('dt', null, p[0])); var dd = el('dd'); if (p[1] instanceof Node) dd.appendChild(p[1]); else dd.textContent = p[1]; d.appendChild(dd); }); return d;
  }
  function btn(texto, onClick, cls) { var b = el('button', cls || 'cds-btn', texto, { type: 'button' }); b.addEventListener('click', function (e) { e.stopPropagation(); onClick(); }); return b; }

  // ---------- cabecera: identificacion, estado principal y secundarios, urgencia ----------
  function cabecera(f, cerrar) {
    var h = el('header', 'cds-dr-cab'), fila1 = el('div', 'cds-dr-fila1'), id = el('div', 'cds-dr-id');
    id.appendChild(el('h2', 'cds-dr-titulo', f.Nombre_producto || f.Codigo_producto, { id: 'cdsDrTitulo' }));
    var meta = el('p', 'cds-dr-meta'); meta.appendChild(el('span', 'cds-mono', f.Codigo_producto));
    var mr = [f.Nombre_marca, f.Nombre_rubro, f.Nombre_subrubro].filter(Boolean).join(' · '); if (mr) meta.appendChild(document.createTextNode(' · ' + mr));
    id.appendChild(meta); fila1.appendChild(id);
    var x = el('button', 'cds-dr-x', '✕', { type: 'button', 'aria-label': 'Cerrar el detalle de ' + f.Codigo_producto, 'data-fk': 'x' }); x.addEventListener('click', cerrar); fila1.appendChild(x);
    h.appendChild(fila1);
    var est = el('div', 'cds-dr-estados'); est.appendChild(R().celdaEstado(f)); est.appendChild(R().celdaUrgencia(f));
    var sec2 = R().secundarios(f);
    if (sec2.length) {
      var l = el('span', 'cds-dr-sec'); l.appendChild(el('span', 'cds-dr-sec-rot', 'También cumple:'));
      sec2.forEach(function (e) { var c = el('span', 'cds-state'), fam = R().familia(e); if (fam) c.setAttribute('data-cds-g', fam); var p = el('span', 'cds-dot'); p.setAttribute('aria-hidden', 'true'); c.appendChild(p); c.appendChild(document.createTextNode(rrTextoEstado(e))); l.appendChild(c); });
      est.appendChild(l);
    }
    h.appendChild(est);
    var tl = el('div', 'cds-tabs', null, { role: 'tablist', 'aria-label': 'Secciones del detalle' });
    TABS.forEach(function (t) {
      var b = el('button', 'cds-tab', t[1], { type: 'button', role: 'tab', id: 'cdsTab_' + t[0], 'aria-label': t[1] + t[2], 'aria-selected': tab === t[0] ? 'true' : 'false', 'aria-controls': 'cdsDrCuerpo', tabindex: tab === t[0] ? '0' : '-1', 'data-fk': 'tab_' + t[0] });
      if (t[2]) b.appendChild(el('span', 'cds-tab-x', t[2]));
      b.addEventListener('click', function () { tab = t[0]; rtRenderVistaActual(); });
      b.addEventListener('keydown', function (e) {
        var i = TABS.findIndex(function (z) { return z[0] === tab; }), n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
        if (n === null) return; e.preventDefault(); tab = TABS[(n + TABS.length) % TABS.length][0]; focoGuardado = 'tab_' + tab; rtRenderVistaActual();
      });
      tl.appendChild(b);
    });
    h.appendChild(tl);
    pendientesTabs = tl;
    return h;
  }

  // ---------- Resumen ----------
  function pestanaResumen(f, resp) {
    var c = el('div'), acc = f.acciones || [];
    var llamada = el('div', 'cds-callout');
    if (acc.length) acc.forEach(function (a) {
      var l = el('div', 'cds-callout-acc'); l.appendChild(el('b', null, rrTextoAccion(a) + (a.principal ? ' (principal)' : '') + ' · prioridad ' + a.prioridad));
      if (a.motivo) l.appendChild(el('span', null, a.motivo)); llamada.appendChild(l);
    });
    else llamada.appendChild(el('b', null, 'Sin acción sugerida: el producto no cumple reglas de oportunidad en este período.'));
    c.appendChild(llamada);
    var neg = typeof f.Ventas_total === 'number' && f.Ventas_total < 0;
    var k = el('dl', 'cds-m4');
    function m(etq, valor, sub) { var d = el('div'); d.appendChild(el('dt', null, etq)); var dd = el('dd'); if (valor instanceof Node) dd.appendChild(valor); else dd.textContent = valor; d.appendChild(dd); if (sub) d.appendChild(el('small', null, sub)); k.appendChild(d); }
    m('Ventas del período', num(f.Ventas_total), typeof f.ventas_semana === 'number' ? nf1.format(f.ventas_semana) + ' por semana' : null);
    m('Stock suc.', num(typeof f.Stock_sucursales === 'number' ? f.Stock_sucursales : null));
    m('Dep. 90', num(deposito(f)), typeof f.Stock_fallados === 'number' ? 'Fallados 93: ' + nf.format(f.Stock_fallados) : null);
    m('Cobertura', ovCeldaCobertura(f, resp), f.ratio_venta == null ? null : 'Ratio de venta ' + rtOportunidadesPct(f.ratio_venta));
    c.appendChild(k);
    if (neg) c.appendChild(el('p', 'cds-aviso', 'Ventas netas negativas: el período registra devoluciones.'));
    else if (f.ratio_confiable === false) c.appendChild(el('p', 'cds-aviso', 'Muestra chica: el ratio de venta es poco confiable.'));
    if (f.diagnostico_rotacion && f.diagnostico_rotacion.par_sugerido) {
      var ps = f.diagnostico_rotacion.par_sugerido, rw = el('div'), l = el('div', 'cds-suc-fila');
      l.appendChild(rtSucursalBadge(ps.origen.sucursal)); l.appendChild(el('span', null, '(stock ' + ps.origen.stock + ') →')); l.appendChild(rtSucursalBadge(ps.destino.sucursal)); l.appendChild(el('span', null, '(ventas ' + ps.destino.ventas + ')')); rw.appendChild(l);
      if (ps.cantidad_sugerida) rw.appendChild(rtOportunidadesEstimacionRotacion(ps.cantidad_sugerida));
      c.appendChild(sec('Diagnóstico de rotación', rw));
    }
    var rot = acc.find(function (a) { return a.requiere_validacion_variante; });
    if (rot) {
      var cj = el('div', 'cds-aviso cds-aviso--senal'); cj.appendChild(el('b', null, 'Señal por producto: requiere validación por variante. '));
      cj.appendChild(document.createTextNode('Antes de mover stock hay que validar talle y color y el stock real de cada variante en Rotaciones. Acá no se crean envíos ni se confirman cantidades.'));
      cj.appendChild(btn('Ver este producto en Rotaciones', function () { rrIrARotaciones(f.Codigo_producto); })); c.appendChild(cj);
    }
    var ac = el('div', 'cds-dr-acciones');
    ac.appendChild(btn('Ver producto', function () { rtOportunidadesVerDetalle(f.Codigo_producto); }));
    ac.appendChild(btn('Ver en Talles y colores', function () { rtAplicarFiltroYVerTallesColores({ codigo: f.Codigo_producto }); }));
    c.appendChild(ac);
    return c;
  }

  // ---------- Motivos ----------
  function pestanaMotivos(f, resp) {
    var c = el('div');
    var porQue = rrBloquePorQue(f, resp); porQue.setAttribute('open', ''); c.appendChild(porQue); // abierto: en el detalle es lo que se vino a leer
    if (typeof rrEsAdmin === 'function' && rrEsAdmin()) c.appendChild(sec('Explicación técnica (solo administradores)', rrBloqueTecnico(f, resp)));
    return c;
  }

  // ---------- Ingreso y rendimiento ----------
  function pestanaIngreso(f, resp) {
    var c = el('div');
    c.appendChild(sec(f.ingreso_proveedor !== undefined ? 'Último ingreso de proveedor' : 'Último ingreso', ovBloqueIngresos(f, resp)));
    c.appendChild(sec('Rendimiento', rrTextoRendimiento(f)));
    var tmp = el('div'); riBloquesDetalle(tmp, f, resp, bloque); while (tmp.firstChild) c.appendChild(tmp.firstChild); // rendimiento desde el ingreso y demanda de la seleccion (solo si la API los entrega)
    var enRepos = f.estado_principal === 'reposicion_urgente' || f.estado_principal === 'reposicion_a_evaluar' || (f.estados_secundarios && (f.estados_secundarios.indexOf('reposicion_urgente') >= 0 || f.estados_secundarios.indexOf('reposicion_a_evaluar') >= 0));
    if (enRepos) { // demanda reciente (v1.3.0): solo cuando el motor la calculo
      var u = f.comparacion_reciente_relativa
        ? 'umbral del grupo: ' + nf.format(f.umbral_demanda_reciente) + ' (mediana de ' + esc(f.grupo_comparacion) + ': ' + nf.format(f.mediana_ventas_30d_grupo) + ', ' + nf.format(f.cantidad_productos_comparados_30d) + ' productos comparados)'
        : 'umbral fijo: ' + nf.format(f.umbral_demanda_reciente) + ' (grupo con menos de 5 productos con ventas recientes, sin exigir mediana)';
      c.appendChild(sec('Demanda reciente', kv([
        ['Resultado', (f.demanda_reciente ? 'Cumple' : 'No cumple') + ' — ' + u],
        ['Ventas últimos 30 días (respecto de «hasta»)', nf.format(f.Ventas_ultimos_30_dias || 0) + ' · última venta: ' + (f.dias_desde_ultima_venta == null ? 'sin ventas registradas' : 'hace ' + nf.format(f.dias_desde_ultima_venta) + ' días')],
        ['Stock operativo', nf.format((f.Stock_sucursales || 0) + (deposito(f) || 0))],
      ].concat(f.motivo_evaluacion ? [['Motivo de evaluación', RT_TEXTO_MOTIVO_EVALUACION[f.motivo_evaluacion] || f.motivo_evaluacion]] : []))));
    }
    var acel = RT_ACELERACION_CACHE.get(f.Codigo_producto), t;
    if (acel === 'loading' || acel === undefined) t = 'Calculando…'; else if (acel === 'error') t = 'No se pudo calcular.';
    else { var ev = evaluarAceleracion(acel); t = RT_TEXTO_ACELERACION[ev.estado] + ' — últimos 7 días: ' + nf.format(acel.recientes) + ' un., 7 días previos: ' + nf.format(acel.previos) + ' un.' + (acel.variacion != null ? ' (' + (acel.variacion >= 0 ? '+' : '') + rtOportunidadesPct(acel.variacion) + ')' : ''); }
    c.appendChild(sec('Tendencia de ventas (7 días vs 7 días previos)', t));
    return c;
  }

  // ---------- Sucursales ----------
  function pestanaSucursales(f) {
    var c = el('div'), resp = RT_OPORTUNIDADES, ps = f.por_sucursal;
    var t = el('table', 'cds-mini'); t.appendChild(el('caption', 'cds-sr', 'Ventas y stock por sucursal de ' + f.Codigo_producto));
    var th = el('thead'), tr = el('tr'); ['Sucursal', 'Ventas', 'Stock'].forEach(function (x, i) { tr.appendChild(el('th', i ? 'r' : '', x, { scope: 'col' })); }); th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody');
    RT_CENTROS.filter(function (cc) { return !resp.sucursales || resp.sucursales.indexOf(cc) >= 0; }).forEach(function (cc) {
      var s = ps && ps[cc], r = el('tr'), a = el('td'); a.appendChild(rtSucursalBadge(cc)); r.appendChild(a);
      r.appendChild(el('td', 'r', s ? nf.format(s.ventas) : '—')); r.appendChild(el('td', 'r', s ? nf.format(s.stock) : '—')); tb.appendChild(r);
    });
    t.appendChild(tb); c.appendChild(t);
    if (ps) {
      var rel = calcularDesbalance(ps).map(function (d) { return Object.assign({}, d, evaluarDesbalance(d)); }).filter(function (d) { return d.estado === 'deficit_relativo' || d.estado === 'superavit_relativo'; });
      var cont = el('div');
      if (rel.length) rel.forEach(function (d) { var l = el('div', 'cds-suc-fila'); l.appendChild(rtSucursalBadge(d.centro)); l.appendChild(el('span', null, RT_TEXTO_DESBALANCE[d.estado] + ' — ' + rtOportunidadesPct(d.participacionVentas) + ' de ventas, ' + rtOportunidadesPct(d.participacionStock) + ' de stock')); cont.appendChild(l); });
      else cont.appendChild(el('p', null, 'Equilibrado entre las sucursales evaluadas (dentro del umbral de ' + rtOportunidadesPct(RT_DESBALANCE_UMBRAL) + ').'));
      c.appendChild(sec('Desbalance entre sucursales', cont));
    }
    return c;
  }

  // ---------- armado ----------
  function trampaFoco(aside, e) {
    if (e.key !== 'Tab') return;
    var f = [].filter.call(aside.querySelectorAll('button,[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])'), function (n) { return !n.disabled && n.offsetParent !== null; });
    if (!f.length) return; var p = f[0], u = f[f.length - 1];
    if (e.shiftKey && document.activeElement === p) { e.preventDefault(); u.focus(); } else if (!e.shiftKey && document.activeElement === u) { e.preventDefault(); p.focus(); }
  }
  function dibujar(host) {
    var cod = RT_OPORTUNIDADES_EXPANDIDO, lista = RT_OPORTUNIDADES, f = cod && lista && lista.data ? lista.data.filter(function (x) { return x.Codigo_producto === cod; })[0] : null;
    if (!f) { ultimoCodigo = null; return; }
    var nuevo = ultimoCodigo !== cod; if (nuevo) { tab = 'resumen'; scrollGuardado = 0; focoGuardado = null; } ultimoCodigo = cod;
    var cerrar = function () { // cierra y devuelve el foco al boton de la fila (aunque el click haya dejado el foco en otro contenedor)
      rtOportunidadesToggleDetalle(cod);
      var b = [].filter.call(document.querySelectorAll('[data-detalle-codigo="' + String(cod).replace(/"/g, '') + '"]'), function (x) { return x.offsetParent !== null; })[0];
      if (b) b.focus({ preventScroll: true });
    };
    var raiz = el('div', 'cds-dr-raiz');
    var scrim = el('div', 'cds-dr-scrim'); scrim.addEventListener('click', cerrar); raiz.appendChild(scrim);
    var a = el('aside', 'cds-dr', null, { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cdsDrTitulo' }); var fam = R().familia(f.estado_principal); if (fam) a.setAttribute('data-cds-g', fam);
    a.appendChild(cabecera(f, cerrar));
    var cuerpo = el('div', 'cds-dr-cuerpo', null, { id: 'cdsDrCuerpo', role: 'tabpanel', 'aria-labelledby': 'cdsTab_' + tab, tabindex: '0' });
    var resp = lista;
    cuerpo.appendChild(tab === 'motivos' ? pestanaMotivos(f, resp) : tab === 'ingreso' ? pestanaIngreso(f, resp) : tab === 'sucursales' ? pestanaSucursales(f) : pestanaResumen(f, resp));
    a.appendChild(cuerpo);
    a.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } else trampaFoco(a, e); });
    a.addEventListener('focusin', function (e) { var k = e.target.closest && e.target.closest('[data-fk]'); focoGuardado = k ? k.getAttribute('data-fk') : null; });
    cuerpo.addEventListener('scroll', function () { scrollGuardado = cuerpo.scrollTop; });
    raiz.appendChild(a); host.appendChild(raiz);
    cuerpo.scrollTop = scrollGuardado;
    var objetivo = nuevo ? a.querySelector('[data-fk="x"]') : (focoGuardado ? a.querySelector('[data-fk="' + focoGuardado + '"]') : null);
    if (objetivo) objetivo.focus({ preventScroll: true });
    var sel = pendientesTabs && pendientesTabs.querySelector('[aria-selected=true]'); // la pestaña elegida siempre queda a la vista en el desplazamiento horizontal
    if (sel && pendientesTabs.scrollWidth > pendientesTabs.clientWidth) pendientesTabs.scrollLeft = Math.max(0, sel.offsetLeft - (pendientesTabs.clientWidth - sel.offsetWidth) / 2);
  }
  // Salir de Oportunidades cierra el detalle y no se reabre al volver (index.html lo llama desde rtCambiarVista).
  function cerrar() { RT_OPORTUNIDADES_EXPANDIDO = null; ultimoCodigo = null; scrollGuardado = 0; focoGuardado = null; try { OV_FOCO = null; } catch (e) { /* sin foco pendiente */ } }

  window.CDS_DETALLE = { dibujar: dibujar, cerrar: cerrar, pestana: function () { return tab; }, fijarPestana: function (t) { tab = t; } };
})();
