/* CROMA DESIGN SYSTEM 2.0 · Etapa C1: pestaña «Talle y color» del detalle de Oportunidades. Solo con la bandera cds-v3.
   Datos: GET /analisis/stock-ventas?codigo=… (endpoint existente, sin cambios en la API). Reglas (INFORME-C0): consulta SOLO al abrir la pestaña,
   sucursales = las de la consulta de Oportunidades (se valida el eco), código/talle/color como CADENAS (ceros iniciales, sin largos fijos), ventas netas
   aunque el stock sea 0, Dep. 90 = Stock_ctro_0000 − Stock_fallados recortado a 0 por variante (nunca Stock_total), cantidades negativas NO son
   disponibles, totales y conciliación solo con todas las páginas y el mismo período y sucursales. Nada de esto altera los algoritmos comerciales.
   Estructura de seguimiento (Etapa D): claves canónicas y atributos data-cds-*; sin botones, persistencia ni alertas. */
(function () {
  'use strict';
  if (!document.documentElement.classList.contains('cds-v3')) return;

  var CFG = { ttlMs: 5 * 60 * 1000, maxEntradas: 20, limite: 500, maxPaginas: 4, tanda: 50, minParaFiltrar: 12, talleUnico: ['99', 'TU'], ahora: function () { return Date.now(); } };
  var CENTROS = ['0001', '0005', '0009', '0010', '0012', '0014'];
  var SUCURSAL = { '0001': 'Paseo', '0005': 'Centenario', '0009': 'Cipo', '0010': 'Plottier', '0012': 'Cutral Có', '0014': 'Centro' };
  var CURVA = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  var ESTADOS = { con_stock: 'Con stock', solo_deposito: 'Solo depósito', sin_stock: 'Sin stock', sin_datos: 'Datos incompletos' };
  var nf = new Intl.NumberFormat('es-AR');

  // ---------- utilidades puras ----------
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function sumar(lista) { var t = 0; for (var i = 0; i < lista.length; i++) { if (lista[i] === null) return null; t += lista[i]; } return t; }
  function n(v) { return v === null || v === undefined ? '—' : nf.format(v); }
  function sinTildes(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function mismoConjunto(a, b) { if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false; return a.every(function (x) { return b.indexOf(x) >= 0; }); }
  function ordenCanonico(lista) { return CENTROS.filter(function (c) { return lista.indexOf(c) >= 0; }); }

  // Claves canonicas de seguimiento (Etapa D). Todas las partes son CADENAS; lo que no es alfanumerico se escapa para que un ':' no rompa la clave.
  var PREFIJO = { producto: 'P', color: 'C', talle: 'T', variante: 'V', variante_sucursal: 'VS' };
  function parte(p) { p = String(p == null ? '' : p); return /^[A-Za-z0-9]*$/.test(p) ? p : encodeURIComponent(p); }
  function claveSeguimiento(nivel, v, sucursal) {
    var pre = PREFIJO[nivel]; if (!pre) throw new Error('nivel de seguimiento desconocido: ' + nivel);
    var p = [pre, parte(v.cod)];
    if (nivel === 'color') p.push(parte(v.color));
    else if (nivel === 'talle') p.push(parte(v.talle));
    else if (nivel === 'variante' || nivel === 'variante_sucursal') { p.push(parte(v.talle)); p.push(parte(v.color)); }
    if (nivel === 'variante_sucursal') p.push(parte(sucursal));
    return p.join(':');
  }

  // Orden de talles: numericos por valor (empate por texto, '040' ≠ '40'), curva conocida (XS…XL), luego el resto por texto.
  function grupoTalle(t) { return /^\d+$/.test(t) ? 0 : CURVA.indexOf(String(t).toUpperCase()) >= 0 ? 1 : 2; }
  function compararTalle(a, b) {
    var ga = grupoTalle(a), gb = grupoTalle(b); if (ga !== gb) return ga - gb;
    if (ga === 0) { var d = Number(a) - Number(b); if (d) return d; return a < b ? -1 : a > b ? 1 : 0; }
    if (ga === 1) return CURVA.indexOf(String(a).toUpperCase()) - CURVA.indexOf(String(b).toUpperCase()) || (a < b ? -1 : a > b ? 1 : 0);
    return String(a).localeCompare(String(b), 'es') || (a < b ? -1 : a > b ? 1 : 0);
  }
  function nombreColor(v) { return v.colorNombre || v.color; }
  function compararTexto(a, b) { return String(a).localeCompare(String(b), 'es') || (a < b ? -1 : a > b ? 1 : 0); }
  var COMPARADORES = {
    color: function (a, b) { return compararTexto(nombreColor(a), nombreColor(b)) || compararTexto(a.color, b.color) || compararTalle(a.talle, b.talle); },
    talle: function (a, b) { return compararTalle(a.talle, b.talle) || compararTexto(nombreColor(a), nombreColor(b)) || compararTexto(a.color, b.color); },
    ventas: function (a, b) { return cmpNum(a.ventas, b.ventas); }, stock: function (a, b) { return cmpNum(a.stockSucDisp, b.stockSucDisp); },
    dep90: function (a, b) { return cmpNum(a.dep90, b.dep90); }, fallados: function (a, b) { return cmpNum(a.fallados, b.fallados); },
  };
  function cmpNum(x, y) { if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1; return x - y; }
  function ordenar(filas, campo, dir, rev) { // rev: mapa clave → revisión de rotación (solo con señal); sirve para ordenar por stock en origen / ventas en destino
    var d = dir < 0 ? -1 : 1, f = COMPARADORES[campo];
    if (campo === 'stockOrigen' || campo === 'ventasDestino') { var k = campo === 'stockOrigen' ? 'stockOrigen' : 'ventasDestino'; f = function (a, b) { var x = rev && rev.get(a.clave), y = rev && rev.get(b.clave); return cmpNum(x ? x[k] : null, y ? y[k] : null); }; }
    f = f || COMPARADORES.color;
    return filas.slice().sort(function (a, b) { return d * f(a, b) || COMPARADORES.color(a, b) || 0; });
  }

  // Una fila de la API → variante normalizada (cadenas intactas). null si es de otro producto.
  function normalizar(r, activas, codigo) {
    if (!r || String(r.Codigo_producto).trim() !== String(codigo).trim()) return null;
    var v = { cod: String(r.Codigo_producto), talle: String(r.Codigo_talle == null ? '' : r.Codigo_talle), color: String(r.Codigo_color == null ? '' : r.Codigo_color), faltantes: [] };
    v.colorNombre = r.Nombre_color ? String(r.Nombre_color) : null;
    v.colorSinNombre = r.color_no_mapeado === true || !v.colorNombre;
    v.ultimoIngreso = r.Ultimo_ingreso || null;
    v.ventas = num(r.Ventas_total); if (v.ventas === null) v.faltantes.push('Ventas_total');
    v.porSuc = {};
    activas.forEach(function (c) {
      var vv = num(r['Ventas_ctro_' + c]), ss = num(r['Stock_ctro_' + c]);
      if (vv === null) v.faltantes.push('Ventas_ctro_' + c); if (ss === null) v.faltantes.push('Stock_ctro_' + c);
      v.porSuc[c] = { ventas: vv, stock: ss };
    });
    var stocks = activas.map(function (c) { return v.porSuc[c].stock; });
    v.stockSucRaw = sumar(stocks);
    v.stockSucDisp = sumar(stocks.map(function (s) { return s === null ? null : Math.max(0, s); })); // una cantidad negativa nunca es stock disponible
    v.comb0000 = num(r.Stock_ctro_0000); if (v.comb0000 === null) v.faltantes.push('Stock_ctro_0000'); // depósito 90 + 93 (así lo entrega la API)
    v.fallados = num(r.Stock_fallados); if (v.fallados === null) v.faltantes.push('Stock_fallados');
    v.depDif = v.comb0000 === null || v.fallados === null ? null : v.comb0000 - v.fallados;
    v.dep90 = v.depDif === null ? null : Math.max(0, v.depDif); // mismo criterio del motor (ADR-032/033): recortado a 0 por variante
    v.disp = v.stockSucDisp === null || v.dep90 === null ? null : v.stockSucDisp + v.dep90;
    v.conStockMotor = v.stockSucRaw === null || v.dep90 === null ? null : (v.stockSucRaw + v.dep90 > 0); // definición de "con stock" del motor (con_stock)
    v.estado = v.disp === null ? 'sin_datos' : v.stockSucDisp > 0 ? 'con_stock' : v.dep90 > 0 ? 'solo_deposito' : 'sin_stock';
    var fl = [];
    var neg = stocks.some(function (s) { return s !== null && s < 0; }) || (v.fallados !== null && v.fallados < 0);
    if (neg) fl.push('saldo_negativo');
    if (v.depDif !== null && v.depDif < 0) fl.push('deposito_menor_a_fallados');
    if (v.ventas === 0) fl.push('sin_ventas'); else if (v.ventas !== null && v.ventas < 0) fl.push('ventas_negativas');
    if (v.fallados !== null && v.fallados > 0) fl.push('fallados');
    if (v.colorSinNombre) fl.push('color_sin_nombre');
    if (CFG.talleUnico.indexOf(v.talle) >= 0) fl.push('talle_unico');
    if (v.faltantes.length) fl.push('datos_faltantes');
    v.flags = fl;
    v.clave = claveSeguimiento('variante', v);
    return v;
  }

  function totales(filas) {
    var t = { variantes: filas.length, conStock: 0, soloDeposito: 0, sinStock: 0, conSaldoNegativo: 0 };
    t.ventas = sumar(filas.map(function (v) { return v.ventas; })); t.stockSucRaw = sumar(filas.map(function (v) { return v.stockSucRaw; }));
    t.stockSucDisp = sumar(filas.map(function (v) { return v.stockSucDisp; })); t.dep90 = sumar(filas.map(function (v) { return v.dep90; }));
    t.fallados = sumar(filas.map(function (v) { return v.fallados; }));
    filas.forEach(function (v) { if (v.estado === 'con_stock') t.conStock++; else if (v.estado === 'solo_deposito') t.soloDeposito++; else if (v.estado === 'sin_stock') t.sinStock++; if (v.flags.indexOf('saldo_negativo') >= 0) t.conSaldoNegativo++; });
    t.conStockMotor = filas.some(function (v) { return v.conStockMotor === null; }) ? null : filas.filter(function (v) { return v.conStockMotor; }).length;
    return t;
  }

  // Cuando se puede mostrar un total: todas las páginas, sin repetidas ni ajenas, y eco de sucursales y período idénticos a lo pedido.
  function totalesDisponibles(e) {
    if (!e) return { ok: false, motivo: 'sin datos' };
    if (!e.completa) return { ok: false, motivo: e.razonParcial === 'tope' ? 'se alcanzó el máximo de páginas' : e.razonParcial === 'error' ? 'falló una página' : e.razonParcial === 'cambio' ? 'el total cambió mientras se cargaba' : 'faltan páginas' };
    if (e.duplicadas > 0 || e.ajenas > 0) return { ok: false, motivo: 'la respuesta trae variantes repetidas o de otro producto' };
    return { ok: true };
  }

  // Conciliación con la fila del producto de Oportunidades. Solo si hay totales y coincide período y sucursales; si el universo difiere, no se concilia.
  function conciliar(f, e, ctx) {
    var td = totalesDisponibles(e);
    if (!td.ok) return { aplicable: false, motivo: 'No se concilia con el producto: ' + td.motivo + '.' };
    if (!ctx.ecoOportunidades) return { aplicable: false, motivo: 'No se concilia con el producto: la consulta de Oportunidades no informó sus sucursales.' };
    if (!ctx.periodoOportunidades) return { aplicable: false, motivo: 'No se concilia con el producto: la consulta de Oportunidades no informó su período.' };
    if (!mismoConjunto(e.sucursales, ctx.sucursales)) return { aplicable: false, motivo: 'No se concilia con el producto: las sucursales difieren.' };
    if (e.periodo.desde !== ctx.desde || e.periodo.hasta !== ctx.hasta) return { aplicable: false, motivo: 'No se concilia con el producto: el período difiere.' };
    var t = totales(e.filas), items = [];
    if (typeof f.variantes === 'number' && f.variantes !== e.filas.length) return { aplicable: false, motivo: 'No se concilian los totales: el universo de variantes difiere (' + nf.format(e.filas.length) + ' en esta consulta, ' + nf.format(f.variantes) + ' en el producto). Cada fuente tiene su alcance.' };
    function par(etq, a, b) { if (a === null || typeof b !== 'number') return; items.push({ etiqueta: etq, variantes: a, producto: b, coincide: a === b }); }
    par('Ventas netas', t.ventas, f.Ventas_total); par('Stock en sucursales (suma con saldos)', t.stockSucRaw, f.Stock_sucursales);
    if (f.Stock_deposito !== undefined) par('Depósito 90', t.dep90, f.Stock_deposito);
    par('Fallados 93', t.fallados, f.Stock_fallados); par('Variantes con stock', t.conStockMotor, f.variantes_con_stock);
    return { aplicable: true, items: items, motivo: null };
  }

  // ---------- señal de rotación (C2): solo lectura de lo que Oportunidades ya calculó; no se reimplementa Rotaciones ----------
  var REV = { revisar: 'Para revisar en Rotaciones', sin_stock_origen: 'Sin stock en origen', sin_ventas_destino: 'Sin ventas en destino', datos_incompletos: 'Datos incompletos' };
  function senalRotacion(f) { // acción principal o secundaria «posible rotación» del producto (señal POR PRODUCTO); null si no hay
    if (!f) return null;
    var acc = (f.acciones || []).filter(function (a) { return a && (a.estado_origen === 'posible_rotacion' || a.requiere_validacion_variante === true); })[0] || null;
    var diag = f.diagnostico_rotacion || null, par = diag && diag.par_sugerido ? diag.par_sugerido : null;
    var estados = [f.estado_principal].concat(Array.isArray(f.estados_secundarios) ? f.estados_secundarios : []);
    if (!acc && estados.indexOf('posible_rotacion') < 0) return null;
    var origen = (acc && acc.origen) || (par && par.origen && par.origen.sucursal) || null, destino = (acc && acc.destino) || (par && par.destino && par.destino.sucursal) || null;
    if (!origen || !destino) return null;
    var cant = acc && num(acc.cantidad_orientativa) !== null ? acc.cantidad_orientativa : (par ? num(par.cantidad_sugerida) : null);
    return { origen: String(origen), destino: String(destino), cantidad: cant !== null && cant > 0 ? cant : null, principal: acc ? acc.principal === true : f.estado_principal === 'posible_rotacion',
      stockProducto: par && par.origen ? num(par.origen.stock) : null, ventasProducto: par && par.destino ? num(par.destino.ventas) : null, otrosPares: diag && Array.isArray(diag.pares) ? Math.max(0, diag.pares.length - 1) : 0 };
  }
  function senalAplicable(s, activas) { return !!s && activas.indexOf(s.origen) >= 0 && activas.indexOf(s.destino) >= 0; }
  // Descriptivo, NO recomienda transferir: solo dice si la variante tiene stock POSITIVO en el origen y ventas en el destino (depósito 90 y fallados 93 no son stock de sucursal).
  function revisionRotacion(v, s) {
    var o = v.porSuc[s.origen], d = v.porSuc[s.destino], so = o ? o.stock : null, vd = d ? d.ventas : null, estado;
    if (so === null || vd === null) estado = 'datos_incompletos'; else if (so <= 0) estado = 'sin_stock_origen'; else if (vd <= 0) estado = 'sin_ventas_destino'; else estado = 'revisar';
    return { estado: estado, stockOrigen: so, ventasDestino: vd, saldoNegativoOrigen: so !== null && so < 0, ventasNegativasDestino: vd !== null && vd < 0 };
  }
  function mapaRevision(filas, s) { var m = new Map(); if (s) filas.forEach(function (v) { m.set(v.clave, revisionRotacion(v, s)); }); return m; }

  // ---------- consulta manual de sugerencias de Rotaciones (C2, solo administradores) ----------
  // Contrato verificado (INFORME-C2): GET /analisis/rotaciones?desde&hasta&codigo, JWT + rol admin; NO admite talle, color ni sucursales (usa las operativas); el servidor calcula
  // un plan global por período (caché de 3 min) → es una consulta cara, SOLO manual, sin refresh=1. Las sugerencias son del motor de Rotaciones, sin confirmar.
  var rotCache = new Map(), rotVuelo = null, rotErrores = new Map(), rotSeq = 0;
  function esAdmin() { return typeof rrEsAdmin === 'function' && rrEsAdmin(); }
  function rotClave(p) { return JSON.stringify([p.codigo, p.desde, p.hasta, p.sucursales]); }
  function rotLeer(k) { var c = rotCache.get(k); if (!c) return null; if (CFG.ahora() - c.t >= CFG.ttlMs) { rotCache.delete(k); return null; } return c.entrada; }
  function rotEstado(p) { var k = rotClave(p), e = rotLeer(k); if (e) return { fase: 'listo', entrada: e }; if (rotVuelo && rotVuelo.key === k) return { fase: 'cargando' }; if (rotErrores.has(k)) return { fase: 'error', error: rotErrores.get(k) }; return { fase: 'inicial' }; }
  function claveItem(it) { return claveSeguimiento('variante', { cod: String(it.Codigo_producto), talle: String(it.Codigo_talle == null ? '' : it.Codigo_talle), color: String(it.Codigo_color == null ? '' : it.Codigo_color) }); }
  async function rotCargar(st) {
    var p = st.p;
    try {
      var q = new URLSearchParams({ desde: p.desde, hasta: p.hasta, codigo: p.codigo });
      var resp = await fetch(apiBase() + '/analisis/rotaciones?' + q.toString(), { headers: typeof rtRotAuthHeaders === 'function' ? rtRotAuthHeaders() : {}, signal: st.controller.signal });
      var data = await resp.json(); if (rotVuelo !== st) return;
      if (resp.status === 401 || resp.status === 403) throw ErrCarga('No tenés permiso para consultar Rotaciones (es solo para administradores).', 'permiso');
      if (!resp.ok || !data || data.ok !== true) throw ErrCarga((data && data.error) || ('HTTP ' + resp.status));
      if (data.desde !== p.desde || data.hasta !== p.hasta || !Array.isArray(data.pares)) throw ErrCarga('Rotaciones respondió para otro período o con un formato inesperado.', 'contrato');
      var vistos = new Set(), items = [], fuera = 0, repetidas = 0, ajenas = 0;
      data.pares.forEach(function (par) { (par.items || []).forEach(function (it) {
        if (String(it.Codigo_producto) !== p.codigo) { ajenas++; return; }
        var id = it.rotacion_id || (claveItem(it) + ':' + it.origen + ':' + it.destino); if (vistos.has(id)) { repetidas++; return; } vistos.add(id);
        if (p.sucursales.indexOf(it.origen) < 0 || p.sucursales.indexOf(it.destino) < 0) { fuera++; return; } // fuera de las sucursales de la consulta: no se muestra
        items.push(it);
      }); });
      rotCache.set(st.key, { t: CFG.ahora(), entrada: { items: items, fuera: fuera, repetidas: repetidas, ajenas: ajenas, recibido: CFG.ahora() } });
    } catch (e) {
      if (e && e.name === 'AbortError') return; if (rotVuelo !== st) return;
      rotErrores.set(st.key, { mensaje: String(e && e.message || e), tipo: (e && e.tipo) || 'api' });
    }
    if (rotVuelo === st) { rotVuelo = null; avisar(); }
  }
  function rotIniciar(p) { // SOLO se llama desde el botón manual
    var k = rotClave(p); if (rotVuelo && rotVuelo.key === k) return rotVuelo; if (rotVuelo) rotVuelo.controller.abort();
    var st = { key: k, p: p, controller: new AbortController(), seq: ++rotSeq }; rotVuelo = st; rotErrores.delete(k); rotCache.delete(k); rotCargar(st); return st;
  }
  function rotCancelar() { if (rotVuelo) { rotVuelo.controller.abort(); rotVuelo = null; } }

  // ---------- consulta, caché y cancelación ----------
  var cache = new Map(), vuelo = null, errores = new Map(), seq = 0;
  function clave(p) { return JSON.stringify([p.codigo, p.desde, p.hasta, p.sucursales]); }
  function leerCache(k) {
    var c = cache.get(k); if (!c) return null;
    if (CFG.ahora() - c.t >= CFG.ttlMs) { cache.delete(k); return null; }
    cache.delete(k); cache.set(k, c); return c.entrada; // LRU: la usada pasa al final
  }
  function guardar(k, entrada) { cache.set(k, { t: CFG.ahora(), entrada: entrada }); while (cache.size > CFG.maxEntradas) cache.delete(cache.keys().next().value); }
  function avisar() { if (typeof api.alCambiar === 'function') { try { api.alCambiar(); } catch (e) { /* la vista decide */ } } }
  function apiBase() { return typeof STOCK_API_URL !== 'undefined' ? STOCK_API_URL : ''; }
  function ErrCarga(msg, tipo) { var e = new Error(msg); e.tipo = tipo || 'api'; return e; }

  async function cargarPaginas(st) {
    var p = st.p, filas = [], vistas = new Set(), duplicadas = 0, ajenas = 0, offset = 0, total = null, paginas = 0, completa = false, razon = null, falla = null, periodo = null, eco = null;
    try {
      for (;;) {
        var q = new URLSearchParams({ desde: p.desde, hasta: p.hasta, codigo: p.codigo, sucursales: p.sucursales.join(','), limit: String(CFG.limite), offset: String(offset) });
        var resp = await fetch(apiBase() + '/analisis/stock-ventas?' + q.toString(), { signal: st.controller.signal });
        var data = await resp.json();
        if (vuelo !== st) return;
        if (!resp.ok || !data || data.ok !== true) throw ErrCarga((data && data.error) || ('HTTP ' + resp.status));
        if (!mismoConjunto(data.sucursales, p.sucursales)) throw ErrCarga('La API no confirmó las sucursales pedidas (pedidas: ' + p.sucursales.join(', ') + '; confirmadas: ' + (Array.isArray(data.sucursales) ? data.sucursales.join(', ') : 'ninguna') + '). Los números podrían incluir sucursales excluidas.', 'eco');
        if (!data.periodo || data.periodo.desde !== p.desde || data.periodo.hasta !== p.hasta) throw ErrCarga('La API respondió para otro período del pedido.', 'periodo');
        var pag = data.paginacion; if (!pag || num(pag.total) === null || !Array.isArray(data.data)) throw ErrCarga('Respuesta sin paginación válida.', 'contrato');
        periodo = data.periodo; eco = data.sucursales.slice();
        if (total !== null && pag.total !== total) { razon = 'cambio'; total = pag.total; break; }
        total = pag.total; paginas++;
        data.data.forEach(function (r) {
          var v = normalizar(r, p.sucursales, p.codigo);
          if (!v) { ajenas++; return; }
          if (vistas.has(v.clave)) { duplicadas++; return; }
          vistas.add(v.clave); filas.push(v);
        });
        st.progreso = filas.length; st.total = total; avisar();
        offset += num(pag.devueltos) !== null ? pag.devueltos : data.data.length;
        if (data.data.length === 0 || offset >= total) { completa = true; break; }
        if (paginas >= CFG.maxPaginas) { razon = 'tope'; break; }
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; if (vuelo !== st) return;
      if (!paginas || (e && (e.tipo === 'eco' || e.tipo === 'periodo' || e.tipo === 'contrato'))) { errores.set(st.key, { mensaje: String(e && e.message || e), tipo: (e && e.tipo) || 'api' }); vuelo = null; avisar(); return; }
      falla = e; razon = 'error';
    }
    if (vuelo !== st) return;
    var entrada = { filas: filas, total: total, paginas: paginas, completa: completa && !razon, razonParcial: razon, duplicadas: duplicadas, ajenas: ajenas, sucursales: eco || p.sucursales.slice(), periodo: periodo || { desde: p.desde, hasta: p.hasta }, recibido: CFG.ahora(), mensajeError: falla ? String(falla.message || falla) : null };
    if (!razon || razon === 'tope') guardar(st.key, entrada); // un resultado parcial por falla o cambio de total no se guarda: el próximo intento vuelve a pedir
    else st.entrada = entrada;
    vuelo = null; if (razon && razon !== 'tope') parciales.set(st.key, entrada);
    avisar();
  }
  var parciales = new Map();

  function estadoDe(p) {
    var k = clave(p), e = leerCache(k);
    if (e) return { fase: 'listo', entrada: e, key: k };
    if (vuelo && vuelo.key === k) return { fase: 'cargando', progreso: vuelo.progreso, total: vuelo.total, key: k };
    if (parciales.has(k)) return { fase: 'listo', entrada: parciales.get(k), key: k };
    if (errores.has(k)) return { fase: 'error', error: errores.get(k), key: k };
    return { fase: 'inicial', key: k };
  }
  function iniciar(p) {
    var k = clave(p);
    if (vuelo && vuelo.key === k) return vuelo;
    if (vuelo) vuelo.controller.abort(); // una consulta nueva descarta la anterior: su respuesta ya no se usa
    var st = { key: k, p: p, controller: new AbortController(), seq: ++seq, progreso: 0, total: null };
    vuelo = st; errores.delete(k); parciales.delete(k);
    cargarPaginas(st).catch(function (e) { if (vuelo === st) { vuelo = null; errores.set(k, { mensaje: String(e && e.message || e), tipo: 'api' }); avisar(); } });
    return st;
  }
  function cancelar() { if (vuelo) { vuelo.controller.abort(); vuelo = null; } rotCancelar(); vista = null; } // salir de la pestaña, cambiar de producto o cerrar el detalle también reinicia búsqueda, filtro y orden
  function invalidar(p) { if (!p) { rotCache.clear(); rotErrores.clear(); } if (p) { var k = clave(p); cache.delete(k); errores.delete(k); parciales.delete(k); } else { cache.clear(); errores.clear(); parciales.clear(); } }
  function reintentar(p) { invalidar(p); return iniciar(p); }

  // Parámetros: período y sucursales de la consulta de Oportunidades (su eco); si no los informó, se usan las elegidas y no se concilia.
  function parametros(f, resp) {
    var per = resp && resp.periodo && resp.periodo.desde && resp.periodo.hasta ? resp.periodo : null;
    var eco = resp && Array.isArray(resp.sucursales) && resp.sucursales.length ? ordenCanonico(resp.sucursales) : null;
    var elegidas = typeof RT_CENTROS !== 'undefined' && Array.isArray(RT_CENTROS) && RT_CENTROS.length ? ordenCanonico(RT_CENTROS) : CENTROS.slice();
    return { codigo: String(f.Codigo_producto), desde: per ? per.desde : RT_DESDE, hasta: per ? per.hasta : RT_HASTA, sucursales: eco || elegidas, ecoOportunidades: !!eco, periodoOportunidades: !!per };
  }

  // ---------- interfaz ----------
  function el(tag, cls, texto, attrs) { var e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto; if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  function boton(texto, onClick, cls, attrs) { var b = el('button', cls || 'cds-btn', texto, Object.assign({ type: 'button' }, attrs || {})); b.addEventListener('click', function (ev) { ev.stopPropagation(); onClick(ev); }); return b; }
  function fechaCorta(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso)); return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso); }
  function hora(ts) { try { return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function nombreSuc(c) { return (SUCURSAL[c] || c) + ' (' + c + ')'; }

  var vista = null; // estado de pantalla de la variante abierta: búsqueda, filtro, orden, tanda y filas desplegadas
  function vistaDe(k) {
    if (!vista || vista.key !== k) vista = { key: k, q: '', chip: 'todas', campo: 'color', dir: 1, mostrar: CFG.tanda, abiertas: new Set() };
    return vista;
  }
  var CHIPS = [['todas', 'Todas', function () { return true; }], ['con_stock', 'Con stock', function (v) { return v.estado === 'con_stock'; }], ['solo_deposito', 'Solo depósito', function (v) { return v.estado === 'solo_deposito'; }],
    ['sin_stock', 'Sin stock', function (v) { return v.estado === 'sin_stock'; }], ['con_ventas', 'Con ventas', function (v) { return v.ventas !== null && v.ventas > 0; }],
    ['saldo_negativo', 'Saldo negativo', function (v) { return v.flags.indexOf('saldo_negativo') >= 0; }], ['color_sin_nombre', 'Color sin nombre', function (v) { return v.flags.indexOf('color_sin_nombre') >= 0; }]];
  var CHIPS_ROT = [['para_revisar', 'Para revisar', function (v, r) { return !!r && r.estado === 'revisar'; }], ['sin_stock_origen', 'Sin stock en origen', function (v, r) { return !!r && r.estado === 'sin_stock_origen'; }],
    ['sin_ventas_destino', 'Sin ventas en destino', function (v, r) { return !!r && r.estado === 'sin_ventas_destino'; }], ['datos_incompletos', 'Datos incompletos', function (v, r) { return !!r && r.estado === 'datos_incompletos'; }]];
  var CHIP_SUG = ['sugeridas', 'Sugeridas por Rotaciones', function (v, r, s) { return !!s && s.has(v.clave); }];
  function filtrar(filas, vs, rev, sug) { // rev: revisión por variante (si hay señal); sug: mapa de sugerencias manuales de Rotaciones (si se consultaron)
    var chip = CHIPS.concat(CHIPS_ROT, [CHIP_SUG]).filter(function (c) { return c[0] === vs.chip; })[0] || CHIPS[0], q = sinTildes(vs.q).trim();
    return filas.filter(function (v) { return chip[2](v, rev && rev.get(v.clave), sug) && (!q || sinTildes(v.talle).indexOf(q) >= 0 || sinTildes(v.color).indexOf(q) >= 0 || sinTildes(v.colorNombre).indexOf(q) >= 0); });
  }

  var AVISOS = { saldo_negativo: 'Saldo negativo', deposito_menor_a_fallados: 'Fallados mayores al depósito', sin_ventas: 'Sin ventas', ventas_negativas: 'Ventas netas negativas', fallados: 'Con fallados', color_sin_nombre: 'Color sin nombre', talle_unico: 'Talle único', datos_faltantes: 'Datos incompletos' };
  function textoRevision(r) { return r.estado === 'sin_stock_origen' && r.saldoNegativoOrigen ? 'Saldo negativo en origen' : r.estado === 'sin_ventas_destino' && r.ventasNegativasDestino ? 'Ventas netas negativas en destino' : REV[r.estado]; }
  function lineaRotacion(v, rc) { // C2: stock de la variante en el origen y ventas en el destino de la señal + sugerencias manuales de Rotaciones (si se consultaron)
    var cont = el('div', 'cds-var-rot'), r = rc.rev && rc.rev.get(v.clave), its = rc.sug && rc.sug.get(v.clave);
    if (r) {
      var l = el('div', 'cds-var-rot-l'); l.setAttribute('data-rot', r.estado); l.appendChild(el('span', 'cds-var-rot-est', textoRevision(r)));
      l.appendChild(el('span', 'cds-var-rot-d', 'Origen ' + (SUCURSAL[rc.senal.origen] || rc.senal.origen) + ': stock ' + n(r.stockOrigen) + ' · Destino ' + (SUCURSAL[rc.senal.destino] || rc.senal.destino) + ': ventas ' + n(r.ventasDestino))); cont.appendChild(l);
    }
    if (its) its.forEach(function (it) {
      var o = v.porSuc[it.origen], okStock = o && o.stock !== null && o.stock > 0, l = el('div', 'cds-var-rot-l cds-var-rot-sug'); l.setAttribute('data-sug', '1');
      l.appendChild(el('span', 'cds-var-rot-est', 'Sugerida por Rotaciones'));
      l.appendChild(el('span', 'cds-var-rot-d', (SUCURSAL[it.origen] || it.origen) + ' → ' + (SUCURSAL[it.destino] || it.destino) + ': ' + n(num(it.cantidad_sugerida)) + ' u. (sin confirmar)'));
      if (!okStock) l.appendChild(el('span', 'cds-var-flag cds-var-flag--aviso', 'El stock de origen en esta pestaña no es positivo'));
      cont.appendChild(l);
    });
    return cont.childNodes.length ? cont : null;
  }
  function celdaId(v, rc) {
    var td = el('td', 'cds-var-id'); td.setAttribute('data-cds-talle', claveSeguimiento('talle', v)); td.setAttribute('data-cds-color', claveSeguimiento('color', v));
    var l1 = el('div', 'cds-var-l1'); l1.appendChild(el('span', 'cds-var-talle cds-mono', v.talle === '' ? '(sin talle)' : v.talle, { 'data-cds-campo': 'talle' }));
    l1.appendChild(el('span', 'cds-var-color', v.colorNombre || 'Sin nombre de color'));
    td.appendChild(l1);
    var l2 = el('div', 'cds-var-l2'); l2.appendChild(el('span', 'cds-mono cds-var-cod', 'color ' + (v.color === '' ? '(sin código)' : v.color), { 'data-cds-campo': 'color' }));
    var est = el('span', 'cds-var-est', ESTADOS[v.estado]); est.setAttribute('data-estado', v.estado); l2.appendChild(est);
    v.flags.forEach(function (f) { if (AVISOS[f]) { var c = el('span', 'cds-var-flag' + (f === 'color_sin_nombre' || f === 'saldo_negativo' || f === 'deposito_menor_a_fallados' || f === 'datos_faltantes' || f === 'ventas_negativas' ? ' cds-var-flag--aviso' : ''), AVISOS[f]); c.setAttribute('data-flag', f); l2.appendChild(c); } });
    td.appendChild(l2);
    var l3 = rc ? lineaRotacion(v, rc) : null; if (l3) td.appendChild(l3);
    return td;
  }
  function celdaNum(valor, sub, attr) { var td = el('td', 'r cds-var-n', n(valor)); if (attr) td.setAttribute('data-cds-campo', attr); if (sub) td.appendChild(el('small', 'cds-var-sub', sub)); return td; }
  function detalleSucursales(v, activas, cols, rc) {
    var tr = el('tr', 'cds-var-det'), td = el('td', null, null, { colspan: String(cols) });
    var t = el('table', 'cds-mini'); t.appendChild(el('caption', 'cds-sr', 'Distribución por sucursal de la variante talle ' + v.talle + ' color ' + v.color));
    var h = el('thead'), hr = el('tr'); ['Ubicación', 'Ventas netas', 'Stock'].forEach(function (x, i) { hr.appendChild(el('th', i ? 'r' : '', x, { scope: 'col' })); }); h.appendChild(hr); t.appendChild(h);
    var b = el('tbody');
    activas.forEach(function (c) {
      var d = v.porSuc[c], r = el('tr'); r.setAttribute('data-cds-var-suc', claveSeguimiento('variante_sucursal', v, c));
      var c1 = el('td', null, nombreSuc(c)), rol = rc && rc.senal && rc.aplicable ? (c === rc.senal.origen ? 'origen' : c === rc.senal.destino ? 'destino' : null) : null;
      if (rol) { r.className = 'cds-var-suc--' + rol; r.setAttribute('data-rol', rol); c1.appendChild(el('small', 'cds-var-sub cds-var-rol', rol === 'origen' ? 'Origen de la señal: stock de la variante' : 'Destino de la señal: ventas de la variante')); }
      r.appendChild(c1); r.appendChild(el('td', 'r', n(d.ventas)));
      var s = el('td', 'r', n(d.stock)); if (d.stock !== null && d.stock < 0) { s.appendChild(el('small', 'cds-var-sub cds-var-sub--aviso', 'saldo negativo: no disponible')); } r.appendChild(s); b.appendChild(r);
    });
    [['Depósito 90 (derivado)', v.dep90, 'combinado 90 + 93 (' + n(v.comb0000) + ') menos fallados (' + n(v.fallados) + ')' + (v.depDif !== null && v.depDif < 0 ? ': el resultado es negativo y se muestra como 0' : '')], ['Fallados 93', v.fallados, 'no es stock disponible']].forEach(function (x) {
      var r = el('tr', 'cds-var-dep'), c1 = el('td', null, x[0]); c1.appendChild(el('small', 'cds-var-sub', x[2])); r.appendChild(c1); r.appendChild(el('td', 'r', '—')); r.appendChild(el('td', 'r', n(x[1]))); b.appendChild(r);
    });
    t.appendChild(b); td.appendChild(t); tr.appendChild(td); return tr;
  }

  function panel(f, resp) {
    var ctx = parametros(f, resp), est = estadoDe(ctx), raiz = el('div', 'cds-var'); raiz.setAttribute('data-cds-prod', claveSeguimiento('producto', { cod: ctx.codigo }));
    var cab = el('div', 'cds-var-cab');
    cab.appendChild(el('h3', 'cds-var-titulo', 'Variantes con actividad en el período'));
    cab.appendChild(el('p', 'cds-var-ctx', 'Período ' + fechaCorta(ctx.desde) + ' al ' + fechaCorta(ctx.hasta) + ' · Sucursales: ' + ctx.sucursales.map(function (c) { return SUCURSAL[c] || c; }).join(', ')));
    if (typeof rtAplicarFiltroYVerTallesColores === 'function') cab.appendChild(boton('Ver en Talles y colores', function () { rtAplicarFiltroYVerTallesColores({ codigo: ctx.codigo }); }, 'cds-btn cds-var-ir', { 'data-fk': 'var_ir_tc' })); // acceso existente a la vista independiente
    raiz.appendChild(cab);
    raiz.appendChild(el('p', 'cds-var-nota', 'Se listan solo las variantes con stock o ventas en el período. Que un talle o color no aparezca no significa que no exista: desde acá no se puede afirmar que la curva esté completa. El stock de las sucursales se actualiza una vez por día.'));
    var senal = senalRotacion(f), aplicable = senalAplicable(senal, ctx.sucursales);
    if (senal) raiz.appendChild(cajaSenal(senal, aplicable, ctx, f));
    var cajaSug = cajaSugerencias(ctx); if (cajaSug) raiz.appendChild(cajaSug);
    if (est.fase === 'inicial') { iniciar(ctx); est = estadoDe(ctx); }
    if (est.fase === 'cargando') {
      var c = el('div', 'cds-skel', null, { role: 'status', 'aria-live': 'polite' }); c.appendChild(el('span', 'cds-var-cargando', 'Cargando variantes…' + (est.progreso ? ' ' + nf.format(est.progreso) + (est.total ? ' de ' + nf.format(est.total) : '') + ' cargadas' : '')));
      for (var i = 0; i < 3; i++) c.appendChild(el('i'));
      raiz.appendChild(c); return raiz;
    }
    if (est.fase === 'error') {
      var a = el('div', 'cds-aviso cds-var-error', null, { role: 'alert' }); a.appendChild(el('b', null, 'No se pudieron cargar las variantes. ')); a.appendChild(document.createTextNode(est.error.mensaje));
      a.appendChild(boton('Reintentar', function () { reintentar(ctx); avisar(); }, 'cds-btn', { 'data-fk': 'var_reintentar' })); raiz.appendChild(a); return raiz;
    }
    var e = est.entrada, vs = vistaDe(est.key), td = totalesDisponibles(e);
    var barra = el('div', 'cds-var-barra');
    barra.appendChild(el('span', 'cds-var-hora', 'Datos de las ' + hora(e.recibido) + ' · se conservan 5 minutos' + (e.completa ? '' : ' · parciales')));
    barra.appendChild(boton('Actualizar', function () { reintentar(ctx); avisar(); }, 'cds-btn', { 'aria-label': 'Actualizar las variantes de ' + ctx.codigo, 'data-fk': 'var_actualizar' }));
    raiz.appendChild(barra);
    if (!e.completa) {
      var p = el('div', 'cds-aviso cds-var-parcial', null, { role: 'status' });
      p.appendChild(el('b', null, 'Resultados parciales: '));
      p.appendChild(document.createTextNode(nf.format(e.filas.length) + (e.total != null ? ' de ' + nf.format(e.total) : '') + ' variantes cargadas' + (e.razonParcial === 'tope' ? ' (máximo de ' + CFG.maxPaginas + ' páginas de ' + CFG.limite + ')' : e.razonParcial === 'error' ? ' (falló una página' + (e.mensajeError ? ': ' + e.mensajeError : '') + ')' : e.razonParcial === 'cambio' ? ' (el total cambió mientras se cargaba)' : '') + '. No se calculan totales ni conciliación.'));
      p.appendChild(boton('Volver a cargar', function () { reintentar(ctx); avisar(); }, 'cds-btn', { 'data-fk': 'var_recargar' })); raiz.appendChild(p);
    }
    if (e.duplicadas || e.ajenas) raiz.appendChild(el('p', 'cds-aviso cds-var-inconsistente', 'La API devolvió ' + (e.duplicadas ? nf.format(e.duplicadas) + ' variante(s) repetida(s)' : '') + (e.duplicadas && e.ajenas ? ' y ' : '') + (e.ajenas ? nf.format(e.ajenas) + ' fila(s) de otro producto' : '') + ': se descartaron y no se calculan totales.', { role: 'status' }));
    if (!e.filas.length) {
      raiz.appendChild(el('p', 'cds-var-vacio', e.completa ? 'Sin variantes con actividad en el período seleccionado.' : 'Todavía no hay variantes cargadas.', { role: 'status' })); return raiz;
    }
    raiz.appendChild(resumen(e, td));
    if (td.ok) { var cc = conciliar(f, e, ctx); raiz.appendChild(bloqueConciliacion(cc)); }
    var cuerpo = el('div', 'cds-var-cuerpo'), rs = esAdmin() ? rotEstado(ctx) : { fase: 'inicial' };
    var rc = { senal: senal, aplicable: aplicable, rev: aplicable ? mapaRevision(e.filas, senal) : null, sug: null };
    if (rs.fase === 'listo') { rc.sug = new Map(); rs.entrada.items.forEach(function (it) { var k = claveItem(it); if (!rc.sug.has(k)) rc.sug.set(k, []); rc.sug.get(k).push(it); }); }
    if (e.filas.length > CFG.minParaFiltrar || rc.rev || rc.sug) cuerpo.appendChild(controles(e, vs, function () { pintar(); }, rc));
    var zona = el('div', 'cds-var-zona', null, { tabindex: '-1' }); cuerpo.appendChild(zona); raiz.appendChild(cuerpo);
    function pintar() {
      zona.replaceChildren();
      var lista = ordenar(filtrar(e.filas, vs, rc.rev, rc.sug), vs.campo, vs.dir, rc.rev), vis = lista.slice(0, vs.mostrar);
      zona.appendChild(el('p', 'cds-var-cuenta', lista.length === e.filas.length ? 'Mostrando ' + nf.format(vis.length) + ' de ' + nf.format(lista.length) + ' variantes' : 'Mostrando ' + nf.format(vis.length) + ' de ' + nf.format(lista.length) + ' variantes que cumplen el filtro (' + nf.format(e.filas.length) + ' en total)', { role: 'status', 'aria-live': 'polite' }));
      if (!lista.length) { zona.appendChild(el('p', 'cds-var-vacio', 'Ninguna variante cumple el filtro.')); return; }
      zona.appendChild(tabla(vis, e, vs, pintar, rc));
      if (lista.length > vis.length) zona.appendChild(boton('Mostrar ' + nf.format(Math.min(CFG.tanda, lista.length - vis.length)) + ' más (' + nf.format(lista.length - vis.length) + ' restantes)', function () {
        var desde = vs.mostrar; vs.mostrar += CFG.tanda; pintar(); // el foco sigue al teclado: primera fila nueva (si el botón desaparece, no se pierde en el documento)
        var nueva = zona.querySelectorAll('.cds-var-fila')[desde], f = nueva && nueva.querySelector('.cds-var-exp'), m = zona.querySelector('[data-fk="var_mas"]');
        (f || m || zona).focus({ preventScroll: true });
      }, 'cds-btn cds-var-mas', { 'data-fk': 'var_mas' }));
    }
    pintar();
    return raiz;
  }

  function resumen(e, td) {
    var box = el('div', 'cds-var-resumen');
    if (!td.ok) { box.appendChild(el('p', 'cds-aviso', 'Totales no disponibles: ' + td.motivo + '.')); return box; }
    var t = totales(e.filas), d = el('dl', 'cds-m4 cds-var-totales');
    function m(etq, valor, sub) { var x = el('div'); x.appendChild(el('dt', null, etq)); x.appendChild(el('dd', null, n(valor))); if (sub) x.appendChild(el('small', null, sub)); d.appendChild(x); }
    m('Variantes', t.variantes, nf.format(t.conStock) + ' con stock · ' + nf.format(t.soloDeposito) + ' solo depósito · ' + nf.format(t.sinStock) + ' sin stock');
    m('Ventas netas', t.ventas, 'suma de las variantes'); m('Stock suc. disponible', t.stockSucDisp, t.conSaldoNegativo ? nf.format(t.conSaldoNegativo) + ' con saldo negativo (no cuenta)' : 'sin saldos negativos');
    m('Dep. 90', t.dep90, 'Fallados 93: ' + n(t.fallados));
    box.appendChild(d); return box;
  }
  function bloqueConciliacion(c) {
    var d = el('details', 'cds-var-conc'); d.appendChild(el('summary', null, 'Conciliación con el producto'));
    if (!c.aplicable) { d.appendChild(el('p', 'cds-var-conc-no', c.motivo)); return d; }
    var ul = el('ul'); c.items.forEach(function (i) { ul.appendChild(el('li', i.coincide ? 'cds-var-ok' : 'cds-var-dif', i.etiqueta + ': ' + n(i.variantes) + ' en las variantes · ' + n(i.producto) + ' en el producto · ' + (i.coincide ? 'coincide' : 'difiere en ' + nf.format(i.variantes - i.producto)))); });
    d.appendChild(ul); d.appendChild(el('p', 'cds-var-conc-no', 'Mismo período y mismas sucursales. Se compara con la fila del producto de Oportunidades; no se corrige ninguna cifra.')); return d;
  }
  function controles(e, vs, repintar, rc) {
    var c = el('div', 'cds-var-ctl'), campo = el('input', 'cds-var-buscar', null, { type: 'search', placeholder: 'Buscar talle, color o código', 'aria-label': 'Buscar por talle, color o código de color', 'data-fk': 'var_q', autocomplete: 'off' }); campo.value = vs.q;
    campo.addEventListener('input', function () { vs.q = campo.value; vs.mostrar = CFG.tanda; repintar(); }); c.appendChild(campo);
    var g = el('div', 'cds-var-chips', null, { role: 'group', 'aria-label': 'Filtrar variantes' });
    CHIPS.concat(rc && rc.rev ? CHIPS_ROT : [], rc && rc.sug ? [CHIP_SUG] : []).forEach(function (ch) {
      var cnt = e.filas.filter(function (v) { return ch[2](v, rc && rc.rev && rc.rev.get(v.clave), rc && rc.sug); }).length; if (!cnt && ch[0] !== 'todas' && vs.chip !== ch[0]) return;
      var b = boton(ch[1] + ' (' + nf.format(cnt) + ')', function () { vs.chip = ch[0]; vs.mostrar = CFG.tanda; [].forEach.call(g.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-chip') === vs.chip ? 'true' : 'false'); }); repintar(); }, 'cds-var-chip', { 'aria-pressed': vs.chip === ch[0] ? 'true' : 'false', 'data-chip': ch[0] });
      g.appendChild(b);
    });
    c.appendChild(g);
    if (rc && rc.rev) { // C2: ordenar para revisar la señal de rotación
      var o = el('div', 'cds-var-chips cds-var-ordenar', null, { role: 'group', 'aria-label': 'Ordenar para revisar la señal de rotación' });
      [['stockOrigen', 'Stock en origen'], ['ventasDestino', 'Ventas en destino']].forEach(function (k) {
        var b = boton(k[1], function () { if (vs.campo === k[0]) vs.dir = -vs.dir; else { vs.campo = k[0]; vs.dir = -1; } [].forEach.call(o.querySelectorAll('button'), function (x) { var act = x.getAttribute('data-orden-rot') === vs.campo; x.setAttribute('aria-pressed', act ? 'true' : 'false'); if (act) x.setAttribute('data-dir', vs.dir > 0 ? 'asc' : 'desc'); else x.removeAttribute('data-dir'); }); repintar(); },
          'cds-var-chip cds-var-ord-rot', { 'aria-pressed': vs.campo === k[0] ? 'true' : 'false', 'data-orden-rot': k[0], 'aria-label': 'Ordenar por ' + k[1].toLowerCase() + (vs.campo === k[0] ? (vs.dir > 0 ? ', de menor a mayor' : ', de mayor a menor') : ', de mayor a menor') });
        if (vs.campo === k[0]) b.setAttribute('data-dir', vs.dir > 0 ? 'asc' : 'desc'); o.appendChild(b);
      });
      c.appendChild(o);
    }
    return c;
  }
  function nombreCorto(c) { return SUCURSAL[c] || c; }
  function cajaSenal(s, aplicable, ctx, f) { // C2: aviso de posible rotación POR PRODUCTO; nunca presenta la cantidad como lista para transferir
    var b = el('section', 'cds-var-senal', null, { 'aria-label': 'Señal de posible rotación' }); b.setAttribute('data-cds-senal', s.principal ? 'principal' : 'secundaria');
    b.appendChild(el('h4', 'cds-var-senal-t', 'Señal de posible rotación · ' + (s.principal ? 'acción principal' : 'acción secundaria del producto')));
    var d = el('dl', 'cds-kv cds-var-senal-kv');
    [['Sucursal de origen', nombreSuc(s.origen)], ['Sucursal de destino', nombreSuc(s.destino)],
      ['Cantidad orientativa', s.cantidad !== null ? nf.format(s.cantidad) + ' u. — estimación del producto, no es una cantidad para transferir' : 'Sin cantidad orientativa']].forEach(function (p) { d.appendChild(el('dt', null, p[0])); d.appendChild(el('dd', null, p[1])); });
    b.appendChild(d);
    b.appendChild(el('p', 'cds-var-senal-p', 'La sugerencia es por producto y requiere validación por variante: antes de mover stock hay que confirmar talle, color y stock real de cada variante en Rotaciones. Acá no se crean envíos ni se confirman cantidades.'));
    if (s.stockProducto !== null || s.ventasProducto !== null) b.appendChild(el('p', 'cds-var-senal-p cds-var-senal-ref', 'Según Oportunidades (producto): ' + (s.stockProducto !== null ? nf.format(s.stockProducto) + ' u. de stock en el origen' : '') + (s.stockProducto !== null && s.ventasProducto !== null ? ' · ' : '') + (s.ventasProducto !== null ? nf.format(s.ventasProducto) + ' ventas en el destino' : '') + (s.otrosPares ? ' · ' + nf.format(s.otrosPares) + ' par(es) candidato(s) más en Rotaciones' : '') + '.'));
    if (!aplicable) b.appendChild(el('p', 'cds-aviso cds-var-senal-no', 'El origen o el destino de la señal no está entre las sucursales consideradas en esta consulta (' + ctx.sucursales.map(nombreCorto).join(', ') + '): no se puede analizar por variante.', { role: 'status' }));
    else b.appendChild(el('p', 'cds-var-senal-p cds-var-senal-ref', '«Para revisar» solo indica stock positivo de la variante en el origen y ventas en el destino. El depósito 90 y los fallados 93 no cuentan como stock de origen. No es una transferencia.'));
    var ac = el('div', 'cds-var-senal-ac');
    if (typeof rrIrARotaciones === 'function') ac.appendChild(boton('Ver este producto en Rotaciones', function () { rrIrARotaciones(f.Codigo_producto); }, 'cds-btn', { 'data-fk': 'var_ir_rot' }));
    b.appendChild(ac);
    b.appendChild(el('p', 'cds-var-senal-ref', 'Rotaciones no permite filtrar por talle y color: allí buscá cada variante por su talle y color dentro de la lista del producto.'));
    return b;
  }
  function cajaSugerencias(ctx) { // C2: consulta manual de las sugerencias de Rotaciones (solo administradores); jamás se dispara sola
    if (!esAdmin()) return null;
    var st = rotEstado(ctx), b = el('section', 'cds-var-sug', null, { 'aria-label': 'Sugerencias de Rotaciones', tabindex: '-1', 'data-fk': 'var_rot' }); b.setAttribute('data-fase', st.fase);
    b.appendChild(el('h4', 'cds-var-senal-t', 'Sugerencias de Rotaciones (consulta manual, solo administradores)'));
    var consulta = function (txt) { return boton(txt, function () { rotIniciar(ctx); avisar(); }, 'cds-btn', { 'data-fk': 'var_rot' }); };
    if (st.fase === 'inicial') {
      b.appendChild(el('p', 'cds-var-senal-p', 'Trae las sugerencias que el motor de Rotaciones calculó para este producto en el período. Calcula el plan global del período, así que puede tardar y no se ejecuta sola. Son propuestas sin confirmar: no se generan envíos desde acá.'));
      b.appendChild(consulta('Consultar sugerencias de Rotaciones')); return b;
    }
    if (st.fase === 'cargando') { b.appendChild(el('p', 'cds-var-cargando', 'Consultando Rotaciones…', { role: 'status', 'aria-live': 'polite' })); return b; }
    if (st.fase === 'error') { var a = el('div', 'cds-aviso', null, { role: 'alert' }); a.appendChild(el('b', null, 'No se pudieron consultar las sugerencias. ')); a.appendChild(document.createTextNode(st.error.mensaje)); a.appendChild(consulta('Reintentar')); b.appendChild(a); return b; }
    var en = st.entrada;
    if (!en.items.length) b.appendChild(el('p', 'cds-var-vacio', 'Rotaciones no sugiere mover variantes de este producto en el período' + (en.fuera ? ' (' + nf.format(en.fuera) + ' sugerencia(s) quedan fuera de las sucursales consideradas)' : '') + '.', { role: 'status' }));
    else {
      var ul = el('ul', 'cds-var-sug-l'); en.items.forEach(function (it) {
        ul.appendChild(el('li', null, 'Talle ' + it.Codigo_talle + ' · color ' + it.Codigo_color + (it.Nombre_color && !it.color_no_mapeado ? ' (' + it.Nombre_color + ')' : '') + ' — ' + nombreCorto(it.origen) + ' → ' + nombreCorto(it.destino) + ': ' + n(num(it.cantidad_sugerida)) + ' u. sugeridas por Rotaciones (sin confirmar) · stock de origen según Rotaciones: ' + n(num(it.stock_origen))));
      });
      b.appendChild(ul);
      if (en.fuera) b.appendChild(el('p', 'cds-var-senal-ref', nf.format(en.fuera) + ' sugerencia(s) fuera de las sucursales consideradas no se muestran.'));
      b.appendChild(el('p', 'cds-var-senal-ref', 'Se marcan en la tabla con «Sugerida por Rotaciones». Confirmar o descartar se hace solo en Rotaciones.'));
    }
    b.appendChild(el('p', 'cds-var-senal-ref', 'Datos de las ' + hora(en.recibido) + ' · se conservan 5 minutos')); b.appendChild(consulta('Volver a consultar'));
    return b;
  }
  function tabla(filas, e, vs, repintar, rc) {
    var wrap = el('div', 'cds-var-tabla'), t = el('table', 'cds-var-t'); t.appendChild(el('caption', 'cds-sr', 'Variantes con actividad en el período'));
    var COLS = [['color', 'Variante'], ['ventas', 'Ventas netas'], ['stock', 'Stock suc.'], ['dep90', 'Dep. 90'], ['fallados', 'Fallados 93']];
    var h = el('thead'), hr = el('tr');
    COLS.forEach(function (c, i) {
      var th = el('th', i ? 'r' : '', null, { scope: 'col', 'aria-sort': vs.campo === c[0] || (c[0] === 'color' && vs.campo === 'talle') ? (vs.dir > 0 ? 'ascending' : 'descending') : 'none' });
      var ord = function (campo) { var bt = boton(campo[1], function () { if (vs.campo === campo[0]) vs.dir = -vs.dir; else { vs.campo = campo[0]; vs.dir = (campo[0] === 'ventas' || campo[0] === 'stock' || campo[0] === 'dep90' || campo[0] === 'fallados') ? -1 : 1; } repintar(); }, 'cds-var-ord', { 'data-orden': campo[0], 'aria-label': 'Ordenar por ' + campo[1].toLowerCase() }); if (vs.campo === campo[0]) bt.setAttribute('data-dir', vs.dir > 0 ? 'asc' : 'desc');
        var corto = { ventas: 'Ventas', stock: 'Stock', dep90: 'Dep. 90', fallados: 'Fall. 93' }[campo[0]]; // en pantallas chicas se muestra el título corto; el nombre accesible sigue completo
        if (corto) { bt.textContent = ''; bt.appendChild(el('span', 'cds-var-lg', campo[1])); bt.appendChild(el('span', 'cds-var-sh', corto)); } return bt; };
      if (i === 0) { th.appendChild(ord(['talle', 'Talle'])); th.appendChild(document.createTextNode(' · ')); th.appendChild(ord(['color', 'Color'])); } else th.appendChild(ord(c));
      hr.appendChild(th);
    });
    hr.appendChild(el('th', null, null, { scope: 'col' })).appendChild(el('span', 'cds-sr', 'Distribución por sucursal')); h.appendChild(hr); t.appendChild(h);
    var b = el('tbody'), cols = COLS.length + 1;
    filas.forEach(function (v) {
      var tr = el('tr', 'cds-var-fila'); tr.setAttribute('data-cds-var', v.clave); tr.setAttribute('data-estado', v.estado);
      tr.appendChild(celdaId(v, rc));
      tr.appendChild(celdaNum(v.ventas, null, 'ventas')); var neg = v.stockSucRaw !== null && v.stockSucRaw < 0 || v.flags.indexOf('saldo_negativo') >= 0;
      tr.appendChild(celdaNum(v.stockSucDisp, neg ? 'saldo negativo aparte' : null, 'stock')); tr.appendChild(celdaNum(v.dep90, null, 'dep90')); tr.appendChild(celdaNum(v.fallados, null, 'fallados'));
      var td = el('td', 'cds-var-acc'), abierta = vs.abiertas.has(v.clave), idDet = 'cdsVarDet_' + e.filas.indexOf(v);
      var x = boton(abierta ? '▾' : '▸', function () { if (vs.abiertas.has(v.clave)) vs.abiertas.delete(v.clave); else vs.abiertas.add(v.clave); repintar(); var again = [].filter.call(document.querySelectorAll('[data-cds-var="' + v.clave.replace(/"/g, '') + '"] .cds-var-exp'), function (z) { return z.offsetParent !== null; })[0]; if (again) again.focus({ preventScroll: true }); }, 'cds-var-exp', { 'aria-expanded': abierta ? 'true' : 'false', 'aria-controls': idDet, 'aria-label': (abierta ? 'Ocultar' : 'Ver') + ' la distribución por sucursal de talle ' + v.talle + ' color ' + v.color });
      td.appendChild(x); tr.appendChild(td); b.appendChild(tr);
      if (abierta) { var d = detalleSucursales(v, e.sucursales, cols, rc); d.setAttribute('id', idDet); b.appendChild(d); }
    });
    t.appendChild(b); wrap.appendChild(t); return wrap;
  }

  var api = {
    CFG: CFG, panel: panel, cancelar: cancelar, invalidar: invalidar, reintentar: reintentar, estadoDe: estadoDe, iniciar: iniciar, parametros: parametros, alCambiar: null,
    normalizar: normalizar, totales: totales, totalesDisponibles: totalesDisponibles, conciliar: conciliar, ordenar: ordenar, filtrar: filtrar, compararTalle: compararTalle, claveSeguimiento: claveSeguimiento, CHIPS: CHIPS,
    senalRotacion: senalRotacion, senalAplicable: senalAplicable, revisionRotacion: revisionRotacion, rotEstado: rotEstado, rotIniciar: rotIniciar, claveItem: claveItem, esAdmin: esAdmin, CHIPS_ROT: CHIPS_ROT,
    _estado: function () { return { cache: cache.size, vuelo: !!vuelo, errores: errores.size, rotCache: rotCache.size, rotVuelo: !!rotVuelo, rotErrores: rotErrores.size }; },
  };
  window.CDS_VARIANTES = api;
})();
