'use strict';
// Oportunidades: GRUPOS de estados y CONTADORES. Logica pura (sin DOM, sin fetch): agrupa los 11 estados que ya clasifica el motor
// de croma-api en seis grupos de lectura y decide que numero mostrar en cada tarjeta/chip. NO clasifica productos ni calcula
// reglas: solo ordena y suma conteos que entrega la API (resumen.por_regla_cumplida, resumen.total_clasificados y los totales de
// paginacion de consultas con varios estados).
//
// Semantica de pertenencia (la misma que ya usa el filtro `estado` de la API): un producto "cumple" un estado si es su estado
// principal O una etiqueta secundaria. Por eso un producto puede estar en mas de un estado y en mas de un grupo (ej. "Reposición
// próxima" + "Bien vendido"). Consecuencias:
//   - el contador de un estado (chip) = productos que cumplen ese estado -> coincide con el listado y la paginacion de ese chip;
//   - el contador de un grupo = productos UNICOS que cumplen alguno de sus estados (union, nunca suma de chips);
//   - "Todas" = productos con alguna oportunidad (total_clasificados) = union de los 11 estados;
//   - la suma de los grupos puede superar a "Todas": no se presenta como total.

// Orden = PRIORIDAD_ORDEN de croma-api/config/oportunidades.js (urgencia descendente).
const OG_ESTADOS = [
  'revisar_devoluciones', 'reposicion_urgente', 'reponer_desde_deposito', 'reposicion_a_evaluar', 'posible_rotacion',
  'reposicion_proxima', 'venta_destacada', 'bien_vendido', 'seguimiento', 'posible_descuento', 'stock_parado',
];

const OG_GRUPOS = [
  { id: 'todas', etiqueta: 'Todas', ayuda: 'Productos con alguna oportunidad detectada (sin duplicados).', estados: OG_ESTADOS },
  { id: 'reposicion', etiqueta: 'Reposición', ayuda: 'Productos que conviene reponer o evaluar para reponer.', estados: ['reposicion_urgente', 'reponer_desde_deposito', 'reposicion_proxima', 'reposicion_a_evaluar'] },
  { id: 'rotaciones', etiqueta: 'Rotaciones', ayuda: 'Señales de mover stock entre sucursales (a validar por talle y color).', estados: ['posible_rotacion'] },
  { id: 'rendimiento', etiqueta: 'Rendimiento', ayuda: 'Productos que venden bien o ingresaron hace poco.', estados: ['venta_destacada', 'bien_vendido', 'seguimiento'] },
  { id: 'estancados', etiqueta: 'Estancados', ayuda: 'Stock parado o candidato a descuento.', estados: ['stock_parado', 'posible_descuento'] },
  { id: 'revisar_datos', etiqueta: 'Revisar datos', ayuda: 'Productos con más devoluciones que ventas.', estados: ['revisar_devoluciones'] },
];

function ogGrupo(id) { return OG_GRUPOS.find(g => g.id === id) || OG_GRUPOS[0]; }
function ogEstadosDelGrupo(id) { return ogGrupo(id).estados.slice(); }
// Grupo "propio" de un estado (el que no es "Todas"). Todos los estados pertenecen a exactamente uno.
function ogGrupoDeEstado(estado) { const g = OG_GRUPOS.find(x => x.id !== 'todas' && x.estados.includes(estado)); return g ? g.id : null; }
// Un grupo de varios estados necesita una consulta propia para contar productos unicos (la API no lo trae en el resumen).
function ogNecesitaUnion(id) { return id !== 'todas' && ogGrupo(id).estados.length > 1; }
function ogGruposConUnion() { return OG_GRUPOS.filter(g => ogNecesitaUnion(g.id)).map(g => g.id); }

// Valor del parametro `estado` de la API: un estado (chip) o la lista de estados del grupo ("Todas" = los 11, que excluye los
// productos sin ninguna oportunidad, igual que el contador).
function ogParametroEstado(grupoId, estado) {
  if (estado && ogGrupo(grupoId).estados.includes(estado)) return estado;
  return ogEstadosDelGrupo(grupoId).join(',');
}

const ogNum = v => (typeof v === 'number' && isFinite(v) ? v : null);

// Una union exacta esta entre el mayor de sus estados y min(suma de sus estados, total con oportunidad). Fuera de ese rango el
// numero es inconsistente (tipicamente: un servidor que todavia no acepta varios estados devuelve 0): no se muestra.
function ogUnionValida(valor, conteosEstados, totalClasificados) {
  const v = ogNum(valor);
  if (v === null || !conteosEstados.length || conteosEstados.some(c => ogNum(c) === null)) return false;
  const piso = Math.max(...conteosEstados);
  const techo = Math.min(conteosEstados.reduce((a, b) => a + b, 0), ogNum(totalClasificados) === null ? Infinity : totalClasificados);
  return v >= piso && v <= techo;
}

// Contadores para pintar tarjetas y chips. null = no disponible (se muestra "—", NUNCA 0).
//   resumen: respuesta.resumen de /analisis/oportunidades (respeta periodo, sucursales y filtros de catalogo).
//   uniones: { reposicion: n, ... } totales de las consultas con varios estados (o null/{} si todavia no llegaron).
function ogConteos(resumen, uniones) {
  const r = resumen || {};
  const porRegla = r.por_regla_cumplida || {};
  const total = ogNum(r.total_clasificados);
  const estados = {};
  OG_ESTADOS.forEach(e => { estados[e] = ogNum(porRegla[e]); });
  const grupos = {};
  OG_GRUPOS.forEach(g => {
    if (g.id === 'todas') { grupos.todas = total; return; }
    const cs = g.estados.map(e => estados[e]);
    if (g.estados.length === 1) { grupos[g.id] = cs[0]; return; }
    const u = uniones ? uniones[g.id] : null;
    grupos[g.id] = ogUnionValida(u, cs, total) ? u : null;
  });
  const conocidos = OG_GRUPOS.filter(g => g.id !== 'todas').map(g => grupos[g.id]);
  const suma = conocidos.every(v => v !== null) ? conocidos.reduce((a, b) => a + b, 0) : null;
  return { total, grupos, estados, sumaGrupos: suma, gruposSeSuperponen: suma !== null && total !== null && suma > total };
}

// Suma de los chips de un grupo (solo para avisar cuando supera al contador unico del grupo).
function ogChipsSeSuperponen(grupoId, conteos) {
  const g = ogGrupo(grupoId);
  const cs = g.estados.map(e => conteos.estados[e]);
  if (cs.some(c => c === null) || conteos.grupos[g.id] === null || g.estados.length < 2) return false;
  return cs.reduce((a, b) => a + b, 0) > conteos.grupos[g.id];
}

// Total esperado de la lista segun la seleccion (para comparar con la paginacion del servidor). null si no se conoce.
function ogTotalEsperado(grupoId, estado, conteos) {
  if (estado && ogGrupo(grupoId).estados.includes(estado)) return conteos.estados[estado];
  return conteos.grupos[grupoId];
}

// Paginas a mostrar en la botonera: siempre la primera, la ultima, la actual y una vecina a cada lado, con "…" en los huecos.
function ogPaginasVisibles(actual, total) {
  const set = new Set([1, total, actual - 1, actual, actual + 1].filter(p => p >= 1 && p <= total));
  const orden = [...set].sort((a, b) => a - b);
  const salida = [];
  orden.forEach((p, i) => { if (i && p - orden[i - 1] > 1) salida.push('…'); salida.push(p); });
  return salida;
}
