'use strict';
// Etapa C1: respuestas SINTETICAS de GET /analisis/stock-ventas con el router REAL de croma-api (este fixture solo hace de base de datos: devuelve filas con los
// alias de la consulta SQL real; el router arma Nombre_color, Stock_total, ventas/stock por sucursal, paginacion y eco). Mismo contrato que INFORME-C0.
// Datos inventados: ningun dato real. Escenarios: normal (n variantes, con casos especiales en las 7 primeras), unicos (talles 99/TU/U) y conciliar
// (reparte los totales del producto del fixture de Oportunidades entre sus variantes, para probar la conciliacion).
const CENTROS = ['0001', '0005', '0009', '0010', '0012', '0014'];
const TALLES = ['040', 'S', 'M', 'L', 'XL', '38', '39', '99', 'TU', 'U'];
const COLORES = ['02', '03', '04', '06', '08', '0A', '01', 'F4']; // todos presentes en el maestro de colores
const ESPECIALES = {
  0: { v: { '0001': 3 }, s: { '0001': 5, '0005': 2 }, c0: 6, f: 1 },                // con stock; deposito 90 = 5
  1: { v: { '0005': 3 }, s: { '0001': 1, '0005': -2 }, c0: 0, f: 0 },               // saldo negativo en una sucursal
  2: { v: { '0001': -2 }, s: {}, c0: 0, f: 0 },                                      // ventas netas negativas (devoluciones)
  3: { v: {}, s: {}, c0: 1, f: 3 },                                                  // fallados mayores al deposito combinado
  4: { v: {}, s: {}, c0: 10, f: 2 },                                                 // solo deposito
  5: { v: { '0001': 4, '0010': 2 }, s: {}, c0: 0, f: 0 },                            // ventas con stock 0
  6: { v: { '0014': 1 }, s: { '0014': 1 }, c0: 0, f: 0, color: 'ZZ' },               // color sin mapear
};

function base(i, codigo, excl) {
  const e = ESPECIALES[i];
  const talle = TALLES[i % TALLES.length], idxC = Math.floor(i / TALLES.length);
  let color = idxC < COLORES.length ? COLORES[idxC] : 'Q' + idxC;
  if (e && e.color) color = e.color;
  const r = { codigo_producto: codigo, codigo_talle: talle, codigo_color: color, nombre_rubro: 'REMERAS', nombre_subrubro: 'MANGA CORTA', nombre_producto: 'REMERA DE PRUEBA', nombre_marca: 'NIKE',
    ultimo_ingreso: i % 4 === 0 ? null : new Date(Date.UTC(2026, 8, 1 + (i % 20))), precio: 25000 + i, precio_costo: i % 5 === 0 ? null : 9000 + i };
  CENTROS.forEach((c, k) => {
    const dentro = !excl.includes(c);
    let v = (i + k) % 7 === 0 ? (i % 4) + 1 : null, s = (i + k) % 3 === 0 ? (i + k) % 5 : null;
    if (e) { v = e.v[c] !== undefined ? e.v[c] : null; s = e.s[c] !== undefined ? e.s[c] : null; }
    r['ventas_' + c] = dentro ? v : null; r['stock_' + c] = dentro ? s : null; // un centro excluido no aporta filas (LEFT JOIN vacio)
  });
  r.stock_ctro_0000 = e ? e.c0 : (i % 6 === 0 ? 4 + (i % 3) : 0); r.stock_fallados = e ? e.f : (i % 11 === 0 ? 1 : 0);
  return r;
}

function conciliar(codigo, excl, producto) {
  const m = Math.max(1, producto.variantes), filas = [];
  for (let j = 0; j < m; j++) {
    const r = { codigo_producto: codigo, codigo_talle: TALLES[j % TALLES.length], codigo_color: COLORES[Math.floor(j / TALLES.length)], nombre_rubro: producto.Nombre_rubro, nombre_subrubro: producto.Nombre_subrubro,
      nombre_producto: producto.Nombre_producto, nombre_marca: producto.Nombre_marca, ultimo_ingreso: producto.Ultimo_ingreso, precio: 1000, precio_costo: 500 };
    CENTROS.forEach(c => {
      const ps = producto.por_sucursal[c], operativa = ps && !excl.includes(c) && c !== '0009';
      const reparto = tot => (operativa ? Math.floor(tot / m) + (j === 0 ? tot % m : 0) : null);
      r['ventas_' + c] = operativa ? reparto(ps.ventas) : null; r['stock_' + c] = operativa ? reparto(ps.stock) : null;
    });
    r.stock_ctro_0000 = j === 0 ? producto.Stock_deposito + producto.Stock_fallados : 0; r.stock_fallados = j === 0 ? producto.Stock_fallados : 0;
    filas.push(r);
  }
  return filas;
}

// C2: 8 variantes con la señal de rotación origen → destino (sucursales pedidas por el test). Cada caso: [stock en origen, ventas en destino, combinado 0000, fallados].
function rotacion(codigo, excl, o, d) {
  const casos = [[5, 4, 6, 1], [0, 3, 0, 0], [-2, 2, 0, 0], [3, 0, 0, 0], [2, -1, 0, 0], [1, 1, 9, 2], [0, 0, 4, 0], [4, 6, 0, 0]];
  return casos.map((c, i) => {
    const r = base(i, codigo, excl); CENTROS.forEach(k => { r['ventas_' + k] = null; r['stock_' + k] = null; });
    if (!excl.includes(o)) r['stock_' + o] = c[0]; if (!excl.includes(d)) r['ventas_' + d] = c[1]; r.stock_ctro_0000 = c[2]; r.stock_fallados = c[3];
    return r;
  });
}

function exclusiones(texto) { // "AND centro NOT IN ('0009', ...)": los centros que el router saco de la consulta
  const out = new Set(); const re = /NOT IN \(([^)]*)\)/g; let m;
  while ((m = re.exec(texto))) (m[1].match(/\d{4}/g) || []).forEach(c => out.add(c));
  return [...out];
}

function consultar(texto, inputs, estado, productos) {
  const codigo = String(inputs.codigo || ''), excl = exclusiones(texto);
  let todas;
  if (estado.modo === 'unicos') todas = ['99', 'TU', 'U'].map((t, k) => ({ ...base(k, codigo, excl), codigo_talle: t, codigo_color: k === 2 ? '00' : COLORES[k] }));
  else if (estado.modo === 'rotacion') todas = rotacion(codigo, excl, estado.origen || '0001', estado.destino || '0005');
  else if (estado.modo === 'conciliar' && productos.find(p => p.Codigo_producto === codigo)) todas = conciliar(codigo, excl, productos.find(p => p.Codigo_producto === codigo));
  else todas = Array.from({ length: estado.n }, (_, i) => base(i, codigo, excl));
  const pagina = todas.slice(inputs.offset, inputs.offset + inputs.limit);
  return pagina.map(r => ({ ...r, total_sin_paginar: todas.length }));
}

// C2: respuesta SINTETICA de GET /analisis/rotaciones (forma del contrato real: pares[{origen,destino,items[]}]) para las variantes del escenario «rotacion».
function respuestaRotaciones(q, estado) {
  const codigo = String(q.codigo || ''), o = estado.origen || '0001', d = estado.destino || '0005';
  const item = (i, talle, color, origen, destino, cant, stockO) => ({ rotacion_id: `${codigo}_${talle}_${color}_${origen}_${destino}`, Codigo_producto: codigo, Codigo_talle: talle, Codigo_color: color, Nombre_color: color === 'ZZ' ? 'COLOR NO MAPEADO' : 'NEGRO', color_no_mapeado: color === 'ZZ',
    Nombre_producto: 'REMERA DE PRUEBA', origen, destino, cantidad_sugerida: cant, stock_origen: stockO, stock_origen_sysneo: stockO, pendiente_salida_origen: 0, confianza: 'manual', motivo: 'sin_validacion_de_curva' });
  const items = codigo ? [item(0, '040', '02', o, d, 3, 5), item(1, 'S', '02', o, d, 2, 0), item(5, '38', '02', o, d, 1, 1), item(9, 'NOEXISTE', '02', o, d, 2, 4), item(7, '99', '02', o, '0014', 2, 4)] : [];
  const pares = []; items.forEach(it => { let p = pares.find(x => x.origen === it.origen && x.destino === it.destino); if (!p) pares.push(p = { origen: it.origen, destino: it.destino, items: [] }); p.items.push(it); });
  return { ok: true, version_rotaciones: 'harness', desde: q.desde, hasta: q.hasta, stock_consultado: null, filtros_aplicados: { codigo: codigo || null }, total_pares_global: pares.length, total_variantes_global: items.length, total_unidades_global: 0, total_pares: pares.length, total_variantes: items.length, total_unidades: 0, pares };
}

module.exports = { consultar, exclusiones, rotacion, respuestaRotaciones, TALLES, COLORES, ESPECIALES };
