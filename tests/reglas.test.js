'use strict';
// Pruebas de los FLUJOS y RIESGOS de la interfaz de reglas (oportunidades-reglas.js) y de la presentacion de Oportunidades
// (oportunidades-explicacion.js). Se ejecutan sin navegador ni dependencias:  node --test tests/
// Cubren: (1) que nada se active sin una accion explicita; (2) el contenido exacto de lo que se envia al servidor (solo
// sobrescrituras, version_base, general_version, vigente_esperado, versiones exactas); (3) conflictos y errores sin perder lo
// escrito; (4) elegibilidad y evidencia vencida; (5) que ningun texto de la API se inserte como HTML; (6) etiquetas y avisos de
// Oportunidades (Ingreso reciente, rendimiento sin clasificar, sucursales ignoradas, validacion por variante).
// El navegador real se verifico aparte (capturas en docs de la Fase 5).
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./dom-minimo');

const plano = v => JSON.parse(JSON.stringify(v));
const PAYLOAD = '<img src=x onerror=alert(1)>';

const par = (ruta, etiqueta, tipo, unidad, min, max, inicial, extra = {}) => ({ ruta, etiqueta, ayuda: 'ayuda de ' + etiqueta, tipo, unidad, min, max, paso: tipo === 'fraccion' ? 0.01 : 1, minimo_exclusivo: tipo === 'fraccion', valor_inicial_general: inicial, ...extra });
const ESQUEMA = {
  total_parametros: 4,
  grupos: [
    { id: 'demanda', titulo: 'Demanda y rendimiento', descripcion: 'd', parametros: [par('bien_vendido.ventas_min', 'Ventas mínimas de "Bien vendido"', 'entero', 'unidades', 1, 1000, 3), par('bien_vendido.ratio_min', 'Rotación mínima de "Bien vendido"', 'fraccion', 'proporción (0-1]', 0, 1, 0.5)] },
    { id: 'reposicion', titulo: 'Reposición y rotación', descripcion: 'r', parametros: [par('reposicion.cobertura_reponer_max', 'Cobertura hasta la cual hay que reponer', 'entero', 'días', 1, 365, 14), par('reposicion.cobertura_proxima_max', 'Cobertura hasta la cual la reposición es próxima', 'entero', 'días', 1, 730, 30)] },
  ],
  relaciones: [{ izq: 'reposicion.cobertura_reponer_max', op: '<', der: 'reposicion.cobertura_proxima_max', texto: 'Cobertura hasta la cual hay que reponer < Cobertura hasta la cual la reposición es próxima' }],
  reglas_fijas: ['sucursales cerradas (Cipo 0009) nunca son candidatas operativas'], claves_fijas: [],
};
const efectivos = (over = {}) => ({ bien_vendido: { ventas_min: 3, ratio_min: 0.5, ...(over.bien_vendido || {}) }, reposicion: { cobertura_reponer_max: 14, cobertura_proxima_max: 30, ...(over.reposicion || {}) } });
const perfilGeneral = { perfil_id: 1, nombre: 'General', alcance: { tipo: 'general', rubro: null, subrubro: null, marca: null }, estado: 'borrador', version_actual: 2, huella_actual: 'aaaaaaaaaaaaaaaa', general_version_referenciada: null, creado: { sub: '1', nombre: 'sistema', en: '2026-10-31T12:00:00.000Z' }, archivado: null };
const perfilZapas = { perfil_id: 2, nombre: 'Zapas ' + PAYLOAD, alcance: { tipo: 'rubro', rubro: 'ZAPAS', subrubro: null, marca: null }, estado: 'borrador', version_actual: 3, huella_actual: 'bbbbbbbbbbbbbbbb', general_version_referenciada: 1, creado: { sub: '1', nombre: 'ana ' + PAYLOAD, en: '2026-10-31T12:00:00.000Z' }, archivado: null };
const ver = (n, over = {}) => ({ version: n, version_id: n, tipo_parametros: 'diferencias', parametros: { bien_vendido: { ventas_min: n } }, huella: 'cccccccccccccccc', general_version: 1, motivo: 'motivo ' + PAYLOAD, creado: { sub: '1', nombre: 'ana', en: '2026-10-31T12:00:00.000Z' }, ...over });
const detalleZapas = { ok: true, perfil: perfilZapas, versiones: [ver(1), ver(2), ver(3)] };
const CATALOGO = { ok: true, rubros: ['ZAPAS', 'REMERAS'], marcas: ['NIKE'], subrubros_por_rubro: { REMERAS: ['MANGA CORTA'] } };

function rutasBase(extra = {}) {
  return {
    'GET /perfiles?estado=todos': { status: 200, body: { ok: true, perfiles: [perfilGeneral, perfilZapas] } },
    'GET /perfiles/esquema': { status: 200, body: { ok: true, esquema: ESQUEMA } },
    'GET /activaciones/vigente': { status: 200, body: { ok: true, vigente: null, referencia: { tipo: 'compat-operativo' } } },
    'GET /analisis/catalogo': { status: 200, body: CATALOGO },
    'GET /perfiles/2': { status: 200, body: detalleZapas },
    'GET /perfiles/1': { status: 200, body: { ok: true, perfil: perfilGeneral, versiones: [ver(1, { tipo_parametros: 'completos', general_version: null }), ver(2, { tipo_parametros: 'completos', general_version: null })] } },
    'GET /perfiles/1/versiones/1': { status: 200, body: { ok: true, perfil: perfilGeneral, version: { ...ver(1, { general_version: null }), parametros_efectivos: efectivos() } } },
    'GET /perfiles/1/versiones/2': { status: 200, body: { ok: true, perfil: perfilGeneral, version: { ...ver(2, { general_version: null }), parametros_efectivos: efectivos({ reposicion: { cobertura_reponer_max: 20 } }) } } },
    ...extra,
  };
}
async function entornoBase(extra, opciones) {
  const env = crearEntorno({ rutas: rutasBase(extra), ...(opciones || {}) });
  await env.ev('rrCargarBase()');
  return env;
}
const posts = env => env.reg.llamadas.filter(c => c.metodo !== 'GET');

// ── (1) y (2) Nada se activa solo; que se envia ───────────────────────────────────────────────
test('guardar un perfil NO activa nada: solo un POST a /perfiles con el alcance y las sobrescrituras', async () => {
  const env = await entornoBase({ 'POST /perfiles': { status: 201, body: { ok: true, perfil: perfilZapas, versiones: [ver(1)] } } });
  await env.ev("rrAbrirForm('crear')");
  env.ev("Object.assign(RR.form, { nombre: ' Remeras de verano ', rubro: 'REMERAS', alcanceTipo: 'rubro_subrubro', subrubro: 'MANGA CORTA', motivo: 'probar remeras' }); RR.form.sobrescribe['bien_vendido.ventas_min'] = true; RR.form.valores['bien_vendido.ventas_min'] = '2';");
  await env.ev('rrGuardarForm()');
  const envios = posts(env);
  assert.equal(envios.length, 1, 'un solo envio');
  assert.equal(envios[0].ruta, '/perfiles');
  assert.deepEqual(plano(envios[0].cuerpo), { nombre: 'Remeras de verano', alcance: { tipo: 'rubro_subrubro', rubro: 'REMERAS', subrubro: 'MANGA CORTA' }, parametros: { bien_vendido: { ventas_min: 2 } }, motivo: 'probar remeras' });
  assert.ok(!env.reg.llamadas.some(c => /activaciones$/.test(c.ruta) && c.metodo === 'POST'), 'no se activo nada');
  assert.match(env.ev('RR.mensaje.texto'), /Todavía no está activo/);
});

test('terminar una simulación NO activa nada: la activación es otra acción, con revisión y confirmación', async () => {
  const sim = simulacionFixture();
  const env = await entornoBase({ 'POST /simulaciones': { status: 201, body: { ok: true, simulacion: sim } }, 'GET /simulaciones/s1': { status: 200, body: { ok: true, simulacion: sim } }, 'GET /simulaciones/s1/productos?limit=25&offset=0': { status: 200, body: { ok: true, paginacion: { limit: 25, offset: 0, total: 0, devueltos: 0 }, productos: [] } }, 'GET /activaciones/elegibilidad/s1': { status: 200, body: { ok: true, elegible: true, motivo: null, vigente_actual: null, vigente_hasta: '2026-11-01T12:00:00.000Z', vigencia_horas: 24 } } });
  env.ev("RR.sub='simulaciones'; rrFormSimNuevo(); RR.sims.form.esp[2] = { sel: true, version: 3 }; RR.sims.form.generalVersion = 2;");
  await env.ev('rrEjecutarSim()');
  const envio = posts(env)[0];
  assert.equal(envio.ruta, '/simulaciones');
  assert.deepEqual(plano(envio.cuerpo), { general: { version: 2 }, especificos: [{ perfil_id: 2, version: 3 }], desde: '2026-08-01', hasta: '2026-10-30', referencia: 'vigente' });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(posts(env).filter(c => /activaciones/.test(c.ruta)).length, 0, 'terminar la simulación no activó nada');
  assert.ok(env.ev('RR.sims.resultado.sim.simulacion_id') === 's1');
});

function simulacionFixture(over = {}) {
  return {
    simulacion_id: 's1', creada: { sub: '1', nombre: 'ana', en: '2026-10-31T12:00:00.000Z' }, origen_simulacion_id: null,
    periodo: { desde: '2026-08-01', hasta: '2026-10-30', dias: 91 }, sucursales: { activas: ['0001', '0005'], ignoradas: ['0009'] },
    datos: { obtenidos_en: '2026-10-31T12:00:00.000Z', productos_evaluados: 110, stock_fecha_actualizacion: null },
    referencia: { tipo: 'compat', activacion_id: null, motivo: 'sin_conjunto_vigente' },
    escenario: { huella: 'dddddddddddddddd', general: { perfil_id: 1, nombre: 'General', version: 2 }, especificos: [{ perfil_id: 2, nombre: 'Zapas ' + PAYLOAD, alcance: { tipo: 'rubro', rubro: 'ZAPAS' }, version: 3, general_version_referenciada: 1, general_version_escenario: 2, difiere_del_general_del_escenario: true }] },
    cambios: { cambia_estado: 3, mismo_estado_cambia_detalle: 2, solo_umbrales: 5, sin_cambios: 100, con_diferencias_de_negocio: 5 },
    transiciones: { entran: 3, salen: 0, cambian: 0, igual: 107, matriz: [{ de: 'sin_clasificar', a: 'bien_vendido', n: 3 }] },
    rendimiento: { cambian: 0, matriz: [] },
    conteos: { por_estado_principal: { antes: { bien_vendido: 1 }, despues: { bien_vendido: 4 }, delta: { bien_vendido: 3 } }, por_accion_principal: { antes: {}, despues: {}, delta: {} }, por_rendimiento: { antes: {}, despues: {}, delta: {} } },
    por_perfil: [{ clave: 'general', productos: 80, version: 2, version_general: 2, categorias: { cambia_estado: 0, mismo_estado_cambia_detalle: 0, solo_umbrales: 80, sin_cambios: 0 } }],
    alcances: [{ perfil_id: 2, nombre: 'Zapas ' + PAYLOAD, alcance: { tipo: 'rubro', rubro: 'ZAPAS' }, estado: 'sin_productos_en_periodo', productos_coincidentes: 0, productos_resueltos: 0, par_no_verificable_en_catalogo: false, detalle: [] }],
    advertencias: [{ codigo: 'general_distinto', mensaje: 'Aviso ' + PAYLOAD }], ...over,
  };
}

test('nueva versión de un específico: se envían SOLO las sobrescrituras, version_base y general_version únicamente si cambió', async () => {
  const env = await entornoBase({ 'POST /perfiles/2/versiones': { status: 201, body: { ok: true, version: ver(4) } } });
  await env.ev("rrAbrirForm('version', RR.base.perfiles[1])");
  assert.equal(env.ev('RR.form.versionBase'), 3);
  assert.deepEqual(plano(env.ev('Object.keys(RR.form.sobrescribe)')), ['bien_vendido.ventas_min'], 'precarga las diferencias de la versión base');
  env.ev("RR.form.valores['bien_vendido.ventas_min'] = '2'; RR.form.motivo = 'subo el piso';");
  await env.ev('rrGuardarForm()');
  let envio = posts(env)[0];
  assert.deepEqual(plano(envio.cuerpo), { version_base: 3, parametros: { bien_vendido: { ventas_min: 2 } }, motivo: 'subo el piso' }, 'sin general_version: no se cambia el General en silencio');
  // Cambiar explícitamente el General referenciado.
  const env2 = await entornoBase({ 'POST /perfiles/2/versiones': { status: 201, body: { ok: true, version: ver(4) } } });
  await env2.ev("rrAbrirForm('version', RR.base.perfiles[1])");
  await env2.ev('rrVersionGeneral(2)');
  env2.ev("RR.form.generalVersion = 2; RR.form.motivo = 'adoptar general 2';");
  await env2.ev('rrGuardarForm()');
  envio = posts(env2)[0];
  assert.equal(envio.cuerpo.general_version, 2);
  assert.equal(envio.cuerpo.version_base, 3);
});

test('al cambiar el General referenciado se muestran los parámetros efectivos que cambian (sin los sobrescritos)', async () => {
  const env = await entornoBase();
  await env.ev("rrAbrirForm('version', RR.base.perfiles[1])");
  await env.ev('rrVersionGeneral(2)');
  env.ev('RR.form.generalVersion = 2');
  env.ev('rtRenderVistaActual()');
  const texto = env.host().textContent;
  assert.match(texto, /Al pasar del General v1 al v2 cambian estos parámetros efectivos/);
  assert.match(texto, /Cobertura hasta la cual hay que reponer: 14 → 20 días/);
  assert.doesNotMatch(texto, /Ventas mínimas de "Bien vendido": 3 →/, 'lo sobrescrito no cambia');
});

// ── (3) Conflictos y errores sin perder lo escrito ────────────────────────────────────────────
test('409 de edición: se conserva lo escrito, se explica qué pasó y se puede reintentar sobre la versión actual', async () => {
  let intento = 0;
  const env = await entornoBase({
    'POST /perfiles/2/versiones': () => (++intento === 1 ? { status: 409, body: { ok: false, codigo: 'conflicto_version', error: 'El perfil esta en la version 4', version_actual: 4 } } : { status: 201, body: { ok: true, version: ver(5) } }),
    'GET /perfiles/2': { status: 200, body: { ...detalleZapas, versiones: [ver(1), ver(2), ver(3), ver(4, { motivo: 'cambio de otra persona' })] } },
  });
  await env.ev("rrAbrirForm('version', RR.base.perfiles[1])");
  env.ev("RR.form.valores['bien_vendido.ventas_min'] = '2'; RR.form.motivo = 'mi edición';");
  await env.ev('rrGuardarForm()');
  assert.equal(env.ev('RR.form.conflicto.version_actual'), 4);
  assert.match(env.ev('RR.form.conflicto.mensaje'), /cambio de otra persona/);
  assert.equal(env.ev('RR.form.motivo'), 'mi edición');
  assert.equal(env.ev("RR.form.valores['bien_vendido.ventas_min']"), '2', 'no se perdió lo escrito');
  env.ev('rtRenderVistaActual()');
  assert.match(env.host().textContent, /no se perdieron/);
  env.host().botones('Reintentar sobre la versión v4')[0].click();
  assert.equal(env.ev('RR.form.versionBase'), 4);
  await env.ev('rrGuardarForm()');
  assert.equal(posts(env).at(-1).cuerpo.version_base, 4);
  assert.equal(env.ev('RR.form'), null, 'guardó y salió del formulario');
});

test('errores de validación del servidor: se muestran por campo y la relación entre parámetros en lenguaje del contrato', async () => {
  const env = await entornoBase({ 'POST /perfiles/2/versiones': { status: 400, body: { ok: false, codigo: 'invalido', error: 'Parametros invalidos', errores: [
    { ruta: 'bien_vendido.ratio_min', codigo: 'rango', mensaje: 'debe estar en (0, 1]' },
    { ruta: 'reposicion.cobertura_reponer_max < reposicion.cobertura_proxima_max', codigo: 'relacion', mensaje: 'debe cumplirse ... (recibido 40 y 30)' },
    { ruta: 'motivo', codigo: 'tipo', mensaje: 'motivo es obligatorio' }] } } });
  await env.ev("rrAbrirForm('version', RR.base.perfiles[1])");
  env.ev("RR.form.motivo = 'x'");
  await env.ev('rrGuardarForm()');
  const e = plano(env.ev('RR.form.errores'));
  assert.equal(e.campos['bien_vendido.ratio_min'], 'debe estar en (0, 1]');
  assert.match(e.resumen[0], /No se cumple la relación entre parámetros: Cobertura hasta la cual hay que reponer < Cobertura hasta la cual la reposición es próxima \(recibido 40 y 30\)/);
  assert.match(e.campos['reposicion.cobertura_reponer_max'], /Interviene en/);
  assert.equal(env.ev('RR.form.motivo'), 'x', 'el formulario conserva sus valores');
});

test('campos obligatorios vacíos se señalan sin llamar al servidor', async () => {
  const env = await entornoBase();
  await env.ev("rrAbrirForm('crear')");
  await env.ev('rrGuardarForm()');
  assert.equal(posts(env).length, 0);
  const campos = plano(env.ev('RR.form.errores.campos'));
  assert.ok(campos.nombre && campos['alcance.rubro'] && campos.motivo);
});

test('clasificación de fallas: sesión, permiso, no habilitado, módulo no listo, conflicto, simulación en curso, conjunto inválido', () => {
  const env = crearEntorno();
  const c = (s, d) => plano(env.ev(`rrClasificar(${s}, ${JSON.stringify(d)})`));
  assert.equal(c(401, {}).tipo, 'sesion');
  assert.equal(c(403, {}).tipo, 'permiso');
  assert.equal(c(503, { codigo: 'perfiles_no_habilitados' }).tipo, 'no_habilitado');
  const prep = c(503, { codigo: 'migracion_pendiente' });
  assert.equal(prep.tipo, 'preparacion');
  assert.doesNotMatch(prep.mensaje, /migra|node |npm|--aplicar/i, 'no se le pide al usuario ejecutar migraciones');
  assert.equal(c(429, { codigo: 'simulacion_en_curso' }).tipo, 'en_curso');
  assert.equal(c(409, { codigo: 'conflicto_version' }).tipo, 'conflicto');
  assert.equal(c(500, { codigo: 'conjunto_activo_invalido' }).tipo, 'conjunto_invalido');
  assert.equal(c(400, { errores: [] }).tipo, 'validacion');
  assert.equal(c(500, {}).tipo, 'error');
});

test('un error al cargar NO se muestra como lista vacía: se muestra el estado de error (y el de "no habilitado" informa)', async () => {
  const caido = crearEntorno({ rutas: { 'GET *': { status: 500, body: { ok: false, error: 'Error interno' } } } });
  await caido.ev('rrCargarBase()');
  caido.ev('rtRenderVistaActual()');
  assert.match(caido.host().textContent, /Error interno/);
  assert.doesNotMatch(caido.host().textContent, /No hay perfiles guardados/);
  const noHab = crearEntorno({ rutas: { 'GET *': { status: 503, body: { ok: false, codigo: 'perfiles_no_habilitados', error: 'x' } } } });
  await noHab.ev('rrCargarBase()');
  noHab.ev('rtRenderVistaActual()');
  assert.match(noHab.host().textContent, /todavía no están habilitadas/);
  assert.equal(noHab.host().botones('Nuevo perfil').length, 0, 'sin controles de administración');
  const sesion = crearEntorno({ rutas: { 'GET *': { status: 401, body: { ok: false, error: 'Token invalido o expirado' } } } });
  await sesion.ev('rrCargarBase()'); sesion.ev('rtRenderVistaActual()');
  assert.match(sesion.host().textContent, /sesión venció/);
});

test('solo administradores: otro rol no ve controles ni dispara llamadas', () => {
  const env = crearEntorno({ usuario: { rol: 'jefe', usuario: 'x' } });
  env.ev('rtRenderVistaActual()');
  assert.match(env.host().textContent, /solo para administradores/);
  assert.equal(env.reg.llamadas.length, 0);
});

// ── (4) Activación: elegibilidad, vigente_esperado, evidencia vencida ────────────────────────
async function entornoActivacion({ vigente = null, respuestaActivar } = {}) {
  const env = await entornoBase({
    'GET /activaciones/vigente': { status: 200, body: { ok: true, vigente, referencia: vigente ? null : { tipo: 'compat-operativo' } } },
    'POST /activaciones': respuestaActivar || { status: 201, body: { ok: true, activacion: { activacion_id: 7 } } },
  });
  env.ev(`RR.act.revision = { sim: ${JSON.stringify(simulacionFixture())}, eleg: { elegible: true } }; RR.act.motivo = 'motivo de la activación'; RR.act.confirmo = true; RR.sub = 'activacion';`);
  return env;
}
const vigenteFixture = { activacion_id: 3, conjunto: { huella: 'eeeeeeeeeeeeeeee', general: { perfil_id: 1, nombre: 'General', version: 1 }, especificos: [] }, motivo: 'm', creada: { sub: '1', nombre: 'ana', en: '2026-10-30T12:00:00.000Z' }, advertencias: [], vigente: true };

test('activar envía vigente_esperado (null sin vigente), las versiones EXACTAS simuladas y el motivo; al terminar refresca Oportunidades', async () => {
  const sinVigente = await entornoActivacion();
  await sinVigente.ev('rrActivar()');
  assert.deepEqual(plano(posts(sinVigente)[0].cuerpo), { simulacion_id: 's1', vigente_esperado: null, motivo: 'motivo de la activación', general: { version: 2 }, especificos: [{ perfil_id: 2, version: 3 }] });
  assert.equal(sinVigente.ev('RT_OPORTUNIDADES'), null, 'Oportunidades vuelve a pedir resultados con el conjunto nuevo');
  assert.match(sinVigente.ev('RR.mensaje.texto'), /conjunto #7/);
  const conVigente = await entornoActivacion({ vigente: vigenteFixture });
  await conVigente.ev('rrActivar()');
  assert.equal(posts(conVigente)[0].cuerpo.vigente_esperado, 3);
});

test('evidencia vencida o vigente cambiado: se explica que hace falta volver a simular, no se pierde nada y no se refresca Oportunidades', async () => {
  const env = await entornoActivacion({ respuestaActivar: { status: 409, body: { ok: false, codigo: 'evidencia_vencida', error: 'La simulacion tiene mas de 24 horas de antiguedad' } } });
  await env.ev('rrActivar()');
  env.ev('rtRenderVistaActual()');
  const t = env.host().textContent;
  assert.match(t, /Hace falta volver a simular/);
  assert.match(t, /venció/);
  assert.equal(env.host().botones('Volver a simular').length >= 1, true);
  assert.equal(env.ev('RT_OPORTUNIDADES.marca'), 'previo', 'no se tocó Oportunidades');
  assert.equal(env.ev('RR.act.revision !== null'), true, 'la revisión sigue disponible');
  const cambio = await entornoActivacion({ vigente: vigenteFixture, respuestaActivar: { status: 409, body: { ok: false, codigo: 'vigente_cambio_tras_simular', error: 'La simulacion se hizo contra el conjunto 3 pero ahora rige el 4' } } });
  await cambio.ev('rrActivar()'); cambio.ev('rtRenderVistaActual()');
  assert.match(cambio.host().textContent, /conjunto vigente cambió después de simular/);
});

test('alcance inexistente bloquea la activación y se lista; catálogo no disponible no activa', async () => {
  const env = await entornoActivacion({ respuestaActivar: { status: 422, body: { ok: false, codigo: 'alcance_inexistente', error: 'x', alcances: [{ perfil_id: 2, nombre: 'Zapas', errores: ['el rubro "ZAPAS" no existe en el catalogo (coincidencia exacta)'] }] } } });
  await env.ev('rrActivar()'); env.ev('rtRenderVistaActual()');
  assert.match(env.host().textContent, /La activación está bloqueada/);
  assert.match(env.host().textContent, /no existe en el catalogo/);
});

test('el botón "Activar estas reglas" exige motivo y confirmación; una simulación no elegible no ofrece revisar', async () => {
  const env = await entornoActivacion();
  env.ev("RR.act.motivo = 'ab'; RR.act.confirmo = false;");
  env.ev('rtRenderVistaActual()');
  const boton = () => env.host().botones('Activar estas reglas')[0];
  assert.equal(boton().disabled, true);
  env.ev("RR.act.motivo = 'motivo válido'; RR.act.confirmo = false;"); env.ev('rtRenderVistaActual()');
  assert.equal(boton().disabled, true, 'sin confirmar');
  env.ev('RR.act.confirmo = true'); env.ev('rtRenderVistaActual()');
  assert.equal(boton().disabled, false);
  // Simulación NO elegible: no hay botón "Revisar para activar", y se explica por qué.
  const sim = simulacionFixture();
  const e2 = await entornoBase();
  e2.ev(`RR.sub = 'simulaciones'; RR.sims.resultado = { id: 's1', cargando: false, sim: ${JSON.stringify(sim)}, falla: null }; RR.sims.productos = { productos: [], paginacion: { limit: 25, offset: 0, total: 0, devueltos: 0 } }; RR.sims.elegibilidad = { ok: true, elegible: false, motivo: { codigo: 'evidencia_vencida', mensaje: 'La simulacion tiene mas de 24 horas de antiguedad' } };`);
  e2.ev('rtRenderVistaActual()');
  assert.equal(e2.host().botones('Revisar para activar').length, 0);
  assert.match(e2.host().textContent, /no puede respaldar una activación/);
  assert.match(e2.host().textContent, /Hace falta volver a simular/);
});

test('la simulación para activar usa todas las sucursales operativas por defecto; un subconjunto se advierte', async () => {
  const env = await entornoBase();
  env.ev("RR.sub = 'simulaciones'; rrFormSimNuevo();");
  assert.equal(env.ev('RR.sims.form.todas'), true);
  env.ev('rtRenderVistaActual()');
  assert.match(env.host().textContent, /necesario para poder activar/);
  env.ev('RR.sims.form.todas = false'); env.ev('rtRenderVistaActual()');
  assert.match(env.host().textContent, /no podrá respaldar una activación/);
});

test('"Reejecutar" exige confirmación y avisa que crea una simulación nueva', async () => {
  const env = await entornoBase({ 'POST /simulaciones/s1/reejecutar': { status: 201, body: { ok: true, simulacion: simulacionFixture({ simulacion_id: 's2', origen_simulacion_id: 's1' }) } }, 'GET /simulaciones/s2/productos?limit=25&offset=0': { status: 200, body: { ok: true, paginacion: { limit: 25, offset: 0, total: 0, devueltos: 0 }, productos: [] } } });
  env.ev(`RR.sub = 'simulaciones'; RR.sims.resultado = { id: 's1', cargando: false, sim: ${JSON.stringify(simulacionFixture())}, falla: null, confirmarReejecucion: false }; RR.sims.productos = { productos: [], paginacion: { limit: 25, offset: 0, total: 0, devueltos: 0 } };`);
  env.ev('rtRenderVistaActual()');
  assert.match(env.host().textContent, /Reejecutar crea una simulación nueva/);
  env.host().botones('Reejecutar con datos actuales')[0].click();
  env.ev('rtRenderVistaActual()');
  assert.match(env.host().textContent, /crea una simulación NUEVA/);
  assert.equal(posts(env).length, 0, 'todavía no se reejecutó');
});

test('un 429 por simulación en curso conserva las selecciones y no pierde el formulario', async () => {
  const env = await entornoBase({ 'POST /simulaciones': { status: 429, body: { ok: false, codigo: 'simulacion_en_curso', error: 'Ya hay una simulacion en curso' }, headers: { 'Retry-After': '30' } } });
  env.ev("RR.sub = 'simulaciones'; rrFormSimNuevo(); RR.sims.form.esp[2] = { sel: true, version: 3 };");
  await env.ev('rrEjecutarSim()');
  assert.match(env.ev('RR.sims.form.aviso.texto'), /Ya hay una simulación en curso/);
  assert.equal(env.ev('RR.sims.form.esp[2].sel'), true);
  assert.equal(env.ev('RR.sims.enCurso'), false);
});

// ── (5) Texto seguro ──────────────────────────────────────────────────────────────────────────
test('nombres, motivos, advertencias y notas de la API se muestran como TEXTO: nunca se interpretan como HTML', async () => {
  const sim = simulacionFixture();
  const env = await entornoBase({ 'GET /activaciones/vigente': { status: 200, body: { ok: true, vigente: { ...vigenteFixture, motivo: 'Motivo ' + PAYLOAD, conjunto: { ...vigenteFixture.conjunto, especificos: [{ perfil_id: 2, nombre: 'Zapas ' + PAYLOAD, version: 3, general_version_referenciada: 1, alcance: { tipo: 'rubro', rubro: 'ZAPAS' } }] }, advertencias: [{ mensaje: 'Adv ' + PAYLOAD }] } } } });
  const vistas = [];
  env.ev('rtRenderVistaActual()'); vistas.push(env.host().textContent);                                                   // lista de perfiles
  await env.ev('rrAbrirDetalle(2)'); env.ev('rtRenderVistaActual()'); vistas.push(env.host().textContent);                  // detalle y versiones
  env.ev(`RR.detalle = null; RR.sub = 'simulaciones'; RR.sims.resultado = { id: 's1', cargando: false, sim: ${JSON.stringify(sim)}, falla: null }; RR.sims.elegibilidad = { elegible: true, vigente_hasta: '2026-11-01T00:00:00Z', vigencia_horas: 24 }; RR.sims.productos = { productos: [{ codigo: '1', nombre: 'Prod ${PAYLOAD}', marca: 'M', perfil: 'general', estado: { antes: null, despues: 'bien_vendido' }, accion_principal: {}, rendimiento: {}, transicion: 'entra', categoria: 'cambia_estado', detalle: { antes: { estado_principal: null, motivo: 'a ${PAYLOAD}' }, despues: { estado_principal: 'bien_vendido', motivo: 'b ${PAYLOAD}', etiquetas_secundarias: [], acciones: [], rendimiento: {} }, parametros_distintos: [], resolucion: { nombre: 'Z ${PAYLOAD}', alcance_tipo: 'general', motivo: { texto: 'r ${PAYLOAD}' } } } }], paginacion: { limit: 25, offset: 0, total: 1, devueltos: 1 } }; RR.sims.expandido = '1';`);
  env.ev('rtRenderVistaActual()'); vistas.push(env.host().textContent);                                                   // resultado de simulación
  env.ev("RR.sims.resultado = null; RR.sub = 'activacion'; rtRenderVistaActual()"); vistas.push(env.host().textContent);   // activación e historial
  for (const t of vistas) assert.ok(t.length > 50);
  assert.ok(vistas.some(t => t.includes(PAYLOAD)), 'el texto malicioso aparece literal');
  assert.deepEqual(env.reg.innerHTML.filter(h => /img|onerror|alert/i.test(h)), [], 'ningún dato de la API pasó por innerHTML');
  assert.equal(env.host().buscar(n => n.tagName === 'IMG' || n.tagName === 'SCRIPT').length, 0);
});

// ── (6) Oportunidades: etiquetas, rendimiento, avisos ─────────────────────────────────────────
const producto = (over = {}) => ({
  Codigo_producto: '1003', estado_principal: 'posible_rotacion', etiquetas_secundarias: ['seguimiento'], motivos_secundarios: { seguimiento: 'Ingresó hace 10 días' }, motivo: 'Vende bien en 0010 pero tiene stock parado en 0001 (confianza: manual).',
  acciones: [{ accion: 'revisar_rotacion', estado_origen: 'posible_rotacion', principal: true, prioridad: 'alta', motivo: 'm', requiere_validacion_variante: true, ejecutable: false }],
  rendimiento: { nivel: null, regla: null, clasificado: false, motivo: null }, calidad_datos: { indicadores: [{ codigo: 'rotacion_sin_validacion_variante', severidad: 'info', detalle: 'Falta validar talle, color y stock real por variante en Rotaciones.' }], fuentes: { stock_fecha_nota: 'no informada por el motor' } },
  perfil: { id: 'perfil-2', version: 3, huella: 'a5febfced8862991' }, resolucion: { origen: 'especifico', perfil_id: 2, alcance_tipo: 'rubro', version_especifica: 3, version_general: 1, motivo: 'rubro' },
  explicacion: { periodo_dias: 91, condiciones_por_estado: { posible_rotacion: [{ condicion: 'Ventas en la sucursal destino 0010', valor: 3, operador: '>=', umbral: 3, unidad: 'unidades', cumple: true }, { condicion: 'Cobertura de la sucursal origen 0001', valor: 0.5, operador: '>=', umbral: 0.2, unidad: 'proporción', cumple: true }], seguimiento: [{ condicion: 'Cumple "Bien vendido"', valor: null, operador: null, umbral: null, unidad: null, cumple: true, informativa: true }] }, datos_faltantes: ['Sin fecha de último ingreso registrada'] },
  ...over,
});
const RESP = { periodo: { desde: '2026-08-01', hasta: '2026-10-30' }, sucursales: ['0001', '0005', '0010', '0012', '0014'], sucursales_ignoradas: [], conjunto: { origen: 'activacion', activacion_id: 4, huella: 'abcdef0123456789' } };

test('Oportunidades: "seguimiento" se muestra como "Ingreso reciente" y nunca como "Seguimiento"', () => {
  const env = crearEntorno();
  assert.equal(env.ev("rrTextoEstado('seguimiento', 'Seguimiento')"), 'Ingreso reciente');
  assert.equal(env.ev("rrTextoEstado('bien_vendido', 'Bien vendido')"), 'Bien vendido');
});

test('Oportunidades: rendimiento sin clasificar no se rotula "normal" ni "bajo"; solo destacado/bueno', () => {
  const env = crearEntorno();
  assert.equal(env.ev(`rrTextoRendimiento(${JSON.stringify(producto())})`), 'Sin clasificación de rendimiento');
  assert.equal(env.ev("rrTextoRendimiento({ rendimiento: { nivel: 'bueno' } })"), 'Bueno');
  assert.equal(env.ev("rrTextoRendimiento({ rendimiento: { nivel: 'destacado' } })"), 'Destacado');
  const celda = env.ev(`ovCeldaAccion(${JSON.stringify(producto())}).textContent`);
  assert.doesNotMatch(celda, /normal|bajo/i);
  assert.match(celda, /Validar por variante/);
});

test('Oportunidades: "Por qué aparece" muestra período, condiciones con valor y umbral, advertencias y datos faltantes', () => {
  const env = crearEntorno();
  const html = env.ev(`(() => { const panel = rtEl('div'); const bloque = (e, v) => { const b = rtEl('div'); b.appendChild(rtEl('b', { text: e })); const x = rtEl('div'); if (typeof v === 'string') x.textContent = v; else x.appendChild(v); b.appendChild(x); return b; }; rrDetalleOportunidad(panel, ${JSON.stringify(producto({ advertencias: ['Hay 2 unidades en Fallados 93.'] }))}, ${JSON.stringify(RESP)}, bloque); return panel.textContent; })()`);
  assert.match(html, /Por qué aparece/);
  assert.match(html, /Período analizado: 2026-08-01 a 2026-10-30 \(91 días\)/);
  assert.match(html, /Ventas en la sucursal destino 0010/);
  assert.match(html, /3 unidades ≥ 3 unidades/);
  assert.match(html, /50\.0% ≥ 20\.0%/);
  assert.match(html, /Ingreso reciente \(secundaria\)/);
  assert.match(html, /Hay 2 unidades en Fallados 93/);
  assert.match(html, /Sin fecha de último ingreso registrada/);
  assert.match(html, /Perfil #2 v3 \(sobre General v1\) · conjunto #4/);
  assert.match(html, /requiere validación por variante/);
  assert.match(html, /Falta validar talle, color y stock real por variante/);
  assert.doesNotMatch(html, /Seguimiento/, 'el estado interno se rotula Ingreso reciente');
});

test('Oportunidades: la señal de rotación enlaza a Rotaciones (sin crear envíos) y deja el código filtrado', () => {
  const env = crearEntorno();
  env.ev(`(() => { const panel = rtEl('div'); globalThis.__panel = panel; rrDetalleOportunidad(panel, ${JSON.stringify(producto())}, ${JSON.stringify(RESP)}, (e, v) => rtEl('div', { text: e })); })()`);
  const btn = env.ev('__panel').botones('Ver este producto en Rotaciones')[0];
  btn.click();
  assert.equal(env.ev('RT_ROTACIONES_FILTRO.codigo'), '1003');
  assert.equal(env.ev('ultimaVista'), 'rotaciones');
  assert.equal(env.ev('RT_ROTACIONES'), null, 'fuerza recarga de sugerencias; no se creó ningún envío');
  assert.equal(env.reg.llamadas.length, 0);
});

test('Oportunidades: aviso visible de sucursales no consideradas (ignoradas por el servidor o seleccionadas pero no evaluadas)', () => {
  const env = crearEntorno();
  const aviso = r => env.ev(`(() => { const h = rtEl('div'); ovAvisoSucursalesNoConsideradas(h, ${JSON.stringify(r)}); return h.textContent; })()`);
  assert.doesNotMatch(aviso(RESP), /Sucursales no consideradas/);
  assert.match(aviso({ ...RESP, sucursales_ignoradas: ['0009'] }), /Sucursales no consideradas: 09 Cipo San Martín/);
  env.ev("RT_CENTROS.push('0009')");
  assert.match(aviso(RESP), /Sucursales no consideradas: 09 Cipo San Martín/, 'seleccionada en la app pero no evaluada por el servidor');
});

// ── Ajustes de presentacion (revision visual de la Fase 5) ───────────────────────────────────────
const panelDe = (env, f, resp = RESP) => env.ev(`(() => { const panel = rtEl('div'); const bloque = (e, v) => { const b = rtEl('div'); b.appendChild(rtEl('b', { text: e })); const x = rtEl('div'); if (typeof v === 'string') x.textContent = v; else x.appendChild(v); b.appendChild(x); return b; }; rrDetalleOportunidad(panel, ${JSON.stringify(f)}, ${JSON.stringify(resp)}, bloque); return panel; })()`);
// Texto de lo que queda VISIBLE (fuera de los <details> cerrados).
const textoVisible = n => n.tagName === 'DETAILS' && !n.open ? '' : (n._texto || '') + n.children.map(textoVisible).join('|');

test('resumen visible: acción, rendimiento, ventas y stock; huellas y explicación larga quedan en desplegables cerrados', () => {
  const env = crearEntorno();
  const panel = panelDe(env, producto({ Ventas_total: 12, Stock_sucursales: 7, Stock_deposito: 5, Stock_fallados: 1, ventas_semana: 1.3, ratio_venta: 0.6 }));
  const visible = textoVisible(panel);
  assert.match(visible, /Acción sugerida/);
  assert.match(visible, /Sin clasificación de rendimiento/);
  assert.match(visible, /Ventas del período: 12/);
  assert.match(visible, /Stock en sucursales: 7/);
  assert.match(visible, /Depósito 90: 5/);
  assert.match(visible, /Ratio de venta: 60\.0%/);
  assert.doesNotMatch(visible, /huella|Perfil #|conjunto #|El motor solo distingue/, 'metadatos y explicación extensa no son visibles sin abrir el detalle');
  const detalles = panel.buscar(n => n.tagName === 'DETAILS');
  assert.deepEqual(detalles.map(d => d.querySelector('summary').textContent), ['Por qué aparece', 'Detalles técnicos'], 'el administrador ve ambos desplegables');
  assert.ok(detalles.every(d => !d.open), 'ambos desplegables cerrados por defecto');
  assert.match(detalles[1].textContent, /Perfil #2 v3 \(sobre General v1\) · conjunto #4/);
  assert.match(detalles[0].textContent, /El motor solo distingue rendimiento destacado o bueno/, 'la explicación extensa sigue disponible');
  assert.equal(panel.buscar(n => n.tagName === 'B' && n.textContent === 'Motivo').length, 0, 'sin bloque Motivo repetido');
});

test('la celda de acción muestra las dos dimensiones que entrega el motor sin deducir nada más', () => {
  const env = crearEntorno();
  const celda = o => env.ev(`ovCeldaAccion({ ...${JSON.stringify(producto())}, ...${JSON.stringify(o)} }).textContent`);
  assert.match(celda({}), /Sin clasificación de rendimiento/);
  assert.doesNotMatch(celda({}), /Rendimiento: Sin|Reglas:|huella/);
  assert.match(celda({ rendimiento: { nivel: 'destacado' } }), /Venta destacada/);
  assert.match(celda({ rendimiento: { nivel: 'bueno' } }), /Bien vendido/);
  assert.match(celda({ acciones: [] }), /Sin acción sugerida/);
  assert.doesNotMatch(celda({ rendimiento: { nivel: null } }), /normal|bajo/i);
});

test('sucursales en la explicación: nombre del catálogo junto al código (datos estructurados) y solo el código si falta el nombre', () => {
  const env = crearEntorno();
  const conPar = (d, o) => ({ diagnostico_rotacion: { par_sugerido: { destino: { sucursal: d, ventas: 5, stock: 0 }, origen: { sucursal: o, stock: 9, ventas: 0 } } } });
  const linea = f => panelDe(env, f).buscar(n => n.className.includes('rr-sucursales')).map(n => n.textContent);
  assert.match(linea(producto(conPar('0010', '0001')))[0], /destino 10 Perito Moreno \(0010\) · origen 01 Paseo \(0001\)/);
  assert.match(linea(producto(conPar('0010', '9999')))[0], /origen 9999\./, 'sin nombre en el catálogo queda el código');
  assert.equal(linea(producto()).length, 0, 'sin par de rotación no hay línea de sucursales');
  assert.match(panelDe(env, producto()).textContent, /Ventas en la sucursal destino 0010/, 'el texto del motor no se reescribe');
});

test('"Rotación mínima" se muestra como "Ratio de venta mínimo" y aclara que no es el porcentaje vendido de un ingreso; los identificadores no cambian', async () => {
  const env = await entornoBase();
  const p = JSON.parse(env.ev('JSON.stringify(rrParamsEsquema().find(p => p.ruta === "bien_vendido.ratio_min"))'));
  assert.equal(p.etiqueta, 'Ratio de venta mínimo de "Bien vendido"');
  assert.match(p.ayuda, /Ventas ÷ \(ventas \+ stock\)/);
  assert.match(p.ayuda, /No es el porcentaje vendido de un ingreso/);
  assert.equal(p.ruta, 'bien_vendido.ratio_min');
  assert.equal(p.tipo, 'fraccion');
  assert.deepEqual(plano(env.ev('RR.base.esquema.grupos.flatMap(g => g.parametros.map(x => x.ruta))')), ['bien_vendido.ventas_min', 'bien_vendido.ratio_min', 'reposicion.cobertura_reponer_max', 'reposicion.cobertura_proxima_max']);
  await env.ev("rrAbrirForm('crear')");
  assert.doesNotMatch(env.host().textContent, /Rotación mínima/);
  assert.match(env.host().textContent, /Ratio de venta mínimo de "Bien vendido"/);
});

test('las relaciones entre parámetros se rearman con las etiquetas visibles (misma ruta y operador)', async () => {
  const env = await entornoBase();
  const rel = plano(env.ev('RR.base.esquema.relaciones'));
  assert.equal(rel[0].izq, 'reposicion.cobertura_reponer_max');
  assert.equal(rel[0].op, '<');
  assert.equal(rel[0].texto, 'Cobertura hasta la cual hay que reponer < Cobertura hasta la cual la reposición es próxima');
});

test('condiciones del motor: el ratio se rotula "Ratio de venta" por coincidencia exacta y se aclara que no es % vendido de un ingreso', () => {
  const env = crearEntorno();
  const exp = { periodo_dias: 91, condiciones_por_estado: { bien_vendido: [{ condicion: 'Rotación sobre venta + stock', valor: 0.55, operador: '>=', umbral: 0.5, unidad: 'proporción', cumple: true }] }, datos_faltantes: [] };
  const txt = panelDe(env, producto({ estado_principal: 'bien_vendido', etiquetas_secundarias: [], explicacion: exp })).textContent;
  assert.match(txt, /Ratio de venta \(ventas ÷ \(ventas \+ stock\)\)/);
  assert.match(txt, /No es el porcentaje vendido de un ingreso/);
  assert.equal(env.ev("RR_CONDICION_TEXTO['Condición desconocida'] || 'Condición desconocida'"), 'Condición desconocida');
});

test('perfiles: tabla de escritorio y tarjetas mobile con alcance, versión guardada, versión vigente y botones', async () => {
  const env = await entornoBase();
  const host = env.host();
  assert.equal(host.buscar(n => n.className === 'rr-perfiles-tabla').length, 1, 'la tabla de escritorio se conserva');
  const tarjetas = host.buscar(n => n.className === 'rr-perfil-card');
  assert.equal(tarjetas.length, 2);
  const zapas = tarjetas.find(t => t.textContent.includes('Zapas'));
  assert.match(zapas.textContent, /Alcance/);
  assert.match(zapas.textContent, /Versión guardada/);
  assert.match(zapas.textContent, /v3/);
  assert.match(zapas.textContent, /Versión vigente/);
  assert.deepEqual(zapas.buscar(n => n.tagName === 'BUTTON').map(b => b.textContent), ['Ver versiones', 'Nueva versión']);
  assert.equal(env.reg.innerHTML.length, 0, 'sin innerHTML con datos de la API');
  zapas.botones('Ver versiones')[0].click();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(env.ev('RR.detalle && RR.detalle.id'), 2, 'los botones de la tarjeta funcionan igual que los de la tabla');
});

test('estilos: las sobrescrituras usan azul suave (no rojo) y el rojo queda para errores; las tarjetas solo aparecen en mobile', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'oportunidades-reglas.css'), 'utf8');
  const cambiado = css.match(/\.rr-param\.rr-cambiado\{([^}]*)\}/)[1];
  assert.match(cambiado, /--info/);
  assert.doesNotMatch(cambiado, /accent|danger|fde8e6/);
  assert.match(css, /\.rr-param\.rr-con-error\{background:var\(--danger-bg\)\}/);
  assert.match(css, /\.rr-perfiles-tarjetas\{display:none\}/);
  assert.match(css, /@media \(max-width:700px\)\{[^@]*\.rr-perfiles-tarjetas\{display:block\}[^@]*\.rr-perfiles-tabla\{display:none\}/);
});

// ── Varios rubros a la vez (un perfil por rubro, mismos parámetros) ─────────────────────────────
const prepararVarios = async (extra, extras = ['REMERAS']) => {
  const env = await entornoBase(extra);
  await env.ev("rrAbrirForm('crear')");
  env.ev(`Object.assign(RR.form, { nombre: ' Verano ', rubro: 'ZAPAS', alcanceTipo: 'rubro', rubrosExtra: ${JSON.stringify(extras)}, motivo: 'mismo criterio' }); RR.form.sobrescribe['bien_vendido.ventas_min'] = true; RR.form.valores['bien_vendido.ventas_min'] = '2';`);
  return env;
};

test('varios rubros: se crea un perfil por rubro con los mismos parámetros, nombre con el rubro y sin activar nada', async () => {
  const env = await prepararVarios({ 'POST /perfiles': { status: 201, body: { ok: true, perfil: perfilZapas, versiones: [ver(1)] } } });
  await env.ev('rrGuardarForm()');
  const envios = posts(env);
  assert.equal(envios.length, 2);
  assert.deepEqual(envios.map(e => e.ruta), ['/perfiles', '/perfiles']);
  assert.deepEqual(envios.map(e => e.cuerpo.nombre), ['Verano · ZAPAS', 'Verano · REMERAS']);
  assert.deepEqual(envios.map(e => e.cuerpo.alcance), [{ tipo: 'rubro', rubro: 'ZAPAS' }, { tipo: 'rubro', rubro: 'REMERAS' }]);
  assert.deepEqual(plano(envios[0].cuerpo.parametros), plano(envios[1].cuerpo.parametros));
  assert.ok(!env.reg.llamadas.some(c => /activaciones|simulaciones/.test(c.ruta) && c.metodo !== 'GET'), 'no activa ni simula');
  assert.match(env.ev('RR.mensaje.texto'), /2 perfiles guardados como borrador \(ZAPAS, REMERAS\)/);
  assert.equal(env.ev('RR.form'), null);
});

test('varios rubros: si uno falla se conservan los creados, el formulario queda con los que faltan y reintentar no duplica', async () => {
  let n = 0;
  const env = await prepararVarios({ 'POST /perfiles': () => (++n === 2 ? { status: 400, body: { ok: false, error: 'validacion', errores: [{ ruta: 'nombre', mensaje: 'Ya existe un perfil con ese nombre' }] } } : { status: 201, body: { ok: true, perfil: perfilZapas, versiones: [ver(1)] } }) }, ['REMERAS', 'BUZOS']);
  await env.ev('rrGuardarForm()');
  assert.equal(posts(env).length, 2, 'frena en el primero que falla');
  assert.deepEqual(plano(env.ev('[RR.form.rubro, ...RR.form.rubrosExtra]')), ['REMERAS', 'BUZOS']);
  const texto = env.host().textContent;
  assert.match(texto, /Se crearon 1 perfil\(es\): ZAPAS/);
  assert.match(texto, /No se pudo crear el perfil de "REMERAS"/);
  await env.ev('rrGuardarForm()');
  const nombres = posts(env).map(e => e.cuerpo.nombre);
  assert.deepEqual(nombres, ['Verano · ZAPAS', 'Verano · REMERAS', 'Verano · REMERAS', 'Verano · BUZOS'], 'ZAPAS no se vuelve a crear');
});

test('varios rubros: un nombre que con el rubro supera 80 caracteres se señala sin llamar al servidor; un solo rubro conserva el nombre tal cual', async () => {
  const env = await prepararVarios({ 'POST /perfiles': { status: 201, body: { ok: true, perfil: perfilZapas, versiones: [ver(1)] } } });
  env.ev("RR.form.nombre = 'x'.repeat(78)");
  await env.ev('rrGuardarForm()');
  assert.equal(posts(env).length, 0);
  assert.match(env.ev('RR.form.errores.campos.nombre'), /supera los 80/);
  env.ev("RR.form.nombre = ' Solo zapas '; RR.form.rubrosExtra = []; RR.form.errores = { campos: {}, resumen: [] }");
  await env.ev('rrGuardarForm()');
  assert.equal(posts(env).length, 1);
  assert.equal(posts(env)[0].cuerpo.nombre, 'Solo zapas');
});

test('varios rubros: el selector solo aparece con "Todo el rubro" y no ofrece el rubro principal', async () => {
  const env = await entornoBase();
  await env.ev("rrAbrirForm('crear')");
  env.ev("RR.form.rubro = 'ZAPAS'; rrRender();");
  const det = env.host().buscar(n => n.className.includes('rr-rubros-extra'))[0];
  assert.ok(det, 'visible con alcance por rubro');
  const opciones = det.buscar(n => n.tagName === 'LABEL').map(l => l.textContent);
  assert.deepEqual(opciones, ['REMERAS']);
  env.ev("RR.form.alcanceTipo = 'rubro_marca'; rrRender();");
  assert.equal(env.host().buscar(n => n.className.includes('rr-rubros-extra')).length, 0, 'con subrubro/marca sigue siendo un solo rubro');
});
