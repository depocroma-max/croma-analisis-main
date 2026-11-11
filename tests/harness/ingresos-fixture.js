'use strict';
// FIXTURE SINTETICO de Ingresos recientes para el harness (propuesta visual 2). NO son datos de Sysneo.
// Procedencia: ~170 codigos generados de forma DETERMINISTA (mismo resultado en cada arranque) con la forma de las filas crudas que el SQL
// de croma-api/routes/ingresos-recientes.js entrega al motor (productos, variantes+sucursal, movimientos diarios, Deposito 90). El harness
// monta el router REAL, asi que contrato, textos, lecturas, umbrales y estados salen del codigo real de croma-api; este archivo solo
// reemplaza a Sysneo. Los primeros codigos reproducen las filas reales de docs/referencias-rediseno/contrato (codigo, descripcion, ingreso,
// unidades, tipo) con marca/rubro de CATALOGO_FILAS del harness para que los filtros funcionen; sus metricas son sinteticas.
// Fecha fija: hoy = 2026-11-11 (corte = cierre del 2026-11-10). Escenarios: alineado | atrasado (Centenario 0012 con stock al 2026-11-09).
const CORTE = '2026-11-10';
const HOY_ISO = '2026-11-11T15:00:00.000Z'; // 12:00 en Argentina
const CENTROS = ['0001', '0005', '0010', '0012', '0014'];

const sumar = (f, n) => { const d = new Date(f + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function prng(semilla) { let a = semilla >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const COMBOS = [
  ['NIKE', 'REMERAS', 'MANGA CORTA'], ['BILLABONG', 'REMERAS', 'MANGA CORTA'], ['VANS', 'REMERAS', 'MANGA LARGA'], ['VANS', 'ZAPAS', 'URBANAS'],
  ['NIKE', 'ZAPAS', 'URBANAS'], ['NIKE', 'BUZOS', 'NO DISPONIBLE'], ['BILLABONG', 'GORRAS', 'VISERA'],
];
const PRENDA = { REMERAS: ['REM MC', 'REM ML'], ZAPAS: ['ZAP URB'], BUZOS: ['BUZO CAN'], GORRAS: ['GORRA TRK'] };
const MODELOS = ['WAVE', 'CRAYON', 'JOYRIDE', 'PACIFIC', 'ORBIT', 'DRIFT', 'TORCH', 'SUNSET', 'RIPTIDE', 'ESSENTIAL', 'CORE', 'LOGO', 'STRIPE', 'PALM', 'CLASSIC', 'AIR', 'SKATE', 'REEF', 'COAST', 'SALT'];
// Filas reales del contrato (codigo, descripcion, ultimo ingreso, unidades, tipo). Kind fuerza la lectura esperada.
const SEMILLAS = [
  { cod: 'B1147', nombre: 'PONCHO BB PACIFIC HOODIE TOWEL', combo: 5, ultimo: '2026-09-12', u: 5, tipo: 'primer', kind: 'sin_ventas' },
  { cod: '05520', nombre: 'RCA WL PU MAGIC WALLET', combo: 6, ultimo: '2026-10-01', u: 12, tipo: 'reingreso', kind: 'descuadre' },
  { cod: 'TR157', nombre: 'POLO MC TEJIDA 01021', combo: 0, ultimo: '2026-09-29', u: 32, tipo: 'primer', kind: 'sin_exposicion' },
  { cod: '02486', nombre: 'RCB G DR MINI KINT BOSSANOVA', combo: 2, ultimo: '2026-09-24', u: 4, tipo: 'reingreso', kind: 'observacion' },
  { cod: 'T1407', nombre: 'CAP TRK FLAT RVCA PLATFORM', combo: 6, ultimo: '2026-09-12', u: 24, tipo: 'primer', kind: 'agotado' },
  { cod: 'B1148', nombre: 'MUSC G BB JOYRIDE', combo: 1, ultimo: '2026-09-12', u: 12, tipo: 'primer', kind: 'con_ventas' },
  { cod: 'B1113', nombre: 'REM G MC BB BRING THE SUN BABY', combo: 1, ultimo: '2026-09-12', u: 21, tipo: 'reingreso', kind: 'con_previo' },
];

function generar() {
  const rnd = prng(20261111);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const productos = [], variantes = [], diarios = [], deposito = [];
  let secuencia = 0;
  const crear = (s) => {
    const [marca, rubro, subrubro] = COMBOS[s.combo];
    const ultimo = s.ultimo, d = Math.round((Date.parse(CORTE) - Date.parse(ultimo)) / 86400000); // dias desde el ingreso hasta el corte
    const primero = s.tipo === 'primer' ? ultimo : sumar(ultimo, -(30 + Math.floor(rnd() * 160)));
    const p = { cod: s.cod, primero, ultimo, dias_ing: s.tipo === 'primer' ? 1 : 2 + Math.floor(rnd() * 3), ult_u: s.u, nombre: s.nombre, marca, rubro, subrubro, ingreso_posterior: 0 };
    productos.push(p);
    const kind = s.kind;
    if (kind === 'sin_exposicion') { deposito.push({ cod: s.cod, talle: 'M', color: '01', dep90: s.u, fallados: 0 }); return; }
    const nVar = 1 + Math.floor(rnd() * 3);
    // unidades de ingreso repartidas entre variantes y sucursales
    let restantes = s.u;
    const celdas = [];
    for (let v = 0; v < nVar; v++) {
      const talle = ['S', 'M', 'L'][v], color = pick(['01', '02', '14']);
      const centros = CENTROS.filter(() => rnd() < 0.6); if (!centros.length) centros.push(pick(CENTROS));
      centros.forEach((c) => { const q = Math.max(1, Math.min(restantes, 1 + Math.floor(rnd() * Math.ceil(s.u / (nVar * centros.length) + 1)))); celdas.push({ talle, color, centro: c, q }); restantes = Math.max(0, restantes - q); });
    }
    if (restantes > 0) celdas[0].q += restantes;
    const previoPorCelda = kind === 'con_previo' ? () => 1 + Math.floor(rnd() * 4) : () => 0;
    let sold = 0;
    celdas.forEach((c) => {
      const previo = previoPorCelda();
      const total = previo + c.q;
      let ventas = 0;
      if (kind === 'con_ventas' || kind === 'con_previo' || kind === 'descuadre') ventas = Math.min(total - (kind === 'descuadre' ? 0 : 0), 1 + Math.floor(rnd() * Math.max(1, Math.ceil(total / 2))));
      if (kind === 'agotado') ventas = total;
      if (d === 0) ventas = 0; // ingreso en el propio corte: sin dias para vender
      if (kind === 'con_ventas' && d > 0 && ventas === 0) ventas = 1;
      // movimientos: entrada el dia del ingreso (transferencia a sucursal) y ventas en dias posteriores
      diarios.push({ cod: s.cod, talle: c.talle, color: c.color, centro: c.centro, f: ultimo, mov: c.q, v_neta: 0, devol: 0 });
      for (let k = 0; k < ventas; k++) {
        const f = sumar(ultimo, 1 + Math.floor(rnd() * Math.max(1, d)));
        diarios.push({ cod: s.cod, talle: c.talle, color: c.color, centro: c.centro, f: f > CORTE ? CORTE : f, mov: -1, v_neta: 1, devol: 0 });
      }
      sold += ventas;
      const stock = total - ventas;
      variantes.push({ cod: s.cod, talle: c.talle, color: c.color, centro: c.centro, stock, neto: kind === 'descuadre' && c === celdas[0] ? stock + 2 : stock });
    });
    if (kind === 'con_ventas' || kind === 'con_previo') { if (rnd() < 0.12) deposito.push({ cod: s.cod, talle: celdas[0].talle, color: celdas[0].color, dep90: 3 + Math.floor(rnd() * 9), fallados: rnd() < 0.2 ? 1 : 0 }); }
  };
  SEMILLAS.forEach(crear);
  // resto: codigos generados con la mezcla de lecturas esperada
  const KINDS = [['con_ventas', 0.55], ['con_previo', 0.08], ['observacion', 0.2], ['sin_ventas', 0.06], ['agotado', 0.06], ['sin_exposicion', 0.03], ['descuadre', 0.02]];
  for (let i = 0; i < 165; i++) {
    let x = rnd(), kind = 'con_ventas'; for (const [k, p] of KINDS) { if (x < p) { kind = k; break; } x -= p; }
    const combo = Math.floor(rnd() * COMBOS.length);
    let dias = Math.floor(rnd() * 60);                              // antiguedad del ultimo ingreso (0..59 dias)
    if (kind === 'sin_ventas') dias = 50 + Math.floor(rnd() * 10);   // >= 47 dias con stock sin ventas
    if (kind === 'observacion') dias = 4 + Math.floor(rnd() * 36);   // menos que el minimo global (47)
    if (kind === 'sin_exposicion') dias = 4 + Math.floor(rnd() * 30);
    if (['con_previo', 'descuadre', 'agotado', 'con_ventas'].includes(kind) && dias < 2) dias = 2;
    const rubro = COMBOS[combo][1], marca = COMBOS[combo][0];
    secuencia++;
    const cod = rnd() < 0.5 ? `B${1150 + secuencia}` : String(10000 + secuencia * 13); // unicos por construccion
    const nombre = `${pick(PRENDA[rubro])} ${marca === 'BILLABONG' ? 'BB' : marca === 'NIKE' ? 'NK' : 'VN'} ${pick(MODELOS)}`;
    crear({ cod, nombre, combo, ultimo: sumar(CORTE, -dias), u: 4 + Math.floor(rnd() * 28), tipo: kind === 'con_previo' ? 'reingreso' : (rnd() < 0.3 ? 'reingreso' : 'primer'), kind });
  }
  return { productos, variantes, diarios, deposito };
}
const DATOS = generar();

const entradas = (inputs, prefijo) => Object.keys(inputs).filter((k) => new RegExp('^' + prefijo + '\\d+$').test(k)).map((k) => String(inputs[k]).trim().toUpperCase());

// Responde la consulta de ingresos recientes como lo haria Sysneo para la ventana, el alcance de sucursales y los filtros pedidos.
// esc: { escenario: 'alineado'|'atrasado', vacio: bool }
function consultar(texto, inputs, esc) {
  const m = texto.match(/sp\.centro IN \(([^)]*)\)\s*\n\s*GROUP BY sp\.centro/);
  const centros = (m ? m[1] : CENTROS.map((c) => `'${c}'`).join(',')).split(',').map((s) => s.replace(/'/g, '').trim()).filter(Boolean);
  const stampDe = (c) => (esc.escenario === 'atrasado' && c === '0012' ? '2026-11-09' : CORTE);
  const sellos = centros.map((c) => ({ centro: c, filas: 5000, nulos: 0, ref_min: stampDe(c), ref_max: stampDe(c), fechas_distintas: 1 }));
  const ultVentas = centros.map((c) => ({ centro: c, ultima_venta: stampDe(c) }));
  const fallados = [{ ultima_novedad_tabla: '2026-11-10 15:34:12.620', ultima_modificacion_93: '2026-10-16 12:03:53.263', punteros_invalidos: 0, filas: 35830 }];
  const desde = String(inputs.desde), hasta = String(inputs.hasta), corte = String(inputs.corte);
  const f = { marca: entradas(inputs, 'marca'), rubro: entradas(inputs, 'rubro'), subrubro: entradas(inputs, 'subrubro'), codigo: entradas(inputs, 'codigo') };
  const sel = esc.vacio ? [] : DATOS.productos.filter((p) => p.ultimo >= desde && p.ultimo <= hasta && p.ultimo <= corte
    && (!f.marca.length || f.marca.includes(p.marca)) && (!f.rubro.length || f.rubro.includes(p.rubro)) && (!f.subrubro.length || f.subrubro.includes(p.subrubro)) && (!f.codigo.length || f.codigo.includes(p.cod.toUpperCase())));
  const cods = new Set(sel.map((p) => p.cod));
  const enAlcance = (r) => cods.has(r.cod) && centros.includes(r.centro);
  return [
    sellos, ultVentas, fallados, sel,
    DATOS.variantes.filter(enAlcance), DATOS.diarios.filter(enAlcance),
    DATOS.deposito.filter((r) => cods.has(r.cod)), [{ n: 0 }],
  ];
}

module.exports = { CORTE, HOY_ISO, CENTROS, DATOS, consultar };
