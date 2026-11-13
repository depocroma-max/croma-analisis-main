'use strict';
// Oportunidades · RENDIMIENTO DESDE EL INGRESO (etapa I2 del §23 del plan de croma-api) y DEMANDA RECIENTE DE LA SELECCION.
// Script clasico que se carga despues del principal (index.html) y usa sus helpers (rtEl, STOCK_API_URL, RT_CENTRO_NOMBRE via
// rrSucursalTexto). Solo PRESENTA lo que ya resolvio croma-api (estado, motivo, lectura, sin_conclusion, snapshot): aca no se calculan
// niveles, umbrales, vigencias ni etiquetas. Es INFORMATIVO: no cambia estados, filtros, contadores, prioridades ni etiquetas vigentes
// (las etiquetas candidatas se muestran como "sin activar"). Todo texto que viene de la API se inserta con textContent (nunca innerHTML).
// Compatibilidad: con la API publicada (sin la etapa I1) la respuesta no trae `rendimiento_ingreso` ni `demanda_reciente_seleccion` y
// estos bloques no se muestran. `demanda_reciente` (el booleano previo del motor) se sigue mostrando donde estaba, sin tocarlo.

const RI_PCT = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 0 });
const RI_PCT1 = new Intl.NumberFormat('es-AR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const RI_NUM = new Intl.NumberFormat('es-AR');
const RI_PP = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RI_CLASE_NIVEL = { destacado: 'ri-b-buen', bueno: 'ri-b-buen', normal: 'ri-b-normal', lento: 'ri-b-lento' };
const RI_TEXTO_NIVEL = { destacado: 'Buen rendimiento del ingreso · destacado', bueno: 'Buen rendimiento del ingreso', normal: 'Rendimiento normal del ingreso', lento: 'Salida lenta del ingreso' };
const RI_NIVEL_CORTO = { destacado: 'destacado', bueno: 'buen rendimiento', normal: 'rendimiento normal', lento: 'salida lenta', fuera_de_rango: 'fuera de rango' };
const RI_UMBRAL = { p25: 'límite de rendimiento normal', p50: 'límite de buen rendimiento', p75: 'límite de destacado' };
const RI_ETIQUETA = { buen_rendimiento_ingreso: 'Buen rendimiento del ingreso', salida_lenta_ingreso: 'Salida lenta del ingreso' };
const RI_DEMANDA_CADENA = { sostenida: 'Demanda sostenida', ritmo_reciente_bajo: 'Ritmo reciente bajo', poca_evidencia_reciente: 'Poca evidencia reciente' };
const RI_DESTINOS = [
  ['vendidas', 'Vendidas', 'd-vendidas'], ['stock_al_fin', 'En stock al fin', 'd-stock'], ['en_transito', 'En tránsito', 'd-transito'],
  ['fallados', 'Fallados', 'd-fallados'], ['mermas_y_bajas', 'Mermas y bajas', 'd-mermas'], ['devueltas_al_proveedor', 'Devueltas al proveedor', 'd-devueltas'],
  ['salidas_de_causa_desconocida', 'Salida de causa desconocida', 'd-desconocida'], ['sin_explicar', 'Sin explicar', 'd-sinexp'],
];
const RI_FUERA = {
  trasladadas_a_cipo: 'trasladadas a Cipo', recibidas_de_cipo: 'recibidas de Cipo', trasladadas_a_otros_alcances: 'trasladadas a otros alcances',
  rechazadas_al_proveedor: 'rechazadas al proveedor (verificado)', corregidas_en_recepcion: 'corregidas en la recepción (verificado)', vendidas_en_deposito: 'vendidas en depósito',
};
// Motivo ESPECIFICO cuando el codigo no tiene conclusion (motor/rendimiento-ingreso.js, evaluarRendimiento y lecturaDe).
const RI_SIN_CONCLUSION = {
  historial_no_confiable: 'El historial de movimientos del código no es confiable para reconstruir el ingreso.',
  deposito_previo_desconocido: 'No se pudo determinar el stock que había en el Depósito 90 antes del ingreso.',
  base_no_positiva: 'No quedan unidades disponibles para la venta en la ventana (la base es cero o negativa).',
  balance_inconsistente: 'Las entradas y salidas del código no cierran: hay unidades sin explicar por encima de la tolerancia.',
  porcentaje_fuera_de_rango: 'El porcentaje vendido sale fuera del rango interpretable (más ventas que unidades disponibles).',
  ventana_minima_incompleta: 'El ingreso es reciente: todavía no se completó la ventana mínima de 30 días.',
  exposicion_insuficiente: 'Hubo pocas ventas y el producto estuvo poco tiempo con stock en la ventana.',
  disponibilidad_limitada: 'Hubo pocas ventas y faltaron talles o colores durante buena parte de la ventana.',
  ventas_insuficientes_en_ventana: 'Hay pocas ventas en la ventana: con esa muestra solo se puede concluir salida lenta, y no es el caso.',
  sin_referencia: 'No hay códigos comparables suficientes para armar la referencia.',
  sin_ingreso_registrado: 'No hay un ingreso de proveedor registrado para este código.',
  codigo_sin_fila_en_snapshot: 'El código no figura en el cálculo publicado.',
  sin_conclusion: 'El cálculo no llegó a una conclusión para este código.',
};
const RI_INCOMPATIBLE = {
  version_distinta: 'El cálculo publicado es de otra versión del método.',
  configuracion_de_calculo_distinta: 'El cálculo publicado se hizo con otra configuración del método.',
  huella_calculo_ilegible: 'No se pudo verificar con qué configuración se hizo el cálculo publicado.',
  sin_ejecucion_por_fila: 'El cálculo publicado no permite verificar que todas sus filas sean de la misma ejecución.',
  corte_posterior_a_hoy: 'La fecha de corte del cálculo publicado es posterior a hoy.',
};

// ── Formato ──────────────────────────────────────────────────────────────────────────────────────
const riDias = n => RI_NUM.format(n) + (n === 1 ? ' día' : ' días');
const riFecha = s => (s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : '—');
function riFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) + ' ' + d.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false });
}
// Nombre corto de la sucursal (catalogo RT_CENTRO_NOMBRE del script principal); sin nombre, el codigo.
const riSucursal = c => (typeof RT_CENTRO_NOMBRE !== 'undefined' && RT_CENTRO_NOMBRE[c]) || String(c);
const riListaSucursales = l => (l || []).map(riSucursal).join(', ');
const riPp = pp => (pp > 0 ? '+' : pp < 0 ? '−' : '') + RI_PP.format(Math.abs(pp)) + ' pp';
const riVersionCorta = v => String(v || '').split('-')[0];

function riE(tag, opts, hijos) {
  const e = rtEl(tag, opts);
  (hijos || []).forEach(h => { if (h !== null && h !== undefined && h !== false) e.appendChild(typeof h === 'string' ? document.createTextNode(h) : h); });
  return e;
}

// ── Estado visible (puro: sin DOM) ──────────────────────────────────────────────────────────────
// Devuelve que mostrar para un producto. tipo: 'omitir' | 'lectura' | 'sin_evidencia' | 'explicacion' | 'seleccion_parcial'.
function riVista(f, resp) {
  const top = resp && resp.rendimiento_ingreso;
  const ri = f && f.rendimiento_ingreso;
  if (!top) {
    // API publicada (sin I1): no hay ninguno de los dos campos nuevos -> no se muestra nada.
    if (!f || !f.demanda_reciente_seleccion) return { tipo: 'omitir' };
    return { tipo: 'explicacion', estado: 'no_configurado', badge: 'No disponible', titulo: 'El rendimiento desde el ingreso no está disponible en este servidor.', texto: 'Todavía no hay un cálculo configurado. Las reglas y etiquetas de Oportunidades no cambian.' };
  }
  const estado = (ri && ri.estado) || top.estado;
  const motivo = (ri && ri.motivo) || top.motivo;
  const snap = top.snapshot || null;
  const consulta = top.consulta || {};
  switch (estado) {
    case 'disponible':
    case 'informativo_atrasado': {
      const atrasado = estado === 'informativo_atrasado';
      if (ri && ri.lectura) return { tipo: 'lectura', estado, atrasado, lectura: ri.lectura, etiquetas: atrasado ? [] : (ri.etiquetas_candidatas || []) };
      const sc = (ri && ri.sin_conclusion) || { tipo: 'datos', motivo: 'codigo_sin_fila_en_snapshot' };
      return { tipo: 'sin_evidencia', estado, atrasado, sin_conclusion: sc, texto: RI_SIN_CONCLUSION[sc.motivo] || RI_SIN_CONCLUSION.sin_conclusion };
    }
    case 'seleccion_parcial':
      return { tipo: 'seleccion_parcial', estado, seleccion: consulta.sucursales || [], cadena: snap ? snap.sucursales : [], ejecucion: snap ? snap.ejecucion : null, desde: consulta.desde || null, hasta: consulta.hasta || null,
        vigencia: snap && snap.vigencia ? { estado: snap.vigencia.estado || null, dias_desde_corte: snap.vigencia.dias_desde_corte ?? null } : null };
    case 'consulta_historica':
      return { tipo: 'explicacion', estado, badge: 'No disponible para este período', titulo: 'El período consultado termina el ' + riFecha(consulta.hasta) + ', antes del corte del cálculo (' + riFecha(snap && snap.corte) + ').',
        texto: 'El rendimiento usa ventas posteriores al período elegido, así que no se muestra. Elegí un período que termine el ' + riFecha(snap && snap.corte) + ' o después para verlo.' };
    case 'vencido':
      return { tipo: 'explicacion', estado, badge: 'Sin datos vigentes', titulo: 'El último cálculo es del ' + riFecha(snap && snap.corte) + (snap && snap.vigencia ? ' (hace ' + riDias(snap.vigencia.dias_desde_corte) + ').' : '.'),
        texto: 'Pasaron más de ' + RI_NUM.format(snap && snap.vigencia ? snap.vigencia.maximo_informativo_dias : 7) + ' días desde el corte, así que no se muestran valores hasta que haya un cálculo nuevo.' };
    case 'snapshot_incompatible': {
      const m = String(motivo || '');
      const faltan = m.startsWith('faltan_metadatos:') ? m.slice('faltan_metadatos:'.length).split(',') : null;
      const titulo = faltan ? (faltan.length === 1 && faltan[0] === 'huella_calculo' ? 'El cálculo publicado no indica con qué configuración se hizo (es anterior a la verificación de compatibilidad).' : 'Al cálculo publicado le faltan datos de identificación.')
        : (RI_INCOMPATIBLE[m] || 'El cálculo publicado no es compatible con esta versión.');
      return { tipo: 'explicacion', estado, badge: 'Cálculo no compatible', titulo, texto: 'No se muestran valores hasta que se publique un cálculo compatible.' };
    }
    case 'snapshot_inconsistente':
      return { tipo: 'explicacion', estado, badge: 'Cálculo en actualización', titulo: 'Los datos de este código son de otra ejecución del cálculo.', texto: 'Puede pasar mientras se publica un cálculo nuevo. No se muestran valores; probá de nuevo en unos minutos.' };
    case 'sin_snapshot':
      if (motivo === 'lectura_fallida') return { tipo: 'explicacion', estado, badge: 'No disponible', titulo: 'No se pudo leer el cálculo de rendimiento.', texto: 'Es un problema de lectura del servidor, no del producto. Las reglas de Oportunidades no cambian.' };
      return { tipo: 'explicacion', estado, badge: 'No disponible', titulo: 'Todavía no hay un cálculo de rendimiento publicado.', texto: 'Las reglas y etiquetas de Oportunidades no cambian.' };
    default:
      return { tipo: 'explicacion', estado: estado || 'desconocido', badge: 'No disponible', titulo: 'El rendimiento desde el ingreso no está disponible.', texto: 'Estado informado por el servidor: ' + (estado || 'sin estado') + '.' };
  }
}

// ── Piezas visuales (prototipo aprobado del §23) ────────────────────────────────────────────────
function riEscala(l, atenuar) {
  const r = l.referencia || {};
  const cap = v => Math.max(0, Math.min(1, v)) * 100 + '%';
  const caja = riE('div', { className: 'ri-escala' + (atenuar ? ' ri-atenuado' : ''), attrs: { role: 'img', 'aria-label': 'Vendido ' + RI_PCT.format(l.valor) + '; referencia p25 ' + RI_PCT.format(r.p25) + ', p50 ' + RI_PCT.format(r.p50) + ', p75 ' + RI_PCT.format(r.p75) } });
  caja.style.setProperty('--p25', cap(r.p25)); caja.style.setProperty('--p50', cap(r.p50));
  caja.appendChild(riE('div', { className: 'ri-pista' }));
  [['p25', r.p25], ['p50', r.p50], ['p75', r.p75]].forEach(([k, v]) => {
    if (v === null || v === undefined) return;
    // En pantallas chicas el valor se oculta (las marcas cercanas se pisarian) y queda en la linea de referencia.
    const m = riE('div', { className: 'ri-marca' + (k === 'p50' ? ' ri-marca-arriba' : '') }, [riE('span', { text: k }, [riE('span', { className: 'ri-marca-v', text: ' ' + RI_PCT.format(v) })])]);
    m.style.left = cap(v);
    caja.appendChild(m);
  });
  const p = riE('div', { className: 'ri-punto' }); p.style.left = cap(l.valor); caja.appendChild(p);
  return caja;
}
function riDestinos(d, total, atenuar) {
  const nodos = [];
  const barra = riE('div', { className: 'ri-barra' + (atenuar ? ' ri-atenuado' : ''), attrs: { 'aria-hidden': 'true' } });
  const ley = riE('div', { className: 'ri-leyenda' });
  RI_DESTINOS.forEach(([k, t, c]) => {
    const v = d[k] || 0;
    if (!v) return;
    const s = riE('div', { className: 'ri-seg ' + c }); s.style.width = Math.min(100, Math.abs(v) / (total || 1) * 100) + '%'; barra.appendChild(s);
    ley.appendChild(riE('span', { className: 'ri-ley' }, [riE('i', { className: c, attrs: { 'aria-hidden': 'true' } }), t + ' ', riE('b', { text: RI_NUM.format(v) })]));
  });
  nodos.push(barra, ley);
  const fuera = Object.keys(d.fuera_del_denominador || {}).filter(k => d.fuera_del_denominador[k] && RI_FUERA[k]).map(k => RI_NUM.format(d.fuera_del_denominador[k]) + ' ' + RI_FUERA[k]);
  if (fuera.length) nodos.push(riE('div', { className: 'ri-chico', text: 'Fuera del denominador: ' + fuera.join(' · ') }));
  return nodos;
}
function riCausaDesconocida(s) {
  if (!s || !s.unidades) return null;
  const texto = 'Se cuentan como no vendidas. ' + (s.cambia_nivel
    ? 'Si se confirmara que nunca estuvieron a la venta, el nivel sería ' + (RI_NIVEL_CORTO[s.nivel_si_se_reduce] || s.nivel_si_se_reduce || '—') + ' (' + RI_PCT.format(s.valor_si_se_reduce) + ').'
    : 'Aunque se confirmara que nunca estuvieron a la venta, el nivel no cambiaría.')
    + (s.habilitaria_etiqueta_positiva ? ' Hasta confirmarlo no habilita una etiqueta positiva.' : '');
  return riE('div', { className: 'ri-caja ri-caja-aviso' }, [riE('b', { text: RI_NUM.format(s.unidades) + ' u. salieron del depósito por causa desconocida' }), riE('span', { text: texto })]);
}
function riLectura(l, { atenuar = false } = {}) {
  const box = riE('div', { className: 'ri-grid' });
  const izq = riE('div', { className: 'ri-col' }), der = riE('div', { className: 'ri-col' });
  izq.appendChild(riE('div', { className: 'ri-cifra' }, [riE('span', { className: 'ri-pct', text: RI_PCT.format(l.valor) }),
    riE('span', { className: 'ri-frase', text: RI_NUM.format(l.ventas) + ' de ' + RI_NUM.format(l.denominador_comercial) + ' unidades vendidas en ' + l.ventana.dias + ' días' })]));
  const ing = l.ingreso;
  izq.appendChild(riE('div', { className: 'ri-chico' }, ['Ventana: ', riE('b', { text: riFecha(l.ventana.desde) + ' → ' + riFecha(l.ventana.hasta) }),
    ing ? ' · Ingreso: ' + RI_NUM.format(ing.unidades) + ' u. facturadas el ' + riFecha(ing.fecha_factura) + (ing.fecha_ingreso_fisico && ing.fecha_ingreso_fisico !== ing.fecha_factura ? ' (llegaron el ' + riFecha(ing.fecha_ingreso_fisico) + ')' : '') : null]));
  izq.appendChild(riE('div', { className: 'ri-chico', text: 'Denominador comercial: unidades que estuvieron disponibles para la venta desde el ingreso. Es una ventana propia del código, distinta del período de Oportunidades.' }));
  izq.appendChild(riEscala(l, atenuar));
  const ref = l.referencia || {};
  izq.appendChild(riE('div', { className: 'ri-chico' }, ['Referencia: ', riE('b', { text: ref.fuente === 'rubro' ? 'rubro ' + ref.rubro : 'global (el rubro tiene poca muestra)' }),
    ' · p25 ' + RI_PCT.format(ref.p25) + ' · p50 ' + RI_PCT.format(ref.p50) + ' · p75 ' + RI_PCT.format(ref.p75) + ' · muestra de ' + RI_NUM.format(ref.muestra || 0) + ' códigos con la misma ventana']));
  const c = l.cercania;
  if (c) izq.appendChild(riE('div', { className: 'ri-chico' }, [riE('b', { text: c.cerca ? 'Cerca del umbral: ' : 'Umbral más cercano: ' }),
    RI_PCT1.format(l.valor) + ' frente a ' + RI_PCT1.format(c.valor_umbral) + ' (' + c.umbral + ', ' + RI_UMBRAL[c.umbral] + '), ' + riPp(c.diferencia_pp) + '.'
    + (c.cerca ? ' Está a ' + RI_NUM.format(c.margen_pp) + ' pp o menos: un cambio chico de ventas puede cambiar el nivel.' : '')]));
  der.appendChild(riE('div', { className: 'ri-et', text: 'Destino de las unidades disponibles' }));
  riDestinos(l.destinos || {}, l.denominador_comercial, atenuar).forEach(n => der.appendChild(n));
  const ex = l.exposicion;
  if (ex) der.appendChild(riE('div', { className: 'ri-chico', text: 'Exposición: ' + RI_NUM.format(ex.dias_con_stock) + ' de ' + RI_NUM.format(ex.dias) + ' días con stock' + (ex.disponibilidad_variantes !== null && ex.disponibilidad_variantes !== undefined ? ' · ' + RI_PCT.format(ex.disponibilidad_variantes) + ' de las variantes disponibles en promedio' : '') }));
  const cd = riCausaDesconocida(l.salidas_causa_desconocida);
  if (cd) der.appendChild(cd);
  box.appendChild(izq); box.appendChild(der);
  return box;
}
function riCabecera(badgeTexto, badgeClase, pills) {
  const cab = riE('div', { className: 'ri-cab' }, [riE('span', { className: 'ri-et', text: 'Rendimiento desde el ingreso' }), riE('span', { className: 'ri-badge ' + badgeClase, text: badgeTexto })]);
  (pills || []).forEach(p => cab.appendChild(riE('span', { className: 'ri-pill' + (p.aviso ? ' ri-pill-aviso' : ''), text: p.texto })));
  return cab;
}
function riPillsLectura(l, etiquetas) {
  const p = [];
  if (l.cercania && l.cercania.cerca) p.push({ texto: 'Cerca del umbral' });
  if (l.pocas_ventas) p.push({ texto: 'Pocas ventas: solo se concluye salida lenta' });
  (etiquetas || []).forEach(e => p.push({ texto: 'Etiqueta candidata, sin activar: ' + (RI_ETIQUETA[e] || e) }));
  return p;
}
function riAvisoAtrasado(snap) {
  const v = snap && snap.vigencia;
  return riE('div', { className: 'ri-caja ri-caja-aviso', attrs: { role: 'note' } }, [riE('b', { text: 'Datos al ' + riFecha(snap && snap.corte) + (v ? ' (hace ' + riDias(v.dias_desde_corte) + ').' : '.') }),
    riE('span', { text: 'El cálculo diario no se actualizó. Se muestran como referencia y no proponen etiquetas hasta que haya un corte de los últimos ' + RI_NUM.format(v ? v.maximo_elegible_dias : 2) + ' días.' })]);
}
// Pie: corte, fecha de calculo, version y alcance visibles; la ejecucion y la vigencia en "Información de los datos".
function riPie(snap, ambitoTexto) {
  const pie = riE('div', { className: 'ri-pie' });
  if (!snap) { pie.appendChild(riE('span', { text: 'Sin cálculo publicado identificable.' })); return pie; }
  pie.appendChild(riE('span', { text: 'Corte ' + riFecha(snap.corte) }));
  pie.appendChild(riE('span', { text: 'Calculado ' + riFechaHora(snap.calculado_en) }));
  pie.appendChild(riE('span', { text: 'Versión ' + riVersionCorta(snap.version) }));
  pie.appendChild(riE('span', { text: 'Alcance del cálculo: ' + (ambitoTexto || ((snap.sucursales || []).length + ' sucursales operativas + Depósito 90')) }));
  const det = riE('details', { className: 'ri-mas' });
  det.appendChild(riE('summary', { text: 'Información de los datos' }));
  const v = snap.vigencia;
  det.appendChild(riE('div', { className: 'ri-mas-cuerpo' }, [
    riE('span', { text: 'Ejecución: ' + (snap.ejecucion || '—') }),
    riE('span', { text: 'Versión completa: ' + (snap.version || '—') }),
    riE('span', { text: 'Sucursales del cálculo: ' + riListaSucursales(snap.sucursales) + ' + Depósito 90' }),
    v ? riE('span', { text: 'Vigencia: ' + riDias(v.dias_desde_corte) + ' desde el corte (propone etiquetas hasta ' + RI_NUM.format(v.maximo_elegible_dias) + ' días; informativo hasta ' + RI_NUM.format(v.maximo_informativo_dias) + ')' }) : null,
  ]));
  pie.appendChild(det);
  return pie;
}
function riSinEvidencia(sc, texto) {
  return riE('div', { className: 'ri-caja ri-caja-neutra' }, [riE('b', { text: (sc.tipo === 'calidad_datos' ? 'Calidad de datos: ' : sc.tipo === 'comercial' ? 'Evidencia comercial: ' : 'Datos: ') + texto }),
    riE('span', { text: 'No se clasifica ni se compara con la referencia hasta resolver el dato.' })]);
}

// ── Lectura de CADENA bajo pedido (seleccion parcial) ───────────────────────────────────────────
// El estado vive a nivel de modulo, por CONTEXTO: producto + ejecucion del snapshot + periodo + sucursales de la consulta. Asi:
//   - el detalle se puede reconstruir (llega la tendencia de 7 dias, se cierra y se reabre) sin perder ni repetir la consulta;
//   - una respuesta TARDIA solo se guarda y se dibuja en su propio contexto: si mientras tanto se abrio otro producto o cambiaron las
//     sucursales o el periodo, no aparece en ningun lado (el contexto nuevo empieza cerrado y sin datos);
//   - cada pedido lleva un numero; si el contexto se descarto o se volvio a pedir, la respuesta vieja se ignora.
// La vista arma el detalle DOS veces (fila de la tabla y tarjeta para pantallas chicas, una oculta por CSS): todas las copias de un
// contexto comparten el estado y UNA sola solicitud; se dibuja en las que siguen en el documento.
const RI_CADENA = new Map(); // clave -> { abierto, estado: null|'cargando'|'ok'|'error', datos, error, reintentable, pedido }
const RI_ZONAS = new Map();  // clave -> [{ boton, zona, vivo, alerta, n, codigo, v, anuncio }]
let RI_ZONA_SEQ = 0, RI_PEDIDO_SEQ = 0;
let RI_CADENA_FOCO = null;   // clave cuyo control de cadena tenia el foco (se restaura si el detalle se reconstruye)

// Contexto de VIGENCIA tal como lo informa la API (ejecucion + estado + edad en dias): no se recalcula aca. El mismo snapshot con otra edad
// (p. ej. vigente a 1 dia -> atrasado a 3) es otro contexto: la respuesta guardada no se reutiliza y la nueva consulta vuelve a ser explicita.
function riContextoVigencia(snap) {
  if (!snap) return '';
  const vg = snap.vigencia || {};
  return [snap.ejecucion || '', vg.estado || '', vg.dias_desde_corte ?? ''].join('/');
}
function riDescribirVigencia(snap) {
  const vg = (snap && snap.vigencia) || {};
  return 'ejecución ' + ((snap && snap.ejecucion) || '—') + (vg.estado ? ', ' + vg.estado : '') + (vg.dias_desde_corte !== undefined && vg.dias_desde_corte !== null ? ', ' + riDias(vg.dias_desde_corte) + ' desde el corte' : '');
}
function riClaveCadena(codigo, v) { return [codigo, riContextoVigencia({ ejecucion: v.ejecucion, vigencia: v.vigencia }), v.desde || '', v.hasta || '', (v.seleccion || []).join(',')].join('|'); }
function riTextoBotonCadena(abierto, n) { return abierto ? 'Ocultar el rendimiento de la cadena' : 'Ver el rendimiento de la cadena (' + n + ' sucursales operativas)'; }
function riRegsVigentes(clave) {
  const regs = (RI_ZONAS.get(clave) || []).filter(r => r.boton.isConnected !== false);
  RI_ZONAS.set(clave, regs);
  return regs;
}
const riVisible = el => el.offsetParent !== null; // la copia oculta por CSS (display:none) no tiene offsetParent

// Mueve el foco al boton de la copia VISIBLE del contexto (al reintentar, o si el detalle se reconstruyo y el foco quedo en el body).
function riEnfocarBoton(clave) {
  const reg = riRegsVigentes(clave).find(r => riVisible(r.boton));
  if (reg && typeof reg.boton.focus === 'function') reg.boton.focus();
}
if (typeof document !== 'undefined' && document.addEventListener) {
  // Si el foco se va a otro control ya no hay que restaurarlo. (Quitar del documento el elemento enfocado no dispara focusin.)
  document.addEventListener('focusin', e => {
    const t = e.target;
    if (!(t && t.getAttribute && t.getAttribute('data-ri-clave') === RI_CADENA_FOCO)) RI_CADENA_FOCO = null;
  });
}

async function riConsultarCadena(clave, codigo, v) {
  const st = RI_CADENA.get(clave) || {};
  if (st.estado === 'cargando') { RI_CADENA.set(clave, { ...st, abierto: true }); riDibujarCadena(clave); return; } // ya hay un pedido: no se duplica
  const pedido = ++RI_PEDIDO_SEQ;
  RI_CADENA.set(clave, { abierto: true, estado: 'cargando', datos: null, error: null, reintentable: false, pedido });
  riDibujarCadena(clave);
  let nuevo;
  try {
    const r = await fetch(STOCK_API_URL + '/analisis/rendimiento-ingreso/' + encodeURIComponent(codigo));
    let body = null;
    try { body = await r.json(); } catch (_) { body = null; }
    const contextoLista = riContextoVigencia({ ejecucion: v && v.ejecucion, vigencia: v && v.vigencia });
    if (r.ok && body && body.ok && String(body.codigo) !== String(codigo)) nuevo = { estado: 'error', error: 'La respuesta no corresponde a este producto.', reintentable: true };
    // La cadena llega con otra ejecucion o vigencia que la lista (se publico otro calculo o cambio el dia): no se muestra, para no tener dos
    // pies de vigencia contradictorios. Hay que actualizar la lista; despues la consulta vuelve a ser explicita.
    else if (r.ok && body && body.ok && riContextoVigencia(body.snapshot) !== contextoLista) nuevo = { estado: 'error', desfasada: true, error: 'El cálculo cambió desde que se cargó la lista (' + riDescribirVigencia(body.snapshot) + '; la lista: ' + riDescribirVigencia({ ejecucion: v && v.ejecucion, vigencia: v && v.vigencia }) + '). Actualizá Oportunidades para ver la cadena con el mismo cálculo.' };
    else if (r.ok && body && body.ok) nuevo = { estado: 'ok', datos: body };
    else if (r.status === 404 && body && body.codigo === 'rendimiento_no_configurado') nuevo = { estado: 'error', error: 'El rendimiento de la cadena no está disponible en este servidor.' };
    else if (r.status === 404) nuevo = { estado: 'error', error: 'Este servidor todavía no ofrece la consulta de cadena.' };
    else nuevo = { estado: 'error', error: 'No se pudo consultar el rendimiento de la cadena (error ' + r.status + ').', reintentable: true };
  } catch (e) {
    nuevo = { estado: 'error', error: 'No se pudo conectar para consultar el rendimiento de la cadena.', reintentable: true };
  }
  const actual = RI_CADENA.get(clave);
  if (!actual || actual.pedido !== pedido) return; // contexto descartado o pedido reemplazado: la respuesta tardia se ignora
  RI_CADENA.set(clave, { ...actual, ...nuevo }); // conserva "abierto" como lo dejo el usuario (si cerro mientras cargaba, queda guardada y cerrada)
  riDibujarCadena(clave);
}

function riContenidoCadena(clave, codigo, st, v) {
  const zona = riE('div', { className: 'ri-cadena-zona' });
  if (st.estado === 'cargando') { zona.appendChild(riE('div', { className: 'ri-chico', text: 'Consultando el rendimiento de la cadena…' })); return zona; }
  if (st.estado === 'error') {
    const caja = riE('div', { className: 'ri-caja ri-caja-neutra' }, [riE('span', { text: st.error })]);
    if (st.reintentable) {
      const b = riE('button', { className: 'ri-boton', text: 'Reintentar', attrs: { 'data-ri-clave': clave } }); b.type = 'button';
      // Reintentar desaparece al redibujar: antes, el foco pasa al boton de la cadena de la copia visible.
      b.addEventListener('click', e => { e.stopPropagation(); RI_CADENA_FOCO = clave; riEnfocarBoton(clave); riConsultarCadena(clave, codigo, v); });
      caja.appendChild(b);
    }
    zona.appendChild(caja);
    return zona;
  }
  const c = st.datos;
  const suc = (c.ambito && c.ambito.sucursales) || (c.snapshot && c.snapshot.sucursales) || [];
  const caja = riE('div', { className: 'ri-cadena', attrs: { role: 'region', 'aria-label': 'Rendimiento de la cadena, no corresponde a tu selección' } });
  const l = c.lectura;
  const atrasado = c.estado === 'informativo_atrasado';
  const badge = l ? [l.texto || RI_TEXTO_NIVEL[l.nivel] || l.nivel, RI_CLASE_NIVEL[l.nivel] || 'ri-b-normal'] : (c.sin_conclusion ? ['Sin evidencia suficiente', 'ri-b-sin'] : ['Sin datos vigentes', 'ri-b-sin']);
  caja.appendChild(riE('div', { className: 'ri-cab' }, [riE('span', { className: 'ri-pill ri-pill-aviso', text: 'Cadena · ' + suc.length + ' sucursales operativas · no corresponde a tu selección' }),
    riE('span', { className: 'ri-badge ' + badge[1], text: badge[0] }), l && l.cercania && l.cercania.cerca ? riE('span', { className: 'ri-pill', text: 'Cerca del umbral' }) : null]));
  caja.appendChild(riE('div', { className: 'ri-chico', text: 'Sucursales: ' + riListaSucursales(suc) + ' + Depósito 90. Es solo una referencia: no propone etiquetas.' }));
  if (atrasado) caja.appendChild(riAvisoAtrasado(c.snapshot));
  if (l) caja.appendChild(riLectura(l, { atenuar: atrasado }));
  else if (c.sin_conclusion) caja.appendChild(riSinEvidencia(c.sin_conclusion, RI_SIN_CONCLUSION[c.sin_conclusion.motivo] || RI_SIN_CONCLUSION.sin_conclusion));
  else {
    const vv = riVista({ rendimiento_ingreso: { estado: c.estado, motivo: c.motivo } }, { rendimiento_ingreso: { estado: c.estado, motivo: c.motivo, snapshot: c.snapshot, consulta: {} } });
    caja.appendChild(riE('div', { className: 'ri-caja ri-caja-neutra' }, [riE('b', { text: vv.titulo || 'Sin datos.' }), vv.texto ? riE('span', { text: vv.texto }) : null]));
  }
  const dm = c.demanda_cadena;
  if (dm) caja.appendChild(riE('div', { className: 'ri-sub' }, [riE('div', { className: 'ri-et', text: 'Demanda de la cadena al corte (distinta del rendimiento del ingreso)' }),
    riE('div', { className: 'ri-demanda' }, [riE('b', { text: RI_DEMANDA_CADENA[dm.categoria] || dm.categoria }), riE('span', { text: 'Ventas netas 30 días: ' + RI_NUM.format(dm.ventas_netas_30) }),
      riE('span', { text: '90 días: ' + RI_NUM.format(dm.ventas_netas_90) }), riE('span', { text: '180 días: ' + RI_NUM.format(dm.ventas_netas_180) }),
      riE('span', { text: dm.dias_desde_ultima_venta === null || dm.dias_desde_ultima_venta === undefined ? 'Sin ventas registradas' : 'Última venta hace ' + riDias(dm.dias_desde_ultima_venta) })]),
    riE('div', { className: 'ri-chico', text: 'Al ' + riFecha(dm.fecha_referencia) + ' (corte del cálculo), en ' + riListaSucursales(dm.sucursales && dm.sucursales.length ? dm.sucursales : suc) + '.' })]));
  caja.appendChild(riPie(c.snapshot, 'cadena, ' + suc.length + ' sucursales operativas + Depósito 90'));
  zona.appendChild(caja);
  return zona;
}

// Anuncios para lectores de pantalla en regiones VIVAS que existen desde que se arma el detalle (una region creada junto con su texto no
// siempre se anuncia). Carga y resultado: role=status (cortes); errores: role=alert. Solo se escribe cuando cambia, para no repetir.
// La copia oculta por CSS (display:none) no se anuncia.
const RI_ANUNCIO = {
  cargando: 'Consultando el rendimiento de la cadena…',
  ok: 'Rendimiento de la cadena cargado. Corresponde a las sucursales operativas, no a tu selección.',
};
function riTextosAnuncio(st) {
  if (!st.abierto) return ['', ''];
  if (st.estado === 'error') return ['', st.error || ''];
  return [RI_ANUNCIO[st.estado] || '', ''];
}
function riAnunciar(reg, st, { silencioso = false } = {}) {
  const [texto, error] = riTextosAnuncio(st);
  const clave = texto + '|' + error;
  if (reg.anuncio === clave) return;
  reg.anuncio = clave;
  if (silencioso) return; // al reconstruir el detalle no se repite lo ya anunciado
  reg.vivo.textContent = texto;
  reg.alerta.textContent = error;
}

function riDibujarReg(clave, reg, { silencioso = false } = {}) {
  const st = RI_CADENA.get(clave) || { abierto: false };
  // Si el foco estaba DENTRO de la zona (p. ej. en Reintentar), pasa al boton de la cadena antes de reemplazar el contenido.
  const activo = typeof document !== 'undefined' ? document.activeElement : null;
  const focoAdentro = !!(activo && reg.zona.contains && reg.zona.contains(activo));
  reg.boton.setAttribute('aria-expanded', String(!!st.abierto));
  reg.boton.textContent = riTextoBotonCadena(!!st.abierto, reg.n);
  reg.zona.setAttribute('aria-busy', String(!!(st.abierto && st.estado === 'cargando')));
  reg.zona.replaceChildren();
  if (st.abierto) reg.zona.appendChild(riContenidoCadena(clave, reg.codigo, st, reg.v));
  riAnunciar(reg, st, { silencioso });
  if (focoAdentro && typeof reg.boton.focus === 'function') reg.boton.focus();
}
// Despues de un clic o de la respuesta: redibuja todas las copias que siguen en el documento y descarta las que ya salieron.
// (No se poda mientras se arma el detalle: en ese momento la copia recien armada todavia no esta insertada.)
function riDibujarCadena(clave) { riRegsVigentes(clave).forEach(reg => riDibujarReg(clave, reg)); }

function riSeleccionParcial(ri, v, codigo) {
  const n = v.cadena.length || 5;
  const clave = riClaveCadena(codigo, v);
  ri.appendChild(riCabecera('No disponible para esta selección', 'ri-b-sin'));
  ri.appendChild(riE('div', { className: 'ri-caja ri-caja-info' }, [riE('b', { text: 'Elegiste ' + (v.seleccion.length ? riListaSucursales(v.seleccion) : 'una parte de las sucursales') + '.' }),
    riE('span', { text: 'El rendimiento desde el ingreso se calcula para la cadena completa (' + riListaSucursales(v.cadena) + ' + Depósito 90) y no se puede separar por sucursal, así que no se muestran números para tu selección.' })]));
  const idZona = 'ri-cadena-' + (++RI_ZONA_SEQ);
  const boton = riE('button', { className: 'ri-boton', attrs: { 'aria-expanded': 'false', 'aria-controls': idZona, 'data-ri-clave': clave } }); boton.type = 'button';
  const zona = riE('div', { attrs: { id: idZona } });
  const vivo = riE('div', { className: 'ri-sr', attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
  const alerta = riE('div', { className: 'ri-sr', attrs: { role: 'alert', 'aria-atomic': 'true' } });
  const reg = { boton, zona, vivo, alerta, n, codigo, v, anuncio: null };
  RI_ZONAS.set(clave, [...(RI_ZONAS.get(clave) || []), reg]);
  boton.addEventListener('click', e => {
    e.stopPropagation();
    RI_CADENA_FOCO = clave; // el foco queda en este boton: al abrir y al cerrar solo cambia su texto, no se reemplaza
    const st = RI_CADENA.get(clave);
    if (st && st.abierto) { RI_CADENA.set(clave, { ...st, abierto: false }); riDibujarCadena(clave); return; }
    if (st && (st.estado === 'ok' || st.estado === 'cargando')) { RI_CADENA.set(clave, { ...st, abierto: true }); riDibujarCadena(clave); return; }
    riConsultarCadena(clave, codigo, v);
  });
  ri.appendChild(boton);
  ri.appendChild(riE('div', { className: 'ri-chico', text: 'Se consulta solo si lo pedís. Muestra la cadena completa, no tu selección.' }));
  ri.appendChild(vivo); ri.appendChild(alerta);
  ri.appendChild(zona);
  riDibujarReg(clave, reg, { silencioso: true });
  if (RI_CADENA_FOCO === clave && typeof setTimeout === 'function') setTimeout(() => {
    if (RI_CADENA_FOCO === clave && (!document.activeElement || document.activeElement === document.body)) riEnfocarBoton(clave);
  }, 0);
}

// Bloque «Rendimiento desde el ingreso» (ancho completo) o null si la API no lo informa.
function riBloqueRendimiento(f, resp) {
  const v = riVista(f, resp);
  if (v.tipo === 'omitir') return null;
  const top = resp && resp.rendimiento_ingreso;
  const snap = top ? top.snapshot : null;
  const ri = riE('section', { className: 'ri', attrs: { 'aria-label': 'Rendimiento desde el ingreso', 'data-ri-estado': v.estado } });
  if (v.tipo === 'lectura') {
    const l = v.lectura;
    ri.appendChild(riCabecera(l.texto || RI_TEXTO_NIVEL[l.nivel] || l.nivel, RI_CLASE_NIVEL[l.nivel] || 'ri-b-normal', riPillsLectura(l, v.etiquetas)));
    if (v.atrasado) ri.appendChild(riAvisoAtrasado(snap));
    ri.appendChild(riLectura(l, { atenuar: v.atrasado }));
  } else if (v.tipo === 'sin_evidencia') {
    ri.appendChild(riCabecera('Sin evidencia suficiente', 'ri-b-sin'));
    if (v.atrasado) ri.appendChild(riAvisoAtrasado(snap));
    ri.appendChild(riSinEvidencia(v.sin_conclusion, v.texto));
  } else if (v.tipo === 'seleccion_parcial') {
    riSeleccionParcial(ri, v, f.Codigo_producto);
  } else {
    ri.appendChild(riCabecera(v.badge, 'ri-b-sin'));
    ri.appendChild(riE('div', { className: 'ri-caja ri-caja-neutra' }, [riE('b', { text: v.titulo }), v.texto ? riE('span', { text: v.texto }) : null]));
  }
  if (top) ri.appendChild(riPie(snap));
  ri.appendChild(riE('div', { className: 'ri-chico ri-nota', text: 'Informativo: no cambia el estado, la prioridad ni las etiquetas de Oportunidades.' }));
  return ri;
}

// Bloque «Demanda reciente de la selección»: ventas NETAS a 30 y 90 dias con las sucursales y la fecha "hasta" de la consulta.
function riBloqueDemandaSeleccion(f) {
  const d = f && f.demanda_reciente_seleccion;
  if (!d) return null;
  const cont = riE('div', { className: 'ri-demanda-sel' });
  cont.appendChild(riE('div', { className: 'ri-demanda' }, [riE('span', { text: 'Ventas netas 30 días: ' }, [riE('b', { text: RI_NUM.format(d.ventas_netas_30) })]),
    riE('span', { text: '90 días: ' }, [riE('b', { text: RI_NUM.format(d.ventas_netas_90) })]),
    riE('span', { text: d.dias_desde_ultima_venta === null || d.dias_desde_ultima_venta === undefined ? 'Sin ventas registradas' : 'Última venta hace ' + riDias(d.dias_desde_ultima_venta) })]));
  cont.appendChild(riE('div', { className: 'ri-chico', text: 'Ventas menos devoluciones al ' + riFecha(d.fecha_referencia) + ' (fecha «hasta») en ' + riListaSucursales(d.sucursales) + '. Distinta del rendimiento del ingreso.' }));
  const u = d.urgencia_candidata_2_6_30;
  if (u && u.criterio) cont.appendChild(riE('div', { className: 'ri-chico', text: 'Criterio candidato de urgencia (≥ ' + u.criterio.v30_min + ' en 30 días, ≥ ' + u.criterio.v90_min + ' en 90, última venta ≤ ' + u.criterio.dias_ultima_venta_max + ' días): ' + (u.cumple ? 'lo cumpliría' : 'no lo cumpliría') + '. Informativo: no cambia la prioridad.' }));
  return cont;
}

// Punto de entrada desde rrDetalleOportunidad (oportunidades-explicacion.js).
function riBloquesDetalle(panel, f, resp, bloque) {
  const dem = riBloqueDemandaSeleccion(f);
  if (dem) panel.appendChild(bloque('Demanda reciente de la selección', dem));
  const rend = riBloqueRendimiento(f, resp);
  if (rend) {
    const b = rtEl('div', { className: 'rt-oport-detalle-bloque ri-ancho' });
    b.appendChild(rend);
    panel.appendChild(b);
  }
}
