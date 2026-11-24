'use strict';
// Etapa D1B (cds-v3): pruebas SIN navegador de «Mis seguimientos»: logica y cliente HTTP (cds/seguimientos-api.js), guardas estaticas de la interfaz
// (cds/seguimientos.js) y garantias de que la aplicacion sin bandera no cambia. La integracion real con el backend y el navegador esta en
// tests/harness/validacion-d1b.js.   node --test tests/cds-seguimientos-d1b.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const A = require('../cds/seguimientos-api.js');
const ui = leer('cds', 'seguimientos.js'), api = leer('cds', 'seguimientos-api.js'), html = leer('index.html'), shell = leer('cds', 'shell.js'), css = leer('cds', 'seguimientos.css');

// ---------- claves canonicas ----------
test('claves canonicas: mismos formatos que Etapa C y que el servidor; ceros iniciales y caracteres especiales a salvo', () => {
  assert.equal(A.claveCanonica('producto', { cod: '03010' }), 'P:03010');
  assert.equal(A.claveCanonica('color', { cod: '03010', color: '01' }), 'C:03010:01');
  assert.equal(A.claveCanonica('talle', { cod: '03010', talle: '040' }), 'T:03010:040');
  assert.equal(A.claveCanonica('variante', { cod: '03010', talle: '040', color: '01' }), 'V:03010:040:01');
  assert.equal(A.claveCanonica('variante_sucursal', { cod: '03010', talle: '040', color: '01', centro: '0005' }), 'VS:03010:040:01:0005');
  assert.notEqual(A.claveCanonica('talle', { cod: '1', talle: '40' }), A.claveCanonica('talle', { cod: '1', talle: '040' }), '«40» y «040» son talles distintos');
  assert.equal(A.claveCanonica('color', { cod: 'A:B', color: 'x y' }), 'C:A%3AB:x%20y', 'un «:» o un espacio no rompen la clave');
  assert.throws(() => A.claveCanonica('inventado', { cod: '1' }));
});
test('claves canonicas: coinciden con las que arma cds/variantes.js (Etapa C) para los mismos datos', () => {
  const ctx = { document: {}, window: {}, Intl, console, setTimeout, clearTimeout, AbortController, URL, URLSearchParams };
  ctx.window = ctx; ctx.document = { documentElement: { classList: { contains: () => true } } }; vm.createContext(ctx);
  vm.runInContext(leer('cds', 'variantes.js'), ctx);
  const V = ctx.CDS_VARIANTES; assert.equal(typeof V.claveSeguimiento, 'function');
  for (const o of [{ cod: '03010', talle: '040', color: '01', centro: '0005' }, { cod: 'T0783', talle: '', color: '', centro: '0010' }, { cod: 'A:B', talle: 'x y', color: 'ñ', centro: '0001' }]) {
    for (const n of ['producto', 'color', 'talle', 'variante']) assert.equal(A.claveCanonica(n, o), V.claveSeguimiento(n, o), n + ' ' + JSON.stringify(o));
    assert.equal(A.claveCanonica('variante_sucursal', o), V.claveSeguimiento('variante_sucursal', o, o.centro));
  }
});
test('parsearClave es la inversa de claveCanonica (incluye los textos escapados)', () => {
  for (const [n, o] of [['producto', { cod: '03010' }], ['color', { cod: 'A:B', color: '01' }], ['talle', { cod: '1', talle: 'x y' }], ['variante', { cod: '1', talle: '040', color: '01' }], ['variante_sucursal', { cod: '1', talle: '040', color: '01', centro: '0014' }]]) {
    const p = A.parsearClave(A.claveCanonica(n, o)); assert.equal(p.nivel, n); for (const k of Object.keys(o)) assert.equal(p[k], o[k], n + '.' + k);
  }
  assert.equal(A.parsearClave('X:1'), null); assert.equal(A.parsearClave(''), null);
});

// ---------- niveles ----------
test('niveles disponibles segun lo que la pantalla conoce; los no disponibles explican por que', () => {
  const por = ctx => Object.fromEntries(A.nivelesDisponibles(ctx).map(n => [n.nivel, n]));
  let n = por({ cod: '1' }); assert.deepEqual(Object.keys(n), ['producto', 'color', 'talle', 'variante', 'variante_sucursal']);
  assert.deepEqual(A.nivelesDisponibles({ cod: '1' }).filter(x => x.disponible).map(x => x.nivel), ['producto']); assert.ok(n.color.motivo && n.variante_sucursal.motivo);
  assert.deepEqual(A.nivelesDisponibles({ cod: '1', talle: 'M', color: '01' }).filter(x => x.disponible).map(x => x.nivel), ['producto', 'color', 'talle', 'variante']);
  assert.equal(A.nivelesDisponibles({ cod: '1', talle: 'M', color: '01', centro: '0005' }).every(x => x.disponible), true);
  n = por({ cod: '1', talle: 'M', color: '01', centro: '0009' }); assert.equal(n.variante_sucursal.disponible, false); assert.match(n.variante_sucursal.motivo, /Cipo/);
  assert.equal(por({ cod: '1', talle: '', color: '' }).variante.disponible, true, 'talle y color vacios (sin codigo) siguen siendo una variante valida');
});
test('objetivoDe arma el cuerpo SOLO con lo que el nivel necesita y como texto (nunca propietario, referencia ni valores)', () => {
  const ctx = { cod: '03010', talle: '040', color: '01', centro: '0005', nombre: 'X', nivelInicial: 'variante' };
  assert.deepEqual(A.objetivoDe('producto', ctx), { nivel: 'producto', cod: '03010' });
  assert.deepEqual(A.objetivoDe('color', ctx), { nivel: 'color', cod: '03010', color: '01' });
  assert.deepEqual(A.objetivoDe('talle', ctx), { nivel: 'talle', cod: '03010', talle: '040' });
  assert.deepEqual(A.objetivoDe('variante', ctx), { nivel: 'variante', cod: '03010', talle: '040', color: '01' });
  assert.deepEqual(A.objetivoDe('variante_sucursal', ctx), { nivel: 'variante_sucursal', cod: '03010', talle: '040', color: '01', centro: '0005' });
  assert.equal(typeof A.objetivoDe('variante', { cod: 3010, talle: 40, color: 1 }).cod, 'string');
});
test('niveles superiores que cubren al elegido (aviso de solape): producto ⊃ color/talle/variante ⊃ variante por sucursal', () => {
  const ctx = { cod: '1', talle: 'M', color: '01', centro: '0005' };
  assert.deepEqual(A.clavesSuperiores('producto', ctx), []);
  assert.deepEqual(A.clavesSuperiores('variante', ctx).map(x => x.nivel), ['producto', 'color', 'talle']);
  assert.deepEqual(A.clavesSuperiores('variante_sucursal', ctx).map(x => x.nivel), ['producto', 'color', 'talle', 'variante']);
  assert.deepEqual(A.clavesSuperiores('color', ctx).map(x => x.clave), ['P:1']);
  assert.deepEqual(A.clavesSuperiores('variante', { cod: '1', talle: 'M', color: '01' }).map(x => x.nivel), ['producto', 'color', 'talle']);
});
test('descripciones legibles (con y sin codigo)', () => {
  const o = { cod: '03010', talle: 'M', color: '01', centro: '0005' };
  assert.equal(A.descripcionObjetivo({ nivel: 'producto', cod: '03010' }), 'Producto completo 03010'); assert.equal(A.descripcionObjetivo({ nivel: 'producto', cod: '03010' }, true), 'Producto completo');
  assert.equal(A.descripcionObjetivo({ nivel: 'variante', ...o }), 'Talle M · color 01 de 03010'); assert.equal(A.descripcionObjetivo({ nivel: 'variante', ...o }, true), 'Talle M · color 01');
  assert.equal(A.descripcionObjetivo({ nivel: 'variante_sucursal', ...o }), 'Talle M · color 01 de 03010 en Wave (0005)');
  assert.equal(A.descripcionObjetivo({ nivel: 'variante', cod: '1', talle: '', color: '' }), 'Talle (sin talle) · color (sin código) de 1');
});

// ---------- errores del servidor ----------
test('errores del servidor traducidos a mensajes claros (400, 401, 403, 404, 409, 412, 413, 422, 428, 429, 503) sin tecnicismos ni detalles internos', () => {
  const t = (s, c, extra) => A.traducirError(s, c ? { code: c, error: 'detalle interno at C:/ruta', ...extra } : null);
  for (const [s, c] of [[400, null], [401, null], [403, 'USUARIO_NO_HABILITADO'], [403, 'SOLO_LECTURA_AJENO'], [404, 'NO_ENCONTRADO'], [409, 'YA_SEGUIDO'], [412, 'VERSION_DESACTUALIZADA'], [413, 'CUERPO_DEMASIADO_GRANDE'], [422, 'LIMITE_USUARIO'], [428, 'VERSION_REQUERIDA'], [429, 'LIMITE_ESCRITURAS'], [503, 'SEGUIMIENTOS_NO_DISPONIBLE'], [503, 'SIN_COPIA_EXTERNA_VERIFICADA']]) {
    const e = t(s, c); assert.equal(e.status, s); assert.ok(e.mensaje.length > 10 && /[a-z]/.test(e.mensaje), s + ' ' + c); assert.ok(!/C:\/ruta|detalle interno|SQLITE|stack/.test(e.mensaje), 'no filtra detalles: ' + e.mensaje);
  }
  assert.match(t(403, 'SOLO_LECTURA_AJENO').mensaje, /otra persona/); assert.match(t(412, 'VERSION_DESACTUALIZADA').mensaje, /cambió/); assert.match(t(503, 'SIN_COPIA_EXTERNA_VERIFICADA').mensaje, /copia de seguridad/);
  assert.match(t(429, 'LIMITE_ESCRITURAS', { reintentar_en_s: 7 }).mensaje, /7 s/); assert.equal(t(409, 'YA_SEGUIDO').codigo, 'YA_SEGUIDO');
  assert.match(A.traducirError(418, null).mensaje, /418/);
});
test('motivos de referencia no disponible: todos los que emite el servidor tienen texto claro', () => {
  for (const m of ['proveedor_no_configurado', 'cache_no_disponible', 'contexto_incompleto', 'datos_vencidos', 'producto_fuera_de_la_consulta', 'alcance_no_cubierto', 'datos_incompletos', 'tiempo_agotado', 'error_proveedor', 'respuesta_no_confiable', 'sin_datos_confiables']) assert.ok(A.REFERENCIA_MOTIVOS[m] && A.REFERENCIA_MOTIVOS[m].length > 15, m);
  for (const e of ['creado', 'motivo_editado', 'nota', 'finalizado', 'reabierto']) assert.ok(A.EVENTOS[e]);
});
test('contexto de la consulta: solo periodo y sucursales operativas, ordenadas; sin Cipo; jamas valores comerciales', () => {
  assert.deepEqual(A.contextoDe('2026-08-23', '2026-11-24', ['0014', '0001', '0009']), { desde: '2026-08-23', hasta: '2026-11-24', sucursales: ['0001', '0014'] });
  assert.equal(A.contextoDe('2026-08-23', '2026-11-24', ['0009']), null); assert.equal(A.contextoDe('23/08/2026', '2026-11-24', ['0001']), null); assert.equal(A.contextoDe('2026-08-23', '2026-11-24', null), null);
});

// ---------- cliente HTTP ----------
function fetchSim(respuestas) {
  const llamadas = []; const f = async (url, op) => { llamadas.push({ url, ...op }); const r = respuestas(url, op, llamadas.length); if (r instanceof Error) throw r; return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => { if (r.crudo) throw new Error('no json'); return r.json; } }; };
  f.llamadas = llamadas; return f;
}
test('cliente: Authorization del token, If-Match con comillas, Idempotency-Key, PATCH/POST con JSON y URLs bajo /seguimientos', async () => {
  const f = fetchSim(() => ({ status: 200, json: { ok: true, seguimiento: { id: 1 } } })); const c = A.crearCliente({ base: 'https://api.x', token: () => 'TOK', fetch: f });
  await c.crear({ nivel: 'producto', cod: '03010' }, 'motivo', { desde: '2026-08-23', hasta: '2026-11-24', sucursales: ['0001'] }, 'idem-12345678');
  await c.editarMotivo(5, 3, 'otro'); await c.agregarNota(5, 'hola', 'idem-nota-0001'); await c.finalizar(5, 4, null); await c.finalizar(5, 4, 'cierre'); await c.reabrir(5, 6); await c.detalle(5); await c.propietarios();
  const [crear, patch, nota, fin, fin2, reab, det] = f.llamadas;
  assert.equal(crear.url, 'https://api.x/seguimientos/'); assert.equal(crear.method, 'POST'); assert.equal(crear.headers.Authorization, 'Bearer TOK'); assert.equal(crear.headers['Idempotency-Key'], 'idem-12345678'); assert.equal(crear.headers['If-Match'], undefined);
  assert.deepEqual(JSON.parse(crear.body), { nivel: 'producto', cod: '03010', motivo: 'motivo', contexto: { desde: '2026-08-23', hasta: '2026-11-24', sucursales: ['0001'] } });
  assert.equal(patch.method, 'PATCH'); assert.equal(patch.headers['If-Match'], '"3"'); assert.deepEqual(JSON.parse(patch.body), { motivo: 'otro' });
  assert.equal(nota.url, 'https://api.x/seguimientos/5/notas'); assert.equal(nota.headers['Idempotency-Key'], 'idem-nota-0001');
  assert.deepEqual(JSON.parse(fin.body), {}); assert.deepEqual(JSON.parse(fin2.body), { motivo_fin: 'cierre' }); assert.equal(fin.headers['If-Match'], '"4"'); assert.equal(reab.url, 'https://api.x/seguimientos/5/reabrir'); assert.equal(reab.headers['If-Match'], '"6"');
  assert.equal(det.method, 'GET'); assert.equal(det.headers['Content-Type'], undefined);
  assert.ok(f.llamadas.every(l => l.url.startsWith('https://api.x/seguimientos')), 'solo habla con los endpoints de seguimientos');
  const cuerpoCrear = JSON.parse(crear.body); for (const prohibido of ['propietario', 'owner', 'referencia', 'valores', 'version', 'estado', 'nombre_producto']) assert.equal(cuerpoCrear[prohibido], undefined);
});
test('cliente: la consulta de claves es POR LOTE (tandas de 100, sin repetidos) y une los resultados', async () => {
  const f = fetchSim(url => { const cl = new URL(url, 'http://x').searchParams.get('claves').split(','); return { status: 200, json: { ok: true, seguidas: Object.fromEntries(cl.filter(k => /9$/.test(k)).map(k => [k, { id: 1 }])) } }; });
  const c = A.crearCliente({ base: '', token: () => 't', fetch: f }); const claves = Array.from({ length: 230 }, (_, i) => 'P:' + i).concat(['P:1', 'P:2']);
  const r = await c.claves(claves); assert.equal(f.llamadas.length, 3, '230 claves distintas = 3 solicitudes, no 230'); assert.equal(Object.keys(r).length, 23);
  assert.ok(f.llamadas.every(l => l.url.startsWith('/seguimientos/claves?claves=')));
  assert.equal((await A.crearCliente({ base: '', token: () => 't', fetch: fetchSim(() => ({ status: 200, json: {} })) }).claves([])).constructor, Object); // sin claves: no revienta
});
test('cliente: sondeo -> habilitado / inactivo (404 apagado, 401, 403) / no_disponible (503, red)', async () => {
  const s = status => A.crearCliente({ base: '', token: () => 't', fetch: fetchSim(() => ({ status, json: { code: 'X' } })) }).sondear();
  assert.equal((await s(200)).estado, 'habilitado'); for (const st of [404, 401, 403]) assert.equal((await s(st)).estado, 'inactivo', String(st)); assert.equal((await s(503)).estado, 'no_disponible');
  assert.equal((await A.crearCliente({ base: '', token: () => 't', fetch: fetchSim(() => new TypeError('fallo de red')) }).sondear()).estado, 'no_disponible');
});
test('cliente: errores HTTP -> ErrorSeg con codigo; cuerpo no JSON no rompe; red caida -> SIN_CONEXION; el abort se propaga', async () => {
  const c = fetchSim => A.crearCliente({ base: '', token: () => 't', fetch: fetchSim });
  await assert.rejects(() => c(fetchSim(() => ({ status: 412, json: { ok: false, code: 'VERSION_DESACTUALIZADA' } }))).editarMotivo(1, 1, 'x'), e => e.name === 'ErrorSeg' && e.status === 412 && e.codigo === 'VERSION_DESACTUALIZADA');
  await assert.rejects(() => c(fetchSim(() => ({ status: 502, crudo: true }))).detalle(1), e => e.status === 502 && /502/.test(e.mensaje));
  await assert.rejects(() => c(fetchSim(() => new TypeError('Failed to fetch'))).detalle(1), e => e.codigo === 'SIN_CONEXION' && e.status === 0);
  await assert.rejects(() => c(fetchSim(() => Object.assign(new Error('abort'), { name: 'AbortError' }))).listar({}), e => e.name === 'AbortError');
});
test('cliente: la lista arma los filtros como parametros codificados y omite los vacios', async () => {
  const f = fetchSim(() => ({ status: 200, json: { ok: true, total: 0, seguimientos: [] } })); await A.crearCliente({ base: '', token: () => 't', fetch: f }).listar({ estado: 'activo', q: 'remera & co', nivel: '', centro: '0005', propietario: 'staff:2', limit: 25, offset: 0 });
  const u = new URL('http://x' + f.llamadas[0].url); assert.equal(u.searchParams.get('q'), 'remera & co'); assert.equal(u.searchParams.get('nivel'), null); assert.equal(u.searchParams.get('propietario'), 'staff:2'); assert.equal(u.searchParams.get('offset'), '0');
});
test('claves de idempotencia: validas para el servidor (8 a 80 caracteres seguros) y distintas cada vez', () => {
  const a = A.nuevaClave(), b = A.nuevaClave(); assert.match(a, /^[A-Za-z0-9._:-]{8,80}$/); assert.notEqual(a, b);
});

// ---------- guardas estaticas de la interfaz ----------
test('interfaz: solo con la bandera cds-v3, sin innerHTML con datos, sin eval ni localStorage, sin fetch directo (todo pasa por el cliente de seguimientos)', () => {
  assert.match(ui, /if \(!document\.documentElement\.classList\.contains\('cds-v3'\)\) return;/);
  for (const [nombre, re] of [['innerHTML', /\.innerHTML\s*=/], ['outerHTML', /\.outerHTML\s*=/], ['insertAdjacentHTML', /insertAdjacentHTML/], ['document.write', /document\.write/], ['eval', /\beval\s*\(/], ['new Function', /new Function/], ['localStorage', /localStorage/], ['sessionStorage', /sessionStorage/], ['fetch directo', /\bfetch\s*\(/], ['XMLHttpRequest', /XMLHttpRequest/]]) assert.doesNotMatch(ui, re, nombre);
  for (const [nombre, re] of [['innerHTML', /\.innerHTML\s*=/], ['localStorage', /localStorage|sessionStorage/], ['eval', /\beval\s*\(/]]) assert.doesNotMatch(api, re, nombre + ' (api)');
  assert.doesNotMatch(css, /@import|url\(\s*['"]?https?:/, 'sin recursos externos');
});
test('interfaz: habla con el servidor SOLO a traves de CDS_SEG_API y no menciona otros endpoints', () => {
  assert.match(ui, /A\(\)\.crearCliente/); const rutas = (ui + api).match(/['"`]\/[a-z][a-z-]*(\/|['"`?])/g) || [];
  for (const r of rutas) assert.match(r, /\/(seguimientos|claves|propietarios|notas|finalizar|reabrir)/, 'ruta inesperada ' + r);
  assert.doesNotMatch(ui + api, /\/analisis\//, 'no depende de otros endpoints');
});
test('interfaz: no contiene graficos historicos ni novedades (la evolucion real es D2) ni alertas/notificaciones (D3/D4)', () => {
  assert.doesNotMatch(ui, /<canvas|createElement\('canvas'\)|sparkline|Chart\(|Notification|serviceWorker|mailto:|wa\.me|whatsapp|telegram/i);
});
test('index.html: la bandera sigue APAGADA por defecto, los archivos nuevos solo se descargan dentro del bloque de la bandera y el gancho de vista es condicional', () => {
  assert.match(html, /CDS_V3_POR_DEFECTO = false/);
  const bloque = html.match(/<script>\s*\(function \(\) \{\s*var CDS_V3_POR_DEFECTO[\s\S]*?\}\)\(\);\s*<\/script>/)[0];
  assert.match(bloque, /cds\/seguimientos\.css/); assert.match(bloque, /cds\/seguimientos-api\.js/); assert.match(bloque, /cds\/seguimientos\.js/); assert.match(bloque, /sg\.async = false/, 'orden de carga: API antes que interfaz');
  assert.equal((html.match(/seguimientos-api\.js/g) || []).length, 1); assert.equal((html.replace(bloque, '').match(/cds\/seguimientos/g) || []).length, 0, 'nada fuera del bloque de la bandera');
  assert.match(html, /else if \(RT_VIEW === 'seguimientos' && window\.CDS_SEGUIMIENTOS\) window\.CDS_SEGUIMIENTOS\.renderVista\(host\);/);
  assert.doesNotMatch(html.replace(bloque, ''), /data-view="seguimientos"/, 'la pestaña la agrega la interfaz solo si el servidor la habilita (no esta en el HTML estatico)');
});
test('shell: «Mis seguimientos» esta en el grupo Decisiones y solo se muestra si existe la pestaña (el servidor la habilita)', () => {
  assert.match(shell, /'seguimientos': \{ t: 'Mis seguimientos', g: 'Decisiones', i: 'star' \}/); assert.match(shell, /ORDEN = \[[^\]]*'oportunidades', 'seguimientos', 'reglas'/); assert.match(shell, /it\.hidden = !existe;/);
});
test('interfaz: arranque diferido y sin efectos si falta sesion o el servidor no habilita (sondeo -> inactivo quita la pestaña)', () => {
  assert.match(ui, /if \(!A\(\) \|\| !token\(\)\) return;/); assert.match(ui, /if \(r\.estado === 'inactivo'\) \{ quitarPestana\(\)/); assert.match(ui, /if \(ESTADO\.sondeo !== 'habilitado'\) return;/);
});
