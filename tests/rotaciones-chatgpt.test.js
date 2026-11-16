'use strict';
// Pruebas de la integracion Rotaciones -> ChatGPT (logica pura, sin DOM ni red).  node --test tests/rotaciones-chatgpt.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const rc = require('../rotaciones-chatgpt.js');

const AHORA = '2026-11-16T13:40:00.000Z'; // 10:40 hora Argentina
const STOCK = '2026-11-16T13:32:00.000Z';
const it = (o = {}) => Object.assign({
  rotacion_id: 'x', origen: '0001', destino: '0014', Codigo_producto: 'A1234', Codigo_talle: 'M', Codigo_color: '008', Nombre_color: 'NEGRO',
  Nombre_producto: 'REMERA EJEMPLO & CO', cantidad_sugerida: 2, stock_origen: 5, color_no_mapeado: false,
}, o);
function armar(items, extra = {}) {
  const { lineas, avisos } = rc.rcLineasDesdeItems(items, extra.cantidadDe);
  const p = rc.rcArmarPaquete({ lineas, stock_consultado: STOCK, periodo: { desde: '2026-10-17', hasta: '2026-11-16' }, ahora: AHORA, subtotales_declarados: extra.decl });
  return { p, avisos, v: rc.rcValidarPaquete(p, { ahora: AHORA, avisos, lotesPrevios: extra.lotesPrevios }) };
}
const codigos = r => r.errores.map(e => e.codigo);
const advs = r => r.advertencias.map(e => e.codigo);

// 1-2. Variantes con iguales codigos y distinto talle / color: no se fusionan, se conserva el formato original
test('misma combinacion repetida se detecta; talles y colores distintos no se fusionan; ceros iniciales conservados', () => {
  const { p, v } = armar([it({ Codigo_talle: 'M' }), it({ Codigo_talle: 'L' }), it({ Codigo_talle: '38.5' }), it({ Codigo_talle: 'M' }), it({ Codigo_color: '0010', Nombre_color: 'AZUL' })]);
  assert.ok(codigos(v).includes('fila_duplicada'), 'M/008 repetida');
  assert.deepEqual(p.grupos[0].lineas.map(l => l.talle + '/' + l.codigo_color).sort(), ['38.5/008', 'L/008', 'M/0010', 'M/008', 'M/008']);
  assert.ok(p.grupos[0].lineas.some(l => l.codigo_color === '0010'), 'ceros iniciales conservados');
});
test('variantes distintas del mismo codigo: valido y sin fusionar', () => {
  const { p, v } = armar([it({ Codigo_talle: 'M' }), it({ Codigo_talle: 'L' }), it({ Codigo_talle: 'M', Codigo_color: '009', Nombre_color: 'BLANCO' })]);
  assert.equal(v.ok, true, JSON.stringify(v.errores));
  assert.equal(p.grupos[0].lineas.length, 3);
  assert.equal(p.grupos[0].total_variantes, 3);
});

// 3. Cantidades mayores que una unidad
test('cantidades mayores a 1 se suman linea por linea', () => {
  const { p, v } = armar([it({ Codigo_talle: 'S' }), it({ Codigo_talle: 'M' })], { cantidadDe: x => (x.Codigo_talle === 'S' ? 3 : 4) });
  assert.equal(p.grupos[0].total_unidades, 7);
  assert.equal(p.total_general.unidades, 7);
  assert.equal(v.resumen.unidades, 7);
  assert.equal(v.ok, true);
});

// 4. Subtotales inconsistentes
test('subtotal declarado distinto de la suma real -> error bloqueante', () => {
  const { v } = armar([it({ Codigo_talle: 'S' }), it({ Codigo_talle: 'M' })], { decl: { '0001|0014': 9 } });
  assert.ok(codigos(v).includes('subtotal_inconsistente'));
  assert.equal(v.ok, false);
});
test('total general declarado inconsistente -> error; paquete editado a mano tambien se detecta', () => {
  const { p } = armar([it()]);
  p.total_general.unidades = 99;
  assert.ok(codigos(rc.rcValidarPaquete(p, { ahora: AHORA })).includes('total_inconsistente'));
  const q = armar([it()]).p; q.grupos[0].lineas[0].cantidad = 5; // cambia la linea sin tocar el subtotal
  assert.ok(codigos(rc.rcValidarPaquete(q, { ahora: AHORA })).includes('subtotal_inconsistente'));
});

// 5. Datos faltantes y cantidades invalidas
test('cantidades nulas, negativas, cero, decimales o texto se rechazan (no se descartan en silencio)', () => {
  for (const mala of [null, undefined, 0, -1, 1.5, '2', NaN]) {
    const { v } = armar([it()], { cantidadDe: () => mala });
    assert.ok(codigos(v).includes('cantidad_invalida'), 'debia rechazar ' + String(mala));
    assert.equal(v.ok, false);
  }
});
test('datos faltantes: codigo, talle, color, nombre de color y descripcion', () => {
  for (const campo of ['Codigo_producto', 'Codigo_talle', 'Codigo_color', 'Nombre_color', 'Nombre_producto']) {
    const { v } = armar([it({ [campo]: '' })]);
    assert.ok(codigos(v).includes('dato_faltante'), campo);
  }
});
test('sin lineas, sin stock consultado y sin lote son errores', () => {
  const vacio = rc.rcValidarPaquete(rc.rcArmarPaquete({ lineas: [], stock_consultado: STOCK, ahora: AHORA }), { ahora: AHORA });
  assert.ok(codigos(vacio).includes('sin_lineas'));
  const { lineas } = rc.rcLineasDesdeItems([it()]);
  const sin = rc.rcValidarPaquete(rc.rcArmarPaquete({ lineas, ahora: AHORA }), { ahora: AHORA });
  assert.ok(codigos(sin).includes('sin_stock_consultado'));
  assert.deepEqual(codigos(rc.rcValidarPaquete({}, {})), ['paquete_invalido']);
});
test('duplicados: fila identica y misma combinacion con otra cantidad', () => {
  const dup = armar([it(), it()]);
  assert.ok(codigos(dup.v).includes('fila_duplicada'));
  let n = 0;
  const comb = armar([it(), it()], { cantidadDe: () => (n++ === 0 ? 1 : 2) });
  assert.ok(codigos(comb.v).includes('combinacion_repetida'));
});
test('origen sin correo configurado, origen igual a destino, destino desconocido', () => {
  assert.ok(codigos(armar([it({ origen: '0009', destino: '0014' })]).v).includes('origen_sin_correo'));
  assert.ok(codigos(armar([it({ origen: '0001', destino: '0001' })]).v).includes('origen_igual_destino'));
  assert.ok(codigos(armar([it({ destino: '0099' })]).v).includes('destino_desconocido'));
  assert.equal(armar([it({ destino: '0009' })]).v.ok, true, 'Cipo puede ser destino de un lote ya existente');
});

// 6. Lotes de multiples sucursales
test('lote con varias sucursales: un grupo por origen/destino y totales correctos', () => {
  const { p, v } = armar([
    it({ origen: '0001', destino: '0014', Codigo_talle: 'S' }), it({ origen: '0001', destino: '0014', Codigo_talle: 'M' }),
    it({ origen: '0001', destino: '0005' }), it({ origen: '0012', destino: '0014', Codigo_producto: 'B9' }), it({ origen: '0010', destino: '0001' }),
  ]);
  assert.equal(v.ok, true, JSON.stringify(v.errores));
  assert.equal(p.grupos.length, 4);
  assert.equal(p.total_general.grupos, 4);
  assert.equal(p.total_general.variantes, 5);
  assert.equal(p.total_general.unidades, 10);
  const porPar = Object.fromEntries(p.grupos.map(g => [g.origen.codigo + '>' + g.destino.codigo, g.total_unidades]));
  assert.deepEqual(porPar, { '0001>0014': 4, '0001>0005': 2, '0010>0001': 2, '0012>0014': 2 });
});

// 7. Exportacion JSON
test('exportacion JSON: ida y vuelta, esquema versionado y sin datos sensibles ni del motor', () => {
  const { p } = armar([it({ stock_origen: 77, cantidad_sugerida: 9, costo: 123, token: 'secreto' })]);
  const json = rc.rcExportarJson(p);
  const back = JSON.parse(json);
  assert.deepEqual(back, JSON.parse(JSON.stringify(p)));
  assert.equal(back.schema, 'croma.rotacion-correos');
  assert.equal(back.schema_version, '1.0');
  assert.match(back.lote_id, /^ROT-20261116-[0-9a-f]{10}$/);
  assert.equal(back.grupos[0].origen.sucursal, '01 PASEO');
  assert.deepEqual(Object.keys(back.grupos[0].lineas[0]).sort(), ['cantidad', 'codigo', 'codigo_color', 'descripcion', 'nombre_color', 'talle']);
  assert.ok(!/costo|token|secreto|stock_origen|sugerida|password|Authorization/i.test(json));
});

// 8. Caracteres especiales y escape HTML
test('escape HTML: valores dinamicos no inyectan marcado y se conservan tildes y comillas', () => {
  const malo = '<script>alert("x")</script> & "O\'NEILL" <img src=x onerror=1> ÑANDÚ';
  const { p } = armar([it({ Nombre_producto: malo, Nombre_color: '<b>ROJO</b>', Codigo_talle: '<M>' })]);
  const html = rc.rcRenderCorreoHtml(p.grupos[0], p);
  assert.ok(!html.includes('<script>'), 'sin <script>');
  assert.ok(!html.includes('<img'), 'sin <img>');
  assert.ok(!html.includes('<b>ROJO</b>'));
  assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;O&#39;NEILL&quot;'));
  assert.ok(html.includes('ÑANDÚ'));
  assert.equal(rc.rcEsc(null), '');
  assert.equal(rc.rcEsc(0), '0');
});

// 9. Plantilla: contenido, diseno de bajo consumo de tinta y compatibilidad de correo
test('plantilla: contenido aprobado, seis columnas, 16px/19px y sin fondos de color', () => {
  const { p } = armar([it({ Codigo_talle: 'M' }), it({ Codigo_talle: 'L' })], { cantidadDe: x => (x.Codigo_talle === 'M' ? 2 : 1) });
  const g = p.grupos[0];
  const html = rc.rcRenderCorreoHtml(g, p);
  for (const t of ['CROMA', 'DEP&Oacute;SITO CENTRAL', 'ROTACI&Oacute;N DE MERCADER&Iacute;A', '01 PASEO &nbsp;&rarr;&nbsp; 14 ROCA', 'Hola equipo de <b>01 PASEO</b>', 'con destino a <b>14 ROCA</b>',
    'C&Oacute;DIGO', 'TALLE', 'COD. COLOR', 'COLOR', 'DESCRIPCI&Oacute;N', 'CANT.', 'TOTAL: 3 UNIDADES', '2 variantes', 'Control previo al despacho',
    'contra el stock f&iacute;sico antes de confirmar la separaci&oacute;n y el despacho', 'Stock consultado: 16/11/2026 10:32', 'Lote: ' + p.lote_id, '16/11/2026']) {
    assert.ok(html.includes(t), 'falta: ' + t);
  }
  assert.equal((html.match(/font-size:16px;">/g) || []).length, 2, 'cantidades a 16px');
  assert.ok(html.includes('font-size:19px;font-weight:bold'), 'total a 19px');
  assert.ok(!/font-size:18px/.test(html));
  assert.ok(!html.includes('font-size:22px;font-weight:bold;color:#111111;text-align:right'), 'el total ya no es 22px');
  assert.equal((html.match(/<th[ >]/g) || []).length, 6, 'seis columnas');
  assert.ok(!/background(-color)?:\s*(?!#ffffff|transparent)/i.test(html), 'ningun fondo distinto de blanco');
  assert.ok(!/background:#(?!f{6})/i.test(html));
});
test('plantilla: compatible con clientes de correo (tablas, inline, sin scripts/imagenes/fuentes remotas/CSS avanzado)', () => {
  const { p } = armar([it()]);
  const html = rc.rcRenderCorreoHtml(p.grupos[0], p);
  assert.ok(!/<script|<img|<link|@import|@font-face|url\(|<iframe|flex|grid|var\(|position:\s*(absolute|fixed)/i.test(html));
  assert.ok(/role="presentation"/.test(html) && /<table/.test(html));
  assert.ok(/font-family:Arial,Helvetica,sans-serif/.test(html));
  assert.ok(html.includes('max-width:620px') && html.includes('width:100%!important'), 'adaptacion movil');
  assert.ok(html.includes('@media print') && html.includes('@page{size:A4'), 'estilos de impresion como mejora');
});
test('impresion de rotaciones extensas: encabezado repetible y filas sin cortar, tambien en linea (no solo en @media print)', () => {
  const items = Array.from({ length: 60 }, (_, i) => it({ Codigo_producto: 'P' + String(i).padStart(3, '0') }));
  const { p, v } = armar(items);
  assert.equal(v.ok, true);
  const html = rc.rcRenderCorreoHtml(p.grupos[0], p);
  assert.ok(html.includes('<thead style="display:table-header-group;">'), 'thead repetible en linea');
  assert.equal((html.match(/<tr style="page-break-inside:avoid;">/g) || []).length, 60, 'cada fila con page-break-inside:avoid en linea');
  assert.ok(html.includes('thead{display:table-header-group}') && html.includes('.t tr{page-break-inside:avoid}'));
});
test('texto plano, asunto y destinatarios', () => {
  const { p } = armar([it()]);
  const g = p.grupos[0];
  const txt = rc.rcRenderCorreoTexto(g, p);
  assert.ok(txt.includes('A1234 | M | 008 | NEGRO | REMERA EJEMPLO & CO | x2'));
  assert.ok(txt.includes('TOTAL: 2 UNIDADES') && txt.includes('CONTROL PREVIO AL DESPACHO'));
  assert.ok(!/<[a-z]/i.test(txt));
  assert.equal(rc.rcAsunto(g, p.generado_en), 'ROTACION 01 PASEO A 14 ROCA – 16/11/2026');
  const d = rc.rcDestinatarios(g);
  assert.deepEqual(d, { de: 'depocroma@gmail.com', para: ['cromapaseo2@gmail.com'], cc: ['belencroma@gmail.com'] });
});
test('configuracion: los cinco origenes y los correos acordados', () => {
  const o = rc.RC_CONFIG.origenes;
  assert.deepEqual(Object.fromEntries(Object.entries(o).map(([k, x]) => [x.nombre, x.email])), {
    '01 PASEO': 'cromapaseo2@gmail.com', '05 WAVE': 'croma.sarmiento@gmail.com', '10 PERITO MORENO': 'cromaperito@gmail.com',
    '12 CENTENARIO': 'cromacentenario@gmail.com', '14 ROCA': 'cromaroca180@gmail.com',
  });
  assert.deepEqual(rc.RC_CONFIG.copia, ['belencroma@gmail.com']);
});
test('un solo correo por origen+destino y ninguno de recepcion', () => {
  const { p } = armar([it(), it({ origen: '0012', Codigo_producto: 'Z' }), it({ origen: '0001', destino: '0005', Codigo_producto: 'Y' })]);
  const correos = rc.rcRenderCorreos(p);
  assert.equal(correos.length, 3);
  correos.forEach(c => { assert.equal(c.para.length, 1); assert.ok(Object.values(rc.RC_CONFIG.origenes).some(o => o.email === c.para[0])); });
  assert.ok(correos.every(c => c.asunto.startsWith('ROTACION ')));
});

// 10. Lotes repetidos
test('lote_id determinista: mismo contenido = mismo id; cambia con cualquier cantidad, talle o color; aviso de lote repetido', () => {
  const a = armar([it()]).p.lote_id;
  assert.equal(armar([it()]).p.lote_id, a);
  assert.notEqual(armar([it()], { cantidadDe: () => 3 }).p.lote_id, a);
  assert.notEqual(armar([it({ Codigo_talle: 'L' })]).p.lote_id, a);
  assert.notEqual(armar([it({ Codigo_color: '009' })]).p.lote_id, a);
  const r = armar([it()], { lotesPrevios: [a] });
  assert.ok(advs(r.v).includes('lote_repetido'));
  assert.equal(r.v.ok, true, 'es advertencia, no bloquea');
  assert.ok(!advs(armar([it()]).v).includes('lote_repetido'));
});

// Advertencias de stock y de datos
test('stock desactualizado y avisos del adaptador son advertencias, no errores; stock stale no bloquea', () => {
  const { lineas, avisos } = rc.rcLineasDesdeItems([it({ color_no_mapeado: true, Nombre_color: 'COLOR NO MAPEADO' })], () => 3);
  const p = rc.rcArmarPaquete({ lineas, stock_consultado: '2026-11-14T10:00:00.000Z', ahora: AHORA });
  const v = rc.rcValidarPaquete(p, { ahora: AHORA, avisos });
  assert.equal(v.ok, true);
  assert.deepEqual(advs(v).sort(), ['color_no_mapeado', 'cantidad_sobre_sugerida', 'stock_desactualizado'].sort());
});
test('no se confunde stock disponible con cantidad solicitada', () => {
  const { p } = armar([it({ stock_origen: 50, cantidad_sugerida: 4 })], { cantidadDe: () => 1 });
  assert.equal(p.grupos[0].lineas[0].cantidad, 1);
  assert.equal(p.total_general.unidades, 1);
});

// 11. Solicitud para ChatGPT y fallo de transferencia
test('solicitud para ChatGPT: reglas, JSON y correos; no autoriza envios', () => {
  const { p } = armar([it(), it({ origen: '0012', Codigo_producto: 'Z' })]);
  const s = rc.rcSolicitudChatGPT(p);
  assert.ok(s.includes('NO ENVIES NADA'));
  assert.ok(s.includes('Esta solicitud no autoriza envios'));
  assert.ok(s.includes('exclusivamente un correo por cada grupo origen -> destino (2 en total)'));
  assert.ok(s.includes('No generes correos de recepcion'));
  assert.ok(s.includes(p.lote_id) && s.includes('depocroma@gmail.com') && s.includes('belencroma@gmail.com'));
  assert.ok(s.includes('=== CORREO 1 de 2 ===') && s.includes('=== CORREO 2 de 2 ==='));
  assert.ok(s.includes('"schema_version": "1.0"'));
  assert.ok(!/password|token|Bearer/i.test(s));
});

// 12. Conservacion de las funciones actuales de ROTACIONES (index.html) y aislamiento de la integracion
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('regresion: las funciones y botones actuales de ROTACIONES siguen en index.html', () => {
  for (const f of ['function rtGenerarTextoRotaciones', 'function rtCopiarTextoRotaciones', 'function rtRotacionesPrepararEnvio', 'function rtEnviarOperacionRotaciones',
    'function rtRotacionesAbrirConfirmarEnvio', 'function rtCargarRotaciones', 'function rtRotacionesCantidadDe', 'function rtRotacionesLineasSeleccionadasPorPar']) assert.ok(html.includes(f), f);
  for (const b of ["text:'Generar texto'", "text:'Copiar texto'", "text:'Marcar como enviado'", "text:'Seleccionar todo'", "text:'Limpiar selección'"]) assert.ok(html.includes(b), b);
  assert.ok(html.includes("RT_ROTACIONES.stock_consultado") && html.includes("'/analisis/rotaciones/envios'"));
});
test('la integracion es de solo lectura: no llama a la API, no usa red ni storage de credenciales, no envia correos', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'rotaciones-chatgpt.js'), 'utf8');
  assert.ok(!/fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.|window\.|innerHTML|gmail\.googleapis|mailto:/i.test(src));
  const vista = fs.readFileSync(path.join(__dirname, '..', 'rotaciones-chatgpt-vista.js'), 'utf8');
  assert.ok(!/fetch\(|XMLHttpRequest|innerHTML|gmail\.googleapis|Authorization|getToken|sendBeacon/i.test(vista));
});

// ── Seguridad de la vista previa (iframe) y del HTML generado ───────────────────────────────────────────────────────────────────────
const vistaSrc = fs.readFileSync(path.join(__dirname, '..', 'rotaciones-chatgpt-vista.js'), 'utf8');
const estructura = h => (h.match(/<[a-zA-Z!\/][^>]*>/g) || []).map(t => t.replace(/<(\w+)[\s\S]*/, '$1')).join(',');
const atributos = h => [...h.matchAll(/<(\w+)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>/g)].map(m => m[1] + ':' + [...m[2].matchAll(/\s+([\w-]+)/g)].map(a => a[1]).join('|')).join(',');
const PAYLOADS = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "' onmouseover='alert(1)", 'javascript:alert(1)', '</td></tr></table><iframe src=//evil></iframe>',
  '<svg onload=alert(1)>', '<a href="javascript:alert(1)">x</a>', '&lt;b&gt;ya escapado&lt;/b&gt;', '<style>body{display:none}</style>', '<meta http-equiv="refresh" content="0;url=//evil">', '{{7*7}} ${7*7}'];
test('seguridad: ningun valor dinamico altera la estructura del HTML (mismas etiquetas y atributos que con datos normales)', () => {
  const normal = armar([it()]).p;
  const base = rc.rcRenderCorreoHtml(normal.grupos[0], normal);
  PAYLOADS.forEach(pl => {
    const { p } = armar([it({ Codigo_producto: pl, Codigo_talle: pl, Codigo_color: pl, Nombre_color: pl, Nombre_producto: pl })]);
    const h = rc.rcRenderCorreoHtml(p.grupos[0], p);
    assert.equal(estructura(h), estructura(base), 'estructura alterada por: ' + pl);
    assert.equal(atributos(h), atributos(base), 'atributos alterados por: ' + pl);
    assert.ok(!/<script|<iframe|<svg|<img|<a\s|<meta http-equiv|onerror\s*=|onload\s*=|onmouseover\s*=\s*['"]?alert/i.test(h.replace(/&lt;[^]*?&gt;/g, '')), 'marcado ejecutable por: ' + pl);
  });
});
test('seguridad: el unico <style> y <meta> permitidos son los de la plantilla; no hay href, src ni action', () => {
  const { p } = armar([it({ Nombre_producto: '<style>x{}</style><meta charset=x><a href=x>' })]);
  const h = rc.rcRenderCorreoHtml(p.grupos[0], p);
  assert.equal((h.match(/<style/g) || []).length, 1);
  assert.equal((h.match(/<meta/g) || []).length, 2);
  assert.ok(!(h.match(/<[a-zA-Z][^>]*>/g) || []).some(t => /\s(href|src|action|formaction|srcset|data|poster)\s*=/i.test(t)), 'ninguna etiqueta real con href/src/action');
});
test('seguridad: la vista previa usa iframe con sandbox VACIO (sin allow-*) y srcdoc; no usa src, innerHTML ni scripts', () => {
  assert.ok(/rtEl\('iframe',\s*\{[^}]*attrs:\s*\{\s*sandbox:\s*''/.test(vistaSrc), 'iframe con sandbox vacio');
  assert.ok(!/allow-(scripts|same-origin|forms|popups|top-navigation|modals|downloads)/.test(vistaSrc), 'sin permisos allow-*');
  assert.ok(/setAttribute\('srcdoc'/.test(vistaSrc));
  assert.ok(!/\.src\s*=|setAttribute\('src'|innerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(vistaSrc));
  assert.equal((vistaSrc.match(/createElement\('iframe'\)|rtEl\('iframe'/g) || []).length, 1, 'un unico punto de creacion de iframe');
});

// ── Solicitud copiada: completa, sin truncamientos ──────────────────────────────────────────────────────────────────────────────────
test('solicitud completa: 5 grupos x 80 variantes (400) -> el JSON embebido, cada correo HTML y cada texto plano traen TODAS las variantes y cantidades', () => {
  const origenes = ['0001', '0005', '0010', '0012', '0014'];
  const talles = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '38', '40'];
  const items = [];
  origenes.forEach((o, oi) => {
    const d = origenes[(oi + 1) % 5];
    for (let i = 0; i < 80; i++) items.push(it({ origen: o, destino: d, Codigo_producto: 'Q' + String(1000 + i), Codigo_talle: talles[i % 8], Codigo_color: String(i % 7).padStart(4, '0'), Nombre_color: 'COLOR ' + (i % 7), Nombre_producto: 'PRODUCTO LARGO DE PRUEBA ' + i + ' ÑÁÉ & CO "X"' }));
  });
  const { p, v } = armar(items, { cantidadDe: x => 1 + (x.Codigo_producto.charCodeAt(4) % 4) });
  assert.equal(v.ok, true, JSON.stringify(v.errores));
  assert.equal(p.total_general.variantes, 400);
  const s = rc.rcSolicitudChatGPT(p);
  // 1) JSON embebido: extraer, parsear y comparar con el paquete
  const ini = s.indexOf('{\n  "schema"'), fin = s.indexOf('\n\n=== CORREO 1 de 5 ===');
  assert.ok(ini > 0 && fin > ini);
  assert.deepEqual(JSON.parse(s.slice(ini, fin)), JSON.parse(JSON.stringify(p)));
  // 2) cinco correos y cada uno completo
  const partes = s.split(/=== CORREO \d+ de 5 ===/).slice(1);
  assert.equal(partes.length, 5);
  assert.equal((s.match(/=== CORREO \d+ de 5 ===/g) || []).length, 5);
  p.grupos.forEach((g, i) => {
    const parte = partes[i];
    assert.ok(parte.includes('</html>'), 'html de cierre del correo ' + (i + 1));
    assert.equal((parte.match(/<tr style="page-break-inside:avoid;">/g) || []).length, 80, 'filas HTML del correo ' + (i + 1));
    assert.ok(parte.includes('TOTAL: ' + g.total_unidades + ' UNIDADES'));
    g.lineas.forEach(l => {
      const celdaCant = '>' + l.cantidad + '</td></tr>';
      assert.ok(parte.includes(l.codigo) && parte.includes(rc.rcEsc(l.descripcion)) && parte.includes(celdaCant));
    });
    const txt = parte.slice(parte.indexOf('--- TEXTO PLANO'));
    assert.equal((txt.match(/ \| x\d+$/gm) || []).length, 80, 'lineas de texto plano del correo ' + (i + 1));
  });
  assert.ok(s.trim().endsWith('Lote: ' + p.lote_id), 'la solicitud termina completa (ultimo correo entero)');
  assert.ok(!/\.\.\.|truncad|\[mas|\u2026/i.test(s.replace(/&[a-z]+;/g, '')), 'sin marcas de truncamiento');
  assert.equal(s.length, rc.rcSolicitudChatGPT(p).length, 'determinista');
});
