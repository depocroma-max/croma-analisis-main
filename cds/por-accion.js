/* CROMA DESIGN SYSTEM 2.0 · Etapa B2: Oportunidades «Por acción» y «Lista». Se carga SOLO con la bandera cds-v3 encendida.
   No clasifica, no ordena y no calcula totales de negocio: agrupa la pagina que entrega el servidor por `estado_principal` (en el orden en que
   llega) y muestra unicamente contadores que trae la API (resumen.por_estado_principal, total_clasificados, total_sin_clasificacion, total_evaluados).
   Los ganchos estan en oportunidades-vista.js y preguntan por window.CDS_POR_ACCION: sin la bandera no existe y la vista es la de siempre. */
(function () {
  'use strict';
  if (!document.documentElement.classList.contains('cds-v3')) return;

  var SIN = '__sin_accion__';
  var vista = 'accion'; // 'accion' (predeterminada) | 'lista'. Solo cambia el dibujo: no toca filtros ni consulta nada.
  var nf = new Intl.NumberFormat('es-AR');

  function numero(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function el(tag, cls, texto) { var e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto; return e; }

  // "Completo": la lista trae todos los productos de la consulta de catalogo (grupo Todos, sin estado, prioridad ni filtros de rotacion). Solo asi los
  // contadores del resumen describen exactamente lo que se pagina; con cualquier otro recorte el total de cada grupo NO esta disponible.
  function alcanceCompleto() { return RT_OPORTUNIDADES_GRUPO === 'todas' && !RT_OPORTUNIDADES_ESTADO && !ovHayFiltroExtra(); }

  // Agrupa una pagina conservando el orden del servidor: un grupo por estado principal (null = sin accion) en orden de aparicion; sin repetidos.
  function agrupar(filas) {
    var grupos = [], idx = {}, vistos = {}, repetidos = 0;
    filas.forEach(function (f) {
      var c = f.Codigo_producto; if (vistos[c]) { repetidos++; return; } vistos[c] = true;
      var e = f.estado_principal || null, k = e === null ? SIN : e, g = idx[k];
      if (!g) { g = { clave: k, estado: e, filas: [] }; idx[k] = g; grupos.push(g); }
      g.filas.push(f);
    });
    return { grupos: grupos, repetidos: repetidos };
  }

  // Contadores por grupo respaldados por la API. fiable=false => ningun grupo muestra total (no disponible), con el motivo.
  function contadores(lista, completo) {
    var out = { fiable: false, porClave: {}, motivo: '' };
    if (!completo) { out.motivo = 'alcance'; return out; }
    var r = (lista && lista.resumen) || {}, pe = r.por_estado_principal, ev = numero(r.total_evaluados), sin = numero(r.total_sin_clasificacion);
    if (!pe || ev === null || sin === null || !lista.paginacion) { out.motivo = 'sin-datos'; return out; }
    var suma = 0, ok = true;
    Object.keys(pe).forEach(function (k) { var v = numero(pe[k]); if (v === null) ok = false; else suma += v; });
    if (!ok || suma + sin !== ev || ev !== lista.paginacion.total) { out.motivo = 'inconsistente'; return out; }
    Object.keys(pe).forEach(function (k) { out.porClave[k] = pe[k]; });
    out.porClave[SIN] = sin; out.fiable = true; return out;
  }

  var MOTIVOS = {
    alcance: 'Con el grupo, estado o prioridad elegidos, la API no entrega el total por acción: se muestran solo los de esta página.',
    'sin-datos': 'La API no entregó los contadores por acción de esta consulta.',
    inconsistente: 'Los contadores de la API no coinciden con el total de la lista: no se muestran para no confundir.',
  };

  function textoGrupo(g) { return g.estado === null ? 'Sin acción' : rrTextoEstado(g.estado); }
  function familia(estado) { return estado === null ? null : (typeof ogGrupoDeEstado === 'function' ? ogGrupoDeEstado(estado) : null); }
  function ayudaGrupo(g) {
    if (g.estado === null) return 'Productos evaluados en el período a los que el motor no les detectó ninguna acción.';
    var fam = familia(g.estado); return fam ? ogGrupo(fam).ayuda : '';
  }

  function cabecera(g, k, cont, pos, pag) {
    var h = el('header', 'cds-grupo-cab'), tit = el('div', 'cds-grupo-tit');
    var punto = el('span', 'cds-grupo-punto'); punto.setAttribute('aria-hidden', 'true'); tit.appendChild(punto);
    var t = el('h4', 'cds-grupo-nombre', textoGrupo(g)); t.id = 'cdsGrupo_' + g.clave; tit.appendChild(t); h.appendChild(tit);
    var total = cont.fiable ? cont.porClave[g.clave] : undefined, cuenta = el('div', 'cds-grupo-cuenta');
    if (numero(total) !== null) {
      var b = el('b', null, nf.format(total)); cuenta.appendChild(b); cuenta.appendChild(document.createTextNode(total === 1 ? ' producto' : ' productos'));
      if (g.filas.length < total) { cuenta.appendChild(el('span', 'cds-grupo-pag', ' · ' + nf.format(g.filas.length) + ' en esta página, el resto en otras páginas')); cuenta.setAttribute('data-continua', 'si'); }
    } else {
      cuenta.appendChild(el('b', null, nf.format(g.filas.length))); cuenta.appendChild(document.createTextNode(g.filas.length === 1 ? ' producto en esta página' : ' productos en esta página'));
      cuenta.appendChild(el('span', 'cds-grupo-nd', ' · total del grupo no disponible'));
      var seguir = (pos.primero && pag.offset > 0) || (pos.ultimo && pag.offset + pag.devueltos < pag.total);
      if (seguir) { cuenta.appendChild(el('span', 'cds-grupo-pag', ' · puede continuar en otra página')); cuenta.setAttribute('data-continua', 'quizas'); }
    }
    h.appendChild(cuenta);
    var ay = ayudaGrupo(g); if (ay) h.appendChild(el('p', 'cds-grupo-ayuda', ay));
    return h;
  }

  function dibujarGrupos(panel, lista, dias) {
    var ag = agrupar(lista.data), cont = contadores(lista, alcanceCompleto()), pag = lista.paginacion;
    var cont0 = el('div', 'cds-grupos'); cont0.setAttribute('data-vista', 'accion');
    if (!cont.fiable) { var n = el('p', 'cds-grupos-nota', MOTIVOS[cont.motivo] || ''); n.setAttribute('role', 'note'); cont0.appendChild(n); }
    if (ag.repetidos) cont0.appendChild(el('p', 'cds-grupos-nota', 'Se omitieron ' + ag.repetidos + ' producto(s) repetido(s) en esta página.'));
    ag.grupos.forEach(function (g, i) {
      var sec = el('section', 'cds-grupo'); sec.setAttribute('data-estado', g.clave); sec.setAttribute('aria-labelledby', 'cdsGrupo_' + g.clave);
      var fam = familia(g.estado); if (fam) sec.setAttribute('data-cds-g', fam);
      sec.appendChild(cabecera(g, g.filas.length, cont, { primero: i === 0, ultimo: i === ag.grupos.length - 1 }, pag));
      sec.appendChild(ovTabla(g.filas, lista, dias));
      sec.appendChild(ovTarjetas(g.filas, lista));
      cont0.appendChild(sec);
    });
    panel.appendChild(cont0);
  }

  function selector(host) {
    var g = el('div', 'cds-vista-sel'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', 'Forma de ver la lista');
    [['accion', 'Por acción'], ['lista', 'Lista']].forEach(function (p) {
      var b = el('button', 'cds-vista-btn' + (vista === p[0] ? ' cds-activo' : ''), p[1]); b.type = 'button'; b.setAttribute('aria-pressed', vista === p[0] ? 'true' : 'false'); b.setAttribute('data-vista', p[0]);
      b.addEventListener('click', function () { if (vista === p[0]) return; vista = p[0]; rtRenderVistaActual(); }); // solo se vuelve a dibujar: ni filtros ni consulta
      g.appendChild(b);
    });
    host.appendChild(g);
  }

  // Es perezoso porque oportunidades-grupos.js se carga al final del body y este script puede llegar antes.
  var preparado = false;
  function preparar() {
    if (preparado || typeof OG_GRUPOS === 'undefined') return; preparado = true;
    var t = OG_GRUPOS[0]; t.etiqueta = 'Todos'; t.ayuda = 'Todos los productos evaluados: con alguna acción detectada y sin acción.';
  }

  window.CDS_POR_ACCION = {
    SIN: SIN, preparar: preparar, agrupar: agrupar, contadores: contadores, alcanceCompleto: alcanceCompleto, selector: selector,
    vista: function () { return vista; }, fijarVista: function (v) { vista = v; },
    // Con "Todos" sin estado la consulta NO envia `estado`: la API devuelve tambien los productos sin accion (evaluados).
    sinFiltroDeEstado: function () { preparar(); return RT_OPORTUNIDADES_GRUPO === 'todas' && !RT_OPORTUNIDADES_ESTADO; },
    // Contadores de las tarjetas: "Todos" = productos evaluados (resumen.total_evaluados), igual que el total de esa lista.
    ajustarConteos: function (cx) {
      preparar();
      var r = cx.base && cx.base.resumen, ev = r ? numero(r.total_evaluados) : null;
      cx.conteos.grupos.todas = ev; return cx;
    },
    // Dibuja la lista segun la vista. Devuelve false si debe dibujarse la tabla de siempre (vista Lista).
    lista: function (panel, lista, dias) { if (vista !== 'accion') return false; dibujarGrupos(panel, lista, dias); return true; },
  };
  // «Todos» incluye los productos sin accion (la API los devuelve cuando no se filtra por estado): se renombra la tarjeta solo con la bandera.
  try { if (typeof RT_VIEW !== 'undefined' && RT_VIEW === 'oportunidades' && typeof rtRenderVistaActual === 'function') rtRenderVistaActual(); } catch (e) { /* sin efecto */ }
})();
