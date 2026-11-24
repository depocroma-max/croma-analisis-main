/* CROMA DESIGN SYSTEM 2.0 · Etapa D1B: «Mis seguimientos» (interfaz). Solo con la bandera cds-v3. Depende de cds/seguimientos-api.js.
   - Sondea al cargar si la persona puede usar seguimientos (interruptor del servidor + rol + lista de habilitados). Si no: NO agrega nada (ni pestaña ni estrellas).
   - Estrellas «Seguir» en filas, tarjetas, detalle de Oportunidades, variantes y distribucion por sucursal (se enganchan a los atributos data-cds-* de C3 sin tocar esas vistas).
     El estado de TODAS las estrellas visibles se consulta por lote (una solicitud, maximo 100 claves por tanda), nunca una por producto.
   - Dialogo de alta (5 niveles, motivo opcional, avisos de duplicado/nivel superior), seccion «Mis seguimientos» y detalle (notas, historial, motivo, finalizar, reabrir).
   - El servidor decide TODO: propietario, permisos, versiones y referencia comercial. Aqui no se guarda nada comercial (ni en el almacenamiento del navegador): solo memoria de la pestaña.
   Todo el texto se inserta con textContent; los iconos son SVG estaticos propios. No hay graficos historicos ni novedades: la evolucion real es la etapa D2. */
(function () {
  'use strict';
  if (!document.documentElement.classList.contains('cds-v3')) return;

  var NS = 'http://www.w3.org/2000/svg';
  var ESTADO = { sondeo: 'pendiente', seguidas: {}, consultadas: {}, cliente: null };
  var vista = { q: '', nivel: '', centro: '', estado: 'activo', propietario: '', offset: 0, limit: 25, datos: null, total: 0, cargando: false, error: null, resumen: null, propietarios: null, abrirId: null, controller: null, version: 0 };
  var det = null;     // detalle abierto: { id, s, eventos, propio, cargando, error, aviso, enviando, editando, finalizando, borrador }
  var dlg = null;     // dialogo de alta abierto
  var toastTimer = null, escaneoPendiente = false, loteTimer = null, lotePendiente = {};

  function A() { return window.CDS_SEG_API; }
  function el(tag, cls, texto, attrs) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto;
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]); });
    return e;
  }
  function svg(d, cls) { var s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '18'); s.setAttribute('height', '18'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); if (cls) s.setAttribute('class', cls); var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.appendChild(p); return s; }
  var D_ESTRELLA = 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z', D_X = 'M6 6l12 12M18 6L6 18';
  var nf = new Intl.NumberFormat('es-AR');
  function fecha(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : '—'; }
  function fechaHora(iso) { try { return new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(iso || ''); } }
  function token() { return typeof getToken === 'function' ? getToken() : null; }
  function apiBase() { return typeof STOCK_API_URL !== 'undefined' ? STOCK_API_URL : ''; }
  function usuarioActual() { try { return typeof getUser === 'function' ? getUser() : null; } catch (e) { return null; } }

  // ---------- avisos accesibles ----------
  function regionViva() { var r = document.getElementById('cdsSegLive'); if (!r) { r = el('div', 'cds-sr', null, { id: 'cdsSegLive', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }); document.body.appendChild(r); } return r; }
  function anunciar(txt) { var r = regionViva(); r.textContent = ''; setTimeout(function () { r.textContent = txt; }, 30); }
  function toast(txt) {
    var t = document.getElementById('cdsSegToast'); if (!t) { t = el('div', 'cds-toast cds-ui', null, { id: 'cdsSegToast', 'data-cds': '' }); document.body.appendChild(t); }
    t.textContent = txt; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 4500); anunciar(txt);
  }

  // ---------- contexto de la pantalla (lo unico que el cliente informa; el servidor lo valida y solo lo usa de clave de busqueda) ----------
  function datosOportunidades() { return typeof RT_OPORTUNIDADES !== 'undefined' && RT_OPORTUNIDADES && RT_OPORTUNIDADES.data ? RT_OPORTUNIDADES : null; }
  function nombreProducto(cod) { var o = datosOportunidades(); if (!o) return null; for (var i = 0; i < o.data.length; i++) if (o.data[i].Codigo_producto === cod) return o.data[i].Nombre_producto || null; return null; }
  function contextoConsulta() {
    var o = datosOportunidades(); if (!o) return null;
    var per = o.periodo && o.periodo.desde && o.periodo.hasta ? o.periodo : null;
    var suc = Array.isArray(o.sucursales) && o.sucursales.length ? o.sucursales : (typeof RT_CENTROS !== 'undefined' && Array.isArray(RT_CENTROS) ? RT_CENTROS : null);
    if (!per || !suc) return null;
    return A().contextoDe(per.desde, per.hasta, suc);
  }

  // ---------- estrellas ----------
  function ctxDeClave(clave) { var p = A().parsearClave(clave); if (!p) return null; p.nombre = nombreProducto(p.cod); return p; }
  function clavePropia(ctx) { return A().claveCanonica(ctx.nivelInicial, ctx); }
  function etiquetaEstrella(ctx) { return 'Seguir ' + A().descripcionObjetivo({ nivel: ctx.nivelInicial, cod: ctx.cod, talle: ctx.talle, color: ctx.color, centro: ctx.centro }) + (ctx.nombre ? ' (' + ctx.nombre + ')' : ''); }
  function pintarEstrella(b) {
    var k = b.getAttribute('data-cds-seg-clave'), sigue = !!ESTADO.seguidas[k];
    b.setAttribute('aria-pressed', sigue ? 'true' : 'false');
    b.title = sigue ? 'Ya lo seguís: ver o gestionar' : 'Seguir';
  }
  function crearEstrella(ctx) {
    var k = clavePropia(ctx), b = el('button', 'cds-star cds-seg-estrella', null, { type: 'button', 'aria-label': etiquetaEstrella(ctx), 'aria-haspopup': 'dialog', 'data-cds-seg-clave': k });
    b.appendChild(svg(D_ESTRELLA, 'cds-i'));
    b.addEventListener('click', function (ev) { ev.stopPropagation(); ev.preventDefault(); abrirDialogo(ctx, b); });
    pintarEstrella(b); return b;
  }
  function colocar(destino, ctx, antes) {
    if (!destino || destino.querySelector(':scope > .cds-seg-estrella[data-cds-seg-clave="' + clavePropia(ctx).replace(/"/g, '') + '"]')) return;
    var b = crearEstrella(ctx); if (antes && antes.parentNode === destino) destino.insertBefore(b, antes); else destino.appendChild(b);
    pedirEstado(clavePropia(ctx));
  }
  function escanear() {
    if (ESTADO.sondeo !== 'habilitado') return;
    // 1) filas de tabla y tarjetas de Oportunidades (producto completo)
    var botones = document.querySelectorAll('.cds-fila [data-detalle-codigo], .cds-card [data-detalle-codigo]');
    for (var i = 0; i < botones.length; i++) {
      var cod = botones[i].getAttribute('data-detalle-codigo'), cont = botones[i].parentNode;
      colocar(cont, { cod: cod, nombre: nombreProducto(cod), nivelInicial: 'producto', origen: 'fila' }, botones[i]);
    }
    // 2) cabecera del detalle de un producto
    var cab = document.querySelector('.cds-dr-fila1');
    if (cab && typeof RT_OPORTUNIDADES_EXPANDIDO !== 'undefined' && RT_OPORTUNIDADES_EXPANDIDO) {
      var cd = RT_OPORTUNIDADES_EXPANDIDO; colocar(cab, { cod: cd, nombre: nombreProducto(cd), nivelInicial: 'producto', origen: 'detalle' }, cab.querySelector('.cds-dr-x'));
    }
    // 3) variantes por talle y color (tabla y tarjetas): ganchos data-cds-var de C3
    var vs = document.querySelectorAll('.cds-var-fila[data-cds-var]');
    for (var j = 0; j < vs.length; j++) {
      var p = A().parsearClave(vs[j].getAttribute('data-cds-var')); if (!p || p.nivel !== 'variante') continue;
      var dest = vs[j].querySelector('.cds-var-l1, .cds-var-card-cab'); if (!dest) continue;
      colocar(dest, { cod: p.cod, talle: p.talle, color: p.color, nombre: nombreProducto(p.cod), colorNombre: (vs[j].querySelector('.cds-var-color') || {}).textContent || null, nivelInicial: 'variante', origen: 'variante' });
    }
    // 4) distribucion por sucursal de una variante: ganchos data-cds-var-suc de C3
    var ss = document.querySelectorAll('tr[data-cds-var-suc]');
    for (var m = 0; m < ss.length; m++) {
      var q = A().parsearClave(ss[m].getAttribute('data-cds-var-suc')); if (!q || q.nivel !== 'variante_sucursal') continue;
      var c1 = ss[m].firstElementChild; if (!c1) continue;
      colocar(c1, { cod: q.cod, talle: q.talle, color: q.color, centro: q.centro, nombre: nombreProducto(q.cod), nivelInicial: 'variante_sucursal', origen: 'sucursal' });
    }
  }
  function programarEscaneo() { if (escaneoPendiente) return; escaneoPendiente = true; (window.requestAnimationFrame || setTimeout)(function () { escaneoPendiente = false; try { escanear(); } catch (e) { /* una falla de decoracion nunca rompe la pantalla */ } }); }
  function repintarEstrellas() { var bs = document.querySelectorAll('.cds-seg-estrella'); for (var i = 0; i < bs.length; i++) pintarEstrella(bs[i]); }

  // Consulta por LOTE: las claves nuevas se juntan unos milisegundos y salen en UNA sola solicitud.
  function pedirEstado(clave) {
    if (ESTADO.consultadas[clave]) return; ESTADO.consultadas[clave] = true; lotePendiente[clave] = true;
    clearTimeout(loteTimer); loteTimer = setTimeout(enviarLote, 40);
  }
  async function enviarLote() {
    var claves = Object.keys(lotePendiente); lotePendiente = {}; if (!claves.length || !ESTADO.cliente) return;
    try {
      var r = await ESTADO.cliente.claves(claves);
      claves.forEach(function (k) { if (r[k]) ESTADO.seguidas[k] = r[k]; else delete ESTADO.seguidas[k]; });
      repintarEstrellas();
    } catch (e) { claves.forEach(function (k) { delete ESTADO.consultadas[k]; }); /* se reintenta en el proximo escaneo; las estrellas quedan sin marcar */ }
  }
  function invalidarEstado() { ESTADO.consultadas = {}; lotePendiente = {}; programarEscaneo(); }

  // ---------- foco y dialogos ----------
  function enfocables(raiz) { return [].filter.call(raiz.querySelectorAll('button,[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])'), function (n) { return !n.disabled && !n.hidden && n.getClientRects().length > 0; }); }
  function trampa(raiz, ev) {
    if (ev.key !== 'Tab') return; var f = enfocables(raiz); if (!f.length) return; var a = f[0], z = f[f.length - 1];
    if (ev.shiftKey && (document.activeElement === a || !raiz.contains(document.activeElement))) { ev.preventDefault(); z.focus(); } else if (!ev.shiftKey && (document.activeElement === z || !raiz.contains(document.activeElement))) { ev.preventDefault(); a.focus(); }
  }
  function botonCerrar(etq, fn) { var b = el('button', 'cds-btn cds-btn--icon cds-btn--quiet', null, { type: 'button', 'aria-label': etq }); b.appendChild(svg(D_X, 'cds-i')); b.addEventListener('click', fn); return b; }
  function campo(id, etiqueta, ctl, ayuda) { var w = el('div', 'cds-seg-campo'); w.appendChild(el('label', 'cds-label', etiqueta, { for: id })); w.appendChild(ctl); if (ayuda) w.appendChild(el('p', 'cds-hint', ayuda, { id: id + 'Ayuda' })); return w; }
  function aviso(cls, txt, rol) { var n = el('div', 'cds-notice ' + (cls || ''), null, rol ? { role: rol } : null); n.appendChild(el('span', null, txt)); return n; }

  // =================== DIALOGO «SEGUIR» ===================
  function abrirDialogo(ctx, disparador) {
    if (dlg) return;
    var niveles = A().nivelesDisponibles(ctx);
    var inicial = niveles.filter(function (n) { return n.nivel === ctx.nivelInicial && n.disponible; })[0] || niveles.filter(function (n) { return n.disponible; })[0];
    dlg = { ctx: ctx, nivel: inicial.nivel, niveles: niveles, enviando: false, idem: A().nuevaClave(), huella: null, existentes: {}, estadoExistentes: 'cargando', disparador: disparador || document.activeElement, error: null, contexto: contextoConsulta() };
    dibujarDialogo(true); cargarExistentes();
  }
  async function cargarExistentes() {
    var d = dlg; if (!d) return; var ctx = d.ctx, claves = [];
    d.niveles.forEach(function (n) { if (n.disponible) claves.push(A().claveCanonica(n.nivel, ctx)); });
    try { var r = await ESTADO.cliente.claves(claves); if (dlg !== d) return; d.existentes = r; claves.forEach(function (k) { if (r[k]) ESTADO.seguidas[k] = r[k]; else delete ESTADO.seguidas[k]; }); repintarEstrellas(); d.estadoExistentes = 'listo'; }
    catch (e) { if (dlg !== d) return; d.estadoExistentes = 'error'; }
    actualizarAvisosDialogo();
  }
  function textoNivel(n) { return A().NIVELES.filter(function (x) { return x.id === n; })[0].etiqueta; }
  function objetivoActual() { var d = dlg; return Object.assign({}, d.ctx, { nivel: d.nivel }); }
  function actualizarAvisosDialogo() {
    var d = dlg, z = document.getElementById('cdsSegDlgAvisos'); if (!d || !z) return; z.textContent = '';
    var resumen = document.getElementById('cdsSegDlgQue'); if (resumen) resumen.textContent = A().descripcionObjetivo({ nivel: d.nivel, cod: d.ctx.cod, talle: d.ctx.talle, color: d.ctx.color, centro: d.ctx.centro }) + (d.ctx.nombre ? ' · ' + d.ctx.nombre : '');
    var propia = A().claveCanonica(d.nivel, d.ctx), ya = d.existentes[propia], bloqueado = !!ya;
    var kc = document.getElementById('cdsSegDlgClave'); if (kc) kc.textContent = propia;
    if (d.estadoExistentes === 'error') z.appendChild(aviso('', 'No se pudo comprobar si ya seguís esto. Podés continuar: el servidor evita los duplicados.', 'status'));
    if (ya) {
      var n = aviso('cds-notice--info', 'Ya seguís esto con un seguimiento activo. No se crea otro.', 'status');
      var ver = el('button', 'cds-btn cds-btn--sm', 'Ver seguimiento', { type: 'button' }); ver.addEventListener('click', function () { var id = ya.id; cerrarDialogo(true); irASeguimiento(id); }); n.appendChild(ver); z.appendChild(n);
    }
    var sup = A().clavesSuperiores(d.nivel, d.ctx).filter(function (s) { return d.existentes[s.clave]; });
    if (sup.length && !ya) {
      var n2 = aviso('', 'Ya seguís ' + sup.map(function (s) { return textoNivel(s.nivel).toLowerCase(); }).join(' y ') + ' que ya incluye' + (sup.length > 1 ? 'n' : '') + ' esto. Podés crear este seguimiento igual: los existentes no se modifican.', 'status');
      var v2 = el('button', 'cds-btn cds-btn--sm', 'Ver el existente', { type: 'button' }); v2.addEventListener('click', function () { var id = d.existentes[sup[0].clave].id; cerrarDialogo(true); irASeguimiento(id); }); n2.appendChild(v2); z.appendChild(n2);
    }
    if (d.error) { var e = aviso('cds-notice--error', d.error.mensaje, 'alert'); if (d.error.status === 409 && d.error.datos && d.error.datos.id_existente) { var v3 = el('button', 'cds-btn cds-btn--sm', 'Ver seguimiento', { type: 'button' }); v3.addEventListener('click', function () { var id = d.error.datos.id_existente; cerrarDialogo(true); irASeguimiento(id); }); e.appendChild(v3); } z.appendChild(e); }
    var env = document.getElementById('cdsSegDlgOk'); if (env) { env.disabled = d.enviando || bloqueado; env.setAttribute('aria-disabled', env.disabled ? 'true' : 'false'); }
  }
  function dibujarDialogo(primera) {
    var d = dlg, ctx = d.ctx;
    var titulo = el('h2', null, 'Seguir', { id: 'cdsSegDlgT' });
    var modal = el('div', 'cds-modal cds-ui cds-seg-dlg', null, { id: 'cdsSegDlg', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cdsSegDlgT', 'aria-describedby': 'cdsSegDlgQue', 'data-cds': '', style: 'z-index:1100;width:min(560px,calc(100% - 24px))' });
    modal.appendChild(el('div', 'cds-modal-h')); modal.firstChild.appendChild(titulo); modal.firstChild.appendChild(botonCerrar('Cerrar sin guardar', function () { cerrarDialogo(); }));
    var cuerpo = el('div', 'cds-modal-b');
    var que = el('p', 'cds-seg-que'); que.appendChild(el('span', 'cds-label', 'Vas a seguir')); que.appendChild(el('b', null, '', { id: 'cdsSegDlgQue' })); que.appendChild(el('small', 'cds-mono cds-seg-clave', '', { id: 'cdsSegDlgClave', title: 'Clave canónica: identifica este seguimiento de forma única' })); cuerpo.appendChild(que);
    var fs = el('fieldset', 'cds-seg-niveles'); fs.appendChild(el('legend', 'cds-label', 'Nivel de seguimiento'));
    d.niveles.forEach(function (n) {
      var lab = el('label', 'cds-seg-nivel' + (n.disponible ? '' : ' cds-seg-nivel--off')), r = el('input', null, null, { type: 'radio', name: 'cdsSegNivel', value: n.nivel, disabled: !n.disponible, 'aria-describedby': 'cdsSegNd_' + n.nivel });
      if (n.nivel === d.nivel) r.checked = true;
      r.addEventListener('change', function () { d.nivel = n.nivel; d.error = null; actualizarAvisosDialogo(); });
      lab.appendChild(r); var t = el('span', 'cds-seg-nivel-t'); t.appendChild(el('b', null, n.etiqueta)); t.appendChild(el('small', null, n.disponible ? n.ayuda : n.motivo, { id: 'cdsSegNd_' + n.nivel })); lab.appendChild(t); fs.appendChild(lab);
    });
    cuerpo.appendChild(fs);
    var ta = el('textarea', 'cds-textarea', null, { id: 'cdsSegMotivo', maxlength: '500', rows: '3', 'aria-describedby': 'cdsSegMotivoAyuda cdsSegMotivoCuenta', placeholder: 'Por qué lo seguís (opcional)' });
    var cc = el('span', 'cds-hint', '0 / 500', { id: 'cdsSegMotivoCuenta' });
    ta.addEventListener('input', function () { cc.textContent = ta.value.length + ' / 500'; d.error = null; });
    var w = campo('cdsSegMotivo', 'Motivo (opcional)', ta, 'Queda en el historial y podés editarlo después.'); w.lastChild.id = 'cdsSegMotivoAyuda'; w.appendChild(cc); cuerpo.appendChild(w);
    cuerpo.appendChild(el('p', 'cds-hint', 'Los valores comerciales de referencia (ventas y stock del momento) los toma el servidor de lo que ya calculó Oportunidades. Si no hay datos vigentes, el seguimiento se guarda igual y lo indica.'));
    cuerpo.appendChild(el('div', 'cds-seg-avisos', null, { id: 'cdsSegDlgAvisos' }));
    modal.appendChild(cuerpo);
    var pie = el('div', 'cds-modal-f'), cancelar = el('button', 'cds-btn', 'Cancelar', { type: 'button' }), ok = el('button', 'cds-btn cds-btn--primary', 'Seguir', { type: 'button', id: 'cdsSegDlgOk' });
    cancelar.addEventListener('click', function () { cerrarDialogo(); }); ok.addEventListener('click', enviarAlta);
    pie.appendChild(cancelar); pie.appendChild(ok); modal.appendChild(pie);
    var velo = el('div', 'cds-scrim cds-ui', null, { id: 'cdsSegDlgVelo', 'data-cds': '', style: 'z-index:1090' }); velo.addEventListener('click', function () { cerrarDialogo(); });
    modal.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); cerrarDialogo(); } else trampa(modal, ev); });
    document.body.appendChild(velo); document.body.appendChild(modal);
    actualizarAvisosDialogo();
    var inicial = fs.querySelector('input:checked') || ta; inicial.focus();
  }
  function cerrarDialogo(sinFoco) {
    var m = document.getElementById('cdsSegDlg'), v = document.getElementById('cdsSegDlgVelo'); var d = dlg; if (m) m.remove(); if (v) v.remove(); dlg = null;
    if (!sinFoco && d && d.disparador && d.disparador.isConnected && d.disparador.focus) d.disparador.focus();
  }
  async function enviarAlta() {
    var d = dlg; if (!d || d.enviando) return; // doble clic: el segundo clic no hace nada
    var ta = document.getElementById('cdsSegMotivo'), motivo = ta ? ta.value.trim() : '';
    var objetivo = A().objetivoDe(d.nivel, d.ctx), huella = JSON.stringify([objetivo, motivo]);
    if (d.huella !== null && d.huella !== huella) d.idem = A().nuevaClave(); // cambio el pedido: otra clave (el servidor rechaza reusar una con otros datos)
    d.huella = huella; d.enviando = true; d.error = null;
    var ok = document.getElementById('cdsSegDlgOk'); if (ok) { ok.textContent = 'Guardando…'; ok.setAttribute('aria-busy', 'true'); } actualizarAvisosDialogo();
    try {
      var r = await ESTADO.cliente.crear(objetivo, motivo || null, d.ctx.origen === 'fila' || d.ctx.origen === 'detalle' || d.ctx.origen === 'variante' || d.ctx.origen === 'sucursal' ? d.contexto : null, d.idem);
      var s = r.seguimiento; ESTADO.seguidas[s.clave] = { id: s.id }; ESTADO.consultadas[s.clave] = true; vista.datos = null; vista.resumen = null; repintarEstrellas();
      cerrarDialogo(true); var f = d.disparador; if (f && f.isConnected && f.focus) f.focus();
      toast('Seguimiento creado: ' + A().descripcionObjetivo(s));
    } catch (e) {
      if (dlg !== d) return; d.enviando = false; d.error = e.mensaje ? e : { mensaje: 'No se pudo crear el seguimiento.', status: 0 };
      if (e.status === 409 && e.datos && e.datos.id_existente) { var kk = A().claveCanonica(d.nivel, d.ctx); d.existentes[kk] = { id: e.datos.id_existente }; ESTADO.seguidas[kk] = { id: e.datos.id_existente }; repintarEstrellas(); }
      if (e.status === 401) d.error = e;
      var ok2 = document.getElementById('cdsSegDlgOk'); if (ok2) { ok2.textContent = 'Seguir'; ok2.removeAttribute('aria-busy'); } actualizarAvisosDialogo();
      var z = document.getElementById('cdsSegDlgAvisos'); if (z && z.querySelector('[role=alert]')) z.querySelector('[role=alert]').scrollIntoView({ block: 'nearest' });
    }
  }

  // =================== SECCION «MIS SEGUIMIENTOS» ===================
  function hostVista() { return document.getElementById('rtPanelHost'); }
  function renderVista(host) {
    var barra = document.getElementById('rtBar'); if (barra) barra.classList.add('ir-activa'); // el periodo global no aplica a esta seccion
    var raiz = el('section', 'cds-ui cds-seg-vista', null, { 'aria-labelledby': 'cdsSegH', 'data-cds': '' });
    var cab = el('header', 'cds-seg-cab'); var t = el('div'); t.appendChild(el('h2', null, 'Mis seguimientos', { id: 'cdsSegH' }));
    t.appendChild(el('p', 'cds-seg-sub', 'Productos y variantes que decidiste seguir. Son personales; solo administradores. La evolución en el tiempo llega en una próxima etapa.')); cab.appendChild(t); raiz.appendChild(cab);
    if (ESTADO.sondeo === 'no_disponible') { raiz.appendChild(vacio('error', 'Seguimientos no está disponible por ahora', (ESTADO.errorSondeo && ESTADO.errorSondeo.mensaje) || 'Reintentá en unos minutos.', 'Reintentar', function () { sondear(true); })); host.appendChild(raiz); return; }
    if (ESTADO.sondeo !== 'habilitado') { raiz.appendChild(vacio('', 'Seguimientos no está habilitado para tu usuario', 'Pedile a quien administra el sistema que te habilite.')); host.appendChild(raiz); return; }
    var zona = el('div', 'cds-seg-zona', null, { id: 'cdsSegZona' }); raiz.appendChild(zona); host.appendChild(raiz);
    if (!vista.propietarios) cargarPropietarios();
    dibujarZona(); if (vista.datos === null && !vista.cargando) cargarLista(); if (!vista.resumen) cargarResumen();
    if (vista.abrirId) { var id = vista.abrirId; vista.abrirId = null; abrirDetalle(id, null); }
  }
  function vacio(tipo, titulo, texto, accion, fn) {
    var v = el('div', 'cds-empty' + (tipo === 'error' ? ' cds-empty--error' : ''), null, tipo === 'error' ? { role: 'alert' } : { role: 'status' }); v.appendChild(el('h3', null, titulo)); v.appendChild(el('p', null, texto));
    if (accion) { var b = el('button', 'cds-btn', accion, { type: 'button' }); b.addEventListener('click', fn); v.appendChild(b); } return v;
  }
  function parametrosLista() {
    var p = { limit: vista.limit, offset: vista.offset }; if (vista.estado) p.estado = vista.estado; if (vista.nivel) p.nivel = vista.nivel; if (vista.centro) p.centro = vista.centro; if (vista.q.trim()) p.q = vista.q.trim();
    if (vista.propietario) p.propietario = vista.propietario; return p;
  }
  async function cargarLista() {
    if (vista.controller) vista.controller.abort(); var c = new AbortController(); vista.controller = c; vista.cargando = true; vista.error = null; var v = ++vista.version; dibujarZona();
    try { var r = await ESTADO.cliente.listar(parametrosLista(), c.signal); if (v !== vista.version) return; vista.datos = r.seguimientos; vista.total = r.total; vista.cargando = false; }
    catch (e) { if (e && e.name === 'AbortError') return; if (v !== vista.version) return; vista.cargando = false; vista.error = e; vista.datos = null; if (e.status === 401 || e.status === 403) ESTADO.sondeo = 'inactivo'; }
    dibujarZona();
  }
  async function cargarResumen() {
    var base = { limit: 1 }; if (vista.propietario) base.propietario = vista.propietario; var v = vista.version;
    try { var a = await ESTADO.cliente.listar(Object.assign({ estado: 'activo' }, base)), f = await ESTADO.cliente.listar(Object.assign({ estado: 'finalizado' }, base)); vista.resumen = { activos: a.total, finalizados: f.total }; }
    catch (e) { vista.resumen = { activos: null, finalizados: null }; } dibujarZona();
  }
  async function cargarPropietarios() { try { var r = await ESTADO.cliente.propietarios(); vista.propietarios = r.propietarios || []; } catch (e) { vista.propietarios = []; } dibujarZona(); }
  function refrescarVista() { vista.datos = null; vista.resumen = null; if (document.getElementById('cdsSegZona')) { cargarLista(); cargarResumen(); } }

  function esteMiId() { var u = usuarioActual(); return u; }
  function dibujarZona() {
    var z = document.getElementById('cdsSegZona'); if (!z) return; var foco = document.activeElement && document.activeElement.id; var pos = document.activeElement && document.activeElement.selectionStart; z.textContent = '';
    // resumen
    var rs = el('div', 'cds-seg-resumen', null, { role: 'group', 'aria-label': 'Resumen de seguimientos' });
    [['activo', 'Activos', vista.resumen && vista.resumen.activos], ['finalizado', 'Finalizados', vista.resumen && vista.resumen.finalizados]].forEach(function (x) {
      var b = el('button', 'cds-seg-tile', null, { type: 'button', 'aria-pressed': vista.estado === x[0] ? 'true' : 'false', id: 'cdsSegTile_' + x[0] });
      b.appendChild(el('span', 'cds-seg-tile-n', typeof x[2] === 'number' ? nf.format(x[2]) : '—')); b.appendChild(el('span', 'cds-seg-tile-l', x[1]));
      b.addEventListener('click', function () { vista.estado = vista.estado === x[0] ? '' : x[0]; vista.offset = 0; vista.datos = null; cargarLista(); }); rs.appendChild(b);
    });
    z.appendChild(rs);
    // filtros
    var fl = el('div', 'cds-seg-filtros', null, { role: 'search', 'aria-label': 'Buscar y filtrar seguimientos' });
    var bus = el('input', 'cds-input', null, { type: 'search', id: 'cdsSegBuscar', placeholder: 'Buscar por código o nombre', 'aria-label': 'Buscar por código o nombre', value: vista.q, autocomplete: 'off', maxlength: '80' }); bus.value = vista.q;
    var deb; bus.addEventListener('input', function () { vista.q = bus.value; clearTimeout(deb); deb = setTimeout(function () { vista.offset = 0; vista.datos = null; cargarLista(); }, 300); });
    fl.appendChild(bus);
    var sn = el('select', 'cds-select', null, { id: 'cdsSegNivel', 'aria-label': 'Filtrar por nivel' }); sn.appendChild(el('option', null, 'Todos los niveles', { value: '' })); A().NIVELES.forEach(function (n) { sn.appendChild(el('option', null, n.etiqueta, { value: n.id })); }); sn.value = vista.nivel;
    sn.addEventListener('change', function () { vista.nivel = sn.value; vista.offset = 0; vista.datos = null; cargarLista(); }); fl.appendChild(sn);
    var sc = el('select', 'cds-select', null, { id: 'cdsSegCentro', 'aria-label': 'Filtrar por sucursal' }); sc.appendChild(el('option', null, 'Todas las sucursales', { value: '' })); A().CENTROS.forEach(function (c) { sc.appendChild(el('option', null, A().NOMBRE_CENTRO[c] + ' (' + c + ')', { value: c })); }); sc.value = vista.centro;
    sc.addEventListener('change', function () { vista.centro = sc.value; vista.offset = 0; vista.datos = null; cargarLista(); }); fl.appendChild(sc);
    var so = el('select', 'cds-select', null, { id: 'cdsSegProp', 'aria-label': 'Ver seguimientos de' }); so.appendChild(el('option', null, 'Los míos', { value: '' })); so.appendChild(el('option', null, 'De todos los administradores (solo lectura)', { value: 'todos' }));
    (vista.propietarios || []).forEach(function (p) { so.appendChild(el('option', null, p.nombre + ' (' + p.activos + ' activos)', { value: p.tipo + ':' + p.sub })); }); so.value = vista.propietario;
    so.addEventListener('change', function () { vista.propietario = so.value; vista.offset = 0; vista.datos = null; vista.resumen = null; cargarLista(); cargarResumen(); }); fl.appendChild(so);
    z.appendChild(fl);
    if (vista.propietario) z.appendChild(aviso('cds-notice--info', 'Estás viendo seguimientos de otras personas. Podés consultarlos, no modificarlos; cada detalle que abras queda registrado.', 'status'));
    // contenido
    if (vista.cargando && vista.datos === null) { var c = el('div', 'cds-empty', null, { role: 'status', 'aria-busy': 'true' }); c.appendChild(el('p', null, 'Cargando seguimientos…')); z.appendChild(c); }
    else if (vista.error) z.appendChild(vacio('error', 'No se pudieron cargar los seguimientos', vista.error.mensaje, 'Reintentar', function () { vista.datos = null; cargarLista(); }));
    else if (vista.datos && !vista.datos.length) {
      var filtrando = vista.q.trim() || vista.nivel || vista.centro || vista.estado !== 'activo' || vista.propietario;
      z.appendChild(vacio('', filtrando ? 'Ningún seguimiento coincide' : 'Todavía no seguís nada', filtrando ? 'Probá con otros filtros o quitá la búsqueda.' : 'Usá la estrella «Seguir» en Oportunidades, en el detalle de un producto o en «Talle y color».'));
    } else if (vista.datos) { z.appendChild(tablaSeguimientos(vista.datos)); z.appendChild(cardsSeguimientos(vista.datos)); z.appendChild(paginador()); }
    if (foco) { var f = document.getElementById(foco); if (f) { f.focus({ preventScroll: true }); if (typeof pos === 'number' && f.setSelectionRange) { try { f.setSelectionRange(pos, pos); } catch (e) { /* tipos sin seleccion */ } } } }
  }
  function refCelda(s) {
    var r = s.referencia, w = el('span', 'cds-seg-ref');
    if (r.estado === 'no_disponible') { w.appendChild(el('span', 'cds-tag', 'Referencia no disponible', { title: A().REFERENCIA_MOTIVOS[r.motivo] || 'Sin referencia al iniciar' })); return w; }
    var v = r.datos && r.datos.valores || {}; w.appendChild(document.createTextNode('Ventas ' + (typeof v.ventas_netas_periodo === 'number' ? nf.format(v.ventas_netas_periodo) : '—') + ' · Stock ' + (typeof v.stock_sucursales === 'number' ? nf.format(v.stock_sucursales) : '—')));
    if (r.estado === 'parcial') w.appendChild(el('span', 'cds-tag', 'Parcial')); return w;
  }
  function estadoPildora(s) { return el('span', 'cds-status cds-status--' + s.estado, s.estado === 'activo' ? 'Activo' : 'Finalizado'); }
  function celdaSeg(s) {
    var w = el('div', 'cds-prod'); w.appendChild(el('b', 'cds-prod-nombre', (s.producto && s.producto.nombre) || ('Producto ' + s.cod)));
    var meta = el('div', 'cds-prod-meta'); meta.appendChild(el('span', 'cds-mono', s.cod)); meta.appendChild(el('span', null, A().descripcionObjetivo(s, true))); if (!s.propio) meta.appendChild(el('span', 'cds-flag', 'de ' + s.propietario.nombre)); w.appendChild(meta); return w;
  }
  function botonVer(s) { var b = el('button', 'cds-btn cds-btn--sm', 'Ver', { type: 'button', 'aria-haspopup': 'dialog', 'aria-label': 'Ver el seguimiento de ' + ((s.producto && s.producto.nombre) || s.cod) + ' (' + A().descripcionObjetivo(s) + ')', 'data-cds-seg-id': s.id }); b.addEventListener('click', function () { abrirDetalle(s.id, b); }); return b; }
  function nivelCorto(s) { return A().NIVELES.filter(function (n) { return n.id === s.nivel; })[0].corto; }
  function tablaSeguimientos(datos) {
    var wrap = el('div', 'cds-seg-tabla-w'), t = el('table', 'cds-seg-tabla'); t.appendChild(el('caption', 'cds-sr', 'Seguimientos'));
    var th = el('thead'), tr = el('tr'); ['Seguimiento', 'Nivel', 'Inicio', 'Motivo', 'Estado', 'Referencia al iniciar', ''].forEach(function (h) { var x = el('th', null, h || null, { scope: 'col' }); if (!h) x.appendChild(el('span', 'cds-sr', 'Detalle')); tr.appendChild(x); }); th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody'); datos.forEach(function (s) {
      var f = el('tr', 'cds-fila', null, { 'data-cds-seg-fila': s.id }); var c = function (cls, nodo) { var d = el('td', cls); if (typeof nodo === 'string') d.textContent = nodo; else d.appendChild(nodo); f.appendChild(d); };
      c('c-prod', celdaSeg(s)); c('', nivelCorto(s)); c('', fecha(s.desde_fecha)); c('cds-seg-mot', s.motivo || '—'); c('', estadoPildora(s)); c('', refCelda(s)); c('c-det', botonVer(s)); tb.appendChild(f);
    }); t.appendChild(tb); wrap.appendChild(t); return wrap;
  }
  function cardsSeguimientos(datos) {
    var ul = el('ul', 'cds-seg-cards', null, { 'aria-label': 'Seguimientos' });
    datos.forEach(function (s) {
      var li = el('li', 'cds-card cds-seg-card', null, { 'data-cds-seg-fila': s.id }), top = el('div', 'cds-card-top'); top.appendChild(celdaSeg(s)); top.appendChild(estadoPildora(s)); li.appendChild(top);
      var m = el('dl', 'cds-seg-card-m'); [['Nivel', nivelCorto(s)], ['Inicio', fecha(s.desde_fecha)], ['Motivo', s.motivo || '—']].forEach(function (p) { var d = el('div'); d.appendChild(el('dt', null, p[0])); d.appendChild(el('dd', null, p[1])); m.appendChild(d); }); li.appendChild(m);
      li.appendChild(refCelda(s)); var a = el('div', 'cds-seg-card-a'); a.appendChild(botonVer(s)); li.appendChild(a); ul.appendChild(li);
    }); return ul;
  }
  function paginador() {
    var p = el('nav', 'cds-pager', null, { 'aria-label': 'Paginación de seguimientos' }), desde = vista.total ? vista.offset + 1 : 0, hasta = Math.min(vista.offset + vista.limit, vista.total);
    p.appendChild(el('span', null, desde + '–' + hasta + ' de ' + nf.format(vista.total), { 'aria-live': 'polite' }));
    var g = el('span', 'cds-pages'), a = el('button', 'cds-btn cds-btn--sm', 'Anterior', { type: 'button', disabled: vista.offset <= 0 }), s = el('button', 'cds-btn cds-btn--sm', 'Siguiente', { type: 'button', disabled: vista.offset + vista.limit >= vista.total });
    a.addEventListener('click', function () { vista.offset = Math.max(0, vista.offset - vista.limit); vista.datos = null; cargarLista(); }); s.addEventListener('click', function () { vista.offset += vista.limit; vista.datos = null; cargarLista(); });
    g.appendChild(a); g.appendChild(s); p.appendChild(g); return p;
  }
  function irASeguimiento(id) { vista.abrirId = id; var t = document.querySelector('#rtTabs .tab[data-view="seguimientos"]'); if (document.getElementById('cdsSegZona') && RT_VIEW === 'seguimientos') { var i = vista.abrirId; vista.abrirId = null; abrirDetalle(i, null); } else if (t) t.click(); }

  // =================== DETALLE ===================
  async function abrirDetalle(id, disparador) {
    cerrarDetalle(true);
    det = { id: id, s: null, eventos: [], propio: false, cargando: true, error: null, aviso: null, enviando: false, editando: false, finalizando: false, borrador: { nota: '', motivo: '', motivoFin: '' }, disparador: disparador || document.activeElement, idemNota: A().nuevaClave(), notaHuella: null };
    dibujarDetalle(); await recargarDetalle();
  }
  async function recargarDetalle(mantener) {
    var d = det; if (!d) return; d.cargando = !d.s; if (!mantener) d.error = null;
    try { var r = await ESTADO.cliente.detalle(d.id); if (det !== d) return; d.s = r.seguimiento; d.eventos = r.eventos || []; d.propio = r.propio === true; d.cargando = false; d.errorCarga = null; }
    catch (e) { if (det !== d) return; d.cargando = false; if (!d.s) d.errorCarga = e; else d.error = e; }
    dibujarDetalle();
  }
  function cerrarDetalle(sinFoco) {
    var a = document.getElementById('cdsSegDet'), v = document.getElementById('cdsSegDetVelo'); if (a) a.remove(); if (v) v.remove(); var d = det; det = null;
    if (sinFoco || !d) return;
    var f = d.disparador && d.disparador.isConnected ? d.disparador : null; // la lista se vuelve a dibujar tras una accion: se busca el mismo «Ver» por su id
    if (!f) { var c = [].filter.call(document.querySelectorAll('[data-cds-seg-id="' + String(d.id).replace(/"/g, '') + '"]'), function (x) { return x.getClientRects().length; }); f = c[0] || null; }
    if (f && f.focus) f.focus();
  }
  function seccion(titulo, ...hijos) { var s = el('section', 'cds-sec'); s.appendChild(el('h3', null, titulo)); hijos.forEach(function (h) { if (h) s.appendChild(h); }); return s; }
  function kv(pares) { var d = el('dl', 'cds-kv'); pares.forEach(function (p) { d.appendChild(el('dt', null, p[0])); var dd = el('dd'); if (p[1] instanceof Node) dd.appendChild(p[1]); else dd.textContent = p[1]; d.appendChild(dd); }); return d; }
  function valorReferencia(k, v) { if (k === 'antiguedad_datos_s') return v < 90 ? v + ' s' : Math.round(v / 60) + ' min'; if (k === 'alcance') return String(v).replace(/_/g, ' '); return typeof v === 'number' ? nf.format(v) : String(v); }
  function bloqueReferencia(s) {
    var r = s.referencia;
    if (r.estado === 'no_disponible') { var n = el('div', 'cds-callout'); n.appendChild(el('b', null, 'Referencia no disponible')); n.appendChild(el('p', null, A().REFERENCIA_MOTIVOS[r.motivo] || 'No había datos comerciales confiables al iniciar el seguimiento.')); n.appendChild(el('p', 'cds-hint', 'El seguimiento quedó creado igual. Los valores no se reconstruyen después: la referencia es lo que había en ese momento.')); return n; }
    var dat = r.datos || {}, w = el('div'), pares = [];
    Object.keys(A().REFERENCIA_ETIQUETAS).forEach(function (k) { if (dat.valores && dat.valores[k] !== undefined && dat.valores[k] !== null) pares.push([A().REFERENCIA_ETIQUETAS[k], valorReferencia(k, dat.valores[k])]); });
    if (dat.valores && dat.valores.alcance) pares.push(['Alcance', valorReferencia('alcance', dat.valores.alcance)]);
    if (dat.periodo) pares.push(['Período', fecha(dat.periodo.desde) + ' al ' + fecha(dat.periodo.hasta)]); if (dat.sucursales) pares.push(['Sucursales', dat.sucursales.join(', ')]);
    pares.push(['Fuente', A().FUENTES[dat.fuente] || String(dat.fuente || '—').replace(/_/g, ' ')]); pares.push(['Capturado', fechaHora(dat.capturado_en)]);
    if (r.estado === 'parcial') w.appendChild(el('p', 'cds-hint', 'La referencia es parcial: faltan algunos datos.')); w.appendChild(kv(pares)); return w;
  }
  function dibujarDetalle() {
    var d = det; if (!d) return; var previo = document.getElementById('cdsSegDet'), scroll = previo && previo.querySelector('.cds-drawer-b') ? previo.querySelector('.cds-drawer-b').scrollTop : 0, foco = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-fk');
    if (previo) previo.remove(); var velo = document.getElementById('cdsSegDetVelo'); if (!velo) { velo = el('div', 'cds-scrim cds-ui', null, { id: 'cdsSegDetVelo', 'data-cds': '', style: 'z-index:1090' }); velo.addEventListener('click', function () { cerrarDetalle(); }); document.body.appendChild(velo); }
    var s = d.s, a = el('aside', 'cds-drawer cds-ui cds-seg-det', null, { id: 'cdsSegDet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cdsSegDetT', 'data-cds': '', style: 'z-index:1100' });
    var cab = el('header', 'cds-drawer-h'), f1 = el('div', 'cds-seg-det-f1'), id = el('div'); id.appendChild(el('h2', 'cds-dr-titulo', s ? ((s.producto && s.producto.nombre) || s.cod) : 'Seguimiento', { id: 'cdsSegDetT' }));
    if (s) { var mt = el('p', 'cds-dr-meta'); mt.appendChild(el('span', 'cds-mono', s.cod)); var mr = s.producto ? [s.producto.marca, s.producto.rubro, s.producto.subrubro].filter(Boolean).join(' · ') : ''; if (mr) mt.appendChild(document.createTextNode(' · ' + mr)); id.appendChild(mt); }
    f1.appendChild(id); var x = botonCerrar('Cerrar el seguimiento', function () { cerrarDetalle(); }); x.setAttribute('data-fk', 'cerrar'); f1.appendChild(x); cab.appendChild(f1);
    if (s) { var pil = el('div', 'cds-seg-det-pil'); pil.appendChild(estadoPildora(s)); pil.appendChild(el('span', 'cds-tag', nivelCorto(s))); if (!d.propio) pil.appendChild(el('span', 'cds-tag', 'Solo lectura')); cab.appendChild(pil); }
    a.appendChild(cab);
    var cu = el('div', 'cds-drawer-b');
    if (d.cargando) cu.appendChild(el('p', 'cds-empty', 'Cargando…', { role: 'status', 'aria-busy': 'true' }));
    else if (d.errorCarga) cu.appendChild(vacio('error', 'No se pudo abrir el seguimiento', d.errorCarga.mensaje, d.errorCarga.status === 404 ? null : 'Reintentar', function () { d.errorCarga = null; d.cargando = true; dibujarDetalle(); recargarDetalle(); }));
    else if (s) {
      if (d.aviso) cu.appendChild(aviso('cds-notice--info', d.aviso, 'status'));
      if (d.error) cu.appendChild(aviso('cds-notice--error', d.error.mensaje, 'alert'));
      if (!d.propio) cu.appendChild(aviso('cds-notice--info', 'Es un seguimiento de ' + s.propietario.nombre + '. Estás en modo lectura y esta consulta quedó registrada.', 'status'));
      var fin = s.finalizado; var pares = [['Qué se sigue', A().descripcionObjetivo(s)], ['Inicio', fecha(s.desde_fecha)], ['Creado por', s.creado_por.nombre + ' · ' + fechaHora(s.creado_en)]];
      if (fin) { pares.push(['Finalizado', fechaHora(fin.en) + ' por ' + fin.por.nombre]); if (fin.motivo) pares.push(['Motivo de cierre', fin.motivo]); }
      cu.appendChild(seccion('Información inicial', kv(pares)));
      cu.appendChild(bloqueMotivo(d, s)); cu.appendChild(seccion('Referencia al iniciar', bloqueReferencia(s)));
      cu.appendChild(bloqueNotas(d, s)); cu.appendChild(bloqueHistorial(d));
    }
    a.appendChild(cu);
    if (s && d.propio) a.appendChild(pieDetalle(d, s));
    a.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); cerrarDetalle(); } else trampa(a, ev); });
    document.body.appendChild(a); var nb = a.querySelector('.cds-drawer-b'); if (nb) nb.scrollTop = scroll;
    var f = foco && a.querySelector('[data-fk="' + foco + '"]'); (f || a.querySelector('[data-fk="cerrar"]')).focus({ preventScroll: true });
  }
  function bloqueMotivo(d, s) {
    var sec = seccion('Motivo');
    if (d.editando && d.propio) {
      var ta = el('textarea', 'cds-textarea', null, { id: 'cdsSegMotivoEd', maxlength: '500', rows: '3', 'aria-label': 'Motivo del seguimiento', 'data-fk': 'motivo' }); ta.value = d.borrador.motivo; ta.addEventListener('input', function () { d.borrador.motivo = ta.value; });
      var g = el('div', 'cds-seg-acciones'), ok = el('button', 'cds-btn cds-btn--primary cds-btn--sm', 'Guardar motivo', { type: 'button', disabled: d.enviando, 'data-fk': 'motivo_ok' }), no = el('button', 'cds-btn cds-btn--sm', 'Cancelar', { type: 'button', 'data-fk': 'motivo_no' });
      ok.addEventListener('click', function () { accion(function () { return ESTADO.cliente.editarMotivo(s.id, s.version, d.borrador.motivo.trim() || null); }, 'Motivo actualizado.', function () { d.editando = false; }); });
      no.addEventListener('click', function () { d.editando = false; dibujarDetalle(); }); g.appendChild(ok); g.appendChild(no); sec.appendChild(ta); sec.appendChild(g); return sec;
    }
    sec.appendChild(el('p', s.motivo ? 'cds-seg-motivo' : 'cds-hint', s.motivo || 'Sin motivo.'));
    if (d.propio && s.estado === 'activo') { var b = el('button', 'cds-btn cds-btn--sm', 'Editar motivo', { type: 'button', 'data-fk': 'motivo_editar' }); b.addEventListener('click', function () { d.editando = true; d.borrador.motivo = s.motivo || ''; dibujarDetalle(); var t = document.getElementById('cdsSegMotivoEd'); if (t) t.focus(); }); sec.appendChild(b); }
    return sec;
  }
  function bloqueNotas(d, s) {
    var sec = seccion('Agregar una nota');
    if (!d.propio) { sec.appendChild(el('p', 'cds-hint', 'Solo quien creó el seguimiento puede agregar notas.')); return sec; }
    var ta = el('textarea', 'cds-textarea', null, { id: 'cdsSegNota', maxlength: '2000', rows: '3', 'aria-label': 'Texto de la nota', placeholder: 'Qué observaste, qué decidiste…', 'data-fk': 'nota' }); ta.value = d.borrador.nota; ta.addEventListener('input', function () { d.borrador.nota = ta.value; });
    var b = el('button', 'cds-btn cds-btn--sm', d.enviando ? 'Guardando…' : 'Agregar nota', { type: 'button', disabled: d.enviando, 'data-fk': 'nota_ok' });
    b.addEventListener('click', function () {
      var texto = d.borrador.nota.trim(); if (!texto) { d.error = { mensaje: 'Escribí el texto de la nota.' }; dibujarDetalle(); var t = document.getElementById('cdsSegNota'); if (t) t.focus(); return; }
      if (d.notaHuella !== null && d.notaHuella !== texto) d.idemNota = A().nuevaClave(); d.notaHuella = texto;
      accion(function () { return ESTADO.cliente.agregarNota(s.id, texto, d.idemNota); }, 'Nota agregada.', function () { d.borrador.nota = ''; d.idemNota = A().nuevaClave(); d.notaHuella = null; });
    });
    sec.appendChild(ta); sec.appendChild(b); return sec;
  }
  function bloqueHistorial(d) {
    var sec = seccion('Historial de acciones'), ol = el('ol', 'cds-timeline', null, { 'aria-label': 'Historial, del más reciente al más antiguo' });
    d.eventos.slice().reverse().forEach(function (e) {
      var li = el('li'), c = el('div'); c.appendChild(el('b', null, A().EVENTOS[e.tipo] || e.tipo)); if (e.texto) c.appendChild(el('p', 'cds-seg-ev-t', e.texto));
      c.appendChild(el('small', null, e.usuario.nombre + ' · ' + fechaHora(e.en))); li.appendChild(c); ol.appendChild(li);
    }); sec.appendChild(ol); return sec;
  }
  function pieDetalle(d, s) {
    var f = el('footer', 'cds-drawer-f');
    if (s.estado === 'activo') {
      if (d.finalizando) {
        var w = el('div', 'cds-seg-fin'), ta = el('textarea', 'cds-textarea', null, { id: 'cdsSegMotivoFin', maxlength: '500', rows: '2', 'aria-label': 'Motivo de cierre (opcional)', placeholder: 'Motivo de cierre (opcional)', 'data-fk': 'fin_motivo' }); ta.value = d.borrador.motivoFin; ta.addEventListener('input', function () { d.borrador.motivoFin = ta.value; });
        var ok = el('button', 'cds-btn cds-btn--danger', d.enviando ? 'Finalizando…' : 'Confirmar finalización', { type: 'button', disabled: d.enviando, 'data-fk': 'fin_ok' }), no = el('button', 'cds-btn', 'Cancelar', { type: 'button', 'data-fk': 'fin_no' });
        ok.addEventListener('click', function () { accion(function () { return ESTADO.cliente.finalizar(s.id, s.version, d.borrador.motivoFin.trim() || null); }, 'Seguimiento finalizado.', function () { d.finalizando = false; d.borrador.motivoFin = ''; }); }); no.addEventListener('click', function () { d.finalizando = false; dibujarDetalle(); });
        w.appendChild(el('p', 'cds-hint', 'Al finalizar dejás de seguirlo. Se conserva todo el historial y podés reabrirlo.')); w.appendChild(ta); var g = el('div', 'cds-seg-acciones'); g.appendChild(ok); g.appendChild(no); w.appendChild(g); f.appendChild(w);
      } else { var b = el('button', 'cds-btn', 'Finalizar seguimiento', { type: 'button', 'data-fk': 'finalizar' }); b.addEventListener('click', function () { d.finalizando = true; dibujarDetalle(); var t = document.getElementById('cdsSegMotivoFin'); if (t) t.focus(); }); f.appendChild(b); }
    } else { var r = el('button', 'cds-btn cds-btn--primary', d.enviando ? 'Reabriendo…' : 'Reabrir seguimiento', { type: 'button', disabled: d.enviando, 'data-fk': 'reabrir' }); r.addEventListener('click', function () { accion(function () { return ESTADO.cliente.reabrir(s.id, s.version); }, 'Seguimiento reabierto.'); }); f.appendChild(r); }
    return f;
  }
  // Ejecuta una escritura: bloquea el doble clic, traduce el error del servidor y vuelve a leer el detalle (version e historial vigentes).
  async function accion(fn, mensajeOk, alExito) {
    var d = det; if (!d || d.enviando) return; d.enviando = true; d.error = null; d.aviso = null; dibujarDetalle();
    try { await fn(); if (det !== d) return; if (alExito) alExito(); d.enviando = false; d.aviso = null; invalidarEstado(); vista.datos = null; vista.resumen = null; await recargarDetalle(); if (det !== d) return; toast(mensajeOk); if (document.getElementById('cdsSegZona')) { cargarLista(); cargarResumen(); } }
    catch (e) {
      if (det !== d) return; d.enviando = false; d.error = e.mensaje ? e : { mensaje: 'No se pudo completar la acción.' };
      if (e.status === 412 || e.status === 409 || e.status === 428) { await recargarDetalle(true); if (det !== d) return; d.error = e; invalidarEstado(); dibujarDetalle(); }
      else dibujarDetalle();
      anunciar(d.error.mensaje);
    }
  }

  // =================== PESTAÑA, SONDEO Y ARRANQUE ===================
  function agregarPestana() {
    var tabs = document.getElementById('rtTabs'); if (!tabs || document.getElementById('rtTabSeguimientos')) return;
    var b = el('button', 'tab', 'Mis seguimientos', { 'data-view': 'seguimientos', id: 'rtTabSeguimientos' }), ref = tabs.querySelector('[data-view="reglas"]') || tabs.querySelector('[data-view="rotaciones"]');
    tabs.insertBefore(b, ref);
  }
  function quitarPestana() { var b = document.getElementById('rtTabSeguimientos'); if (b) b.remove(); }
  async function sondear(forzar) {
    if (!ESTADO.cliente) ESTADO.cliente = A().crearCliente({ base: apiBase(), token: token });
    var r = await ESTADO.cliente.sondear(); ESTADO.sondeo = r.estado; ESTADO.errorSondeo = r.error || null;
    if (r.estado === 'inactivo') { quitarPestana(); document.documentElement.removeAttribute('data-cds-seg'); return; }
    document.documentElement.setAttribute('data-cds-seg', r.estado); agregarPestana();
    if (r.estado === 'habilitado') programarEscaneo();
    if (forzar && typeof rtRenderVistaActual === 'function' && typeof RT_VIEW !== 'undefined' && RT_VIEW === 'seguimientos') rtRenderVistaActual();
  }
  function iniciar() {
    if (!A() || !token()) return;
    sondear(false);
    if (window.MutationObserver) new MutationObserver(programarEscaneo).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && ESTADO.sondeo === 'habilitado') invalidarEstado(); });
  }

  window.CDS_SEGUIMIENTOS = { renderVista: renderVista, escanear: escanear, abrirDialogo: abrirDialogo, irASeguimiento: irASeguimiento, sondear: sondear, estado: function () { return { sondeo: ESTADO.sondeo, seguidas: Object.assign({}, ESTADO.seguidas) }; }, contextoConsulta: contextoConsulta };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(iniciar, 0); }); else setTimeout(iniciar, 0);
})();
