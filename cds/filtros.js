/* CROMA DESIGN SYSTEM 2.0 · Etapa B1: filtros y busqueda de Oportunidades (pendientes vs. aplicados).
   Se carga SOLO con la bandera cds-v3 encendida. Sin la bandera este archivo ni se descarga: el formulario legacy no cambia.
   No consulta la API ni calcula nada de negocio: solo compara el borrador del formulario con el filtro YA aplicado (RT_FILTRO) y avisa.
   Los ganchos estan en index.html (rtFormularioFiltro) y oportunidades-vista.js (renderRTOportunidades); ambos preguntan por window.CDS_FILTROS. */
(function () {
  'use strict';
  if (!document.documentElement.classList.contains('cds-v3')) return;

  var CAMPOS = ['buscar', 'marca', 'rubro', 'subrubro', 'talle', 'color'];
  var NOMBRES = { buscar: 'Búsqueda', marca: 'Marca', rubro: 'Rubro', subrubro: 'Subrubro', talle: 'Talle', color: 'Color' };
  var pendiente = null;      // { clave: rtFiltroKey() con el que se escribio, texto } -- el texto escrito y no aplicado sobrevive a los re-dibujos
  var ultimoEstado = null;   // <p> de estado del formulario vigente

  function limpiarEspacios(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }
  // Forma comparable de un filtro: mismos campos y orden, listas ordenadas, y { codigo } equivale a { buscar } (viene de otras vistas).
  function normalizar(f) {
    var o = {}; if (!f) return o;
    CAMPOS.forEach(function (c) {
      var v = f[c]; if (c === 'buscar' && !v && f.codigo) v = f.codigo;
      if (Array.isArray(v)) { if (v.length) o[c] = v.slice().sort(function (a, b) { return String(a).localeCompare(String(b), 'es'); }); }
      else if (v) o[c] = limpiarEspacios(v);
    });
    return o;
  }
  function clave(f) { return JSON.stringify(normalizar(f)); }
  // Campos cuyo valor del borrador difiere del filtro aplicado (nombres legibles).
  function cambios(texto) {
    var a = normalizar(typeof RT_FILTRO !== 'undefined' ? RT_FILTRO : null);
    var n = normalizar(rtFiltroDesdeBorrador(texto));
    return CAMPOS.filter(function (c) { return JSON.stringify(a[c] || null) !== JSON.stringify(n[c] || null); }).map(function (c) { return NOMBRES[c]; });
  }
  function hayDatosCargadosOEnCurso() { return RT_OPORTUNIDADES_LOADING || (RT_OPORTUNIDADES && !RT_OPORTUNIDADES_ERROR); }

  window.CDS_FILTROS = {
    normalizar: normalizar, clave: clave, cambios: cambios,
    // Texto del buscador al dibujar el formulario: el escrito y sin aplicar (si sigue siendo sobre el mismo filtro aplicado) o el aplicado.
    textoInicial: function (aplicado) { return pendiente && pendiente.clave === rtFiltroKey() ? pendiente.texto : aplicado; },
    alEscribir: function (texto) { pendiente = { clave: rtFiltroKey(), texto: texto }; },
    alAplicar: function () { pendiente = null; }, // lo escrito pasa a ser el filtro aplicado
    hayPendiente: function () { return pendiente !== null; },
    // Aplicar sin cambios no repite la consulta: mismo filtro y la lista ya esta cargada (o cargandose). Un error o una lista vacia por falla SI se reintenta.
    sinCambios: function (filtro) { return clave(filtro) === clave(RT_FILTRO) && Boolean(hayDatosCargadosOEnCurso()); },
    avisarSinCambios: function () { if (ultimoEstado) { ultimoEstado.textContent = 'Sin cambios: los filtros ya están aplicados.'; ultimoEstado.setAttribute('data-estado', 'sin-cambios'); } },
    // Limpiar: descarta el borrador; si habia un filtro aplicado lo quita (una consulta), si solo habia cambios sin aplicar NO consulta.
    limpiar: function (quitarAplicado) {
      pendiente = null;
      RT_FILTRO_BORRADOR = { marca: new Set(), rubro: new Set(), subrubro: new Set(), talle: new Set(), color: new Set() };
      RT_FILTRO_BUSQUEDA = { marca: '', rubro: '', subrubro: '', talle: '', color: '' };
      if (RT_FILTRO) quitarAplicado(); else rtRenderVistaActual();
    },
    // Estado visual del formulario: boton Aplicar con marca de pendiente, aviso accesible y Limpiar habilitado si hay algo que descartar.
    montar: function (o) {
      var est = document.createElement('p');
      est.className = 'cds-filtros-estado'; est.id = 'cdsFiltrosEstado'; est.setAttribute('role', 'status'); est.setAttribute('aria-live', 'polite');
      o.form.appendChild(est); ultimoEstado = est;
      o.btnFiltrar.setAttribute('aria-describedby', 'cdsFiltrosEstado');
      function refrescar() {
        var c = cambios(o.inCodigo.value), hay = c.length > 0;
        o.btnFiltrar.classList.toggle('cds-pendiente', hay);
        o.form.classList.toggle('cds-hay-pendientes', hay);
        o.btnLimpiar.disabled = !(RT_FILTRO || hay);
        est.textContent = hay ? 'Cambios sin aplicar: ' + c.join(', ') + '. La lista sigue mostrando los filtros aplicados.' : '';
        est.setAttribute('data-estado', hay ? 'pendiente' : '');
      }
      o.inCodigo.addEventListener('input', function () { window.CDS_FILTROS.alEscribir(o.inCodigo.value); refrescar(); });
      refrescar();
    },
    // Dos cifras con nombre propio: la lista de la consulta actual (paginacion.total) y el resumen de acciones (resumen.total_clasificados).
    // Nunca se suman, se restan ni se estiman a partir de una pagina; mientras se consulta no se muestra ninguna.
    resultados: function (host) {
      var p = document.createElement('p'); p.className = 'cds-resultados'; p.setAttribute('role', 'status');
      var nf = new Intl.NumberFormat('es-AR');
      var lista = RT_OPORTUNIDADES && !RT_OPORTUNIDADES_LOADING && !RT_OPORTUNIDADES_ERROR ? RT_OPORTUNIDADES : null;
      if (RT_OPORTUNIDADES_ERROR) { host.appendChild(p); p.textContent = 'No se pudo consultar: no hay resultados que mostrar.'; return; }
      if (!lista) { host.appendChild(p); p.textContent = 'Consultando…'; p.setAttribute('aria-busy', 'true'); return; }
      var cx = ovConteosActuales(), res = cx.conteos.total;
      function par(etiqueta, valor, ayuda) {
        var s = document.createElement('span'); s.className = 'cds-res-par'; if (ayuda) s.title = ayuda;
        // etiqueta y valor pueden ser [texto corto, resto]: en pantallas chicas el resto se oculta (el texto completo sigue en el DOM y en el titulo).
        function partes(nodo, v, sep) { var a = Array.isArray(v) ? v : [v, '']; nodo.appendChild(document.createTextNode(a[0])); if (a[1]) { var x = document.createElement('span'); x.className = 'cds-res-x'; x.textContent = a[1]; nodo.appendChild(x); } if (sep) nodo.appendChild(document.createTextNode(' ')); }
        partes(s, etiqueta, true); var b = document.createElement('b'); partes(b, valor, false); s.appendChild(b); return s;
      }
      p.appendChild(par(['Consulta actual', ' (' + ovTituloPanel() + ')'].map(function (x, i) { return i ? x + ':' : x; }), [nf.format(lista.paginacion.total), lista.paginacion.total === 1 ? ' producto' : ' productos'], 'Productos de la lista que estás viendo: respeta el grupo, el estado, la prioridad y los filtros aplicados.'));
      p.appendChild(par(['Resumen', ' de acciones:'], res === null ? '—' : [nf.format(res), ' con acción'], 'Respeta el período, las sucursales y los filtros aplicados; no cambia con el grupo, el estado ni la prioridad elegidos.'));
      // B2: «sin acción» (resumen.total_sin_clasificacion), los productos visibles en esta pagina y, si la lista esta mas acotada que el resumen, el aviso.
      var rs = (cx.base && cx.base.resumen) || {}, sin = typeof rs.total_sin_clasificacion === 'number' ? rs.total_sin_clasificacion : null;
      p.appendChild(par('Sin acción:', sin === null ? '—' : nf.format(sin), 'Productos evaluados a los que el motor no les detectó ninguna acción. Mismo alcance que el resumen de acciones.'));
      p.appendChild(par('En esta página:', nf.format(lista.data.length), 'Productos visibles ahora; la lista completa puede tener más páginas.'));
      var acotada = !(window.CDS_POR_ACCION && window.CDS_POR_ACCION.alcanceCompleto());
      if (acotada) { var n = document.createElement('span'); n.className = 'cds-res-nota'; n.textContent = 'El resumen y «sin acción» no cambian con el grupo, el estado ni la prioridad elegidos.'; p.appendChild(n); }
      host.appendChild(p);
    },
  };
  // Si el script llega despues del primer dibujo de Oportunidades, se vuelve a dibujar para que aparezca el estado.
  try { if (typeof RT_VIEW !== 'undefined' && RT_VIEW === 'oportunidades' && typeof rtRenderVistaActual === 'function') rtRenderVistaActual(); } catch (e) { /* sin efecto */ }
})();
