'use strict';
// Pruebas de la interfaz de la etapa I4 del §23 (rendimiento desde el ingreso en perfiles, simulacion y activacion) y de su
// presentacion en Oportunidades. Sin navegador:  node --test tests/reglas-rendimiento.test.js
// Cubren: (1) el modo como lista con la explicacion de cada valor, lo que se envia y la compatibilidad con perfiles sin el
// parametro; (2) la evidencia del snapshot en una simulacion (ejecucion, version, corte, alcance, huella), altas y bajas y la
// suspension; (3) la elegibilidad y la activacion rechazada por el snapshot; (4) en Oportunidades, etiquetas ACTIVAS como pastillas
// secundarias, el aviso de suspension y la explicacion; (5) que ningun texto de la API se inserte como HTML.
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./dom-minimo');

const plano = v => JSON.parse(JSON.stringify(v));
const PAYLOAD = '<img src=x onerror=alert(1)>';
const MODOS = [
  { valor: 0, titulo: 'No se usa', descripcion: 'Comportamiento vigente: el rendimiento desde el ingreso es solo informativo en el detalle y no cambia nada.' },
  { valor: 1, titulo: 'Etiquetas secundarias', descripcion: 'Agrega las etiquetas secundarias "Buen rendimiento del ingreso" y "Salida lenta del ingreso". No cambian la prioridad.' },
  { valor: 2, titulo: 'Reemplaza "Bien vendido" y "Venta destacada"', descripcion: 'Bien vendido y Venta destacada pasan a decidirse por el rendimiento desde el ingreso; si el snapshot no sirve, se suspenden.' },
];
const par = (ruta, etiqueta, tipo, unidad, min, max, inicial, extra = {}) => ({ ruta, etiqueta, ayuda: 'ayuda de ' + etiqueta, tipo, unidad, min, max, paso: tipo === 'fraccion' ? 0.01 : 1, minimo_exclusivo: tipo === 'fraccion', valor_inicial_general: inicial, ...extra });
const ESQUEMA = {
  total_parametros: 4,
  grupos: [
    { id: 'demanda', titulo: 'Demanda y rendimiento', descripcion: 'd', parametros: [par('bien_vendido.ventas_min', 'Ventas mínimas de "Bien vendido"', 'entero', 'unidades', 1, 1000, 3)] },
    { id: 'reposicion', titulo: 'Reposición y rotación', descripcion: 'r', parametros: [par('reposicion_urgente.demanda_90_min', 'Ventas netas mínimas en 90 días (reposición urgente)', 'entero', 'unidades netas en 90 dias', 0, 1000, 0, { opcional: true, valor_por_defecto: 0 })] },
    { id: 'rendimiento_ingreso', titulo: 'Rendimiento desde el ingreso', descripcion: 'Uso del snapshot nocturno.', parametros: [par('rendimiento_ingreso.modo', 'Uso del rendimiento desde el ingreso', 'entero', 'modo', 0, 2, 0, { opcional: true, valor_por_defecto: 0, opciones: MODOS, depende_del_snapshot: true })] },
  ],
  relaciones: [], reglas_fijas: ['regla fija'], claves_fijas: [], contrato_parametros: 3,
  rendimiento_ingreso: {
    modos: MODOS, estados_reemplazados_en_modo_2: ['bien_vendido', 'venta_destacada'],
    etiquetas: [{ id: 'salida_lenta_ingreso', texto: 'Salida lenta del ingreso', nota: 'Distinta del estancamiento ' + PAYLOAD }],
    condiciones_del_snapshot: ['vigente: corte de hace 2 días o menos', 'alcance: las 5 sucursales operativas'],
    suspension: 'Si alguna condición falla, las etiquetas se suspenden con su motivo.', sin_evidencia: 'Sin evidencia no hay etiquetas positivas.',
  },
};
// Version guardada con el contrato anterior: sus parametros no traen los opcionales; los efectivos (servidor) si.
const efectivos = (over = {}) => ({ bien_vendido: { ventas_min: 3 }, reposicion_urgente: { demanda_90_min: 0 }, rendimiento_ingreso: { modo: 0 }, ...over });
const perfilGeneral = { perfil_id: 1, nombre: 'General', alcance: { tipo: 'general' }, estado: 'borrador', version_actual: 1, huella_actual: 'aaaaaaaaaaaaaaaa', general_version_referenciada: null, creado: { sub: '1', nombre: 'sistema', en: '2026-10-31T12:00:00.000Z' }, archivado: null };
const perfilZapas = { perfil_id: 2, nombre: 'Zapas', alcance: { tipo: 'rubro', rubro: 'ZAPAS' }, estado: 'borrador', version_actual: 1, huella_actual: 'bbbbbbbbbbbbbbbb', general_version_referenciada: 1, creado: { sub: '1', nombre: 'ana', en: '2026-10-31T12:00:00.000Z' }, archivado: null };
const ver = (n, over = {}) => ({ version: n, version_id: n, tipo_parametros: 'completos', parametros: { bien_vendido: { ventas_min: 3 } }, huella: 'cccccccccccccccc', general_version: null, motivo: 'm', creado: { sub: '1', nombre: 'ana', en: '2026-10-31T12:00:00.000Z' }, ...over });
const SNAP = { ejecucion: 'deriv_mx01', version: '0.5.1-R1-2026-11-12', corte: '2026-11-12', calculado_en: '2026-11-13T07:30:00Z', sucursales: ['0001', '0005', '0010', '0012', '0014'], huella_calculo: '0123456789abcdef', vigencia: { dias_desde_corte: 1 } };
function rutas(extra = {}) {
  return {
    'GET /perfiles?estado=todos': { status: 200, body: { ok: true, perfiles: [perfilGeneral, perfilZapas] } },
    'GET /perfiles/esquema': { status: 200, body: { ok: true, esquema: ESQUEMA } },
    'GET /activaciones/vigente': { status: 200, body: { ok: true, vigente: null } },
    'GET /analisis/catalogo': { status: 200, body: { ok: true, rubros: ['ZAPAS'], marcas: [], subrubros_por_rubro: {} } },
    'GET /perfiles/1': { status: 200, body: { ok: true, perfil: perfilGeneral, versiones: [ver(1)] } },
    'GET /perfiles/1/versiones/1': { status: 200, body: { ok: true, perfil: perfilGeneral, version: { ...ver(1), parametros_efectivos: efectivos() } } },
    'GET /perfiles/2': { status: 200, body: { ok: true, perfil: perfilZapas, versiones: [ver(1, { tipo_parametros: 'diferencias', general_version: 1 })] } },
    ...extra,
  };
}
async function entorno(extra) { const env = crearEntorno({ rutas: rutas(extra) }); await env.ev('rrCargarBase()'); return env; }
const posts = env => env.reg.llamadas.filter(c => c.metodo !== 'GET');
const sim = (ri, over = {}) => ({
  simulacion_id: 's1', origen_simulacion_id: null, creada: { sub: '1', nombre: 'ana', en: '2026-11-13T10:00:00.000Z' }, motor: { version: '2.1.0' },
  periodo: { desde: '2026-08-15', hasta: '2026-11-12', dias: 90 }, sucursales: { activas: SNAP.sucursales, ignoradas: [] },
  datos: { obtenidos_en: '2026-11-13T10:00:00.000Z', productos_evaluados: 110, stock_fecha_actualizacion: null },
  referencia: { tipo: 'compat', activacion_id: null, motivo: 'sin_conjunto_vigente' }, escenario: { huella: 'dd', general: { perfil_id: 1, nombre: 'General', version: 2 }, especificos: [] },
  cambios: { cambia_estado: 9, mismo_estado_cambia_detalle: 30, solo_umbrales: 0, sin_cambios: 71 }, transiciones: { entran: 4, salen: 5, cambian: 0, igual: 101, matriz: [] }, rendimiento: { cambian: 0, matriz: [] },
  conteos: { por_estado_principal: { antes: {}, despues: {}, delta: {} }, por_accion_principal: { antes: {}, despues: {}, delta: {} }, por_rendimiento: { antes: {}, despues: {}, delta: {} } },
  por_perfil: [], alcances: [], advertencias: [], rendimiento_ingreso: ri,
  cobertura: { version_contrato: '3', rendimiento_ingreso: { requerido: ri.requerido, aplicado: ri.aplicable, snapshot: ri.snapshot } }, ...over,
});
const RI_OK = { requerido: true, modos_escenario: [2], modos_referencia: [0], aplicable: true, motivo: null, snapshot: SNAP, productos_con_modo: 110, suspendidos: 0,
  no_evaluables: { sin_ingreso_registrado: 12, codigo_sin_fila_en_snapshot: 3 },
  etiquetas: { buen_rendimiento_ingreso: { antes: 0, despues: 21, altas: 21, bajas: 0 }, salida_lenta_ingreso: { antes: 0, despues: 8, altas: 8, bajas: 0 }, bien_vendido: { antes: 29, despues: 21, altas: 7, bajas: 15 }, venta_destacada: { antes: 3, despues: 6, altas: 4, bajas: 1 }, reposicion_urgente: { antes: 0, despues: 0, altas: 0, bajas: 0 } } };
const abrirSim = (env, s, eleg) => { env.ev(`RR.sub = 'simulaciones'; RR.sims.resultado = { id: 's1', cargando: false, sim: ${JSON.stringify(s)}, falla: null }; RR.sims.productos = { productos: [], paginacion: { limit: 25, offset: 0, total: 0, devueltos: 0 } }; RR.sims.elegibilidad = ${JSON.stringify(eleg)};`); env.ev('rtRenderVistaActual()'); return env.host().textContent; };

// ── (1) Parametros ────────────────────────────────────────────────────────────────────────────
test('el modo se elige de una lista con el comportamiento de cada valor; el General envía el número y una versión sin el parámetro muestra el default', async () => {
  const env = await entorno({ 'POST /perfiles/1/versiones': { status: 201, body: { ok: true, perfil: perfilGeneral, version: ver(2) } } });
  await env.ev("rrAbrirForm('general', RR.base.general)");
  env.ev('rtRenderVistaActual()');
  const t = env.host().textContent;
  assert.match(t, /Modo 0 · No se usa/); assert.match(t, /Modo 2 · Reemplaza "Bien vendido" y "Venta destacada"/);
  assert.match(t, /Qué hace cada modo/); assert.match(t, /El cálculo nocturno solo se usa si es/); assert.match(t, /las etiquetas se suspenden con su motivo/);
  assert.match(t, /Valor actual: Modo 0 · No se usa/, 'version guardada sin el parametro: el servidor informa el default');
  const select = env.host().buscar(n => n.tagName === 'SELECT' && n.attrs && n.attrs['aria-label'] === 'Uso del rendimiento desde el ingreso')[0];
  assert.ok(select, 'el modo es una lista, no un número libre');
  env.ev("RR.form.valores['rendimiento_ingreso.modo'] = '2'; RR.form.motivo = 'probar modo 2';");
  env.ev('rtRenderVistaActual()');
  assert.match(env.host().textContent, /se suspenden/, 'muestra la descripción del modo elegido');
  await env.ev('rrGuardarForm()');
  const envio = posts(env)[0];
  assert.equal(envio.ruta, '/perfiles/1/versiones');
  assert.equal(plano(envio.cuerpo).parametros.rendimiento_ingreso.modo, 2);
  assert.equal(plano(envio.cuerpo).parametros.reposicion_urgente.demanda_90_min, 0);
  assert.ok(!env.reg.llamadas.some(c => /activaciones$/.test(c.ruta) && c.metodo === 'POST'), 'guardar no activa nada');
});

test('un perfil específico puede sobrescribir el modo: se agrega a sus diferencias y no se envía nada heredado', async () => {
  const env = await entorno({ 'POST /perfiles/2/versiones': { status: 201, body: { ok: true, perfil: perfilZapas, version: ver(2) } } });
  await env.ev("rrAbrirForm('version', RR.base.perfiles[1])");
  env.ev("RR.form.sobrescribe['rendimiento_ingreso.modo'] = true; RR.form.valores['rendimiento_ingreso.modo'] = '1'; RR.form.motivo = 'zapas en modo 1';");
  env.ev('rtRenderVistaActual()');
  assert.match(env.host().textContent, /Heredado del General v1: Modo 0 · No se usa/);
  await env.ev('rrGuardarForm()');
  assert.deepEqual(plano(posts(env)[0].cuerpo.parametros), { bien_vendido: { ventas_min: 3 }, rendimiento_ingreso: { modo: 1 } }, 'su diferencia previa + el modo; ni la demanda a 90 días ni otros heredados');
});

// ── (2) Simulacion ────────────────────────────────────────────────────────────────────────────
test('simulación: muestra el cálculo usado (ejecución, versión, corte, alcance y huella) y las altas y bajas de cada etiqueta', async () => {
  const env = await entorno();
  const t = abrirSim(env, sim(RI_OK), { ok: true, elegible: true, motivo: null, vigente_hasta: '2026-11-14T10:00:00.000Z', vigencia_horas: 24, rendimiento_ingreso: { requerido: true, snapshot_simulacion: SNAP, aplicado_en_simulacion: true, actual: { elegible: true, snapshot: { ...SNAP, ejecucion: 'deriv_mx02', corte: '2026-11-13' } } } });
  assert.match(t, /Rendimiento desde el ingreso/);
  assert.match(t, /Ejecución deriv_mx01 · versión 0\.5\.1-R1-2026-11-12 · corte 2026-11-12 · alcance 5 sucursales/);
  assert.match(t, /huella 01234567/);
  assert.match(t, /usa el rendimiento desde el ingreso \(modo 2\)/);
  assert.match(t, /Bien vendido/); assert.match(t, /\+7/); assert.match(t, /−15/);
  assert.match(t, /Buen rendimiento del ingreso/);
  assert.match(t, /12 sin ingreso registrado/);
  assert.match(t, /Cálculo de rendimiento que exige esta activación/);
  assert.match(t, /Hay un cálculo más nuevo que el simulado/, 'otra ejecución del mismo contrato: se admite y se informa');
  assert.match(t, /mientras el cálculo de rendimiento siga utilizable/);
});

test('simulación con el cálculo suspendido: se explica el motivo, que no se usa otro criterio y que no sirve para activar', async () => {
  const env = await entorno();
  const t = abrirSim(env, sim({ ...RI_OK, aplicable: false, motivo: 'snapshot_atrasado', suspendidos: 110, etiquetas: { bien_vendido: { antes: 29, despues: 0, altas: 0, bajas: 29 } } }),
    { ok: true, elegible: false, motivo: { codigo: 'evidencia_sin_snapshot', mensaje: 'x' }, rendimiento_ingreso: { requerido: true, snapshot_simulacion: SNAP, aplicado_en_simulacion: false, actual: { elegible: false, motivo: 'snapshot_atrasado', snapshot: SNAP } } });
  assert.match(t, /Etiquetas de rendimiento suspendidas/);
  assert.match(t, /atrasado/);
  assert.match(t, /no se usa otro criterio en su lugar/);
  assert.match(t, /no sirve para activar/);
  assert.match(t, /se hizo con las etiquetas de rendimiento suspendidas/);
  assert.equal(env.host().botones('Revisar para activar').length, 0);
});

// ── (3) Activacion ────────────────────────────────────────────────────────────────────────────
test('activación rechazada porque el cálculo no está vigente: se explica, no se pierde nada y no se refresca Oportunidades', async () => {
  const env = await entorno({ 'POST /activaciones': { status: 409, body: { ok: false, codigo: 'snapshot_no_vigente', error: 'x', motivo: 'snapshot_vencido' } } });
  env.ev(`RT_OPORTUNIDADES = { marca: 'previo' }; RR.act.revision = { sim: ${JSON.stringify(sim(RI_OK))}, eleg: { elegible: true, rendimiento_ingreso: { requerido: true, snapshot_simulacion: ${JSON.stringify(SNAP)}, aplicado_en_simulacion: true, actual: { elegible: true, snapshot: ${JSON.stringify(SNAP)} } } } }; RR.act.motivo = 'activar modo 2'; RR.act.confirmo = true; RR.sub = 'activacion';`);
  env.ev('rtRenderVistaActual()');
  assert.match(env.host().textContent, /Cálculo de rendimiento que exige esta activación/, 'la revisión muestra el cálculo exigido');
  await env.ev('rrActivar()'); env.ev('rtRenderVistaActual()');
  const t = env.host().textContent;
  assert.match(t, /No se activó/); assert.match(t, /no se puede usar ahora/); assert.match(t, /vencido/);
  assert.equal(env.ev('RT_OPORTUNIDADES.marca'), 'previo');
  assert.equal(env.ev('RR.act.revision !== null'), true);
});

test('el conjunto vigente que usa el rendimiento informa el cálculo registrado al activar', async () => {
  const vigente = { activacion_id: 5, conjunto: { huella: 'ee', general: { perfil_id: 1, nombre: 'General', version: 2 }, especificos: [] }, motivo: 'm', creada: { sub: '1', nombre: 'ana', en: '2026-11-13T12:00:00.000Z' }, advertencias: [{ codigo: 'snapshot_actualizado', mensaje: 'El snapshot cambio desde la simulacion' }], vigente: true,
    rendimiento_ingreso: { requerido: true, modos: [2], snapshot_simulacion: SNAP, snapshot_activacion: SNAP } };
  const env = await entorno({ 'GET /activaciones/vigente': { status: 200, body: { ok: true, vigente } }, 'GET /activaciones?limit=15&offset=0': { status: 200, body: { ok: true, paginacion: { limit: 15, offset: 0, total: 0, devueltos: 0 }, activaciones: [] } } });
  env.ev("RR.sub = 'activacion'"); env.ev('rtRenderVistaActual()');
  const t = env.host().textContent;
  assert.match(t, /Usa el rendimiento desde el ingreso \(modo 2\)/);
  assert.match(t, /Cálculo al activar: Ejecución deriv_mx01/);
  assert.match(t, /si no hay, sus etiquetas se suspenden con aviso/);
});

// ── (4) Oportunidades ─────────────────────────────────────────────────────────────────────────
const prod = (over = {}) => ({ Codigo_producto: '1001', estado_principal: 'stock_parado', etiquetas_secundarias: [], motivos_secundarios: {}, motivo: 'Sin ingresos hace 200 días',
  acciones: [{ accion: 'revisar_stock_parado', estado_origen: 'stock_parado', principal: true, prioridad: 'baja', motivo: 'm' }], rendimiento: { nivel: null }, calidad_datos: { indicadores: [] },
  explicacion: { periodo_dias: 90, condiciones_por_estado: { salida_lenta_ingreso: [{ condicion: 'Nivel "Salida lenta del ingreso" del snapshot: 18,0 %', informativa: true, cumple: true }] }, datos_faltantes: [] },
  etiquetas_rendimiento_ingreso: ['salida_lenta_ingreso'], motivos_rendimiento_ingreso: { salida_lenta_ingreso: 'Vendió 9 de 50 unidades ' + PAYLOAD },
  rendimiento_ingreso: { estado: 'disponible', etiquetas_activas: ['salida_lenta_ingreso'], aplicacion: { aplicado: true, modo: 1, etiquetas_suspendidas: [] } }, ...over });
const RESP = { periodo: { desde: '2026-08-15', hasta: '2026-11-12' }, sucursales: SNAP.sucursales, sucursales_ignoradas: [], rendimiento_ingreso: { estado: 'disponible', snapshot: SNAP, aplicacion: { aplicado: true, modos: [1], snapshot: SNAP, etiquetas_dependientes: ['buen_rendimiento_ingreso', 'salida_lenta_ingreso'], suspendidas: [] } } };

test('Oportunidades: una etiqueta activa se muestra como pastilla secundaria junto a la acción, sin cambiar la acción ni su prioridad', () => {
  const env = crearEntorno();
  const celda = env.ev(`(() => { const c = ovCeldaAccion(${JSON.stringify(prod())}); globalThis.__c = c; return c.textContent; })()`);
  assert.match(celda, /Revisar stock parado/);
  assert.match(celda, /Salida lenta del ingreso/);
  const pills = env.ev('__c').buscar(n => n.className && /ov-pill-ri-lenta/.test(n.className));
  assert.equal(pills.length, 1);
  assert.match(pills[0].attrs.title, /no cambia la prioridad/);
  assert.doesNotMatch(env.ev(`ovCeldaAccion(${JSON.stringify(prod({ etiquetas_rendimiento_ingreso: undefined, rendimiento_ingreso: undefined }))}).textContent`), /del ingreso/, 'sin etiquetas activas no hay pastilla');
});

test('Oportunidades: "Por qué aparece" lista la etiqueta de rendimiento como secundaria, con su motivo como texto', () => {
  const env = crearEntorno();
  const t = env.ev(`(() => { const panel = rtEl('div'); rrDetalleOportunidad(panel, ${JSON.stringify(prod())}, ${JSON.stringify(RESP)}, (e, v) => { const b = rtEl('div'); b.appendChild(rtEl('b', { text: e })); if (typeof v !== 'string') b.appendChild(v); return b; }); globalThis.__p = panel; return panel.textContent; })()`);
  assert.match(t, /Salida lenta del ingreso \(etiqueta secundaria; no cambia la prioridad\)/);
  assert.match(t, /Vendió 9 de 50 unidades <img/, 'el motivo se inserta como texto');
  assert.equal(env.ev('__p').buscar(n => n.tagName === 'IMG').length, 0);
});

test('Oportunidades: aviso de suspensión con el motivo y, en modo 2, que tampoco hay "Bien vendido" ni "Venta destacada"', () => {
  const env = crearEntorno();
  const aviso = r => env.ev(`(() => { const h = rtEl('div'); ovAvisoRendimientoSuspendido(h, ${JSON.stringify(r)}); return h.textContent; })()`);
  assert.equal(aviso(RESP), '', 'aplicado: sin aviso');
  assert.equal(aviso({}), '', 'sin conjunto que use el rendimiento: sin aviso');
  const t = aviso({ rendimiento_ingreso: { aplicacion: { aplicado: false, motivo: 'snapshot_atrasado', suspendidas: ['buen_rendimiento_ingreso', 'salida_lenta_ingreso', 'bien_vendido', 'venta_destacada'] } } });
  assert.match(t, /Etiquetas de rendimiento suspendidas/); assert.match(t, /más de 2 días/); assert.match(t, /tampoco "Bien vendido" ni "Venta destacada"/); assert.match(t, /Las demás reglas siguen igual/);
  const parcial = aviso({ rendimiento_ingreso: { aplicacion: { aplicado: false, motivo: 'sucursales_distintas_del_snapshot', suspendidas: ['buen_rendimiento_ingreso', 'salida_lenta_ingreso'] } } });
  assert.match(parcial, /menos sucursales que las 5 operativas/); assert.doesNotMatch(parcial, /Bien vendido/);
});

test('Oportunidades: el bloque del detalle distingue etiqueta activa de candidata y declara si las reglas usan el cálculo', () => {
  const env = crearEntorno();
  const lectura = { nivel: 'lento', texto: 'Salida lenta del ingreso', valor: 0.18, ventas: 9, denominador_comercial: 50, ventana: { dias: 60, desde: '2026-07-01', hasta: '2026-08-29' }, referencia: { fuente: 'rubro', rubro: 'ZAPAS', muestra: 30, p25: 0.25, p50: 0.5, p75: 0.75 }, destinos: { vendidas: 9 }, exposicion: {} };
  const bloque = (f, r) => env.ev(`(() => { const b = riBloqueRendimiento(${JSON.stringify(f)}, ${JSON.stringify(r)}); return b ? b.textContent : ''; })()`);
  const activa = bloque(prod({ rendimiento_ingreso: { estado: 'disponible', lectura, etiquetas_candidatas: ['salida_lenta_ingreso'], etiquetas_activas: ['salida_lenta_ingreso'], aplicacion: { aplicado: true } } }), RESP);
  assert.match(activa, /Etiqueta activa: /); assert.doesNotMatch(activa, /sin activar/); assert.match(activa, /Las reglas vigentes usan este cálculo para etiquetas secundarias/);
  const informativa = bloque(prod({ rendimiento_ingreso: { estado: 'disponible', lectura, etiquetas_candidatas: ['salida_lenta_ingreso'], etiquetas_activas: [] } }), { ...RESP, rendimiento_ingreso: { estado: 'disponible', snapshot: SNAP } });
  assert.match(informativa, /Etiqueta candidata, sin activar/); assert.match(informativa, /Informativo: no cambia/);
});

// ── Revision de I4 ────────────────────────────────────────────────────────────────────────────
const LECT = { nivel: 'destacado', texto: 'Buen rendimiento del ingreso · destacado', valor: 0.82, ventas: 41, denominador_comercial: 50, ventana: { dias: 60, desde: '2026-07-01', hasta: '2026-08-29' }, referencia: { fuente: 'rubro', rubro: 'ZAPAS', muestra: 30, p25: 0.25, p50: 0.5, p75: 0.75 }, destinos: { vendidas: 41 }, exposicion: {} };
test('detalle: una lectura de OTRA ejecución nunca se muestra como fundamento de etiquetas calculadas con otra; la misma ejecución sí', () => {
  const env = crearEntorno();
  const bloque = f => env.ev(`(() => { const b = riBloqueRendimiento(${JSON.stringify(f)}, ${JSON.stringify(RESP)}); return b ? b.textContent : ''; })()`);
  const misma = bloque(prod({ rendimiento_ingreso: { estado: 'disponible', ejecucion: 'deriv_a', lectura: LECT, etiquetas_activas: ['buen_rendimiento_ingreso'], aplicacion: { aplicado: true, snapshot_ejecucion: 'deriv_a' } } }));
  assert.match(misma, /Etiqueta activa: Buen rendimiento del ingreso/); assert.match(misma, /41 de 50/);
  const otra = bloque(prod({ rendimiento_ingreso: { estado: 'disponible', ejecucion: 'deriv_b', lectura: LECT, etiquetas_activas: ['buen_rendimiento_ingreso'], aplicacion: { aplicado: true, snapshot_ejecucion: 'deriv_a' } } }));
  assert.match(otra, /Cálculo en actualización/);
  assert.match(otra, /se calcularon con el cálculo deriv_a y la lectura disponible es del cálculo deriv_b/);
  assert.doesNotMatch(otra, /41 de 50/, 'no muestra la lectura B');
  assert.doesNotMatch(otra, /Etiqueta activa/, 'no presenta B como fundamento');
});

test('demanda de la selección: con la urgencia neta del perfil se muestra como regla vigente con sus tres condiciones, no como candidata informativa', () => {
  const env = crearEntorno();
  const demanda = d => env.ev(`(() => { const b = riBloqueDemandaSeleccion({ demanda_reciente_seleccion: ${JSON.stringify(d)} }); return b ? b.textContent : ''; })()`);
  const base = { fecha_referencia: '2026-11-12', sucursales: SNAP.sucursales, ventas_netas_30: 0, ventas_netas_90: 8, dias_desde_ultima_venta: 3, urgencia_candidata_2_6_30: { cumple: false, criterio: { v30_min: 2, v90_min: 6, dias_ultima_venta_max: 30 }, informativa: true } };
  assert.match(demanda(base), /Criterio candidato de urgencia/); assert.match(demanda(base), /Informativo/);
  const vigente = demanda({ ...base, regla_vigente: { politica: 'neta', minimos: { ventas_netas_30: 2, ventas_netas_90: 6, dias_desde_ultima_venta_max: 30 }, cumple_urgencia: false } });
  assert.match(vigente, /Regla de urgencia vigente \(neta: ventas menos devoluciones\): ≥ 2 en 30 días, ≥ 6 en 90 y última venta ≤ 30 días: no la cumple/);
  assert.match(vigente, /No se usan las ventas brutas, el umbral del grupo ni la muestra del período/);
  assert.doesNotMatch(vigente, /candidato|Informativo/);
});

test('Reglas: el formulario muestra las condiciones efectivas de cada política de urgencia y cuál rige con el valor actual', async () => {
  const esq = JSON.parse(JSON.stringify(ESQUEMA));
  esq.politicas_urgencia = [
    { id: 'vigente', cuando: 'Ventas netas mínimas en 90 días = 0 (por defecto)', condiciones: ['ventas BRUTAS de 30 días contra el umbral de su grupo', 'ventas mínimas del período'] },
    { id: 'neta', cuando: 'Ventas netas mínimas en 90 días mayor que 0', condiciones: ['ventas NETAS en 30 días', 'ventas NETAS en 90 días', 'última venta'], no_aplica: ['ventas brutas de 30 días', 'umbral relativo del grupo', 'ventas mínimas del período'] },
  ];
  const env = await entorno({ 'GET /perfiles/esquema': { status: 200, body: { ok: true, esquema: esq } } });
  await env.ev("rrAbrirForm('general', RR.base.general)");
  const abrir = () => { env.ev('rtRenderVistaActual()'); return env.host().textContent; };
  let t = abrir();
  assert.match(t, /Reposición urgente: condiciones según/);
  assert.match(t, /Regla vigente — Ventas netas mínimas en 90 días = 0 \(por defecto\) \(es la que rige con el valor actual\)/);
  assert.match(t, /No se exige: ventas brutas de 30 días, umbral relativo del grupo, ventas mínimas del período/);
  env.ev("RR.form.valores['reposicion_urgente.demanda_90_min'] = '6'");
  t = abrir();
  assert.match(t, /Urgencia neta — Ventas netas mínimas en 90 días mayor que 0 \(es la que rige con el valor actual\)/);
});

test('simulación: si las reglas vigentes tienen hoy el rendimiento suspendido, se avisa que «Antes» es lo que muestra Oportunidades', async () => {
  const env = await entorno();
  const t = abrirSim(env, sim({ ...RI_OK, referencia: { aplicable: false, motivo: 'snapshot_distinto_del_activado', snapshot: SNAP } }), { ok: true, elegible: true, motivo: null, vigente_hasta: '2026-11-14T10:00:00.000Z', vigencia_horas: 24, rendimiento_ingreso: { requerido: true, snapshot_simulacion: SNAP, aplicado_en_simulacion: true, actual: { elegible: true, snapshot: SNAP } } });
  assert.match(t, /Las reglas vigentes tienen hoy las etiquetas de rendimiento suspendidas/);
  assert.match(t, /otra versión o configuración que el registrado al activar/);
  assert.match(t, /«Antes» refleja lo que Oportunidades muestra ahora/);
  assert.match(t, /Cálculo usado: Ejecución deriv_mx01/, 'el escenario sí usa el cálculo compatible');
});
