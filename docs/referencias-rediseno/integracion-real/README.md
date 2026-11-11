# Integración de Ingresos recientes con croma-api local + Sysneo (solo lectura)

Validación del 2026-11-11 con **datos reales** (no simulados): frontend → `croma-api` local (`localhost:3001`, `GET /analisis/ingresos-recientes`) → Sysneo_Croma con la cuenta de consulta existente. La ruta solo hace `SELECT`; no se escribió nada en Sysneo ni en ninguna base. Los datos de las capturas son reales (productos, ventas y stock al 10/11/2026).

## Cómo reproducirla
```bash
# 1) API local (DB_PASSWORD ya está en el entorno; las SQLite de rotaciones/snapshots no se usan en esta ruta: ROTACIONES_DB_PATH apunta a un archivo temporal)
cd ../croma-api && PORT=3001 ROTACIONES_DB_PATH=<archivo-temporal.db> JWT_SECRET=<cualquiera> node index.js
# 2) frontend en :8771 (origen permitido por CORS) apuntando a la API local, sin tocar index.html del repo
node tests/harness/servidor-front-real.js
# 3) validación (Playwright + Edge)
node tests/harness/validacion-integracion-real.js
```
Resultado completo en `resultados-integracion-real.json`; capturas en `capturas/` (`1280-` y `375-real-*`).

## Resultado: 173/173 comprobaciones OK (1280×800 y 375×812)
Cada paso compara lo que muestra la pantalla con el JSON del **mismo pedido** (cuenta de códigos, seis contadores, cantidad de filas y, en las primeras 6 filas: código, fecha y unidades del ingreso, ventas, días con stock, stock de sucursales y lectura).
- **Consulta inicial** (`dias=30`, sucursales explícitas, `limit=50`): 206 códigos; contadores 1/0/0/63/2/140. Estado alineado: las 5 sucursales con stock al 10/11, corte 10/11.
- **Períodos:** 30 d y 60 d (467 códigos; 17/3/1/86/7/353).
- **Filtros:** código, tipo = reingreso (78), lectura = con ventas (140), orden por ventas (descendente verificado), formulario de marca/rubro/código; **paginación** (offset=50, sin repetidos).
- **Detalle:** primer ingreso, reingreso con stock previo (02312: stock previo 6 u.), historial insuficiente (con 60 d: 3 códigos, `DÍAS CON STOCK — no disponible: el stock no cuadra con los movimientos`), valores `null` en «—» con su motivo, desglose por sucursal (stock/ventas/días/fecha) idéntico a `por_sucursal`.
- **Fechas por fuente y ventas observadas:** «Información de los datos» muestra la fecha de stock por sucursal y «observadas hasta» de la API; Depósito 90 «sin fecha de actualización disponible».
- **Exclusión de Wave:** el pedido pasa a `sucursales=0001,0010,0012,0014`, la API devuelve 4 sucursales y los contadores (1/0/1/69/3/132), filas y detalle coinciden; **reincorporada** vuelve a los números iniciales. Tras recargar no queda exclusión.
- **Navegación y selección global:** Oportunidades ↔ Ingresos recientes, Dashboard → Ingresos; quitar Perito Moreno con el botón «Sucursales» de la barra llega a la API (`0001,0005,0012,0014`) y el alcance lo informa; se restaura sin residuos.
- **Atraso:** hoy todas las sucursales están alineadas, así que el atraso sigue validado **solo como escenario simulado** del harness (`validacion-ingresos-recientes.js`, 106/106).

## Tiempos observados
| Paso | Tiempo en pantalla | API |
|---|---|---|
| Consulta inicial (clic → filas) | 0,5–0,7 s con caché; **hasta 19 s** una vez en frío | frío 2,2–3,1 s medido directo; 19,2 s observado una vez |
| Período 60 d | 0,4 s (caché) | frío 3,0 s (2,9 s en la corrida móvil de la primera pasada) |
| Paginación (página 2) | 0,8 s | 5–12 ms |
| Sin una sucursal (consulta nueva) | ~0,4–2,5 s | frío 2,2 s, caché 0,15 s |
| Carga de la app hasta las pestañas | 0,3 s | — |

Frío = primera consulta de cada alcance/período tras 180 s sin pedirla (caché de la ruta). La variación de 2–3 s a 19 s es de Sysneo (red `cromawave.dyndns.org`), no del frontend; la pantalla muestra el esqueleto de carga mientras tanto.

## Problemas de integración encontrados y corregidos
1. **Panel «Sucursales» de la barra global salía de la pantalla en móvil** (x = −159 px a 375 px; también en Stock Ventas, ya existía): el botón queda a la izquierda y el panel estaba anclado a la derecha. `index.html` (≤ 640 px) ancla el panel a la izquierda con ancho acotado; `ingresos-recientes-vista.css` lo cubre hasta 700 px en esta vista.
2. **Primera tarjeta móvil con datos reales no entraba en la primera pantalla** (nombre largo + lectura con umbral): marca/rubro y «Detalle» comparten renglón (la zona táctil de «Detalle» pasó a 40 px sin agrandar la tarjeta). Primer producto: 623–774 de 812 px.
3. Etiqueta de lectura: la pantalla usa nombres cortos («Sin exposición», «Vendió y agotado»); la etiqueta completa de la API queda en el `title` de cada lectura y se valida.

## Notas
- `limit=50` en la interfaz; el servidor también cachea por alcance (180 s alineado).
- Sin errores HTTP, de consola ni de script en ningún flujo.
