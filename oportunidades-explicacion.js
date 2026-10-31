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
function rrTextoRendimiento(f) {
  const nivel = f.rendimiento && f.rendimiento.nivel;
  return nivel ? (RR_NIVEL_TEXTO[nivel] || nivel) : 'Sin clasificar';
}

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
      wrap.appendChild(rtEl('span', { className: 'rr-muted', text: 'Rendimiento: ' + rrTextoRendimiento(f) }));
      if (a && a.requiere_validacion_variante) wrap.appendChild(rtEl('span', { className: 'rr-tag rr-warn', text: 'Validar por variante' }));
      return wrap;
    },
  };
}

// Lineas extra de la tarjeta mobile (misma informacion que la columna).
function rrLineasTarjeta(card, f, resp) {
  const a = rrAccionPrincipal(f);
  card.appendChild(rtEl('div', { className: 'rt-opp-card-linea', text: 'Acción: ' + (a ? rrTextoAccion(a) : 'sin acción sugerida') + ' · Rendimiento: ' + rrTextoRendimiento(f) }));
  card.appendChild(rtEl('div', { className: 'rt-opp-card-linea rr-perfil-tec', text: 'Reglas: ' + rrPerfilTecnico(f, resp) }));
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

function rrBloquePorQue(f, resp) {
  const det = rtEl('details', { className: 'rr-porque' });
  det.appendChild(rtEl('summary', { text: 'Por qué aparece' }));
  const cuerpo = rtEl('div', { className: 'rr-porque-cuerpo' });
  const ex = f.explicacion;
  if (!ex) {
    cuerpo.appendChild(rtEl('p', { className: 'rt-note', text: 'El servidor no informó el detalle de las condiciones para este producto.' }));
    det.appendChild(cuerpo);
    return det;
  }
  const periodo = resp.periodo ? resp.periodo.desde + ' a ' + resp.periodo.hasta + ' (' + ex.periodo_dias + ' días)' : ex.periodo_dias + ' días';
  cuerpo.appendChild(rtEl('p', { className: 'rt-note', text: 'Período analizado: ' + periodo + ' · Reglas aplicadas a este producto: ' + rrPerfilTecnico(f, resp) }));
  const estados = [f.estado_principal, ...(f.etiquetas_secundarias || [])].filter(Boolean);
  if (!estados.length) cuerpo.appendChild(rtEl('p', { text: 'No cumple ninguna regla de oportunidad en este período.' }));
  estados.forEach(estado => {
    const bloque = rtEl('div');
    bloque.appendChild(rtEl('h5', { className: 'rt-subtitulo', text: rrTextoEstado(estado) + (estado === f.estado_principal ? ' (principal)' : ' (secundaria)') }));
    const motivo = estado === f.estado_principal ? f.motivo : (f.motivos_secundarios || {})[estado];
    if (motivo) bloque.appendChild(rtEl('p', { text: motivo }));
    ((ex.condiciones_por_estado || {})[estado] || []).forEach(c => {
      const fila = rtEl('div', { className: 'rr-cond' });
      if (c.informativa) { fila.appendChild(rtEl('span', { className: 'rr-nota', text: c.condicion })); bloque.appendChild(fila); return; }
      fila.appendChild(rtEl('span', { text: c.condicion }));
      fila.appendChild(rtEl('span', { text: rrFormatoValor(c.valor, c.unidad) + ' ' + (RR_OPERADOR[c.operador] || c.operador) + ' ' + rrFormatoValor(c.umbral, c.unidad) }));
      fila.appendChild(rtEl('span', { className: 'rr-cumple', text: c.cumple ? '✓ cumple' : '✗ no cumple' }));
      bloque.appendChild(fila);
    });
    cuerpo.appendChild(bloque);
  });
  const advertencias = [...(f.advertencias || [])];
  const faltantes = ex.datos_faltantes || [];
  if (advertencias.length) { cuerpo.appendChild(rtEl('h5', { className: 'rt-subtitulo', text: 'Advertencias' })); advertencias.forEach(a => cuerpo.appendChild(rtEl('p', { text: a }))); }
  if (faltantes.length) { cuerpo.appendChild(rtEl('h5', { className: 'rt-subtitulo', text: 'Datos faltantes' })); faltantes.forEach(a => cuerpo.appendChild(rtEl('p', { text: a }))); }
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
  const rend = f.rendimiento || {};
  const rendTxt = rend.nivel
    ? rrTextoRendimiento(f) + (rend.motivo ? ' — ' + rend.motivo : '')
    : 'Sin clasificar. El motor solo distingue rendimiento destacado o bueno; no se indica "normal" ni "bajo".';
  panel.appendChild(bloque('Rendimiento', rendTxt));
  const ind = (f.calidad_datos && f.calidad_datos.indicadores) || [];
  panel.appendChild(bloque('Indicadores de calidad', ind.length ? ind.map(i => (typeof i === 'string' ? i : (i.detalle || i.mensaje || i.codigo || ''))).join(' · ') : 'Sin indicadores de calidad pendientes.'));
  panel.appendChild(bloque('Reglas aplicadas', rrPerfilTecnico(f, resp)));
  panel.appendChild(rrBloquePorQue(f, resp));
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
