# Propuesta 2 — Ingresos recientes en el harness de Croma

Implementación local, lista para revisión visual (sin commit ni integración definitiva). Es una subpestaña **Ingresos recientes** dentro de **Oportunidades**, construida sobre el contrato real de `GET /analisis/ingresos-recientes` (croma-api `5a1ad3a` + comentario corregido) y las referencias de Nequ Studio.

## Cómo verla
```bash
node tests/harness/servidor.js --puerto=8795        # http://localhost:8795 → Oportunidades → Ingresos recientes
# escenarios (solo harness): /__h/ir?escenario=alineado|atrasado  &vacio=0|1  &error=0|1  &retraso=ms
```
Un franja inferior del harness indica siempre **«datos SIMULADOS · escenario …»**.

## Archivos
| Archivo | Cambio |
|---|---|
| `ingresos-recientes-vista.js` (nuevo) | Vista: encabezado, alcance, aviso, panel de sucursales, información de los datos, filtros, contadores, tabla, tarjetas, detalle, paginación, estados |
| `ingresos-recientes-vista.css` (nuevo) | Estilos con tokens de `croma-ds.css` (rojo acento, negro, fondo claro) |
| `oportunidades-vista.js` | Subpestañas Oportunidades / Ingresos recientes (`ovSubnav`) y despacho a `irRender` |
| `index.html` | Carga del script y CSS nuevos; la barra global oculta Desde/Hasta mientras está activa esta vista (el período global no aplica) |
| `tests/harness/servidor.js` | Monta el router **real** de ingresos recientes, controles `/__h/ir`, reloj fijo (2026-11-11) y franja «SIMULADO» |
| `tests/harness/ingresos-fixture.js` (nuevo) | Fixture sintético (ver procedencia) |
| `tests/harness/validacion-ingresos-recientes.js` (nuevo) | Validación automatizada con Playwright (106 comprobaciones) |
| `tests/ingresos-recientes-vista.test.js` (nuevo), `tests/dom-minimo.js` | 8 pruebas de la lógica pura |
| `croma-api/routes/ingresos-recientes.js` | Solo el comentario de la línea 175 (cambio separado, sin efecto en el código) |

## Procedencia del fixture (harness)
`ingresos-fixture.js` genera ~170 códigos **sintéticos y deterministas** con la forma de las filas crudas que el SQL entrega al motor (productos, variantes por sucursal, movimientos diarios, Depósito 90). El harness responde al SQL de la ruta real, así que **contrato, textos, lecturas, umbrales, fechas de referencia y atrasado salen del código real de croma-api**; solo Sysneo está reemplazado. Los 7 primeros códigos reproducen códigos, descripciones, ingresos y unidades reales de `contrato/ingresos-recientes_alineado.json` (con marca/rubro del catálogo del harness para que los filtros funcionen); sus métricas son sintéticas. Escenarios: **alineado** (5 sucursales al 10/11) y **atrasado** (Centenario con stock al 09/11, **simulado**). Responde según el alcance pedido: excluir un local devuelve una respuesta calculada sin esa sucursal (coherente con el alcance).

## Decisiones de diseño
1. **Encabezado compacto:** título + una línea «Último ingreso entre el 12/10/2026 y el 10/11/2026 · 30 días · corte 10/11/2026 (cierre de ayer)». Todas las fechas salen de `periodo` de la misma respuesta (en móvil se abrevian sin año).
2. **Línea de alcance:** «Sucursales: …» + estado (`Stock al día · 10/11` / `Stock desactualizado`). Es un botón que abre el detalle por sucursal (fecha del stock, estado, última venta, excluir).
3. **Aviso de atraso breve** (una a dos líneas): local, fecha y efecto sobre la clasificación; acciones **«Revisar sucursales»** (abre el panel) y «Reintentar». **Excluir** exige dos pasos (botón → «Confirmar exclusión» con el texto de que recalcula ventas y stock sin ese local); el alcance visible pasa a «Excluida de esta vista: Centenario» con «Volver a incluir». La exclusión es local a esta vista (no toca la selección de sucursales de la barra superior).
4. **Filtros según el contrato:** período 7/15/30/60 d (rango inicial = `dias=30`) y Personalizado (desde/hasta, máximo 180 días, hasta ≤ corte), tipo de ingreso, orden, marca/rubro/código (formulario del catálogo existente) y lectura (desde los contadores). En móvil quedan plegados con resumen de lo activo.
5. **Contadores compactos** (seis columnas; dos en móvil) con nombre corto y etiqueta accesible completa; **0 real se muestra 0** y el dato no disponible **«—»** (en el atrasado solo Historial insuficiente muestra cifra). «¿Cómo se leen las lecturas?» despliega las definiciones, con el umbral que informa la API.
6. **Tabla alineada en escritorio** (Producto · Último ingreso · Ventas obs. · Días con stock · Stock suc. con su fecha · Dep. 90 en vivo · Lectura) y **tarjetas compactas en móvil** (código y producto, lectura, y tres métricas separadas: Ingreso, Ventas obs., Stock). Sin íconos decorativos.
7. **Detalle desplegable** por producto: stock previo (sucursales y Depósito 90), días con stock, umbral aplicado y su origen, variantes agotadas, primer ingreso registrado, desglose por sucursal con su fecha, y la aclaración de reingresos con stock previo («las ventas son del código desde la fecha de ingreso; su atribución al lote nuevo está pendiente»). Los valores `null` se muestran «—» con su motivo.
8. **«Información de los datos»:** un solo desplegable con fuentes y fechas (stock por local, Dep. 90 sin fecha, Fallados 93), ventas observadas (completitud desconocida y su efecto), datos no disponibles y corte. No cita referencias internas (ADR); esas quedan en la documentación.

## Validaciones realizadas
- `node tests/harness/validacion-ingresos-recientes.js`: **106/106 comprobaciones OK** a 1280×800 y 375×812 (`resultados-validacion.json`). Cubre: primer producto dentro de la primera pantalla en el estado alineado (escritorio 571–626 de 800 px; móvil 641–799 de 812), rango inicial `dias=30`, encabezado y alcance, ceros vs «—», dos columnas de contadores en móvil, filtros plegables con resumen, información de los datos, detalle y aclaración de reingresos, período, tipo, lectura, orden, código con chip y su quita, rango personalizado (180 días), paginación (offset=50), aviso atrasado breve y visible, panel «Revisar sucursales», exclusión con confirmación y consulta sin 0012, volver a incluir, carga (esqueleto), vacío, error con reintento, y cambios rápidos de período sin que una respuesta vieja reemplace a la vigente. Sin errores HTTP ni de script en la vista.
- `node --test tests/*.test.js` (frontend): **70/70** (62 anteriores + 8 nuevas). `croma-api`: `node --test scripts/test-ingresos-recientes.js` **43/43** tras el cambio de comentario.

## Capturas (`capturas/`, harness, datos simulados)
`1280-` y `375-` × `alineado-01-primera-pantalla`, `01b-completa`, `02-informacion-datos`, `03-detalle`, `04-detalle-reingreso-y-filtro-activo`, `05-paginacion`; `atrasado-01-primera-pantalla`, `01b-completa`, `02-panel-sucursales`, `03-confirmar-exclusion`, `04-centenario-excluida`; `estado-carga`, `estado-vacio`, `estado-error`.

## Limitaciones y pendientes
- Datos sintéticos: la mezcla de lecturas no representa la real; en el rango de 30 días no hay «Revisar: sin ventas» (necesita ≥ 47 días con stock): aparece con 60 d. Los códigos del catálogo del harness usan marcas/rubros del fixture del harness.
- La exclusión de un local vive solo en el estado de la vista (no se persiste): tras recargar se consultan todas las sucursales y la línea de alcance muestra las efectivamente consultadas (validado). Las quitadas desde el botón «Sucursales» de la barra superior se indican aparte en el alcance.
- Falta validar en un entorno real con Sysneo y con el endpoint desplegado (hoy solo existe en local); el período global de la barra superior no se usa en esta vista.

## Ajustes previos al commit (revisión 2)
1. **Barra superior compacta:** sin tarjeta vacía; solo «Sucursales» y «Actualizar» alineados (36 px escritorio, 40 px móvil). Las subpestañas terminan en 218 px (escritorio) y 214 px (móvil).
2. **Panel de sucursales móvil:** por local, 1.ª línea nombre + acción; debajo fecha de stock, estado y última venta. Nombres largos sin desborde; confirmación de exclusión a 375 px con botones ≥ 40 px y foco en Cancelar.
3. **Foco y scroll:** al abrir paneles o detalles el encabezado fijo deja visibles título y control enfocado; Escape cierra confirmación → panel → información → detalle y devuelve el foco.
4. **Depósito 90:** «Stock informado por el sistema · sin fecha de actualización disponible» (la referencia ADR-032 queda solo en la documentación). La exclusión sigue limitada a Ingresos recientes, con su aviso de alcance.

## Cambio posterior (integración con datos reales)
La tarjeta móvil junta marca/rubro y «Detalle» en un renglón y el panel «Sucursales» de la barra global queda dentro de la pantalla en móvil. Detalle y comparación con la API real: `../integracion-real/README.md`.
