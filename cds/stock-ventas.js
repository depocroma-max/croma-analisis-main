'use strict';
// CROMA DESIGN SYSTEM 2.0 · Stock Ventas con TODO el ancho. Solo con la bandera cds-v3 (se carga desde el bloque de index.html).
// Fija las columnas que IDENTIFICAN la fila (COD y Producto) para que sigan a la vista al desplazar la tabla en horizontal. No cambia datos,
// columnas, orden, filtros ni totales: solo agrega clases a celdas que ya existen (la tabla sigue armandola index.html) y mide el ancho de COD
// para posicionar a Producto justo a su lado. La tabla conserva su ancho natural (nada se angosta) y se desplaza dentro de su contenedor.
(function () {
  if (!document.documentElement.classList.contains('cds-v3')) return;
  var MIN_FIJAS_DOS = 1024, MIN_FIJA_UNA = 761; // ≥ 1024 px: COD + Producto; entre 761 y 1023: solo Producto; en movil ninguna (ocuparian demasiado)
  function texto(th) { return (th.textContent || '').replace(/[▲▼↑↓↕\s]+/g, ' ').trim().toUpperCase(); }
  function marcar(tabla) {
    var trh = tabla.querySelector('thead tr:last-child'); if (!trh) return;
    var ths = [].slice.call(trh.children), iCod = -1, iProd = -1;
    ths.forEach(function (th, i) { var t = texto(th); if (iCod < 0 && t === 'COD') iCod = i; else if (iProd < 0 && t === 'PRODUCTO') iProd = i; });
    var filas = tabla.querySelectorAll('thead tr, tbody tr, tfoot tr');
    for (var r = 0; r < filas.length; r++) {
      var c = filas[r].children; if (c.length !== ths.length) continue;
      if (iCod >= 0) c[iCod].classList.add('cds-sv-fijo', 'cds-sv-fijo-1');
      if (iProd >= 0) c[iProd].classList.add('cds-sv-fijo', 'cds-sv-fijo-2');
    }
    tabla.setAttribute('data-cds-sv', iCod >= 0 && iProd >= 0 ? 'dos' : (iProd >= 0 ? 'una' : 'ninguna'));
    medir(tabla);
  }
  function medir(tabla) {
    var wrap = tabla.closest('.rt-table-wrap'); if (!wrap) return;
    var th = tabla.querySelector('thead tr:last-child .cds-sv-fijo-1');
    wrap.style.setProperty('--cds-sv-w1', (th ? Math.round(th.getBoundingClientRect().width) : 0) + 'px');
    var f = function () { wrap.classList.toggle('cds-sv-desplazada', wrap.scrollLeft > 2); };
    if (!wrap.__cdsSv) { wrap.__cdsSv = true; wrap.addEventListener('scroll', f, { passive: true }); }
    f();
  }
  function revisar() {
    var ts = document.querySelectorAll('.rt-stockventas-tabla:not([data-cds-sv])');
    for (var i = 0; i < ts.length; i++) marcar(ts[i]);
  }
  var pendiente = false;
  function programar() { if (pendiente) return; pendiente = true; requestAnimationFrame(function () { pendiente = false; revisar(); }); }
  function iniciar() {
    var host = document.getElementById('rtPanelHost'); if (!host) return;
    if (window.MutationObserver) new MutationObserver(programar).observe(host, { childList: true, subtree: true });
    window.addEventListener('resize', function () { var ts = document.querySelectorAll('.rt-stockventas-tabla[data-cds-sv]'); for (var i = 0; i < ts.length; i++) medir(ts[i]); });
    revisar();
  }
  window.CdsStockVentas = { revisar: revisar, MIN_FIJAS_DOS: MIN_FIJAS_DOS, MIN_FIJA_UNA: MIN_FIJA_UNA };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
