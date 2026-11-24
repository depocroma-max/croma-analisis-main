/* CROMA DESIGN SYSTEM 2.0 · Etapa D1B: logica y cliente HTTP de «Mis seguimientos». Sin DOM: se prueba en Node (tests/cds-seguimientos-d1b.test.js).
   Habla EXCLUSIVAMENTE con los endpoints de D1A de croma-api (/seguimientos). El servidor decide todo (sesion, rol, propietario, version, referencia):
   aqui solo se arman pedidos y se traducen respuestas. No usa el almacenamiento del navegador ni guarda nada comercial; las claves de idempotencia viven en memoria. */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api; else raiz.CDS_SEG_API = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CENTROS = ['0001', '0005', '0010', '0012', '0014']; // operativas; Cipo (0009) cerro y no admite seguimientos nuevos
  var NOMBRE_CENTRO = { '0001': 'Paseo', '0005': 'Wave', '0010': 'Perito Moreno', '0012': 'Centenario', '0014': 'Roca' };
  var NIVELES = [
    { id: 'producto', etiqueta: 'Producto completo', corto: 'Producto', requiere: [], ayuda: 'Todas las variantes del producto, en todas las sucursales.' },
    { id: 'color', etiqueta: 'Color', corto: 'Color', requiere: ['color'], ayuda: 'Un color en todos sus talles y sucursales.' },
    { id: 'talle', etiqueta: 'Talle', corto: 'Talle', requiere: ['talle'], ayuda: 'Un talle en todos sus colores y sucursales.' },
    { id: 'variante', etiqueta: 'Variante exacta', corto: 'Variante', requiere: ['talle', 'color'], ayuda: 'Un talle y un color concretos, en todas las sucursales.' },
    { id: 'variante_sucursal', etiqueta: 'Variante por sucursal', corto: 'Variante en sucursal', requiere: ['talle', 'color', 'centro'], ayuda: 'Un talle y un color concretos, en una sola sucursal.' },
  ];
  var PREFIJO = { producto: 'P', color: 'C', talle: 'T', variante: 'V', variante_sucursal: 'VS' };
  var POR_PREFIJO = { P: 'producto', C: 'color', T: 'talle', V: 'variante', VS: 'variante_sucursal' };

  // Misma regla que cds/variantes.js y que el servidor (motor/seguimientos-claves.js): partes siempre TEXTO; lo no alfanumerico se escapa. El servidor la recalcula.
  function parte(p) { p = String(p == null ? '' : p); return /^[A-Za-z0-9]*$/.test(p) ? p : encodeURIComponent(p); }
  function claveCanonica(nivel, o) {
    var pre = PREFIJO[nivel]; if (!pre) throw new Error('nivel de seguimiento desconocido: ' + nivel);
    var p = [pre, parte(o.cod)];
    if (nivel === 'color') p.push(parte(o.color)); else if (nivel === 'talle') p.push(parte(o.talle));
    else if (nivel === 'variante' || nivel === 'variante_sucursal') { p.push(parte(o.talle)); p.push(parte(o.color)); }
    if (nivel === 'variante_sucursal') p.push(parte(o.centro));
    return p.join(':');
  }
  function parsearClave(clave) {
    var p = String(clave || '').split(':'), nivel = POR_PREFIJO[p[0]]; if (!nivel) return null;
    var d = function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } };
    var o = { nivel: nivel, cod: d(p[1] || '') };
    if (nivel === 'color') o.color = d(p[2] || ''); else if (nivel === 'talle') o.talle = d(p[2] || '');
    else if (nivel === 'variante' || nivel === 'variante_sucursal') { o.talle = d(p[2] || ''); o.color = d(p[3] || ''); }
    if (nivel === 'variante_sucursal') o.centro = d(p[4] || '');
    return o;
  }

  // Que niveles se pueden elegir desde un contexto (lo que la pantalla conoce): { cod, talle?, color?, centro? }. El motivo de un nivel NO disponible se muestra al usuario.
  function nivelesDisponibles(ctx) {
    var tiene = function (k) { return ctx[k] !== undefined && ctx[k] !== null && (k === 'talle' || k === 'color' ? true : String(ctx[k]) !== ''); };
    return NIVELES.map(function (n) {
      var falta = n.requiere.filter(function (k) { return !tiene(k); });
      var r = { nivel: n.id, etiqueta: n.etiqueta, corto: n.corto, ayuda: n.ayuda, disponible: true, motivo: null };
      if (falta.length) { r.disponible = false; r.motivo = 'Se elige desde «Talle y color» del detalle del producto.'; }
      else if (n.id === 'variante_sucursal' && CENTROS.indexOf(String(ctx.centro)) < 0) { r.disponible = false; r.motivo = ctx.centro === '0009' ? 'Cipo (0009) cerró: no admite seguimientos nuevos.' : 'Elegí una sucursal operativa en la distribución por sucursal.'; }
      return r;
    });
  }
  function objetivoDe(nivel, ctx) { // cuerpo para POST /seguimientos (sin propietario, sin referencia: los pone el servidor)
    var o = { nivel: nivel, cod: String(ctx.cod) };
    if (nivel === 'color') o.color = String(ctx.color); if (nivel === 'talle') o.talle = String(ctx.talle);
    if (nivel === 'variante' || nivel === 'variante_sucursal') { o.talle = String(ctx.talle); o.color = String(ctx.color); }
    if (nivel === 'variante_sucursal') o.centro = String(ctx.centro);
    return o;
  }
  // Niveles que CUBREN al elegido (si el usuario ya sigue alguno, el nuevo es redundante en parte). producto ⊃ color/talle/variante ⊃ variante_sucursal; color/talle ⊃ variante.
  var CUBREN = { producto: [], color: ['producto'], talle: ['producto'], variante: ['producto', 'color', 'talle'], variante_sucursal: ['producto', 'color', 'talle', 'variante'] };
  function clavesSuperiores(nivel, ctx) {
    return CUBREN[nivel].filter(function (n) { return nivelesDisponibles(ctx).filter(function (x) { return x.nivel === n; })[0].disponible; }).map(function (n) { return { nivel: n, clave: claveCanonica(n, ctx) }; });
  }
  function descripcionObjetivo(o, sinCodigo) { // «Producto completo 03010», «Talle M · color 01 de 03010»... (sinCodigo: «Talle M · color 01», para listas que ya muestran el codigo aparte)
    var cod = o.cod, de = sinCodigo ? '' : ' de ' + cod, c = o.color === '' ? '(sin código)' : o.color, t = o.talle === '' ? '(sin talle)' : o.talle;
    if (o.nivel === 'producto') return sinCodigo ? 'Producto completo' : 'Producto completo ' + cod;
    if (o.nivel === 'color') return 'Color ' + c + de;
    if (o.nivel === 'talle') return 'Talle ' + t + de;
    if (o.nivel === 'variante') return 'Talle ' + t + ' · color ' + c + de;
    return 'Talle ' + t + ' · color ' + c + de + ' en ' + (NOMBRE_CENTRO[o.centro] || o.centro) + ' (' + o.centro + ')';
  }

  // ---------- errores del servidor → texto para la persona ----------
  var MENSAJES = {
    400: 'Los datos enviados no son válidos.', 401: 'Tu sesión venció o fue revocada. Volvé a iniciar sesión.', 403: 'No tenés permiso para esta acción.', 404: 'No se encontró el seguimiento.',
    409: 'Ya existe un seguimiento activo con esos datos.', 412: 'Este seguimiento cambió en otra pestaña o sesión. Se cargó la versión actual: revisá y repetí la acción.', 413: 'El texto es demasiado largo.',
    422: 'Se alcanzó un límite de seguimientos activos.', 428: 'Falta la versión del seguimiento: recargá el detalle.', 429: 'Hiciste muchas acciones seguidas. Esperá unos segundos y reintentá.', 503: 'Seguimientos no está disponible por ahora. Reintentá en unos minutos.',
  };
  var POR_CODIGO = {
    USUARIO_NO_HABILITADO: 'Tu usuario no está habilitado para seguimientos.', TOKEN_REVOCADO: 'La sesión fue revocada: volvé a iniciar sesión.', SOLO_LECTURA_AJENO: 'Es un seguimiento de otra persona: podés consultarlo, no modificarlo.',
    YA_SEGUIDO: 'Ya seguís esto.', SEGUIMIENTOS_NO_DISPONIBLE: 'Seguimientos no está disponible por ahora. Reintentá en unos minutos.', SIN_COPIA_EXTERNA_VERIFICADA: 'Las escrituras están en pausa hasta que haya una copia de seguridad externa verificada. Podés consultar, pero no guardar cambios.',
    CENTRO_NO_SEGUIBLE: 'Esa sucursal no admite seguimientos nuevos.', LIMITE_USUARIO: 'Alcanzaste el máximo de seguimientos activos. Finalizá alguno para crear otro.', LIMITE_GLOBAL: 'Se alcanzó el máximo de seguimientos activos del sistema.',
    OCUPADO: 'El sistema está ocupado. Reintentá en unos segundos.', JSON_INVALIDO: 'La solicitud estaba mal formada. Reintentá.', IDEMPOTENCIA_CONFLICTO: 'Esta acción ya se había enviado con otros datos. Volvé a abrir el diálogo.', FINALIZADO: 'El seguimiento está finalizado: reabrilo para editarlo.', YA_ACTIVO: 'El seguimiento ya estaba activo.', YA_FINALIZADO: 'El seguimiento ya estaba finalizado.',
    LIMITE_ESCRITURAS: MENSAJES[429],
    VERSION_DESACTUALIZADA: MENSAJES[412],
  };
  function ErrorSeg(status, codigo, mensaje, datos) { var e = new Error(mensaje); e.name = 'ErrorSeg'; e.status = status; e.codigo = codigo; e.datos = datos || null; e.mensaje = mensaje; return e; }
  function traducirError(status, cuerpo) {
    var codigo = cuerpo && typeof cuerpo.code === 'string' ? cuerpo.code : null;
    var msg = (codigo && POR_CODIGO[codigo]) || MENSAJES[status] || 'No se pudo completar la acción (error ' + status + ').';
    if (status === 400 && cuerpo && typeof cuerpo.error === 'string' && cuerpo.error.length < 160 && !codigo) msg = MENSAJES[400];
    if (status === 429 && cuerpo && typeof cuerpo.reintentar_en_s === 'number') msg = 'Hiciste muchas acciones seguidas. Reintentá en ' + cuerpo.reintentar_en_s + ' s.';
    return ErrorSeg(status, codigo, msg, cuerpo || null);
  }
  var REFERENCIA_MOTIVOS = {
    proveedor_no_configurado: 'Todavía no hay una fuente de datos comerciales configurada.', cache_no_disponible: 'Los datos calculados por Oportunidades no estaban disponibles en ese momento.',
    contexto_incompleto: 'No se informó el período y las sucursales de la consulta.', datos_vencidos: 'Los datos de Oportunidades estaban vencidos.', producto_fuera_de_la_consulta: 'El producto no estaba en la consulta de Oportunidades.',
    alcance_no_cubierto: 'Oportunidades solo calcula productos completos: este nivel no tiene referencia.', datos_incompletos: 'Los datos del producto estaban incompletos.', tiempo_agotado: 'La fuente de datos tardó demasiado.',
    error_proveedor: 'La fuente de datos falló en ese momento.', respuesta_no_confiable: 'La fuente de datos devolvió información no confiable.', sin_datos_confiables: 'No había datos confiables.',
  };
  var FUENTES = { oportunidades_cache: 'Oportunidades (datos ya calculados y vigentes)' };
  var REFERENCIA_ETIQUETAS = { ventas_netas_periodo: 'Ventas netas del período', ventas_30d_brutas: 'Ventas de los últimos 30 días (brutas)', stock_sucursales: 'Stock en sucursales', stock_deposito_90: 'Stock en Depósito 90', stock_fallados: 'Fallados (93)', antiguedad_datos_s: 'Antigüedad de los datos' };
  var EVENTOS = { creado: 'Seguimiento creado', motivo_editado: 'Motivo editado', nota: 'Nota', finalizado: 'Seguimiento finalizado', reabierto: 'Seguimiento reabierto' };

  // ---------- cliente ----------
  function nuevaClave() {
    var c = typeof crypto !== 'undefined' ? crypto : null;
    if (c && c.randomUUID) return c.randomUUID();
    var a = new Uint8Array(16); if (c && c.getRandomValues) c.getRandomValues(a); else for (var i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function crearCliente(o) {
    var base = o.base || '', token = o.token || function () { return null; }, f = o.fetch || (typeof fetch === 'function' ? fetch.bind(typeof self !== 'undefined' ? self : undefined) : null);
    async function pedir(metodo, ruta, op) {
      op = op || {}; var h = { Accept: 'application/json' }, t = token(); if (t) h.Authorization = 'Bearer ' + t;
      if (op.cuerpo !== undefined) h['Content-Type'] = 'application/json';
      if (op.version !== undefined) h['If-Match'] = '"' + op.version + '"';
      if (op.idem) h['Idempotency-Key'] = op.idem;
      var resp;
      try { resp = await f(base + '/seguimientos' + ruta, { method: metodo, headers: h, body: op.cuerpo !== undefined ? JSON.stringify(op.cuerpo) : undefined, signal: op.signal }); }
      catch (e) { if (e && e.name === 'AbortError') throw e; throw ErrorSeg(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor. Revisá tu conexión y reintentá.', null); }
      var json = null; try { json = await resp.json(); } catch (e) { json = null; }
      if (!resp.ok) throw traducirError(resp.status, json);
      return json;
    }
    function qs(p) { var s = Object.keys(p || {}).filter(function (k) { return p[k] !== undefined && p[k] !== null && p[k] !== ''; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(p[k]); }).join('&'); return s ? '?' + s : ''; }
    return {
      // Sondeo: ¿esta persona puede usar seguimientos? Una lectura propia con el mismo control de acceso que todo lo demas (interruptor, rol, habilitacion).
      async sondear() {
        try { await pedir('GET', '/?limit=1'); return { estado: 'habilitado' }; }
        catch (e) { if (e.status === 404 || e.status === 401 || e.status === 403) return { estado: 'inactivo', codigo: e.codigo }; if (e.status === 503 || e.status === 0) return { estado: 'no_disponible', error: e }; return { estado: 'no_disponible', error: e }; }
      },
      async claves(lista) { // consulta por LOTE: una solicitud (maximo 200 claves) en lugar de una por producto
        var out = {}, unicas = Array.from(new Set(lista));
        for (var i = 0; i < unicas.length; i += 100) { var r = await pedir('GET', '/claves' + qs({ claves: unicas.slice(i, i + 100).join(',') })); Object.assign(out, r.seguidas || {}); }
        return out;
      },
      crear: function (objetivo, motivo, contexto, idem) { var c = Object.assign({}, objetivo); if (motivo) c.motivo = motivo; if (contexto) c.contexto = contexto; return pedir('POST', '/', { cuerpo: c, idem: idem }); },
      listar: function (p, signal) { return pedir('GET', '/' + qs(p), { signal: signal }); },
      detalle: function (id) { return pedir('GET', '/' + encodeURIComponent(id)); },
      propietarios: function () { return pedir('GET', '/propietarios'); },
      editarMotivo: function (id, version, motivo) { return pedir('PATCH', '/' + id, { cuerpo: { motivo: motivo }, version: version }); },
      agregarNota: function (id, texto, idem) { return pedir('POST', '/' + id + '/notas', { cuerpo: { texto: texto }, idem: idem }); },
      finalizar: function (id, version, motivoFin) { return pedir('POST', '/' + id + '/finalizar', { cuerpo: motivoFin ? { motivo_fin: motivoFin } : {}, version: version }); },
      reabrir: function (id, version) { return pedir('POST', '/' + id + '/reabrir', { cuerpo: {}, version: version }); },
    };
  }

  // Contexto que el cliente informa al crear (periodo y sucursales de la consulta). El servidor lo VALIDA y solo lo usa para buscar en su cache: nunca son valores comerciales.
  function contextoDe(desde, hasta, sucursales) {
    var fecha = /^\d{4}-\d{2}-\d{2}$/;
    if (!fecha.test(String(desde)) || !fecha.test(String(hasta)) || !Array.isArray(sucursales)) return null;
    var suc = CENTROS.filter(function (c) { return sucursales.indexOf(c) >= 0; });
    return suc.length ? { desde: desde, hasta: hasta, sucursales: suc } : null;
  }

  return { FUENTES: FUENTES, CENTROS: CENTROS, NOMBRE_CENTRO: NOMBRE_CENTRO, NIVELES: NIVELES, EVENTOS: EVENTOS, REFERENCIA_MOTIVOS: REFERENCIA_MOTIVOS, REFERENCIA_ETIQUETAS: REFERENCIA_ETIQUETAS,
    claveCanonica: claveCanonica, parsearClave: parsearClave, nivelesDisponibles: nivelesDisponibles, objetivoDe: objetivoDe, clavesSuperiores: clavesSuperiores, descripcionObjetivo: descripcionObjetivo,
    traducirError: traducirError, ErrorSeg: ErrorSeg, crearCliente: crearCliente, nuevaClave: nuevaClave, contextoDe: contextoDe };
});
