'use strict';
// Pruebas de la LOGICA nueva de Oportunidades: grupos de estados, contadores sin duplicados, parametros de consulta, periodos rapidos y
// celdas con reglas de presentacion (cobertura, stock, motivo). No replican el marcado visual. Se ejecutan con:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./dom-minimo');

const plano = v => JSON.parse(JSON.stringify(v));
const ESTADOS = ['revisar_devoluciones', 'reposicion_urgente', 'reponer_desde_deposito', 'reposicion_a_evaluar', 'posible_rotacion', 'reposicion_proxima', 'venta_destacada', 'bien_vendido', 'seguimiento', 'posible_descuento', 'stock_parado'];
const resumen = (porRegla = {}, total = 100) => ({ total_clasificados: total, por_regla_cumplida: Object.fromEntries(ESTADOS.map(e => [e, porRegla[e] ?? 0])) });

// ── Grupos y mapeo de estados ─────────────────────────────────────────────────────────────────────
test('mapeo: los 11 estados del motor pertenecen a exactamente un grupo, con la composición pedida', () => {
  const env = crearEntorno();
  assert.deepEqual(plano(env.ev('ogEstadosDelGrupo("reposicion")')), ['reposicion_urgente', 'reponer_desde_deposito', 'reposicion_proxima', 'reposicion_a_evaluar']);
  assert.deepEqual(plano(env.ev('ogEstadosDelGrupo("rotaciones")')), ['posible_rotacion']);
  assert.deepEqual(plano(env.ev('ogEstadosDelGrupo("rendimiento")')), ['venta_destacada', 'bien_vendido', 'seguimiento']);
  assert.deepEqual(plano(env.ev('ogEstadosDelGrupo("estancados")')), ['stock_parado', 'posible_descuento']);
  assert.deepEqual(plano(env.ev('ogEstadosDelGrupo("revisar_datos")')), ['revisar_devoluciones']);
  assert.deepEqual(plano(env.ev('ogEstadosDelGrupo("todas")')).sort(), [...ESTADOS].sort());
  assert.deepEqual(plano(env.ev('OG_GRUPOS.map(g => g.id)')), ['todas', 'reposicion', 'rotaciones', 'rendimiento', 'estancados', 'revisar_datos']);
  ESTADOS.forEach(e => {
    const propios = plano(env.ev(`OG_GRUPOS.filter(g => g.id !== 'todas' && g.estados.includes('${e}')).map(g => g.id)`));
    assert.equal(propios.length, 1, e + ' en un solo grupo');
    assert.equal(env.ev(`ogGrupoDeEstado('${e}')`), propios[0]);
  });
});

test('mapeo: "seguimiento" (ingreso reciente) queda en Rendimiento y "Todas" excluye estados inventados', () => {
  const env = crearEntorno();
  assert.equal(env.ev("ogGrupoDeEstado('seguimiento')"), 'rendimiento');
  assert.equal(env.ev("ogGrupoDeEstado('inventado')"), null);
  assert.equal(env.ev("ogEstadosDelGrupo('grupo_inexistente').length"), 11, 'un grupo desconocido cae en Todas');
});

test('parámetro de la consulta: un estado puntual, la lista del grupo o los 11 estados para "Todas"', () => {
  const env = crearEntorno();
  assert.equal(env.ev("ogParametroEstado('reposicion', 'reposicion_urgente')"), 'reposicion_urgente');
  assert.equal(env.ev("ogParametroEstado('reposicion', null)"), 'reposicion_urgente,reponer_desde_deposito,reposicion_proxima,reposicion_a_evaluar');
  assert.equal(env.ev("ogParametroEstado('reposicion', 'stock_parado')"), 'reposicion_urgente,reponer_desde_deposito,reposicion_proxima,reposicion_a_evaluar', 'un estado de otro grupo no se aplica');
  assert.equal(env.ev("ogParametroEstado('todas', null).split(',').length"), 11);
  assert.equal(env.ev("ogParametroEstado('rotaciones', null)"), 'posible_rotacion');
});

// ── Contadores ────────────────────────────────────────────────────────────────────────────────────
test('contadores: grupos de un estado salen del resumen; los de varios estados, de la unión; "Todas" es el total con oportunidad', () => {
  const env = crearEntorno();
  const r = resumen({ reposicion_urgente: 5, reponer_desde_deposito: 2, reposicion_proxima: 7, reposicion_a_evaluar: 1, posible_rotacion: 9, bien_vendido: 20, venta_destacada: 4, stock_parado: 3, posible_descuento: 2, revisar_devoluciones: 6 }, 40);
  const c = plano(env.ev(`ogConteos(${JSON.stringify(r)}, { reposicion: 12, rendimiento: 22, estancados: 4 })`));
  assert.equal(c.total, 40);
  assert.equal(c.grupos.todas, 40);
  assert.equal(c.grupos.rotaciones, 9);
  assert.equal(c.grupos.revisar_datos, 6);
  assert.equal(c.grupos.reposicion, 12, 'unión: menos que la suma de sus estados (15) porque hay productos en más de un estado');
  assert.equal(c.grupos.rendimiento, 22);
  assert.equal(c.estados.reposicion_urgente, 5);
  assert.equal(c.sumaGrupos, 12 + 9 + 22 + 4 + 6);
  assert.equal(c.gruposSeSuperponen, true, 'la suma de los grupos (53) supera el total (40): no se presenta como total');
});

test('contadores: si los grupos no se superponen la suma coincide con el total y no se avisa', () => {
  const env = crearEntorno();
  const r = resumen({ reposicion_urgente: 3, posible_rotacion: 2, bien_vendido: 4, stock_parado: 1, revisar_devoluciones: 0 }, 10);
  const c = plano(env.ev(`ogConteos(${JSON.stringify(r)}, { reposicion: 3, rendimiento: 4, estancados: 1 })`));
  assert.equal(c.sumaGrupos, 10);
  assert.equal(c.gruposSeSuperponen, false);
});

test('contadores: lo que no se sabe es null ("—"), nunca 0; una unión inconsistente (servidor viejo que devuelve 0) no se muestra', () => {
  const env = crearEntorno();
  const r = resumen({ reposicion_urgente: 5, reposicion_proxima: 3 }, 50);
  const sinUniones = plano(env.ev(`ogConteos(${JSON.stringify(r)}, null)`));
  assert.equal(sinUniones.grupos.reposicion, null);
  assert.equal(sinUniones.sumaGrupos, null, 'sin todos los grupos no hay suma');
  assert.equal(sinUniones.grupos.rotaciones, 0, 'un grupo de un estado conocido sí puede ser 0 real');
  const viejo = plano(env.ev(`ogConteos(${JSON.stringify(r)}, { reposicion: 0, rendimiento: 0, estancados: 0 })`));
  assert.equal(viejo.grupos.reposicion, null, '0 es menor que el mayor de sus estados (5): inconsistente');
  const excesivo = plano(env.ev(`ogConteos(${JSON.stringify(r)}, { reposicion: 99 })`));
  assert.equal(excesivo.grupos.reposicion, null, 'mayor que la suma de sus estados');
  assert.equal(plano(env.ev('ogConteos(null, null)')).total, null);
  assert.equal(plano(env.ev('ogConteos(null, null)')).estados.bien_vendido, null);
  const todoCero = plano(env.ev(`ogConteos(${JSON.stringify(resumen({}, 0))}, { reposicion: 0, rendimiento: 0, estancados: 0 })`));
  assert.equal(todoCero.grupos.reposicion, 0, 'sin ningún producto, 0 es un dato válido');
});

test('contadores: avisan cuando los chips de un grupo suman más que sus productos únicos; el total esperado de la lista sale del chip o del grupo', () => {
  const env = crearEntorno();
  const r = resumen({ reposicion_urgente: 5, reposicion_proxima: 7 }, 40);
  const c = env.ev(`ogConteos(${JSON.stringify(r)}, { reposicion: 10, rendimiento: 0, estancados: 0 })`);
  env.ctx.__c = c;
  assert.equal(env.ev("ogChipsSeSuperponen('reposicion', __c)"), true);
  assert.equal(env.ev("ogChipsSeSuperponen('rotaciones', __c)"), false);
  assert.equal(env.ev("ogTotalEsperado('reposicion', 'reposicion_proxima', __c)"), 7);
  assert.equal(env.ev("ogTotalEsperado('reposicion', null, __c)"), 10);
  assert.equal(env.ev("ogTotalEsperado('todas', null, __c)"), 40);
});

test('contadores: no dependen del grupo, estado ni prioridad elegidos (seleccionar un grupo no borra los demás)', () => {
  const env = crearEntorno();
  env.ev(`RT_OPORTUNIDADES_BASE = { clave: rtOportunidadesClaveBase(), resumen: ${JSON.stringify(resumen({ reposicion_urgente: 5, posible_rotacion: 9 }, 30))} };
          RT_OPORTUNIDADES_UNIONES = { clave: rtOportunidadesClaveBase(), estado: 'ok', valores: { reposicion: 5, rendimiento: 0, estancados: 0 } };`);
  const antes = plano(env.ev('ovConteosActuales().conteos.grupos'));
  env.ev("RT_OPORTUNIDADES_GRUPO = 'rotaciones'; RT_OPORTUNIDADES_ESTADO = 'posible_rotacion'; RT_OPORTUNIDADES_PRIORIDAD = 'alta';");
  assert.deepEqual(plano(env.ev('ovConteosActuales().conteos.grupos')), antes);
  assert.equal(antes.reposicion, 5);
  assert.equal(antes.rotaciones, 9);
  // cambia el periodo, las sucursales o el filtro de catalogo: los contadores guardados ya no valen (se muestran "—" hasta recalcular)
  env.ev("RT_DESDE = '2026-09-01'");
  assert.equal(env.ev('ovConteosActuales().base'), null);
  assert.equal(env.ev('ovConteosActuales().conteos.grupos.reposicion'), null);
  assert.equal(env.ev('ovConteosActuales().conteos.grupos.todas'), null);
});

test('clave de conteos: cambia con período, sucursales y filtros de catálogo; no con la selección de la lista', () => {
  const env = crearEntorno();
  const k0 = env.ev('rtOportunidadesClaveBase()');
  env.ev("RT_OPORTUNIDADES_GRUPO = 'estancados'; RT_OPORTUNIDADES_ESTADO = 'stock_parado'; RT_OPORTUNIDADES_PRIORIDAD = 'baja'; RT_OPORTUNIDADES_OFFSET = 50;");
  assert.equal(env.ev('rtOportunidadesClaveBase()'), k0);
  env.ev("RT_FILTRO = { rubro: ['ZAPAS'] }");
  assert.notEqual(env.ev('rtOportunidadesClaveBase()'), k0);
  env.ev("RT_FILTRO = null; RT_CENTROS.pop()");
  assert.notEqual(env.ev('rtOportunidadesClaveBase()'), k0, 'otro conjunto de sucursales');
});

// ── Paginación ────────────────────────────────────────────────────────────────────────────────────
test('botonera de páginas: primera, última, actual y vecinas, con huecos marcados', () => {
  const env = crearEntorno();
  assert.deepEqual(plano(env.ev('ogPaginasVisibles(1, 3)')), [1, 2, 3]);
  assert.deepEqual(plano(env.ev('ogPaginasVisibles(1, 29)')), [1, 2, '…', 29]);
  assert.deepEqual(plano(env.ev('ogPaginasVisibles(15, 29)')), [1, '…', 14, 15, 16, '…', 29]);
  assert.deepEqual(plano(env.ev('ogPaginasVisibles(29, 29)')), [1, '…', 28, 29]);
  assert.deepEqual(plano(env.ev('ogPaginasVisibles(1, 1)')), [1]);
});

// ── Parámetros de la consulta ─────────────────────────────────────────────────────────────────────
test('consulta del listado: grupo, estado, prioridad y página; los filtros de rotación solo se envían en la lista de rotaciones', () => {
  const env = crearEntorno();
  const q = () => Object.fromEntries(new URLSearchParams(env.ev('ovParamsLista().toString()')));
  let p = q();
  assert.equal(p.desde, '2026-08-01');
  assert.equal(p.hasta, '2026-10-30');
  assert.equal(p.limit, '50');
  assert.equal(p.offset, '0');
  assert.equal(p.estado.split(',').length, 11, '"Todas" = unión de los 11 estados (excluye productos sin oportunidad)');
  assert.equal(p.sucursales, '0001,0005,0010,0012,0014', 'solo si la selección es un subconjunto');
  env.ev("RT_OPORTUNIDADES_ROTACION.origen = '0001'; RT_OPORTUNIDADES_CONFIANZA = 'manual'; RT_OPORTUNIDADES_PRIORIDAD = 'alta'; RT_OPORTUNIDADES_OFFSET = 100;");
  p = q();
  assert.equal(p.rotacion_origen, undefined, 'fuera de Rotaciones los filtros de rotación no recortan la lista');
  assert.equal(p.confianza, undefined);
  assert.equal(p.prioridad, 'alta');
  assert.equal(p.offset, '100');
  env.ev("RT_OPORTUNIDADES_GRUPO = 'rotaciones'");
  p = q();
  assert.equal(p.estado, 'posible_rotacion');
  assert.equal(p.rotacion_origen, '0001');
  assert.equal(p.confianza, 'manual');
  env.ev("RT_OPORTUNIDADES_GRUPO = 'reposicion'; RT_OPORTUNIDADES_ESTADO = 'reponer_desde_deposito'; RT_FILTRO = { marca: ['VANS'], codigo: 'T1' }");
  p = q();
  assert.equal(p.estado, 'reponer_desde_deposito');
  assert.equal(p.marca, 'VANS');
  assert.equal(p.codigo, 'T1');
});

// ── Fechas y accesos rápidos ──────────────────────────────────────────────────────────────────────
test('días del período: inclusivos (desde y hasta cuentan)', () => {
  const env = crearEntorno();
  assert.equal(env.ev("ovDiasPeriodo('2026-04-01', '2026-04-30')"), 30);
  assert.equal(env.ev("ovDiasPeriodo('2026-08-01', '2026-10-30')"), 91);
  assert.equal(env.ev("ovDiasPeriodo('2026-10-30', '2026-10-30')"), 1);
  assert.equal(env.ev("ovDiasPeriodo('2026-02-01', '2026-03-02')"), 30, 'cruza el fin de febrero sin errores de zona horaria');
  assert.equal(env.ev("ovDiasPeriodo(null, '2026-10-30')"), null);
});

test('accesos rápidos: usan los controles globales, mantienen "hasta" y cuentan N días inclusivos; repetir el mismo no hace nada', () => {
  const env = crearEntorno();
  env.ev("inputsFecha.rtDesde.value = RT_DESDE; inputsFecha.rtHasta.value = RT_HASTA; function rtRenderVistaActual() {}");
  for (const n of [30, 60, 90]) {
    env.ev(`ovPeriodoRapido(${n})`);
    assert.equal(env.ev('RT_HASTA'), '2026-10-30', 'hasta no cambia');
    assert.equal(env.ev('ovDiasPeriodo(RT_DESDE, RT_HASTA)'), n);
    assert.equal(env.ev('inputsFecha.rtDesde.value'), env.ev('RT_DESDE'), 'se actualizan los controles globales');
  }
  assert.equal(env.ev('RT_DESDE'), '2026-08-02');
  const antes = env.ev('periodoCambiado');
  env.ev('ovPeriodoRapido(90)');
  assert.equal(env.ev('periodoCambiado'), antes, 'mismo período: no se vuelve a consultar');
});

// ── Celdas con reglas de presentación ─────────────────────────────────────────────────────────────
const f = (o = {}) => ({ Codigo_producto: '1003', Nombre_producto: 'Remera', Nombre_marca: 'VANS', Nombre_rubro: 'REMERAS', estado_principal: 'reposicion_proxima', etiquetas_secundarias: [], motivo: 'Cobertura de 24.3 días, se agota dentro de 30 días.', Ventas_total: 15, Stock_sucursales: 4, Stock_deposito: 0, Stock_fallados: 7, cobertura_estado: 'calculada', cobertura_dias: 24.3, ...o });
const RESP_SIN_CONJUNTO = { campos_globales: { aplican_a_todos_los_productos: true }, umbrales: { reposicion: { cobertura_reponer_max: 14, cobertura_proxima_max: 30 } } };

test('cobertura: sin ventas no es 0 días; el color solo con umbrales vigentes para todos y en productos de reposición', () => {
  const env = crearEntorno();
  const celda = (fila, resp = RESP_SIN_CONJUNTO) => { const n = env.ev(`ovCeldaCobertura(${JSON.stringify(fila)}, ${JSON.stringify(resp)})`); return { texto: n.textContent, clase: n.className }; };
  const sinVentas = celda(f({ cobertura_estado: 'sin_ventas', cobertura_dias: null }));
  assert.equal(sinVentas.texto, 'Sin ventas');
  assert.doesNotMatch(sinVentas.texto, /0 días/);
  assert.equal(celda(f({ cobertura_dias: null })).texto, 'Sin ventas', 'sin dato tampoco es 0');
  assert.equal(celda(f({ cobertura_dias: 0 })).texto, '0 días', 'cobertura 0 real (sin stock con ventas) sí se muestra');
  assert.match(celda(f({ cobertura_dias: 10 })).clase, /ov-pill-danger/);
  assert.match(celda(f({ cobertura_dias: 24.3 })).clase, /ov-pill-warning/);
  assert.match(celda(f({ cobertura_dias: 45 })).clase, /ov-pill-success/);
  assert.match(celda(f({ estado_principal: 'stock_parado', cobertura_dias: 200 })).clase, /ov-pill-plano/, 'fuera de reposición no se pinta');
  assert.match(celda(f({ estado_principal: 'posible_rotacion', etiquetas_secundarias: ['reposicion_proxima'], cobertura_dias: 24.3 })).clase, /ov-pill-warning/, 'estado de reposición secundario también cuenta');
  const conConjunto = { campos_globales: { aplican_a_todos_los_productos: false }, umbrales: RESP_SIN_CONJUNTO.umbrales };
  assert.match(celda(f({ cobertura_dias: 10 }), conConjunto).clase, /ov-pill-plano/, 'con conjunto personalizado los umbrales globales no son los efectivos: sin color');
});

test('stock: sucursales y Depósito 90 separados, sin Depósito 93 (Fallados)', () => {
  const env = crearEntorno();
  const txt = env.ev(`ovCeldaStock(${JSON.stringify(f({ Stock_sucursales: 4, Stock_deposito: 6, Stock_fallados: 7 }))})`).textContent;
  assert.match(txt, /4suc\./);
  assert.match(txt, /6dep\. 90/);
  assert.doesNotMatch(txt, /7|93|fallad/i);
  assert.match(env.ev(`ovCeldaStock(${JSON.stringify(f({ Stock_deposito: undefined, Stock_ctro_0000: 3 }))})`).textContent, /3dep\. 90/, 'compatibilidad con el campo anterior del servidor');
});

test('"Por qué aparece": el par de rotación se escribe con nombres de sucursal y datos estructurados; el resto usa el motivo del motor', () => {
  const env = crearEntorno();
  const motivo = fila => env.ev(`ovMotivoCorto(${JSON.stringify(fila)})`);
  const rot = f({ estado_principal: 'posible_rotacion', motivo: 'Vende bien en 0010 pero tiene stock parado en 0001 (confianza: manual).', diagnostico_rotacion: { par_sugerido: { destino: { sucursal: '0010', ventas: 5, stock: 0 }, origen: { sucursal: '0001', stock: 9 } } } });
  assert.equal(motivo(rot), 'Vende en 10 Perito Moreno (5 ventas, stock 0) y tiene stock parado en 01 Paseo (9 u.).');
  assert.doesNotMatch(motivo(rot), /0010|0001/);
  assert.equal(motivo(f()), 'Cobertura de 24.3 días, se agota dentro de 30 días.');
  assert.equal(motivo(f({ motivo: null, explicacion: null })), '—', 'sin motivo no se inventa uno');
});

test('ventas: devoluciones netas y muestra chica se señalan sin ocultar el valor', () => {
  const env = crearEntorno();
  const celda = o => env.ev(`ovCeldaVentas(${JSON.stringify(f(o))})`);
  assert.match(celda({ Ventas_total: -3 }).textContent, /-3devoluciones/);
  assert.match(celda({ Ventas_total: -3 }).className, /rt-oport-ventas-neg/);
  assert.match(celda({ Ventas_total: 2, ratio_confiable: false }).textContent, /2muestra chica/);
  assert.equal(celda({ Ventas_total: 12, ratio_confiable: true }).textContent, '12');
});

// ── Permisos ──────────────────────────────────────────────────────────────────────────────────────
test('permisos: "Ver reglas" y los detalles técnicos del perfil solo para administradores', () => {
  const admin = crearEntorno();
  const jefe = crearEntorno({ usuario: { rol: 'jefe', usuario: 'ana' } });
  const encabezado = env => env.ev('ovEncabezado()').buscar(n => n.tagName === 'BUTTON').map(b => b.textContent);
  assert.deepEqual(encabezado(admin), ['Ver reglas']);
  assert.deepEqual(encabezado(jefe), []);
  const detalle = env => env.ev(`(() => { const panel = rtEl('div'); const bloque = (e, v) => { const b = rtEl('div'); b.appendChild(rtEl('b', { text: e })); const x = rtEl('div'); if (typeof v === 'string') x.textContent = v; else x.appendChild(v); b.appendChild(x); return b; }; rrDetalleOportunidad(panel, { Codigo_producto: '1', acciones: [], rendimiento: {}, perfil: { id: 'p', version: 1, huella: 'abcdef0123456789' }, resolucion: { origen: 'general', version_general: 1 }, Ventas_total: 1, Stock_sucursales: 1 }, { periodo: { desde: '2026-08-01', hasta: '2026-10-30' }, conjunto: { origen: 'activacion', activacion_id: 7 } }, bloque); return panel; })()`);
  assert.deepEqual(detalle(admin).buscar(n => n.tagName === 'SUMMARY').map(s => s.textContent), ['Por qué aparece', 'Detalles técnicos']);
  const comoJefe = detalle(jefe);
  assert.deepEqual(comoJefe.buscar(n => n.tagName === 'SUMMARY').map(s => s.textContent), ['Por qué aparece'], 'la explicación sigue disponible');
  assert.doesNotMatch(comoJefe.textContent, /huella|conjunto #|General v/, 'sin identificadores de perfil ni conjunto');
});

test('contexto del análisis: reglas estándar vs conjunto personalizado (el número del conjunto solo para administradores)', () => {
  const admin = crearEntorno();
  const jefe = crearEntorno({ usuario: { rol: 'jefe', usuario: 'ana' } });
  const resp = (conjunto) => ({ periodo: { desde: '2026-04-01', hasta: '2026-04-30' }, sucursales: ['0001', '0005'], conjunto });
  const texto = (env, r) => env.ev(`(() => { const h = rtEl('div'); ovContexto(h, ${JSON.stringify(r)}); return h; })()`).buscar(n => n.className === 'ov-contexto-info')[0].textContent;
  const est = texto(admin, resp({ origen: 'compat-operativo' }));
  assert.match(est, /Período: 01\/04\/2026 al 30\/04\/2026 · 30 días/);
  assert.match(est, /Sucursales: 2 sucursales \(01 Paseo, 05 Wave\)/);
  assert.match(est, /Reglas: estándar/);
  assert.match(texto(admin, resp({ origen: 'activacion', activacion_id: 7 })), /Reglas: conjunto personalizado activo #7/);
  const comoJefe = texto(jefe, resp({ origen: 'activacion', activacion_id: 7 }));
  assert.match(comoJefe, /Reglas: conjunto personalizado activo/);
  assert.doesNotMatch(comoJefe, /#7/);
});

// ── Estado secundario visible, filtros plegables y notas ──────────────────────────────────────────
const prod = (o = {}) => ({ Codigo_producto: '910', estado_principal: 'reposicion_proxima', etiquetas_secundarias: ['bien_vendido'], acciones: [
  { accion: 'reposicion_proxima', estado_origen: 'reposicion_proxima', principal: true, prioridad: 'media' },
  { accion: 'evaluar_descuento', estado_origen: 'posible_descuento', principal: false, prioridad: 'baja' }], rendimiento: { nivel: 'bueno' }, ...o });
const celdaTexto = (env, fila) => env.ev(`ovCeldaAccion(${JSON.stringify(fila)})`);

test('estado secundario: al filtrar por un estado que el producto cumple solo como secundario se ve como badge, junto a la acción principal', () => {
  const env = crearEntorno();
  const fila = prod({ estado_principal: 'reposicion_proxima', etiquetas_secundarias: ['posible_descuento'] });
  env.ev("RT_OPORTUNIDADES_GRUPO = 'estancados'; RT_OPORTUNIDADES_ESTADO = 'posible_descuento'");
  const n = celdaTexto(env, fila);
  const badge = n.buscar(x => x.className === 'ov-badge-sec');
  assert.equal(badge.length, 1);
  assert.match(badge[0].textContent, /También: Posible descuento/);
  assert.match(n.buscar(x => x.className.startsWith('ov-pill'))[0].textContent, /Reposición próxima/, 'la acción principal sigue siendo la del motor');
  assert.match(n.buscar(x => x.className.startsWith('ov-pill'))[0].className, /ov-pill-warning/, 'color de la prioridad real (media), no la del estado buscado (baja)');
  assert.doesNotMatch(n.textContent, /Otras acciones/, 'no se repite como "otras acciones"');
});

test('estado secundario: sin badge cuando el estado buscado es el principal, en "Todas" o ya lo muestra el rendimiento; sin etiquetas repetidas', () => {
  const env = crearEntorno();
  const badges = fila => celdaTexto(env, fila).buscar(x => x.className === 'ov-badge-sec').length;
  env.ev("RT_OPORTUNIDADES_GRUPO = 'reposicion'; RT_OPORTUNIDADES_ESTADO = 'reposicion_proxima'");
  assert.equal(badges(prod()), 0, 'es el principal');
  env.ev("RT_OPORTUNIDADES_GRUPO = 'todas'; RT_OPORTUNIDADES_ESTADO = null");
  assert.equal(badges(prod({ etiquetas_secundarias: ['posible_descuento'] })), 0, 'en Todas todo estado cuenta: nunca hay badge');
  env.ev("RT_OPORTUNIDADES_GRUPO = 'rendimiento'; RT_OPORTUNIDADES_ESTADO = 'bien_vendido'");
  const n = celdaTexto(env, prod());
  assert.equal(n.buscar(x => x.className === 'ov-badge-sec').length, 0, 'el rendimiento ya dice "Bien vendido"');
  assert.equal((n.textContent.match(/Bien vendido/g) || []).length, 1);
  env.ev("RT_OPORTUNIDADES_GRUPO = 'rendimiento'; RT_OPORTUNIDADES_ESTADO = 'venta_destacada'");
  const dest = celdaTexto(env, prod({ etiquetas_secundarias: ['bien_vendido', 'venta_destacada'], rendimiento: { nivel: 'destacado' } }));
  assert.equal(dest.buscar(x => x.className === 'ov-badge-sec').length, 0);
  env.ev("RT_OPORTUNIDADES_GRUPO = 'rendimiento'; RT_OPORTUNIDADES_ESTADO = 'bien_vendido'");
  assert.match(celdaTexto(env, prod({ etiquetas_secundarias: ['bien_vendido', 'venta_destacada'], rendimiento: { nivel: 'destacado' } })).textContent, /También: Bien vendido/, 'destacado no repite "Bien vendido": se explica con el badge');
});

test('estado secundario: en un grupo sin chip se explican los estados secundarios del grupo y no se repiten las otras acciones', () => {
  const env = crearEntorno();
  env.ev("RT_OPORTUNIDADES_GRUPO = 'estancados'; RT_OPORTUNIDADES_ESTADO = null");
  const n = celdaTexto(env, prod({ etiquetas_secundarias: ['posible_descuento', 'stock_parado'] }));
  assert.deepEqual(n.buscar(x => x.className === 'ov-badge-sec').map(b => b.textContent), ['También: Posible descuento', 'También: Stock parado']);
  assert.doesNotMatch(n.textContent, /Otras acciones: Evaluar descuento/, 'ya está como badge');
});

test('filtros: aplicar sin filtros es válido (consulta todo); solo un valor realmente inválido muestra error y deja los filtros abiertos', () => {
  const env = crearEntorno();
  env.ev('function rtRenderVistaActual() {}; function rtCargarOportunidades() { cargas = (typeof cargas === "number" ? cargas : 0) + 1; }');
  assert.equal(env.ev("ovValidarFiltro({})"), null, 'sin filtros no es un error');
  assert.equal(env.ev("ovValidarFiltro({ rubro: ['ZAPAS'] })"), null);
  assert.equal(env.ev("ovValidarFiltro({ codigo: 'T0004' })"), null);
  assert.equal(env.ev("ovValidarFiltro({ codigo: '07698' })"), null);
  assert.match(env.ev("ovValidarFiltro({ codigo: 'X'.repeat(41) })"), /demasiado largo/);
  assert.match(env.ev("ovValidarFiltro({ codigo: 'AB\u0001C' })"), /no válidos/);
  env.ev("ovFiltroInvalido('Código inválido')");
  assert.equal(env.ev('OV_FILTROS_ABIERTO'), true);
  assert.equal(env.ev('OV_ERROR_FILTRO'), 'Código inválido');
  assert.equal(env.ev('typeof cargas'), 'undefined', 'no se consultó');
  env.ev('ovAlAplicarFiltro()');
  assert.equal(env.ev('OV_ERROR_FILTRO'), null);
  assert.equal(env.ev('OV_FILTROS_ABIERTO'), false);
  assert.equal(env.ev('cargas'), 1);
});

test('filtros plegables: el resumen lista los filtros activos', () => {
  const env = crearEntorno();
  assert.equal(env.ev('ovResumenFiltros()'), 'ninguno');
  env.ev("RT_FILTRO = { rubro: ['ZAPAS', 'BUZOS'], marca: ['VANS'] }");
  assert.equal(env.ev('ovResumenFiltros()'), 'Marca: VANS · Rubro: ZAPAS, BUZOS');
  env.ev("RT_FILTRO = { codigo: 'T0004' }");
  assert.equal(env.ev('ovResumenFiltros()'), 'Código: T0004');
});

test('notas de superposición: texto corto fijo y la explicación ampliada en una ayuda accesible', () => {
  const env = crearEntorno();
  const h = env.ev("(() => { const h = rtEl('div'); ovNotaConAyuda(h, 'Un producto puede aparecer en varios grupos.', 'detalle largo'); return h; })()");
  const nota = h.buscar(x => x.className === 'ov-nota')[0];
  assert.equal(nota.attrs.role, 'note');
  assert.match(nota.children[0].textContent, /^Un producto puede aparecer en varios grupos\. $/);
  const ayuda = nota.buscar(x => x.tagName === 'DETAILS')[0];
  assert.equal(ayuda.querySelector('summary').textContent, 'Más información');
  assert.equal(ayuda.open, false, 'cerrada por defecto');
  assert.match(ayuda.textContent, /detalle largo/);
});

test('ingreso de proveedor: última fecha y cantidad, "hace N días" al final del período; null = sin ingreso; API anterior = fecha sin cantidad', () => {
  const env = crearEntorno();
  const texto = o => env.ev(`ovTextoIngreso(${JSON.stringify(o)})`);
  assert.equal(texto({ ingreso_proveedor: { ultima_fecha: '2026-07-24T00:00:00.000Z', ultima_cantidad: 36, unidades_periodo: 0, dias_con_ingreso_periodo: 0 } }), 'Ingreso proveedor: 24/07/2026 · 36 u. (hace 98 días)');
  assert.equal(texto({ ingreso_proveedor: { ultima_fecha: '2026-10-29T00:00:00.000Z', ultima_cantidad: 3, unidades_periodo: 3, dias_con_ingreso_periodo: 1 } }), 'Ingreso proveedor: 29/10/2026 · 3 u. (hace 1 día)');
  assert.equal(texto({ ingreso_proveedor: null, Ultimo_ingreso: '2026-07-24T00:00:00.000Z' }), 'Sin ingreso de proveedor registrado', 'null del servidor: no se rellena con otro dato');
  assert.equal(texto({ Ultimo_ingreso: '2026-07-24T00:00:00.000Z', dias_desde_ultimo_ingreso: 101 }), 'Último ingreso: 24/07/2026 (hace 101 días)', 'API anterior: sin cantidad');
  assert.equal(texto({ Ultimo_ingreso: null }), 'Sin ingreso registrado');
  const celda = env.ev(`ovCeldaProducto({ Codigo_producto: '1', Nombre_producto: 'X', ingreso_proveedor: { ultima_fecha: '2026-07-24T00:00:00.000Z', ultima_cantidad: 24, unidades_periodo: 0, dias_con_ingreso_periodo: 0 } })`);
  const linea = celda.buscar(n => n.className.includes('ov-prod-ingreso'))[0];
  assert.match(linea.textContent, /24\/07\/2026 · 24 u\./);
  assert.match(linea.attrs.title, /Depósito 90.*No incluye Fallados 93, transferencias ni rotaciones/);
});

test('detalle de ingresos: último, lo ingresado en el período y aviso cuando las reglas usan otra fecha', () => {
  const env = crearEntorno();
  const bloque = (f, resp = { periodo: { hasta: '2026-10-30' } }) => env.ev(`ovBloqueIngresos(${JSON.stringify(f)}, ${JSON.stringify(resp)})`).textContent;
  const ip = { ultima_fecha: '2026-09-20T00:00:00.000Z', ultima_cantidad: 36, unidades_periodo: 60, dias_con_ingreso_periodo: 2 };
  const t = bloque({ ingreso_proveedor: ip, Ultimo_ingreso: '2026-09-20T00:00:00.000Z' });
  assert.match(t, /Último ingreso: 20\/09\/2026 · 36 unidades \(hace 40 días\)/);
  assert.match(t, /En el período: 60 unidades en 2 días con ingreso\./);
  assert.doesNotMatch(t, /reglas de antigüedad usan hoy otro dato/, 'misma fecha: sin aviso');
  assert.match(bloque({ ingreso_proveedor: ip, Ultimo_ingreso: '2026-10-05T00:00:00.000Z' }), /reglas de antigüedad usan hoy otro dato: último ingreso registrado el 05\/10\/2026 \(incluye Fallados 93 y cualquier talle\)/);
  assert.match(bloque({ ingreso_proveedor: { ...ip, unidades_periodo: 0, dias_con_ingreso_periodo: 0 } }), /En el período: sin ingresos de proveedor\./);
  assert.match(bloque({ ingreso_proveedor: { ...ip, dias_con_ingreso_periodo: 1, unidades_periodo: 36 } }), /36 unidades en 1 día con ingreso\./);
  assert.match(bloque({ ingreso_proveedor: null }), /Sin ingresos de proveedor al Depósito 90 hasta el final del período\./);
  assert.match(bloque({ Ultimo_ingreso: '2026-07-24T00:00:00.000Z', dias_desde_ultimo_ingreso: 101 }), /no indica cuántas unidades entraron/, 'API anterior');
});
