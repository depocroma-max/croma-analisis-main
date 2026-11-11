# Referencias para el rediseño de Oportunidades e Ingresos recientes

Preparadas el 2026-11-11 para el diseño posterior. Estado del código: `croma-analisis-main` en `75cec54` (sin cambios locales) y `croma-api` en `5a1ad3a`. **No se modificó ningún archivo de la aplicación**: esta carpeta es solo documentación.

## Índice
| Archivo | Contenido |
|---|---|
| `README.md` | Este índice, procedencia de los datos, requisitos de diseño y qué va a Studio o al harness. |
| `inventario-funciones.md` | Funciones actuales a preservar: conteos, filtros, orden, permisos de administrador, móvil, estados y requisitos de Ingresos recientes. |
| `tokens-visuales.md` | Ubicación de `tridente_solo.png`, `croma-ds.css`, `croma-icons.js` y los tokens visuales relevantes. |
| `capturas/` (23 PNG) | Capturas de Oportunidades a 1280 y 375 px (tabla siguiente). |
| `contrato/oportunidades_publica.json` | Respuesta **real** de `GET /analisis/oportunidades` (API de producción, 3 productos). |
| `contrato/ingresos-recientes_alineado.json` | Respuesta **real** de `GET /analisis/ingresos-recientes?dias=60` con todas las sucursales al día (8 filas representativas). |
| `contrato/ingresos-recientes_atrasado_SIMULADO.json` | **Simulado:** los mismos datos reales con el sello de stock de Centenario (0012) forzado al 2026-11-09. |

## Procedencia y qué es simulado
- **Capturas:** harness local (`node tests/harness/servidor.js --puerto=8795`) con el universo **sintético** de `croma-api/scripts/fixtures` y un token de pruebas. Navegador: Edge headless (Playwright), escritorio 1280×900 y móvil 375×812 a 2×. No son datos de Sysneo.
- **Carga, vacío y error están simulados:** carga con la respuesta de Oportunidades demorada 15 s; vacío con el universo vacío del harness (`/__h/universo?n=vacio`); error forzando HTTP 500. Sus nombres terminan en `-simulado`.
- **Oportunidades (contrato):** respuesta real de producción. Esa versión **todavía no incluye `ingreso_proveedor`** (commit `2915afb`, sin desplegar), por eso las filas no traen ese campo aunque la pantalla local lo muestre.
- **Ingresos recientes (contrato):** el endpoint **no está desplegado**; se ejecutó el router local contra Sysneo en solo lectura. El ejemplo *alineado* es real (al generarlo las 5 sucursales estaban al 2026-11-10). El ejemplo *atrasado* es simulado porque ese día ninguna sucursal estaba atrasada; está identificado en el nombre del archivo y en `_nota_referencia`.
- Los JSON son datos comerciales (códigos, nombres de producto, stock y ventas). No contienen credenciales ni datos personales. `data` está recortada a pocas filas; `paginacion` y `resumen` conservan los valores reales. Se respetan nombres de campo, valores `null` y longitudes originales.

## Capturas
| Archivo | Muestra |
|---|---|
| `desktop-01-principal.png` / `desktop-01b-…primera-pantalla.png` | Vista principal completa y primera pantalla: barra de período, pestañas, filtros, contexto, grupos, tabla. |
| `desktop-02-filtros.png` | Franja de filtros (código, marca, rubro, subrubro). |
| `desktop-03-detalle-expandido.png` / `desktop-03b-…pagina-completa.png` | Fila con el detalle abierto (y la página completa). |
| `desktop-04a/04b-paginacion-pagina-1/2.png` | Paginación en la página 1 y la 2. |
| `desktop-05-panel-sucursales.png` | Panel «Sucursales a considerar» abierto (nota: afecta stock y ventas de las pestañas). |
| `desktop-06-carga-simulada.png`, `desktop-07-vacio-simulado.png`, `desktop-08-error-simulado.png` | Estados **simulados**. |
| `movil-01-principal.png` / `movil-01b-…primera-pantalla.png` | Móvil: barra apilada, pestañas con scroll, filtros plegados, grupos en 3 columnas. |
| `movil-02a-filtros-plegados.png` / `movil-02b-filtros-abiertos.png` | Filtros plegados y abiertos. |
| `movil-03-detalle-expandido.png` / `movil-03b-…tarjeta-completa.png` | Tarjeta con el detalle abierto. |
| `movil-04a/04b-paginacion-pagina-1/2.png`, `movil-05-panel-sucursales.png` | Paginación y panel de sucursales. |
| `movil-06-carga-simulada.png`, `movil-07-vacio-simulado.png`, `movil-08-error-simulado.png` | Estados **simulados**. |

Límites: el harness solo responde Oportunidades y catálogo (no Dashboard, Marcas, series ni Sysneo), así que la tendencia del detalle y otras pestañas no tienen datos reales. Ingresos recientes **no tiene pantalla** todavía: su diseño parte del contrato.

## Requisitos de diseño ya acordados
1. El aviso de **stock atrasado** (o con fecha desconocida) tiene como acción **«Revisar sucursales»**. Debe mostrar los locales afectados, sus fechas de actualización y el corte solicitado, y explicar por qué faltan las métricas históricas (días con stock y stock previo).
2. **Excluir un local** es una acción explícita del usuario y debe mostrar con claridad que **cambia el alcance de ventas y de stock** de lo que se está viendo. Nunca se excluye automáticamente.
3. El alcance de sucursales y las fechas de referencia de cada fuente permanecen siempre visibles.
4. «Ventas observadas» con una única explicación accesible sobre la completitud desconocida; Depósito 90 respeta su aclaración (ADR-032).

## Qué puede representarse en Nequ Studio y qué requiere el harness
| Referencia | Studio (capacidades actuales) | Prototipo en el harness |
|---|---|---|
| Tokens, paleta, radios, tipografía y logo | **Sí** (tema de 9 colores, radio, relleno; el tridente como recurso). Bebas Neue y DM Sans no están disponibles: se aproximan con Manrope/Inter. | — |
| Navegación (pestañas y subpestañas Oportunidades / Ingresos recientes) | Maqueta estática con `header` y `buttons`. | Cambio real de pestaña, estado y foco. |
| Tira de grupos/lecturas con contadores | **Sí** (`benefits`, hasta 8 cifras). | Selección, contadores reales, estados «—». |
| Alcance de sucursales y fechas de referencia | **Sí** como datos rotulados (`event-info`, hasta 8). | Panel de sucursales con casillas y recarga. |
| Aviso de stock atrasado con «Revisar sucursales» | **Sí** como banner (`cta`). | El flujo completo: abrir el panel, excluir un local, ver el cambio de alcance y recalcular. |
| Tarjetas móviles | **Sí** (`services` en 1 columna) como composición visual. | Densidad real, detalle dentro de la tarjeta, foco y teclado. |
| Tabla de escritorio, encabezado fijo, columnas alineadas | **No** (no hay bloque de tabla). | **Sí, requerido.** |
| Filtros con selectores múltiples, fechas y desplegable móvil | Solo chips estáticos y dos tableros (plegado/abierto). | **Sí, requerido.** |
| Detalle expandido de fila, paginación | Solo un tablero aparte del detalle. | **Sí, requerido.** |
| Carga, vacío, error | Vacío y error como banners estáticos; la carga (skeleton) no existe. | Estados reales y reintento. |
| Explicación accesible de «ventas observadas» | Texto fijo; sin tooltips ni desplegables. | Desplegable accesible. |
| Cambio de diseño por ancho (≤ 700 px) | Variantes por dispositivo (visibilidad de bloques) en 1280/768/375. | Comportamiento responsive real. |
