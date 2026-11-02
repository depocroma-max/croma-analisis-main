'use strict';
// Oportunidades (Fase 5): presentacion de la ACCION sugerida, el RENDIMIENTO, el perfil tecnico aplicado y el detalle
// "Por que aparece". Script clasico que se carga despues del principal (index.html) y usa sus helpers (rtEl, nf, nf1,
// RT_*...). IMPORTANTE: aca NO se calcula ni se decide ninguna regla de negocio -- solo se formatean campos que ya vienen
// resueltos de croma-api (acciones, rendimiento, calidad_datos, explicacion, resolucion, perfil, conjunto). Todo texto
// que viene de la API se inserta con textContent (nunca innerHTML).

const RR_ACCION_TEXTO = {
  reponer_urgente: 'Reponer con urgencia', reponer_desde_deposito: 'Reponer desde depósito', evaluar_reposicion: 'Evaluar reposición',
  revisar_rotacion: 'Revisar rotación', reposicion_proxima: 'Reposición próxima', seguir_producto_nuevo: 'Seguir el ingreso reciente',
  evaluar_descuento: 'Evaluar descuento', revisar_stock_parado: 'Revisar stock parado', revisar_devoluciones: 'Revisar devoluciones',
};
// El motor solo clasifica "destacado" y "bueno"; sin clasificar NO se rotula "normal" ni "bajo".
const RR_NIVEL_TEXTO = { destacado: 'Destacado', bueno: 'Bueno' };
const RR_OPERADOR = { '>=': '≥', '<=': '≤', '>': '>', '<': '<', '==': '=' };

// "seguimiento" es el identificador interno del estado; su etiqueta visible es "Ingreso reciente" ("Seguimiento" queda
// reservado para la futura seccion manual).
function rrTextoEstado(estado, textoApi) {
  if (estado === 'seguimiento') return 'Ingreso reciente';
  return (typeof RT_TEXTO_ESTADO !== 'undefined' && RT_TEXTO_ESTADO[estado]) || textoApi || estado || '—';
}
function rrAccionPrincipal(f) { return (f.acciones || []).find(a => a.principal) || null; }
function rrTextoAccion(a) { return RR_ACCION_TEXTO[a.accion] || a.accion; }
// Texto corto de rendimiento: sin nivel NO se rotula "normal" ni "bajo".
const RR_SIN_RENDIMIENTO = 'Sin clasificación de rendimiento';
function rrTextoRendimiento(f) {
  const nivel = f.rendimiento && f.rendimiento.nivel;
  return nivel ? (RR_NIVEL_TEXTO[nivel] || nivel) : RR_SIN_RENDIMIENTO;
}
// Linea visible de rendimiento ("Rendimiento: Destacado" o "Sin clasificación de rendimiento").
function rrLineaRendimiento(f) {
  return f.rendimiento && f.rendimiento.nivel ? 'Rendimiento: ' + rrTextoRendimiento(f) : RR_SIN_RENDIMIENTO;
}

// Sucursal con su nombre del catalogo existente (RT_CENTRO_NOMBRE) junto al codigo; sin nombre queda solo el codigo.
function rrSucursalTexto(codigo) {
  const nombre = typeof RT_CENTRO_NOMBRE !== 'undefined' ? RT_CENTRO_NOMBRE[codigo] : null;
  return nombre ? nombre + ' (' + codigo + ')' : String(codigo);
}

// Nombres de condiciones que hablan del "ratio de venta" = ventas / (ventas + stock). Coincidencia EXACTA del nombre que
// entrega el motor (no se reemplaza texto dentro de motivos); si el motor cambia el nombre, se ve el original.
const RR_CONDICION_TEXTO = {
  'Rotación sobre venta + stock': 'Ratio de venta (ventas ÷ (ventas + stock))',
  'Ventas suficientes para confiar en la rotación': 'Ventas suficientes para confiar en el ratio de venta',
};
const RR_NOTA_RATIO = 'El ratio de venta es ventas ÷ (ventas + stock) del período analizado. No es el porcentaje vendido de un ingreso.';

// Identificacion TECNICA del perfil aplicado (sin nombres internos: la API publica no los entrega).
function rrPerfilTecnico(f, resp) {
  const huella = f.perfil && f.perfil.huella ? ' · huella ' + String(f.perfil.huella).slice(0, 8) : '';
  const r = f.resolucion;
  let base;
  if (r) base = r.origen === 'general' ? 'General v' + r.version_general : 'Perfil #' + r.perfil_id + ' v' + r.version_especifica + ' (sobre General v' + r.version_general + ')';
  else base = f.perfil ? f.perfil.id + ' v' + f.perfil.version : '—';
  const c = resp && resp.conjunto;
  const conj = c && c.origen === 'activacion' ? ' · conjunto #' + c.activacion_id : ' · reglas estándar';
  return base + conj + huella;
}

// ── Columna "Acción sugerida / Rendimiento" de la tabla ───────────────────────────────────────────
function rrColumnaAccion() {
  return {
    header: 'Acción · rendimiento', className: 'rt-col-accion',
    render: f => {
      const wrap = rtEl('div', { className: 'rr-accion-cel' });
      const a = rrAccionPrincipal(f);
      wrap.appendChild(rtEl('strong', { text: a ? rrTextoAccion(a) : 'Sin acción sugerida' }));
      wrap.appendChild(rtEl('span', { className: 'rr-muted', text: rrLineaRendimiento(f) }));
      if (a && a.requiere_validacion_variante) wrap.appendChild(rtEl('span', { className: 'rr-tag rr-warn', text: 'Validar por variante' }));
      return wrap;
    },
  };
}

// Linea extra de la tarjeta mobile (misma informacion resumida que la columna; las reglas aplicadas van en el detalle).
function rrLineasTarjeta(card, f) {
  const a = rrAccionPrincipal(f);
  card.appendChild(rtEl('div', { className: 'rt-opp-card-linea', text: 'Acción: ' + (a ? rrTextoAccion(a) : 'sin acción sugerida') + ' · ' + rrLineaRendimiento(f) }));
}

// ── Cabecera de Oportunidades: sucursales ignoradas, periodo y conjunto de reglas ────────────────
function rrCabeceraOportunidades(host, resp) {
  const activas = resp.sucursales || [];
  const ignoradas = new Set(resp.sucursales_ignoradas || []);
  // Lo que la app tiene seleccionado pero el servidor NO evaluo (p. ej. Cipo, cerrada) tambien se avisa.
  RT_CENTROS.forEach(c => { if (activas.length && !activas.includes(c)) ignoradas.add(c); });
  if (ignoradas.size) {
    const nombres = [...ignoradas].map(c => RT_CENTRO_NOMBRE[c] || c).join(', ');
    const aviso = rtEl('div', { className: 'rr-aviso', attrs: { role: 'status' } });
    const txt = rtEl('div');
    txt.appendChild(rtEl('b', { text: 'Sucursales no consideradas: ' }));
    txt.appendChild(document.createTextNode(nombres + '. Oportunidades solo evalúa sucursales operativas; las sucursales cerradas conservan su consulta histórica en las demás secciones, pero no son candidatas para reponer ni rotar.'));
    aviso.appendChild(txt);
    host.appendChild(aviso);
  }
  const c = resp.conjunto;
  const dias = resp.periodo ? Math.round((new Date(resp.periodo.hasta) - new Date(resp.periodo.desde)) / 86400000) + 1 : null;
  const partes = [];
  if (resp.periodo) partes.push('Período analizado: ' + resp.periodo.desde + ' a ' + resp.periodo.hasta + (dias ? ' (' + dias + ' días)' : ''));
  partes.push(c && c.origen === 'activacion' ? 'Reglas: conjunto activo #' + c.activacion_id + ' (huella ' + String(c.huella).slice(0, 8) + ')' : 'Reglas: estándar (no hay un conjunto personalizado activado)');
  host.appendChild(rtEl('p', { className: 'rt-note', text: partes.join(' · ') }));
}

// ── Detalle expandido ────────────────────────────────────────────────────────────────────────────
function rrFormatoValor(valor, unidad) {
  if (valor === null || valor === undefined) return '—';
  if (unidad === 'proporción') return rtOportunidadesPct(valor);
  return nf1.format(valor) + (unidad ? ' ' + unidad : '');
}

// Sucursales que nombra la explicacion, tomadas de datos ESTRUCTURADOS (par de rotacion sugerido), no del texto del motivo.
function rrSucursalesDeLaExplicacion(f) {
  const ps = f.diagnostico_rotacion && f.diagnostico_rotacion.par_sugerido;
  if (!ps) return null;
  const partes = [];
  if (ps.destino && ps.destino.sucursal) partes.push('destino ' + rrSucursalTexto(ps.destino.sucursal));
  if (ps.origen && ps.origen.sucursal) partes.push('origen ' + rrSucursalTexto(ps.origen.sucursal));
  return partes.length ? 'Sucursales mencionadas: ' + partes.join(' · ') + '.' : null;
}

function rrBloquePorQue(f, resp) {
  const det = rtEl('details', { className: 'rr-porque' });
  det.appendChild(rtEl('summary', { text: 'Por qué aparece' }));
  const cuerpo = rtEl('div', { className: 'rr-porque-cuerpo' });
  const ex = f.explicacion;
  if (!ex) {
    if (f.motivo) cuerpo.appendChild(rtEl('p', { text: f.motivo }));
    cuerpo.appendChild(rtEl('p', { className: 'rt-note', text: 'El servidor no informó el detalle de las condiciones para este producto.' }));
    det.appendChild(cuerpo);
    return det;
  }
  const periodo = resp.periodo ? resp.periodo.desde + ' a ' + resp.periodo.hasta + ' (' + ex.periodo_dias + ' días)' : ex.periodo_dias + ' días';
  cuerpo.appendChild(rtEl('p', { className: 'rt-note', text: 'Período analizado: ' + periodo }));
  const sucursales = rrSucursalesDeLaExplicacion(f);
  if (sucursales) cuerpo.appendChild(rtEl('p', { className: 'rt-note rr-sucursales', text: sucursales }));
  const estados = [f.estado_principal, ...(f.etiquetas_secundarias || [])].filter(Boolean);
  if (!estados.length) cuerpo.appendChild(rtEl('p', { text: 'No cumple ninguna regla de oportunidad en este período.' }));
  let hayRatio = false;
  estados.forEach(estado => {
    const bloque = rtEl('div');
    bloque.appendChild(rtEl('h5', { className: 'rt-subtitulo', text: rrTextoEstado(estado) + (estado === f.estado_principal ? ' (principal)' : ' (secundaria)') }));
    const motivo = estado === f.estado_principal ? f.motivo : (f.motivos_secundarios || {})[estado];
    if (motivo) bloque.appendChild(rtEl('p', { text: motivo }));
    ((ex.condiciones_por_estado || {})[estado] || []).forEach(c => {
      const fila = rtEl('div', { className: 'rr-cond' });
      if (c.informativa) { fila.appendChild(rtEl('span', { className: 'rr-nota', text: c.condicion })); bloque.appendChild(fila); return; }
      if (c.unidad === 'proporción') hayRatio = true;
      fila.appendChild(rtEl('span', { text: RR_CONDICION_TEXTO[c.condicion] || c.condicion }));
      fila.appendChild(rtEl('span', { text: rrFormatoValor(c.valor, c.unidad) + ' ' + (RR_OPERADOR[c.operador] || c.operador) + ' ' + rrFormatoValor(c.umbral, c.unidad) }));
      fila.appendChild(rtEl('span', { className: 'rr-cumple', text: c.cumple ? '✓ cumple' : '✗ no cumple' }));
      bloque.appendChild(fila);
    });
    cuerpo.appendChild(bloque);
  });
  if (hayRatio) cuerpo.appendChild(rtEl('p', { className: 'rt-note', text: RR_NOTA_RATIO }));

  const rend = f.rendimiento || {};
  cuerpo.appendChild(rtEl('h5', { className: 'rt-subtitulo', text: 'Rendimiento' }));
  cuerpo.appendChild(rtEl('p', { text: rend.nivel
    ? rrTextoRendimiento(f) + (rend.motivo ? ' — ' + rend.motivo : '')
    : RR_SIN_RENDIMIENTO + '. El motor solo distingue rendimiento destacado o bueno; no se indica "normal" ni "bajo".' }));

  const ind = (f.calidad_datos && f.calidad_datos.indicadores) || [];
  cuerpo.appendChild(rtEl('h5', { className: 'rt-subtitulo', text: 'Indicadores de calidad' }));
  cuerpo.appendChild(rtEl('p', { text: ind.length ? ind.map(i => (typeof i === 'string' ? i : (i.detalle || i.mensaje || i.codigo || ''))).join(' · ') : 'Sin indicadores de calidad pendientes.' }));

  const advertencias = [...(f.advertencias || [])];
  const faltantes = ex.datos_faltantes || [];
  if (advertencias.length) { cuerpo.appendChild(rtEl('h5', { className: 'rt-subtitulo', text: 'Advertencias' })); advertencias.forEach(a => cuerpo.appendChild(rtEl('p', { text: a }))); }
  if (faltantes.length) { cuerpo.appendChild(rtEl('h5', { className: 'rt-subtitulo', text: 'Datos faltantes' })); faltantes.forEach(a => cuerpo.appendChild(rtEl('p', { text: a }))); }
  det.appendChild(cuerpo);
  return det;
}

// Huellas, identificadores de perfil/conjunto y metadatos de fuente: desplegable, cerrado por defecto.
function rrBloqueTecnico(f, resp) {
  const det = rtEl('details', { className: 'rr-porque rr-tecnico' });
  det.appendChild(rtEl('summary', { text: 'Detalles técnicos' }));
  const cuerpo = rtEl('div', { className: 'rr-porque-cuerpo' });
  cuerpo.appendChild(rtEl('p', { className: 'rr-perfil-tec', text: 'Reglas aplicadas: ' + rrPerfilTecnico(f, resp) }));
  const cd = f.calidad_datos;
  if (cd && cd.fuentes && cd.fuentes.stock_fecha_nota) cuerpo.appendChild(rtEl('p', { className: 'rt-note', text: 'Stock: ' + cd.fuentes.stock_fecha_nota + '.' }));
  det.appendChild(cuerpo);
  return det;
}

// Navega a Rotaciones con el codigo ya filtrado (capacidad existente). No crea envios ni cantidades.
function rrIrARotaciones(codigo) {
  RT_ROTACIONES_FILTRO = { origen: '', destino: '', marca: '', rubro: '', codigo, confianza: '' };
  RT_ROTACIONES = null; RT_ROTACIONES_SUBVISTA = 'sugeridas';
  rtCambiarVista('rotaciones');
}

// Resumen visible: accion, rendimiento, ventas y stock. El resto (explicacion completa y metadatos) va en desplegables.
function rrDetalleOportunidad(panel, f, resp, bloque) {
  const acciones = f.acciones || [];
  if (acciones.length) {
    const lista = rtEl('div');
    acciones.forEach(a => {
      const linea = rtEl('div', { className: 'rr-accion-cel' });
      linea.appendChild(rtEl('strong', { text: rrTextoAccion(a) + (a.principal ? ' (principal)' : '') + ' · prioridad ' + a.prioridad }));
      if (a.motivo) linea.appendChild(rtEl('span', { text: a.motivo }));
      lista.appendChild(linea);
    });
    panel.appendChild(bloque('Acción sugerida', lista));
  } else {
    panel.appendChild(bloque('Acción sugerida', 'Ninguna: el producto no cumple reglas de oportunidad en este período.'));
  }
  panel.appendChild(bloque('Rendimiento', rrTextoRendimiento(f)));
  const deposito = typeof rtOportunidadesStockDeposito === 'function' ? rtOportunidadesStockDeposito(f) : (f.Stock_deposito || 0);
  const ratio = f.ratio_venta == null ? '—' : rtOportunidadesPct(f.ratio_venta) + (f.ratio_confiable === false ? ' (muestra chica, poco confiable)' : '');
  panel.appendChild(bloque('Ventas y stock',
    'Ventas del período: ' + nf.format(f.Ventas_total || 0) + ' (' + nf1.format(f.ventas_semana || 0) + ' por semana) · Stock en sucursales: ' + nf.format(f.Stock_sucursales || 0)
    + ' · Depósito 90: ' + nf.format(deposito) + ' · Fallados 93: ' + nf.format(f.Stock_fallados || 0) + ' · Ratio de venta: ' + ratio));
  panel.appendChild(rrBloquePorQue(f, resp));
  panel.appendChild(rrBloqueTecnico(f, resp));
  const rot = acciones.find(a => a.requiere_validacion_variante);
  if (rot) {
    const caja = rtEl('div', { className: 'rr-senal' });
    caja.appendChild(rtEl('b', { text: 'Señal por producto: requiere validación por variante. ' }));
    caja.appendChild(document.createTextNode('Antes de mover stock hay que validar talle y color y el stock real de cada variante en Rotaciones. Acá no se crean envíos ni se confirman cantidades.'));
    const btn = rtEl('button', { className: 'btn-sm', text: 'Ver este producto en Rotaciones' });
    btn.type = 'button';
    btn.addEventListener('click', e => { e.stopPropagation(); rrIrARotaciones(f.Codigo_producto); });
    const fila = rtEl('div', { className: 'rr-row' });
    fila.appendChild(btn);
    caja.appendChild(fila);
    panel.appendChild(caja);
  }
}
