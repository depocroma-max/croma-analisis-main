'use strict';
// Rotaciones -> ChatGPT (interfaz): boton "Preparar correos con ChatGPT" + modal de revision. Script clasico que se carga despues del
// principal (index.html) y usa sus helpers (rtEl, nf, RT_ROTACIONES, RT_ROTACIONES_SELECCION, rtRotacionesCantidadDe, rtCerrarModalRotaciones)
// y la logica pura de rotaciones-chatgpt.js. Aca NO se llama a la API ni se envia ningun correo: solo se arma el paquete, se muestra para
// revisarlo y se ofrece copiarlo / descargarlo / abrir ChatGPT. Todo texto dinamico se inserta con textContent (nunca como marcado).

let RC_ESTADO = null; // { paquete, validacion, avisos, origenDatos, solicitud }

function rcLeerLotesPrevios() {
  try { return JSON.parse(localStorage.getItem(RC_CONFIG.clave_lotes_previos) || '[]'); } catch (e) { return []; }
}
function rcRecordarLote(id) {
  try {
    const l = rcLeerLotesPrevios();
    if (!l.includes(id)) { l.push(id); localStorage.setItem(RC_CONFIG.clave_lotes_previos, JSON.stringify(l.slice(-200))); }
  } catch (e) { /* sin storage: la advertencia de lote repetido simplemente no se muestra */ }
}

// Toma la seleccion actual; si no hay ninguna, el lote completo que muestra la vista (ya filtrado por la UI). Nunca recalcula nada.
function rcPrepararDesdeRotaciones() {
  if (!RT_ROTACIONES) return null;
  const todos = RT_ROTACIONES.pares.flatMap(p => p.items);
  const hayLecturaSeleccion = RT_ROTACIONES_SELECCION.size > 0;
  const items = hayLecturaSeleccion ? todos.filter(i => RT_ROTACIONES_SELECCION.get(i.rotacion_id)) : todos;
  const { lineas, avisos } = rcLineasDesdeItems(items, rtRotacionesCantidadDe);
  const paquete = rcArmarPaquete({ lineas, stock_consultado: RT_ROTACIONES.stock_consultado, periodo: { desde: RT_DESDE, hasta: RT_HASTA } });
  const validacion = rcValidarPaquete(paquete, { avisos, lotesPrevios: rcLeerLotesPrevios() });
  return { paquete, validacion, avisos, origenDatos: hayLecturaSeleccion ? 'selección' : 'lote completo (filtros actuales)' };
}

function rcDescargarJson(p) {
  const blob = new Blob([rcExportarJson(p)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'rotacion-' + p.lote_id + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function rcAbrirChatGPT() {
  // Sin parametros: no se asume que un enlace pueda adjuntar archivos ni precargar datos. Abrirlo NO autoriza ningun envio.
  window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
}

function rcMostrarModal() {
  const datos = rcPrepararDesdeRotaciones();
  if (!datos) { alert('Primero cargá las rotaciones.'); return; }
  RC_ESTADO = datos;
  rtCerrarModalRotaciones();
  const { paquete, validacion } = datos;
  const overlay = rtEl('div', { className: 'rt-modal-overlay' });
  const box = rtEl('div', { className: 'card rt-modal-box rc-modal-box' });
  box.appendChild(rtEl('h3', { className: 'rt-subtitulo', text: 'Preparar correos con ChatGPT' }));
  box.appendChild(rtEl('p', { className: 'rt-note rc-aviso-fijo', text: 'Esto NO envía ningún correo. Abrir ChatGPT no autoriza envíos: la confirmación y el envío se hacen aparte.' }));
  box.appendChild(rtEl('p', { className: 'rt-note', text: 'Origen de los datos: ' + datos.origenDatos + '.' }));

  const r = validacion.resumen;
  box.appendChild(rtEl('p', { className: 'rc-contadores', text: nf.format(r.movimientos) + ' movimiento(s) (origen → destino) · ' + nf.format(r.variantes) + ' variante(s) · ' + nf.format(r.unidades) + ' unidad(es)' }));
  box.appendChild(rtEl('p', { className: 'rt-note', text: 'Lote: ' + paquete.lote_id + ' · Stock consultado: ' + rcFechaHora(paquete.stock_consultado, RC_CONFIG.zona_horaria) }));

  const lista = rtEl('ul', { className: 'rt-note' });
  paquete.grupos.forEach(g => {
    lista.appendChild(rtEl('li', { text: (g.origen.sucursal || g.origen.codigo) + ' → ' + (g.destino.sucursal || g.destino.codigo) + ': ' + g.total_variantes + ' variante(s), ' + g.total_unidades + ' unidad(es)' }));
  });
  box.appendChild(lista);

  if (validacion.errores.length) {
    box.appendChild(rtEl('p', { className: 'rt-note rt-oport-ventas-neg', text: 'Errores (bloquean la transferencia):' }));
    const ul = rtEl('ul', { className: 'rt-note rt-oport-ventas-neg rc-errores' });
    validacion.errores.forEach(e => ul.appendChild(rtEl('li', { text: e.mensaje })));
    box.appendChild(ul);
  }
  if (validacion.advertencias.length) {
    box.appendChild(rtEl('p', { className: 'rt-note', text: 'Advertencias:' }));
    const ul = rtEl('ul', { className: 'rt-note rc-advertencias' });
    validacion.advertencias.forEach(e => ul.appendChild(rtEl('li', { text: e.mensaje })));
    box.appendChild(ul);
  }

  // Vista previa de los correos: iframe srcdoc AISLADO con sandbox vacio (sin scripts, sin formularios, sin popups, origen opaco).
  if (validacion.ok && paquete.grupos.length) {
    const correos = rcRenderCorreos(paquete);
    const det = rtEl('details', { className: 'rc-preview' });
    det.appendChild(rtEl('summary', { text: 'Vista previa del correo' }));
    const sel = rtEl('select', { className: 'form-control' });
    correos.forEach((c, i) => sel.appendChild(Object.assign(rtEl('option', { text: c.asunto }), { value: String(i) })));
    const frame = rtEl('iframe', { className: 'rc-frame', attrs: { sandbox: '', title: 'Vista previa del correo' } });
    frame.setAttribute('srcdoc', correos[0].html);
    sel.addEventListener('change', () => frame.setAttribute('srcdoc', correos[Number(sel.value)].html));
    if (correos.length > 1) det.appendChild(sel);
    det.appendChild(frame);
    box.appendChild(det);
  }

  const estado = rtEl('p', { className: 'rt-note rc-estado', text: '' });
  const respaldo = rtEl('textarea', { className: 'form-control rt-rot-textarea' });
  respaldo.readOnly = true; respaldo.hidden = true;

  const acciones = rtEl('div', { className: 'rt-modal-acciones rc-acciones' });
  const bloquear = !validacion.ok;

  const btnCopiar = rtEl('button', { className: 'btn-sm rt-modal-confirmar', text: 'Copiar solicitud completa' });
  btnCopiar.type = 'button'; btnCopiar.disabled = bloquear;
  btnCopiar.addEventListener('click', async () => {
    const texto = rcSolicitudChatGPT(paquete);
    try {
      await navigator.clipboard.writeText(texto);
      rcRecordarLote(paquete.lote_id);
      estado.textContent = 'Solicitud copiada. Pegala en ChatGPT.';
    } catch (err) {
      // Fallo del portapapeles: se muestra el texto seleccionable para copiarlo a mano; la transferencia no se da por hecha.
      respaldo.value = texto; respaldo.hidden = false; respaldo.focus(); respaldo.select();
      estado.textContent = 'No se pudo copiar automáticamente. Copiá el texto de abajo (Ctrl+C) o descargá el JSON.';
    }
  });
  const btnJson = rtEl('button', { className: 'btn-sm', text: 'Descargar paquete JSON' });
  btnJson.type = 'button'; btnJson.disabled = bloquear;
  btnJson.addEventListener('click', () => {
    try { rcDescargarJson(paquete); rcRecordarLote(paquete.lote_id); estado.textContent = 'Paquete descargado.'; }
    catch (err) { estado.textContent = 'No se pudo descargar el paquete: ' + err.message; }
  });
  const btnAbrir = rtEl('button', { className: 'btn-sm', text: 'Abrir ChatGPT' });
  btnAbrir.type = 'button';
  btnAbrir.addEventListener('click', () => { try { rcAbrirChatGPT(); } catch (err) { estado.textContent = 'No se pudo abrir ChatGPT: ' + err.message; } });
  const btnCerrar = rtEl('button', { className: 'btn-sm', text: 'Cerrar' });
  btnCerrar.type = 'button';
  btnCerrar.addEventListener('click', rtCerrarModalRotaciones);
  [btnCopiar, btnJson, btnAbrir, btnCerrar].forEach(b => acciones.appendChild(b));
  box.appendChild(acciones);
  box.appendChild(estado);
  box.appendChild(respaldo);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}
