'use strict';
// Rotaciones -> ChatGPT (correos operativos). LOGICA PURA: configuracion, armado del paquete JSON, validaciones, plantilla del correo
// (HTML + texto plano) y texto de la solicitud. No toca el DOM, no llama a la API, no envia nada. IMPORTANTE: aca NO se calcula ni se
// modifica ninguna regla de rotaciones -- solo se toman las lineas que el motor de croma-api ya fijo (y la cantidad vigente que eligio
// el usuario) y se empaquetan. Se carga como script clasico en el navegador y con require() en los tests (node:test).

// ── Configuracion UNICA (nada de esto debe repetirse en otros archivos) ─────────────────────────────────────────────────────────────
const RC_CONFIG = {
  schema: 'croma.rotacion-correos',
  schema_version: '1.0',
  // Cuenta desde la que se emiten los correos (la emision NO la hace esta app) y copia habitual.
  cuenta_emisora: 'depocroma@gmail.com',
  copia: ['belencroma@gmail.com'],
  // Sucursales que pueden ser ORIGEN (reciben el correo operativo). Clave = codigo de centro de Sysneo.
  origenes: {
    '0001': { nombre: '01 PASEO', email: 'cromapaseo2@gmail.com' },
    '0005': { nombre: '05 WAVE', email: 'croma.sarmiento@gmail.com' },
    '0010': { nombre: '10 PERITO MORENO', email: 'cromaperito@gmail.com' },
    '0012': { nombre: '12 CENTENARIO', email: 'cromacentenario@gmail.com' },
    '0014': { nombre: '14 ROCA', email: 'cromaroca180@gmail.com' },
  },
  // Nombres de sucursales que solo pueden ser DESTINO (sin correo).
  solo_destino: { '0009': { nombre: '09 CIPO SAN MARTÍN' } },
  // Un stock consultado hace mas de esto se informa como advertencia (el stock de sucursales de Sysneo se actualiza una vez al dia).
  stock_max_antiguedad_min: 24 * 60,
  zona_horaria: 'America/Argentina/Buenos_Aires',
  clave_lotes_previos: 'rcLotesPreparados',
};

function rcNombreSucursal(codigo, config) {
  const c = config || RC_CONFIG;
  const o = c.origenes[codigo] || (c.solo_destino && c.solo_destino[codigo]);
  return o ? o.nombre : null;
}

// ── Utilidades ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function rcEsc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function rcTexto(v) { return v == null ? '' : String(v); }
function rcFechaHora(iso, tz) {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return '—';
  const p = {};
  new Intl.DateTimeFormat('es-AR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return p.day + '/' + p.month + '/' + p.year + ' ' + p.hour + ':' + p.minute;
}
function rcFecha(iso, tz) { return rcFechaHora(iso, tz).split(' ')[0]; }
function rcFechaCompacta(iso, tz) { const f = rcFecha(iso, tz).split('/'); return f[2] + f[1] + f[0]; }
function rcCmp(a, b) { return rcTexto(a).localeCompare(rcTexto(b), 'es', { numeric: false }); }
// Hash determinista de 64 bits (dos FNV-1a de 32 bits con semillas distintas), 16 hex. No es criptografico: solo identifica el contenido.
function rcHash(str) {
  let h1 = 0x811c9dc5, h2 = 0x9747b28c;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
// Solo las cantidades validas (enteras > 0) se suman en los totales; las invalidas se reportan una vez, como error de la linea.
const rcCantValida = q => (Number.isInteger(q) && q > 0 ? q : 0);
const rcClaveVariante = l => [l.codigo, l.talle, l.codigo_color].join('\u0001');

// ── Adaptador: items del plan de rotaciones -> lineas planas ───────────────────────────────────────────────────────────────────────
// items: los objetos de RT_ROTACIONES.pares[].items; cantidadDe(item) devuelve la cantidad vigente (editada o sugerida). Las cantidades
// invalidas NO se descartan: pasan tal cual para que la validacion las rechace con mensaje. Devuelve tambien avisos que no viajan en el JSON.
function rcLineasDesdeItems(items, cantidadDe) {
  const avisos = [];
  const lineas = (items || []).map(it => {
    const cantidad = cantidadDe ? cantidadDe(it) : it.cantidad_sugerida;
    if (Number.isInteger(cantidad) && Number.isInteger(it.cantidad_sugerida) && cantidad > it.cantidad_sugerida) {
      avisos.push({ codigo: 'cantidad_sobre_sugerida', mensaje: it.Codigo_producto + ' talle ' + it.Codigo_talle + ' color ' + it.Codigo_color + ': la cantidad (' + cantidad + ') supera lo sugerido (' + it.cantidad_sugerida + ').' });
    }
    if (it.color_no_mapeado) {
      avisos.push({ codigo: 'color_no_mapeado', mensaje: it.Codigo_producto + ' talle ' + it.Codigo_talle + ': el color ' + it.Codigo_color + ' no tiene nombre mapeado.' });
    }
    return {
      origen: it.origen, destino: it.destino,
      codigo: it.Codigo_producto, talle: it.Codigo_talle, codigo_color: it.Codigo_color,
      nombre_color: it.Nombre_color, descripcion: it.Nombre_producto, cantidad,
    };
  });
  return { lineas, avisos };
}

// ── Armado del paquete ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
// opts: { lineas, stock_consultado, periodo:{desde,hasta}, ahora (Date|ISO, default now), config, subtotales_declarados:{ 'orig|dest': n, total: n } }
// Los totales del paquete SE DECLARAN a partir de los datos de entrada (declarados) y la validacion los recalcula linea por linea.
function rcArmarPaquete(opts) {
  const config = opts.config || RC_CONFIG;
  const ahora = opts.ahora ? new Date(opts.ahora) : new Date();
  const generado_en = ahora.toISOString();
  const grupos = new Map();
  (opts.lineas || []).forEach(l => {
    const k = rcTexto(l.origen) + '|' + rcTexto(l.destino);
    if (!grupos.has(k)) grupos.set(k, { origen: l.origen, destino: l.destino, lineas: [] });
    grupos.get(k).lineas.push({
      codigo: rcTexto(l.codigo), talle: rcTexto(l.talle), codigo_color: rcTexto(l.codigo_color),
      nombre_color: rcTexto(l.nombre_color), descripcion: rcTexto(l.descripcion), cantidad: l.cantidad,
    });
  });
  const decl = opts.subtotales_declarados || null;
  const lista = [...grupos.values()].map(g => {
    g.lineas.sort((a, b) => rcCmp(a.codigo, b.codigo) || rcCmp(a.talle, b.talle) || rcCmp(a.codigo_color, b.codigo_color));
    const total = g.lineas.reduce((s, l) => s + rcCantValida(l.cantidad), 0);
    const k = g.origen + '|' + g.destino;
    return {
      origen: { codigo: rcTexto(g.origen), sucursal: rcNombreSucursal(g.origen, config) },
      destino: { codigo: rcTexto(g.destino), sucursal: rcNombreSucursal(g.destino, config) },
      lineas: g.lineas,
      total_unidades: decl && decl[k] != null ? decl[k] : total,
      total_variantes: g.lineas.length,
    };
  }).sort((a, b) => rcCmp(a.origen.sucursal || a.origen.codigo, b.origen.sucursal || b.origen.codigo) || rcCmp(a.destino.sucursal || a.destino.codigo, b.destino.sucursal || b.destino.codigo));

  const sumaGrupos = lista.reduce((s, g) => s + g.lineas.reduce((a, l) => a + rcCantValida(l.cantidad), 0), 0);
  const contenido = lista.map(g => g.origen.codigo + '>' + g.destino.codigo + ':' + g.lineas.map(l => [l.codigo, l.talle, l.codigo_color, l.cantidad].join('/')).join(',')).join(';');
  const lote_id = 'ROT-' + rcFechaCompacta(generado_en, config.zona_horaria) + '-' + rcHash(contenido + '#' + rcTexto(opts.stock_consultado)).slice(0, 10);

  return {
    schema: config.schema, schema_version: config.schema_version,
    lote_id, generado_en, stock_consultado: opts.stock_consultado || null,
    periodo: opts.periodo ? { desde: rcTexto(opts.periodo.desde), hasta: rcTexto(opts.periodo.hasta) } : null,
    grupos: lista,
    total_general: {
      unidades: decl && decl.total != null ? decl.total : sumaGrupos,
      variantes: lista.reduce((s, g) => s + g.lineas.length, 0),
      grupos: lista.length,
    },
  };
}

// ── Validaciones ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Devuelve { ok, errores:[{codigo,mensaje}], advertencias:[...], resumen:{movimientos,variantes,unidades} }. Los errores bloquean la
// transferencia; las advertencias no. opts: { ahora, config, lotesPrevios:[ids], avisos:[...] }
function rcValidarPaquete(p, opts) {
  opts = opts || {};
  const config = opts.config || RC_CONFIG;
  const ahora = opts.ahora ? new Date(opts.ahora).getTime() : Date.now();
  const errores = [], advertencias = [];
  const err = (codigo, mensaje) => errores.push({ codigo, mensaje });
  const adv = (codigo, mensaje) => advertencias.push({ codigo, mensaje });

  if (!p || typeof p !== 'object' || !Array.isArray(p.grupos)) { err('paquete_invalido', 'El paquete no tiene la estructura esperada.'); return { ok: false, errores, advertencias, resumen: { movimientos: 0, variantes: 0, unidades: 0 } }; }
  if (!p.grupos.length) err('sin_lineas', 'No hay movimientos para preparar.');
  if (p.schema_version !== config.schema_version) err('version_esquema', 'Version de esquema no soportada: ' + p.schema_version);
  if (!p.lote_id) err('sin_lote', 'Falta el identificador de lote.');

  const sc = p.stock_consultado ? new Date(p.stock_consultado).getTime() : NaN;
  if (!p.stock_consultado || isNaN(sc)) err('sin_stock_consultado', 'Falta la fecha y hora de consulta del stock.');
  else if (ahora - sc > config.stock_max_antiguedad_min * 60000) adv('stock_desactualizado', 'El stock se consulto el ' + rcFechaHora(p.stock_consultado, config.zona_horaria) + ' (hace mas de ' + Math.round(config.stock_max_antiguedad_min / 60) + ' h). Actualizalo antes de despachar.');

  if (opts.lotesPrevios && p.lote_id && opts.lotesPrevios.includes(p.lote_id)) adv('lote_repetido', 'Este lote (' + p.lote_id + ') ya se preparo antes en este navegador. Verifica no duplicar correos.');
  (opts.avisos || []).forEach(a => adv(a.codigo, a.mensaje));

  const paresVistos = new Set();
  let variantes = 0, unidades = 0, sumaDeclaradaGrupos = 0;
  p.grupos.forEach((g, gi) => {
    const o = g && g.origen && g.origen.codigo, d = g && g.destino && g.destino.codigo;
    const etq = (rcNombreSucursal(o, config) || o) + ' -> ' + (rcNombreSucursal(d, config) || d);
    if (!o || !d) { err('sin_sucursal', 'Grupo ' + (gi + 1) + ': falta origen o destino.'); return; }
    if (o === d) err('origen_igual_destino', etq + ': origen y destino son la misma sucursal.');
    if (!config.origenes[o] || !config.origenes[o].email) err('origen_sin_correo', etq + ': el origen ' + o + ' no tiene un correo configurado.');
    if (!rcNombreSucursal(d, config)) err('destino_desconocido', etq + ': destino ' + d + ' desconocido.');
    if (paresVistos.has(o + '|' + d)) err('grupo_repetido', etq + ': el par origen/destino aparece en mas de un grupo.');
    paresVistos.add(o + '|' + d);
    if (!Array.isArray(g.lineas) || !g.lineas.length) { err('grupo_vacio', etq + ': no tiene lineas.'); return; }

    const filas = new Set(), combos = new Set();
    let suma = 0;
    g.lineas.forEach((l, li) => {
      const ref = etq + ' linea ' + (li + 1) + (l && l.codigo ? ' (' + l.codigo + ' ' + l.talle + ' ' + l.codigo_color + ')' : '');
      ['codigo', 'talle', 'codigo_color', 'nombre_color', 'descripcion'].forEach(c => {
        if (!l || typeof l[c] !== 'string' || !l[c].trim()) err('dato_faltante', ref + ': falta ' + c + '.');
      });
      const q = l && l.cantidad;
      if (q == null || typeof q !== 'number' || !Number.isFinite(q)) err('cantidad_invalida', ref + ': cantidad nula o no numerica.');
      else if (!Number.isInteger(q)) err('cantidad_invalida', ref + ': la cantidad ' + q + ' no es entera.');
      else if (q <= 0) err('cantidad_invalida', ref + ': la cantidad ' + q + ' debe ser mayor que cero.');
      else { suma += q; }
      if (l) {
        const fila = JSON.stringify([l.codigo, l.talle, l.codigo_color, l.nombre_color, l.descripcion, l.cantidad]);
        const combo = rcClaveVariante(l);
        if (filas.has(fila)) err('fila_duplicada', ref + ': fila duplicada.');
        else if (combos.has(combo)) err('combinacion_repetida', ref + ': la combinacion codigo+talle+color aparece mas de una vez en el par.');
        filas.add(fila); combos.add(combo);
      }
    });
    variantes += g.lineas.length; unidades += suma; sumaDeclaradaGrupos += Number(g.total_unidades) || 0;
    if (g.total_unidades !== suma) err('subtotal_inconsistente', etq + ': el subtotal declarado (' + g.total_unidades + ') no coincide con la suma de lineas (' + suma + ').');
    if (g.total_variantes !== g.lineas.length) err('subtotal_inconsistente', etq + ': variantes declaradas (' + g.total_variantes + ') distintas de las lineas (' + g.lineas.length + ').');
  });
  const tg = p.total_general || {};
  if (tg.unidades !== unidades) err('total_inconsistente', 'El total general declarado (' + tg.unidades + ') no coincide con la suma de lineas (' + unidades + ').');
  if (tg.variantes !== variantes) err('total_inconsistente', 'Las variantes declaradas (' + tg.variantes + ') no coinciden con las lineas (' + variantes + ').');
  if (tg.grupos !== p.grupos.length) err('total_inconsistente', 'Los grupos declarados (' + tg.grupos + ') no coinciden (' + p.grupos.length + ').');

  return { ok: errores.length === 0, errores, advertencias, resumen: { movimientos: p.grupos.length, variantes, unidades } };
}

// ── Exportacion JSON ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function rcExportarJson(p) { return JSON.stringify(p, null, 2); }

// ── Correo operativo (plantilla aprobada: blanco y negro, bajo consumo de tinta) ─────────────────────────────────────────────────────
// Tablas de maquetacion + estilos inline (compatible con Gmail/Outlook/Thunderbird). El <style> es solo una mejora (movil + impresion).
const RC_TH = 'padding:7px 6px;border-bottom:2px solid #111111;font-size:11px;letter-spacing:.5px;color:#333333;';
const RC_TD = 'padding:8px 6px;border-bottom:1px solid #d0d0d0;';
function rcAsunto(g, fechaIso, config) {
  config = config || RC_CONFIG;
  return 'ROTACION ' + (g.origen.sucursal || g.origen.codigo) + ' A ' + (g.destino.sucursal || g.destino.codigo) + ' – ' + rcFecha(fechaIso, config.zona_horaria);
}
function rcDestinatarios(g, config) {
  config = config || RC_CONFIG;
  const o = config.origenes[g.origen.codigo];
  return { de: config.cuenta_emisora, para: o ? [o.email] : [], cc: config.copia.slice() };
}
function rcRenderCorreoHtml(g, p, config) {
  config = config || RC_CONFIG;
  const tz = config.zona_horaria;
  const O = rcEsc(g.origen.sucursal || g.origen.codigo), D = rcEsc(g.destino.sucursal || g.destino.codigo);
  const filas = g.lineas.map(l =>
    '<tr style="page-break-inside:avoid;"><td style="' + RC_TD + 'font-weight:bold;">' + rcEsc(l.codigo) + '</td><td style="' + RC_TD + '">' + rcEsc(l.talle) + '</td><td style="' + RC_TD + '">' + rcEsc(l.codigo_color) +
    '</td><td style="' + RC_TD + '">' + rcEsc(l.nombre_color) + '</td><td style="' + RC_TD + '">' + rcEsc(l.descripcion) +
    '</td><td align="right" style="' + RC_TD + 'text-align:right;font-weight:bold;font-size:16px;">' + rcEsc(l.cantidad) + '</td></tr>').join('\n   ');
  return '<!doctype html>\n<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<title>' + rcEsc(rcAsunto(g, p.generado_en, config)) + '</title>\n<style>\n' +
    '@media only screen and (max-width:620px){.c{width:100%!important;table-layout:fixed!important}.s{overflow-x:auto!important;-webkit-overflow-scrolling:touch}.t{min-width:560px!important}.p{padding:14px 14px!important}.t td,.t th{padding:6px 3px!important;font-size:11px!important;letter-spacing:0!important}}\n' +
    '@media print{@page{size:A4;margin:12mm}body,table,td,th{background:#ffffff!important;color:#000000!important;-webkit-print-color-adjust:economy;print-color-adjust:economy}.c{width:100%!important;max-width:100%!important;border:0!important}.p{padding-left:0!important;padding-right:0!important}.t tr{page-break-inside:avoid}thead{display:table-header-group}tfoot{display:table-footer-group}.s{overflow:visible!important}.t{min-width:0!important}}\n' +
    '</style></head>\n<body style="margin:0;padding:0;background:#ffffff;">\n' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:8px;">\n' +
    '<table role="presentation" class="c" width="680" cellpadding="0" cellspacing="0" style="width:680px;max-width:100%;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111111;">\n' +
    ' <tr><td class="p" style="padding:8px 4px 10px 4px;border-bottom:2px solid #111111;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="font-size:22px;font-weight:bold;letter-spacing:2px;color:#111111;">CROMA<br><span style="font-size:11px;font-weight:normal;letter-spacing:1.5px;color:#555555;">DEP&Oacute;SITO CENTRAL</span></td>' +
    '<td align="right" valign="bottom" style="font-size:13px;color:#555555;">' + rcEsc(rcFecha(p.generado_en, tz)) + '</td></tr></table></td></tr>\n' +
    ' <tr><td class="p" style="padding:16px 4px 4px 4px;"><div style="font-size:20px;font-weight:bold;color:#111111;letter-spacing:.5px;">ROTACI&Oacute;N DE MERCADER&Iacute;A</div>' +
    '<div style="font-size:17px;font-weight:bold;color:#111111;padding-top:8px;">' + O + ' &nbsp;&rarr;&nbsp; ' + D + '</div></td></tr>\n' +
    ' <tr><td class="p" style="padding:10px 4px 6px 4px;font-size:14px;line-height:20px;color:#222222;">Hola equipo de <b>' + O + '</b>:<br>Por favor preparen los siguientes art&iacute;culos con destino a <b>' + D + '</b>.</td></tr>\n' +
    ' <tr><td class="p" style="padding:6px 4px;"><div class="s" style="overflow-x:auto;"><table role="presentation" class="t" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;color:#111111;border-top:1px solid #bbbbbb;">\n' +
    '  <thead style="display:table-header-group;"><tr style="text-align:left;"><th style="' + RC_TH + '">C&Oacute;DIGO</th><th style="' + RC_TH + '">TALLE</th><th style="' + RC_TH + '">COD. COLOR</th><th style="' + RC_TH + '">COLOR</th><th style="' + RC_TH + '">DESCRIPCI&Oacute;N</th><th align="right" style="' + RC_TH + 'text-align:right;">CANT.</th></tr></thead>\n' +
    '  <tbody>\n   ' + filas + '\n  </tbody>\n </table></div></td></tr>\n' +
    ' <tr><td class="p" style="padding:8px 4px 4px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #111111;border-bottom:2px solid #111111;page-break-inside:avoid;"><tr>' +
    '<td style="padding:10px 6px;font-size:13px;color:#555555;">' + rcEsc(g.total_variantes) + ' variante' + (g.total_variantes === 1 ? '' : 's') + '</td>' +
    '<td align="right" style="padding:10px 6px;font-size:19px;font-weight:bold;color:#111111;text-align:right;">TOTAL: ' + rcEsc(g.total_unidades) + ' UNIDAD' + (g.total_unidades === 1 ? '' : 'ES') + '</td></tr></table></td></tr>\n' +
    ' <tr><td class="p" style="padding:14px 4px 6px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="page-break-inside:avoid;"><tr><td style="border-left:3px solid #111111;padding:2px 12px;font-size:13px;line-height:19px;color:#222222;">' +
    '<b>Control previo al despacho</b><br>Verificar c&oacute;digo, talle, color y cantidad de cada variante contra el stock f&iacute;sico antes de confirmar la separaci&oacute;n y el despacho.</td></tr></table></td></tr>\n' +
    ' <tr><td class="p" style="padding:10px 4px 4px 4px;font-size:11px;color:#666666;">Stock consultado: ' + rcEsc(rcFechaHora(p.stock_consultado, tz)) + ' &nbsp;&middot;&nbsp; Lote: ' + rcEsc(p.lote_id) + '</td></tr>\n' +
    '</table></td></tr></table>\n</body></html>\n';
}
function rcRenderCorreoTexto(g, p, config) {
  config = config || RC_CONFIG;
  const tz = config.zona_horaria;
  const O = g.origen.sucursal || g.origen.codigo, D = g.destino.sucursal || g.destino.codigo;
  const filas = g.lineas.map(l => [l.codigo, l.talle, l.codigo_color, l.nombre_color, l.descripcion, 'x' + l.cantidad].join(' | '));
  return [
    'CROMA - DEPOSITO CENTRAL', 'ROTACION DE MERCADERIA', rcFecha(p.generado_en, tz), O + ' -> ' + D, '',
    'Hola equipo de ' + O + ':', 'Por favor preparen los siguientes articulos con destino a ' + D + '.', '',
    'CODIGO | TALLE | COD. COLOR | COLOR | DESCRIPCION | CANT.', ...filas, '',
    'TOTAL: ' + g.total_unidades + ' UNIDAD' + (g.total_unidades === 1 ? '' : 'ES') + ' (' + g.total_variantes + ' variante' + (g.total_variantes === 1 ? '' : 's') + ')', '',
    'CONTROL PREVIO AL DESPACHO: Verificar codigo, talle, color y cantidad de cada variante contra el stock fisico antes de confirmar la separacion y el despacho.', '',
    'Stock consultado: ' + rcFechaHora(p.stock_consultado, tz) + ' - Lote: ' + p.lote_id,
  ].join('\n');
}
function rcRenderCorreos(p, config) {
  config = config || RC_CONFIG;
  return p.grupos.map(g => Object.assign({
    origen: g.origen.codigo, destino: g.destino.codigo, asunto: rcAsunto(g, p.generado_en, config),
    html: rcRenderCorreoHtml(g, p, config), texto: rcRenderCorreoTexto(g, p, config),
  }, rcDestinatarios(g, config)));
}

// ── Solicitud para ChatGPT ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Texto completo para pegar: instrucciones + paquete JSON + correos ya armados (para que ChatGPT los use TAL CUAL y no reescriba datos).
function rcSolicitudChatGPT(p, config) {
  config = config || RC_CONFIG;
  const correos = rcRenderCorreos(p, config);
  const bloques = correos.map((c, i) => [
    '=== CORREO ' + (i + 1) + ' de ' + correos.length + ' ===',
    'De: ' + c.de, 'Para: ' + c.para.join(', '), 'CC: ' + c.cc.join(', '), 'Asunto: ' + c.asunto,
    '--- HTML (usar tal cual) ---', c.html, '--- TEXTO PLANO (alternativa) ---', c.texto,
  ].join('\n')).join('\n\n');
  return [
    'Necesito que prepares CORREOS OPERATIVOS DE ROTACION DE MERCADERIA de Croma, listos para revisar.',
    '',
    'REGLAS (obligatorias):',
    '1. Prepara exclusivamente un correo por cada grupo origen -> destino (' + p.grupos.length + ' en total), dirigido a la sucursal de ORIGEN. No generes correos de recepcion ni de ningun otro tipo.',
    '2. Usa el HTML y el texto plano de cada correo EXACTAMENTE como estan abajo. No cambies codigos, talles, codigos de color (conserva los ceros iniciales), colores, descripciones ni cantidades. No fusiones variantes distintas.',
    '3. Verifica que cada correo coincida con el JSON y que los totales sumen (total general: ' + p.total_general.unidades + ' unidades, ' + p.total_general.variantes + ' variantes). Si algo no coincide, avisame y NO continues.',
    '4. Cuenta emisora autorizada: ' + config.cuenta_emisora + '. Copia (CC) en todos: ' + config.copia.join(', ') + '.',
    '5. NO ENVIES NADA. Preparalos como borradores o mostramelos, y espera mi confirmacion explicita por escrito antes de enviar cualquier correo. Esta solicitud no autoriza envios.',
    '',
    'PAQUETE JSON (' + p.schema + ' v' + p.schema_version + ', lote ' + p.lote_id + '):',
    rcExportarJson(p),
    '',
    bloques,
  ].join('\n');
}

const RC_API = { RC_CONFIG, rcEsc, rcNombreSucursal, rcFechaHora, rcHash, rcLineasDesdeItems, rcArmarPaquete, rcValidarPaquete, rcExportarJson, rcAsunto, rcDestinatarios, rcRenderCorreoHtml, rcRenderCorreoTexto, rcRenderCorreos, rcSolicitudChatGPT };
if (typeof module !== 'undefined' && module.exports) module.exports = RC_API;
