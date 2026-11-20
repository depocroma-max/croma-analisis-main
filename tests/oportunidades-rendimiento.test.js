'use strict';
// Pruebas de la PRESENTACION del rendimiento desde el ingreso y de la demanda reciente de la seleccion (etapa I2, §23 del plan de croma-api).
// Datos SINTETICOS con la forma del contrato cerrado en croma-api 8de82f8 (no se versionan datos reales). Los casos reales (03010, 03113,
// 03183, R0001, T0783, T0847) se verifican en el navegador con tests/harness (ver README). Se ejecutan con:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./dom-minimo');

const CINCO = ['0001', '0005', '0010', '0012', '0014'];
const SNAP = (estado = 'vigente', dias = 1) => ({ ejecucion: 'eje_prueba_1', version: '0.5.1-R1-2026-11-12', corte: '2026-11-10', calculado_en: '2026-11-11T12:30:00.000Z', sucursales: CINCO,
  vigencia: { dias_desde_corte: dias, maximo_elegible_dias: 2, maximo_informativo_dias: 7, estado } });
const TOP = (estado, extra = {}) => ({ informativo: true, version_lectura: '1', estado, motivo: null, elegible_para_etiquetas: estado === 'disponible', snapshot: SNAP(), consulta: { desde: '2026-08-13', hasta: '2026-11-10', sucursales: CINCO }, ambito_compatible: true, consulta_historica: false, ...extra });
const LECTURA = (o = {}) => ({
  nivel: 'lento', texto: 'Salida lenta del ingreso', buen_rendimiento: false, venta_destacada: false, pocas_ventas: false,
  ventana: { dias: 90, desde: '2026-05-01', hasta: '2026-07-29' }, ingreso: { fecha_factura: '2026-05-02', fecha_ingreso_fisico: '2026-05-01', unidades: 40 },
  ventas: 11, denominador_comercial: 33, valor: 0.3333,
  referencia: { fuente: 'rubro', rubro: 'RUBRO A', muestra: 120, p25: 0.4, p50: 0.6, p75: 0.8 },
  cercania: { umbral: 'p25', valor_umbral: 0.4, diferencia_pp: -6.67, cerca: false, margen_pp: 5 },
  exposicion: { dias_con_stock: 88, dias: 90, disponibilidad_variantes: 0.7 },
  destinos: { vendidas: 11, stock_al_fin: 10, fallados: 2, salidas_de_causa_desconocida: 10, fuera_del_denominador: { trasladadas_a_cipo: 3, recibidas_de_cipo: 1 } },
  salidas_causa_desconocida: { unidades: 10, valor_si_se_reduce: 0.4783, nivel_si_se_reduce: 'normal', cambia_nivel: true, habilitaria_etiqueta_positiva: false },
  ...o,
});
const PROD = (ri, extra = {}) => ({
  Codigo_producto: 'P0001', estado_principal: 'bien_vendido', etiquetas_secundarias: [], acciones: [], rendimiento: { nivel: 'bueno' }, Ventas_total: 9, ventas_semana: 0.7,
  Stock_sucursales: 3, Stock_deposito: 1, Stock_fallados: 0, ratio_venta: 0.69, demanda_reciente: false, por_sucursal: {},
  demanda_reciente_seleccion: { fecha_referencia: '2026-11-10', sucursales: CINCO, ventas_netas_30: 2, ventas_netas_90: 7, dias_desde_ultima_venta: 1, urgencia_candidata_2_6_30: { cumple: true, criterio: { v30_min: 2, v90_min: 6, dias_ultima_venta_max: 30 }, informativa: true } },
  ...(ri === undefined ? {} : { rendimiento_ingreso: ri }), ...extra,
});
const RI = (estado, o = {}) => ({ estado, motivo: null, con_valores: false, elegible_para_etiquetas: false, etiquetas_candidatas: [], etiquetas_activas: [], lectura: null, sin_conclusion: null, demanda_cadena: null, ...o });

// Arma el detalle como la vista: primero el panel completo y DESPUES se inserta en el documento (document.body).
function detalle(env, f, resp) {
  env.ctx.__f = f; env.ctx.__resp = resp;
  return env.ev(`(() => {
    const panel = rtEl('div', { className: 'rt-oport-detalle' });
    const bloque = (et, v) => { const b = rtEl('div', { className: 'rt-oport-detalle-bloque' }); b.appendChild(rtEl('div', { className: 'rt-oport-detalle-etiqueta', text: et })); const x = rtEl('div'); if (typeof v === 'string') x.textContent = v; else x.appendChild(v); b.appendChild(x); return b; };
    rrDetalleOportunidad(panel, __f, __resp, bloque);
    document.body.appendChild(panel);
    return panel;
  })()`);
}
const cerrar = (env, panel) => env.ev('document.body').removeChild(panel); // cerrar el detalle (la vista lo saca del documento)
const activo = env => env.ev('document.activeElement');
// Respuesta que se resuelve cuando la prueba lo decide (respuestas tardias).
function diferida() { let resolver; const p = new Promise(r => { resolver = r; }); return { p, resolver }; }
const etiquetas = panel => panel.buscar(n => n.className === 'rt-oport-detalle-etiqueta').map(n => n.textContent);
const seccion = panel => panel.buscar(n => n.tagName === 'SECTION' && n.className === 'ri')[0] || null;
const texto = n => (n ? n.textContent : '');
const esperar = () => new Promise(r => setTimeout(r, 0));

// ── Compatibilidad ──────────────────────────────────────────────────────────────────────────────
test('API publicada (sin I1): sin rendimiento_ingreso ni demanda_reciente_seleccion no se agrega nada y el detalle previo queda igual', () => {
  const env = crearEntorno();
  const f = PROD(undefined); delete f.demanda_reciente_seleccion;
  const panel = detalle(env, f, { periodo: { desde: '2026-08-13', hasta: '2026-11-10' } });
  assert.equal(seccion(panel), null);
  assert.deepEqual(etiquetas(panel), ['Acción sugerida', 'Rendimiento', 'Ventas y stock', 'Ingreso']);
  assert.equal(env.reg.llamadas.length, 0);
});

test('API con I1 sin base configurada: demanda de la selección visible y rendimiento explicado sin valores', () => {
  const env = crearEntorno();
  const panel = detalle(env, PROD(undefined), {});
  assert.deepEqual(etiquetas(panel), ['Acción sugerida', 'Rendimiento', 'Ventas y stock', 'Ingreso', 'Demanda reciente de la selección']);
  const s = seccion(panel);
  assert.match(texto(s), /no está disponible en este servidor/);
  assert.doesNotMatch(texto(s), /\d+\s?%/);
});

test('el bloque previo "Rendimiento" (regla vigente) y el booleano demanda_reciente no se tocan', () => {
  const env = crearEntorno();
  const f = PROD(RI('disponible', { con_valores: true, lectura: LECTURA() }));
  const antes = JSON.stringify(f);
  const panel = detalle(env, f, { rendimiento_ingreso: TOP('disponible') });
  assert.equal(JSON.stringify(f), antes, 'la presentacion no muta el producto');
  assert.equal(f.demanda_reciente, false);
  assert.ok(etiquetas(panel).includes('Rendimiento'));
  assert.equal(panel.buscar(n => n.className === 'rt-oport-detalle-etiqueta' && n.textContent === 'Rendimiento')[0] !== undefined, true);
});

// ── Lectura disponible ──────────────────────────────────────────────────────────────────────────
test('disponible: unidades sobre denominador comercial, ventana, referencia, cercanía en pp, destinos, causa desconocida y datos del snapshot', () => {
  const env = crearEntorno();
  const panel = detalle(env, PROD(RI('disponible', { con_valores: true, elegible_para_etiquetas: true, etiquetas_candidatas: ['salida_lenta_ingreso'], lectura: LECTURA() })), { rendimiento_ingreso: TOP('disponible') });
  const t = texto(seccion(panel));
  assert.match(t, /Salida lenta del ingreso/);
  assert.match(t, /11 de 33 unidades vendidas en 90 días/);
  assert.match(t, /01\/05\/2026 → 29\/07\/2026/);
  assert.match(t, /40 u\. facturadas el 02\/05\/2026 \(llegaron el 01\/05\/2026\)/);
  assert.match(t, /rubro RUBRO A/);
  assert.match(t, /muestra de 120 códigos/);
  assert.match(t, /−6,67 pp/, 'diferencia en puntos porcentuales, con signo');
  assert.doesNotMatch(t, /Cerca del umbral/, 'a 6,67 pp no esta cerca (margen 5)');
  assert.match(t, /Vendidas 11/); assert.match(t, /Salida de causa desconocida 10/);
  assert.match(t, /3 trasladadas a Cipo · 1 recibidas de Cipo/);
  assert.match(t, /10 u\. salieron del depósito por causa desconocida/);
  assert.match(t, /el nivel sería rendimiento normal/);
  assert.match(t, /Etiqueta candidata, sin activar: Salida lenta del ingreso/);
  assert.match(t, /Corte 10\/11\/2026/); assert.match(t, /Calculado 11\/11\/2026/); assert.match(t, /Versión 0\.5\.1/); assert.match(t, /Alcance del cálculo: 5 sucursales operativas \+ Depósito 90/);
  const info = seccion(panel).buscar(n => n.tagName === 'DETAILS')[0];
  assert.ok(info && /Información de los datos/.test(texto(info)) && /Ejecución: eje_prueba_1/.test(texto(info)), 'la ejecucion esta en Información de los datos');
  assert.match(t, /no cambia el estado, la prioridad ni las etiquetas/);
  assert.equal(env.reg.innerHTML.length, 0, 'nunca innerHTML');
});

test('cercanía: "Cerca del umbral" solo cuando la API marca cerca; la diferencia se muestra con 2 decimales', () => {
  const env = crearEntorno();
  const l = LECTURA({ nivel: 'normal', texto: 'Rendimiento normal del ingreso', valor: 0.575, cercania: { umbral: 'p50', valor_umbral: 0.6, diferencia_pp: -2.5, cerca: true, margen_pp: 5 }, salidas_causa_desconocida: null });
  const t = texto(seccion(detalle(env, PROD(RI('disponible', { con_valores: true, lectura: l })), { rendimiento_ingreso: TOP('disponible') })));
  assert.match(t, /Cerca del umbral/);
  assert.match(t, /−2,50 pp/);
  assert.match(t, /límite de buen rendimiento/);
});

test('atrasado: lectura con aviso y SIN etiquetas candidatas, aunque llegaran en la respuesta', () => {
  const env = crearEntorno();
  const top = TOP('informativo_atrasado', { snapshot: SNAP('atrasado', 4), elegible_para_etiquetas: false });
  const panel = detalle(env, PROD(RI('informativo_atrasado', { con_valores: true, etiquetas_candidatas: ['salida_lenta_ingreso'], lectura: LECTURA() })), { rendimiento_ingreso: top });
  const t = texto(seccion(panel));
  assert.match(t, /Datos al 10\/11\/2026 \(hace 4 días\)/);
  assert.match(t, /no proponen etiquetas/);
  assert.match(t, /11 de 33 unidades/);
  assert.doesNotMatch(t, /Etiqueta candidata/);
});

test('sin evidencia: motivo específico de calidad de datos o comercial, sin valores', () => {
  for (const [sc, re] of [[{ tipo: 'calidad_datos', motivo: 'balance_inconsistente' }, /Calidad de datos: Las entradas y salidas del código no cierran/],
    [{ tipo: 'comercial', motivo: 'ventana_minima_incompleta' }, /Evidencia comercial: El ingreso es reciente/],
    [{ tipo: 'datos', motivo: 'sin_ingreso_registrado' }, /No hay un ingreso de proveedor registrado/]]) {
    const env = crearEntorno();
    const t = texto(seccion(detalle(env, PROD(RI('disponible', { sin_conclusion: sc })), { rendimiento_ingreso: TOP('disponible') })));
    assert.match(t, /Sin evidencia suficiente/);
    assert.match(t, re);
    assert.doesNotMatch(t, /\d+\s?%/);
  }
});

// ── Estados sin valores ─────────────────────────────────────────────────────────────────────────
test('consulta histórica, vencido, incompatible, lectura fallida e inconsistente: explicación sin valores ni botón de cadena', () => {
  const casos = [
    ['consulta_historica', { consulta: { desde: '2026-06-01', hasta: '2026-08-31', sucursales: CINCO } }, /termina el 31\/08\/2026, antes del corte del cálculo \(10\/11\/2026\)/],
    ['vencido', { snapshot: SNAP('vencido', 10) }, /último cálculo es del 10\/11\/2026 \(hace 10 días\)/],
    ['snapshot_incompatible', { motivo: 'faltan_metadatos:huella_calculo' }, /no indica con qué configuración se hizo/],
    ['snapshot_incompatible', { motivo: 'configuracion_de_calculo_distinta' }, /otra configuración del método/],
    ['sin_snapshot', { motivo: 'lectura_fallida', snapshot: null }, /No se pudo leer el cálculo/],
    ['sin_snapshot', { motivo: 'sin_metadatos', snapshot: null }, /no hay un cálculo de rendimiento publicado/],
  ];
  for (const [estado, extra, re] of casos) {
    const env = crearEntorno();
    const top = TOP(estado, extra);
    const panel = detalle(env, PROD(RI(estado, { motivo: extra.motivo || null })), { rendimiento_ingreso: top });
    const t = texto(seccion(panel));
    assert.match(t, re, estado);
    assert.doesNotMatch(t, /\d+\s?%/, estado + ': sin porcentajes');
    assert.equal(panel.botones('Ver el rendimiento de la cadena').length, 0, estado);
  }
  const env = crearEntorno();
  const t = texto(seccion(detalle(env, PROD(RI('snapshot_inconsistente', { motivo: 'fila_de_otra_ejecucion' })), { rendimiento_ingreso: TOP('disponible') })));
  assert.match(t, /otra ejecución del cálculo/);
});

// ── Seleccion parcial y cadena bajo pedido ──────────────────────────────────────────────────────
const PARCIAL = () => ({ rendimiento_ingreso: TOP('seleccion_parcial', { consulta: { desde: '2026-08-13', hasta: '2026-11-10', sucursales: ['0001', '0005'] }, ambito_compatible: false, elegible_para_etiquetas: false }) });
const CADENA = (o = {}) => ({ ok: true, codigo: 'P0001', informativo: true, version_lectura: '1', ambito: { tipo: 'cadena', sucursales: CINCO, descripcion: 'x' }, estado: 'disponible', motivo: null, snapshot: SNAP(),
  elegible_para_etiquetas: false, etiquetas_candidatas: [], lectura: LECTURA(), sin_conclusion: null,
  demanda_cadena: { categoria: 'sostenida', ventas_netas_30: 3, ventas_netas_90: 9, ventas_netas_180: 20, dias_desde_ultima_venta: 1, fecha_referencia: '2026-11-10', sucursales: CINCO }, ...o });

test('selección parcial: sin números de cadena, nombra la selección y las 5 sucursales, y NO consulta la cadena sola', async () => {
  const env = crearEntorno();
  const panel = detalle(env, PROD(RI('seleccion_parcial', { motivo: 'sucursales_distintas_del_snapshot' })), PARCIAL());
  const t = texto(seccion(panel));
  assert.match(t, /No disponible para esta selección/);
  assert.match(t, /Elegiste 01 Paseo, 05 Wave\./);
  assert.match(t, /01 Paseo, 05 Wave, 10 Perito Moreno, 12 Centenario, 14 Roca \+ Depósito 90/);
  assert.doesNotMatch(t, /\d+\s?%/);
  const [b] = panel.botones('Ver el rendimiento de la cadena (5 sucursales operativas)');
  assert.ok(b);
  assert.equal(b.getAttribute('aria-expanded'), 'false');
  await esperar();
  assert.equal(env.reg.llamadas.length, 0, 'sin consulta automatica');
});

test('cadena: el botón consulta una vez, rotula el ámbito, no propone etiquetas y se puede cerrar y reabrir sin volver a consultar', async () => {
  const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': { status: 200, body: CADENA() } } });
  const panel = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  const [b] = panel.botones('Ver el rendimiento de la cadena');
  b.click(); await esperar(); await esperar();
  assert.equal(env.reg.llamadas.length, 1);
  assert.equal(env.reg.llamadas[0].url, '/analisis/rendimiento-ingreso/P0001');
  assert.equal(b.getAttribute('aria-expanded'), 'true');
  const t = texto(seccion(panel));
  assert.match(t, /Cadena · 5 sucursales operativas · no corresponde a tu selección/);
  assert.match(t, /11 de 33 unidades vendidas/);
  assert.match(t, /no propone etiquetas/);
  assert.doesNotMatch(t, /Etiqueta candidata/);
  assert.match(t, /Demanda de la cadena al corte/);
  b.click();
  assert.equal(b.getAttribute('aria-expanded'), 'false');
  assert.doesNotMatch(texto(seccion(panel)), /no corresponde a tu selección/);
  b.click(); await esperar();
  assert.equal(env.reg.llamadas.length, 1, 'reabrir usa lo ya consultado');
  assert.match(texto(seccion(panel)), /no corresponde a tu selección/);
});

test('cadena: el resultado se dibuja en todas las copias del detalle (fila de tabla y tarjeta)', async () => {
  const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': { status: 200, body: CADENA() } } });
  const p1 = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  const p2 = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  p1.botones('Ver el rendimiento de la cadena')[0].click(); await esperar(); await esperar();
  for (const p of [p1, p2]) assert.match(texto(seccion(p)), /no corresponde a tu selección/);
  assert.equal(p2.botones('Ocultar el rendimiento de la cadena').length, 1);
});

test('cadena: errores de consulta con mensaje y reintento; sin la ruta (API publicada) se explica sin reintento', async () => {
  let n = 0;
  const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': () => (++n === 1 ? { status: 503, body: { ok: false, codigo: 'lectura_fallida' } } : { status: 200, body: CADENA() }) } });
  const panel = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  panel.botones('Ver el rendimiento de la cadena')[0].click(); await esperar(); await esperar();
  assert.match(texto(seccion(panel)), /No se pudo consultar el rendimiento de la cadena \(error 503\)/);
  panel.botones('Reintentar')[0].click(); await esperar(); await esperar();
  assert.match(texto(seccion(panel)), /no corresponde a tu selección/);

  const env2 = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': { status: 404, body: null } } });
  const p2 = detalle(env2, PROD(RI('seleccion_parcial')), PARCIAL());
  p2.botones('Ver el rendimiento de la cadena')[0].click(); await esperar(); await esperar();
  assert.match(texto(seccion(p2)), /todavía no ofrece la consulta de cadena/);
  assert.equal(p2.botones('Reintentar').length, 0);

  const env3 = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': { status: 404, body: { ok: false, codigo: 'rendimiento_no_configurado' } } } });
  const p3 = detalle(env3, PROD(RI('seleccion_parcial')), PARCIAL());
  p3.botones('Ver el rendimiento de la cadena')[0].click(); await esperar(); await esperar();
  assert.match(texto(seccion(p3)), /no está disponible en este servidor/);
});

test('cadena atrasada o sin conclusión: aviso o motivo, nunca etiquetas', async () => {
  const env = crearEntorno({ rutas: {
    'GET /analisis/rendimiento-ingreso/P0001': { status: 200, body: CADENA({ estado: 'informativo_atrasado', snapshot: SNAP('atrasado', 5) }) },
    'GET /analisis/rendimiento-ingreso/P0002': { status: 200, body: CADENA({ codigo: 'P0002', lectura: null, sin_conclusion: { tipo: 'calidad_datos', motivo: 'balance_inconsistente' } }) },
    'GET /analisis/rendimiento-ingreso/P0003': { status: 200, body: CADENA({ codigo: 'P0003', estado: 'vencido', lectura: null, demanda_cadena: null, snapshot: SNAP('vencido', 9) }) },
  } });
  const p = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL_CON(['0001', '0005'], '2026-11-10', 'eje_prueba_1', SNAP('atrasado', 5).vigencia));
  p.botones('Ver el rendimiento de la cadena')[0].click(); await esperar(); await esperar();
  assert.match(texto(seccion(p)), /hace 5 días/);
  const p2 = detalle(env, PROD(RI('seleccion_parcial'), { Codigo_producto: 'P0002' }), PARCIAL());
  p2.botones('Ver el rendimiento de la cadena')[0].click(); await esperar(); await esperar();
  assert.match(texto(seccion(p2)), /Calidad de datos: Las entradas y salidas/);
  const p3 = detalle(env, PROD(RI('seleccion_parcial'), { Codigo_producto: 'P0003' }), PARCIAL());
  p3.botones('Ver el rendimiento de la cadena')[0].click(); await esperar(); await esperar();
  // La lista se cargo vigente (1 dia) y la cadena llega vencida (9 dias): no se muestra; se pide actualizar (sin pies contradictorios).
  assert.match(texto(seccion(p3)), /El cálculo cambió desde que se cargó la lista/);
  assert.doesNotMatch(texto(seccion(p3)), /Vigencia: 9 días/);
  for (const x of [p, p2, p3]) assert.doesNotMatch(texto(seccion(x)), /Etiqueta candidata/);
});

// ── Demanda reciente de la seleccion ────────────────────────────────────────────────────────────
test('demanda reciente de la selección: netas 30/90, fecha "hasta", sucursales y criterio 2/6/30 informativo; separada del rendimiento', () => {
  const env = crearEntorno();
  const f = PROD(RI('seleccion_parcial'), { demanda_reciente_seleccion: { fecha_referencia: '2026-08-31', sucursales: ['0001', '0005'], ventas_netas_30: 1, ventas_netas_90: 4, dias_desde_ultima_venta: 1, urgencia_candidata_2_6_30: { cumple: false, criterio: { v30_min: 2, v90_min: 6, dias_ultima_venta_max: 30 }, informativa: true } } });
  const panel = detalle(env, f, PARCIAL());
  const b = panel.buscar(n => n.className === 'rt-oport-detalle-bloque' && /Demanda reciente de la selección/.test(n.textContent))[0];
  const t = texto(b);
  assert.match(t, /Ventas netas 30 días: 1/); assert.match(t, /90 días: 4/); assert.match(t, /Última venta hace 1 día(?!s)/);
  assert.match(t, /al 31\/08\/2026 \(fecha «hasta»\) en 01 Paseo, 05 Wave/);
  assert.match(t, /no lo cumpliría\. Informativo: no cambia la prioridad/);
  assert.ok(!b.buscar(n => n.tagName === 'SECTION').length, 'no esta dentro del bloque de rendimiento');
});

// ── Respuestas tardias, contexto, copias, anuncios y foco (revision previa al commit de I2) ─────
const PARCIAL_CON = (sucursales, hasta = '2026-11-10', ejecucion = 'eje_prueba_1', vigencia = SNAP().vigencia) => ({ rendimiento_ingreso: TOP('seleccion_parcial', {
  snapshot: { ...SNAP(), ejecucion, vigencia }, consulta: { desde: '2026-08-13', hasta, sucursales }, ambito_compatible: false, elegible_para_etiquetas: false }) });
const llamadasCadena = env => env.reg.llamadas.filter(l => l.url.includes('/rendimiento-ingreso/'));
const regiones = sec => ({
  estado: sec.buscar(n => n.getAttribute && n.getAttribute('role') === 'status')[0],
  alerta: sec.buscar(n => n.getAttribute && n.getAttribute('role') === 'alert')[0],
});
const zonaDe = (panel, boton) => panel.buscar(n => n.getAttribute && n.getAttribute('id') === boton.getAttribute('aria-controls'))[0];

test('respuesta tardía: si mientras carga se abre OTRO producto, no aparece en él; al volver al primero se ve sin otra consulta', async () => {
  const d = diferida();
  const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': () => d.p, 'GET /analisis/rendimiento-ingreso/P0002': { status: 200, body: CADENA({ codigo: 'P0002' }) } } });
  const pA = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  pA.botones('Ver el rendimiento de la cadena')[0].click(); await esperar();
  cerrar(env, pA);
  const pB = detalle(env, PROD(RI('seleccion_parcial'), { Codigo_producto: 'P0002' }), PARCIAL());
  d.resolver({ status: 200, body: CADENA() }); await esperar(); await esperar();
  assert.doesNotMatch(texto(seccion(pB)), /no corresponde a tu selección|Consultando/, 'nada de P0001 en P0002');
  assert.equal(pB.botones('Ver el rendimiento de la cadena').length, 1);
  assert.doesNotMatch(texto(seccion(pA)), /no corresponde a tu selección/, 'la copia cerrada no se redibuja');
  cerrar(env, pB);
  const pA2 = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  assert.match(texto(seccion(pA2)), /no corresponde a tu selección/, 'mismo producto y contexto: se ve el resultado');
  assert.equal(llamadasCadena(env).length, 1);
});

test('respuesta tardía: si cambian las sucursales, el período o el cálculo, no aparece en el contexto nuevo (empieza cerrado y vuelve a consultar)', async () => {
  for (const nuevo of [PARCIAL_CON(['0001', '0014']), PARCIAL_CON(['0001', '0005'], '2026-11-12'), PARCIAL_CON(['0001', '0005'], '2026-11-10', 'eje_prueba_2')]) {
    const d = diferida(); let n = 0;
    const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': () => (++n === 1 ? d.p : { status: 200, body: CADENA({ snapshot: nuevo.rendimiento_ingreso.snapshot }) }) } });
    const p1 = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL_CON(['0001', '0005']));
    p1.botones('Ver el rendimiento de la cadena')[0].click(); await esperar();
    cerrar(env, p1); // la vista se reconstruye con la consulta nueva
    const p2 = detalle(env, PROD(RI('seleccion_parcial')), nuevo);
    d.resolver({ status: 200, body: CADENA() }); await esperar(); await esperar();
    assert.doesNotMatch(texto(seccion(p2)), /no corresponde a tu selección|Consultando/);
    const [b] = p2.botones('Ver el rendimiento de la cadena');
    assert.equal(b.getAttribute('aria-expanded'), 'false');
    b.click(); await esperar(); await esperar();
    assert.equal(n, 2, 'el contexto nuevo hace su propia consulta');
    assert.match(texto(seccion(p2)), /no corresponde a tu selección/);
  }
});

test('respuesta tardía: cerrar y reabrir el detalle mientras carga muestra "consultando" y después el resultado, con una sola solicitud', async () => {
  const d = diferida();
  const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': () => d.p } });
  const p1 = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  p1.botones('Ver el rendimiento de la cadena')[0].click(); await esperar();
  cerrar(env, p1);
  const p2 = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  const [b] = p2.botones('Ocultar el rendimiento de la cadena');
  assert.ok(b, 'reabre en el mismo estado');
  assert.match(texto(seccion(p2)), /Consultando el rendimiento de la cadena/);
  assert.equal(zonaDe(p2, b).getAttribute('aria-busy'), 'true');
  d.resolver({ status: 200, body: CADENA() }); await esperar(); await esperar();
  assert.match(texto(seccion(p2)), /no corresponde a tu selección/);
  assert.equal(zonaDe(p2, b).getAttribute('aria-busy'), 'false');
  assert.equal(llamadasCadena(env).length, 1);
});

test('dos copias del detalle: comparten estado y resultado sin duplicar solicitudes, aunque se pulse en las dos', async () => {
  const d = diferida();
  const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': () => d.p } });
  const p1 = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  const p2 = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  p1.botones('Ver el rendimiento de la cadena')[0].click(); await esperar();
  for (const p of [p1, p2]) assert.match(texto(seccion(p)), /Consultando/);
  p2.botones('Ocultar el rendimiento de la cadena')[0].click(); // se cierra desde la otra copia mientras carga
  p2.botones('Ver el rendimiento de la cadena')[0].click();   // y se reabre: reutiliza el pedido en curso
  assert.equal(llamadasCadena(env).length, 1);
  d.resolver({ status: 200, body: CADENA() }); await esperar(); await esperar();
  for (const p of [p1, p2]) assert.match(texto(seccion(p)), /no corresponde a tu selección/);
  assert.equal(llamadasCadena(env).length, 1);
});

test('cerrar la cadena mientras carga: el resultado queda guardado y cerrado; reabrir no vuelve a consultar', async () => {
  const d = diferida();
  const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': () => d.p } });
  const p = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  p.botones('Ver el rendimiento de la cadena')[0].click(); await esperar();
  p.botones('Ocultar el rendimiento de la cadena')[0].click();
  d.resolver({ status: 200, body: CADENA() }); await esperar(); await esperar();
  assert.doesNotMatch(texto(seccion(p)), /no corresponde a tu selección/);
  p.botones('Ver el rendimiento de la cadena')[0].click();
  assert.match(texto(seccion(p)), /no corresponde a tu selección/);
  assert.equal(llamadasCadena(env).length, 1);
});

test('una respuesta de OTRO código no se muestra como si fuera de este producto', async () => {
  const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': { status: 200, body: CADENA({ codigo: 'P0999' }) } } });
  const p = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  p.botones('Ver el rendimiento de la cadena')[0].click(); await esperar(); await esperar();
  assert.match(texto(seccion(p)), /La respuesta no corresponde a este producto/);
  assert.doesNotMatch(texto(seccion(p)), /11 de 33 unidades/);
});

test('anuncios accesibles: regiones vivas presentes desde el inicio; carga y resultado en status, errores en alert; sin repetir al reconstruir', async () => {
  const d = diferida(); let n = 0;
  const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': () => (++n === 1 ? { status: 503, body: { ok: false } } : d.p) } });
  const p = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  let r = regiones(seccion(p));
  assert.ok(r.estado && r.alerta, 'existen antes de consultar');
  assert.equal(r.estado.getAttribute('aria-live'), 'polite');
  assert.equal(r.estado.className, 'ri-sr'); assert.equal(r.alerta.className, 'ri-sr');
  assert.equal(texto(r.estado), ''); assert.equal(texto(r.alerta), '');
  p.botones('Ver el rendimiento de la cadena')[0].click();
  assert.equal(texto(r.estado), 'Consultando el rendimiento de la cadena…');
  await esperar(); await esperar();
  assert.equal(texto(r.estado), '');
  assert.match(texto(r.alerta), /No se pudo consultar el rendimiento de la cadena \(error 503\)/);
  p.botones('Reintentar')[0].click();
  assert.equal(texto(r.alerta), ''); assert.equal(texto(r.estado), 'Consultando el rendimiento de la cadena…');
  d.resolver({ status: 200, body: CADENA() }); await esperar(); await esperar();
  assert.match(texto(r.estado), /Rendimiento de la cadena cargado/);
  cerrar(env, p);
  const p2 = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  r = regiones(seccion(p2));
  assert.equal(texto(r.estado), '', 'al reconstruir no se repite el anuncio');
  assert.match(texto(seccion(p2)), /no corresponde a tu selección/);
});

test('foco: queda en el botón al abrir y cerrar; al reintentar pasa al botón de la cadena; si el detalle se reconstruye vuelve al botón nuevo', async () => {
  let n = 0;
  const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': () => (++n === 1 ? { status: 503, body: { ok: false } } : { status: 200, body: CADENA() }) } });
  const p = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  const [b] = p.botones('Ver el rendimiento de la cadena');
  b.focus(); b.click(); await esperar(); await esperar();
  assert.equal(activo(env), b, 'tras abrir (con error)');
  const [re] = p.botones('Reintentar');
  re.focus(); re.click();
  assert.equal(activo(env), b, 'Reintentar desaparece: el foco pasa al botón de la cadena');
  await esperar(); await esperar();
  assert.equal(activo(env), b, 'tras el resultado');
  b.click();
  assert.equal(activo(env), b, 'tras cerrar');
  assert.equal(b.getAttribute('aria-expanded'), 'false');
  // reconstruccion (p. ej. llega la tendencia de 7 dias): el boton viejo sale del documento y el foco vuelve al nuevo
  cerrar(env, p);
  assert.equal(activo(env), env.ev('document.body'));
  const p2 = detalle(env, PROD(RI('seleccion_parcial')), PARCIAL());
  await new Promise(r => setTimeout(r, 5));
  assert.equal(activo(env), p2.botones('Ver el rendimiento de la cadena')[0]);
});

// ── Vigencia del snapshot en la consulta de cadena (revision del ZIP de I2) ──────────────────────────────────────────────
const VIG = { vigente1: SNAP('vigente', 1).vigencia, atrasado3: SNAP('atrasado', 3).vigencia };
const listaCon = vig => PARCIAL_CON(['0001', '0005'], '2026-11-10', 'eje_prueba_1', vig);
const cadenaCon = vig => CADENA({ estado: vig.estado === 'atrasado' ? 'informativo_atrasado' : 'disponible', snapshot: { ...SNAP(), vigencia: vig } });
const piesVigencia = sec => sec.buscar(n => n.tagName === 'SPAN' && /^Vigencia: /.test(n.textContent)).map(n => n.textContent);

test('vigencia: vigente (1 día) -> atrasado (3 días) con la MISMA ejecución invalida la respuesta guardada; la nueva consulta es explícita', async () => {
  let vigenciaApi = VIG.vigente1;
  const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': () => ({ status: 200, body: cadenaCon(vigenciaApi) }) } });
  const p1 = detalle(env, PROD(RI('seleccion_parcial')), listaCon(VIG.vigente1));
  p1.botones('Ver el rendimiento de la cadena')[0].click(); await esperar(); await esperar();
  assert.match(texto(seccion(p1)), /no corresponde a tu selección/);
  assert.deepEqual([...new Set(piesVigencia(seccion(p1)))], ['Vigencia: 1 día desde el corte (propone etiquetas hasta 2 días; informativo hasta 7)']);
  // Pasan dos dias: la API informa la misma ejecucion, ahora atrasada a 3 dias. El detalle se reconstruye.
  cerrar(env, p1); vigenciaApi = VIG.atrasado3;
  const p2 = detalle(env, PROD(RI('seleccion_parcial')), listaCon(VIG.atrasado3));
  const t2 = texto(seccion(p2));
  assert.doesNotMatch(t2, /no corresponde a tu selección/, 'no reutiliza la respuesta del dia 1');
  assert.equal(p2.botones('Ver el rendimiento de la cadena')[0].getAttribute('aria-expanded'), 'false');
  assert.equal(env.reg.llamadas.length, 1, 'no consulta sola');
  assert.deepEqual(piesVigencia(seccion(p2)), [piesVigencia(seccion(p2))[0]]);
  assert.match(piesVigencia(seccion(p2))[0], /^Vigencia: 3 días/);
  p2.botones('Ver el rendimiento de la cadena')[0].click(); await esperar(); await esperar();
  assert.equal(env.reg.llamadas.length, 2, 'consulta explícita al pulsar');
  const pies = piesVigencia(seccion(p2));
  assert.equal(pies.length, 2, 'pie exterior y pie de la cadena');
  assert.equal(new Set(pies).size, 1, 'mismos datos de vigencia en los dos pies: ' + pies.join(' / '));
  assert.match(texto(seccion(p2)), /Datos al 10\/11\/2026 \(hace 3 días\)/, 'la cadena atrasada muestra su aviso');
});

test('vigencia: una respuesta PENDIENTE del contexto anterior (1 día) que llega después no aparece en el contexto atrasado', async () => {
  const d = diferida();
  const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': () => d.p } });
  const p1 = detalle(env, PROD(RI('seleccion_parcial')), listaCon(VIG.vigente1));
  p1.botones('Ver el rendimiento de la cadena')[0].click(); await esperar();
  cerrar(env, p1);
  const p2 = detalle(env, PROD(RI('seleccion_parcial')), listaCon(VIG.atrasado3));
  d.resolver({ status: 200, body: cadenaCon(VIG.vigente1) }); await esperar(); await esperar();
  const t = texto(seccion(p2));
  assert.doesNotMatch(t, /no corresponde a tu selección|Consultando/);
  assert.equal(p2.botones('Ver el rendimiento de la cadena')[0].getAttribute('aria-expanded'), 'false');
  assert.equal(piesVigencia(seccion(p2)).length, 1);
  assert.equal(texto(regiones(seccion(p2)).estado), '', 'tampoco se anuncia');
});

test('vigencia: si la respuesta llega con otra vigencia que la lista, no se muestra (sin pies contradictorios) y se pide actualizar', async () => {
  const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': { status: 200, body: cadenaCon(VIG.atrasado3) } } });
  const p = detalle(env, PROD(RI('seleccion_parcial')), listaCon(VIG.vigente1));
  p.botones('Ver el rendimiento de la cadena')[0].click(); await esperar(); await esperar();
  const t = texto(seccion(p));
  assert.match(t, /El cálculo cambió desde que se cargó la lista \(ejecución eje_prueba_1, atrasado, 3 días desde el corte; la lista: ejecución eje_prueba_1, vigente, 1 día desde el corte\)\. Actualizá Oportunidades/);
  assert.doesNotMatch(t, /no corresponde a tu selección|11 de 33 unidades/);
  assert.deepEqual(piesVigencia(seccion(p)).map(x => x.slice(0, 18)), ['Vigencia: 1 día de']);
  assert.match(texto(regiones(seccion(p)).alerta), /El cálculo cambió/, 'se anuncia como alerta');
  assert.equal(p.botones('Reintentar').length, 0, 'reintentar no lo resuelve: hay que actualizar la lista');
});

test('vigencia: cerrar y reabrir sin cambios conserva el resultado con una sola solicitud', async () => {
  const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': { status: 200, body: cadenaCon(VIG.atrasado3) } } });
  const p1 = detalle(env, PROD(RI('seleccion_parcial')), listaCon(VIG.atrasado3));
  p1.botones('Ver el rendimiento de la cadena')[0].click(); await esperar(); await esperar();
  p1.botones('Ocultar el rendimiento de la cadena')[0].click();
  p1.botones('Ver el rendimiento de la cadena')[0].click();
  cerrar(env, p1);
  const p2 = detalle(env, PROD(RI('seleccion_parcial')), listaCon(VIG.atrasado3));
  assert.match(texto(seccion(p2)), /no corresponde a tu selección/);
  assert.equal(new Set(piesVigencia(seccion(p2))).size, 1);
  assert.equal(env.reg.llamadas.length, 1);
});

test('vigencia: las dos copias del detalle comparten estado y solicitud en el contexto atrasado', async () => {
  const d = diferida();
  const env = crearEntorno({ rutas: { 'GET /analisis/rendimiento-ingreso/P0001': () => d.p } });
  const p1 = detalle(env, PROD(RI('seleccion_parcial')), listaCon(VIG.atrasado3));
  const p2 = detalle(env, PROD(RI('seleccion_parcial')), listaCon(VIG.atrasado3));
  p2.botones('Ver el rendimiento de la cadena')[0].click(); await esperar();
  p1.botones('Ocultar el rendimiento de la cadena')[0].click();
  p1.botones('Ver el rendimiento de la cadena')[0].click();
  d.resolver({ status: 200, body: cadenaCon(VIG.atrasado3) }); await esperar(); await esperar();
  for (const p of [p1, p2]) {
    assert.match(texto(seccion(p)), /no corresponde a tu selección/);
    assert.equal(new Set(piesVigencia(seccion(p))).size, 1);
  }
  assert.equal(env.reg.llamadas.length, 1);
});
