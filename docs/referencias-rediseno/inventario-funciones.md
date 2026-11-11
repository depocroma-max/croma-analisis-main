# Inventario de funciones actuales a preservar (Oportunidades)

Fuente: código del repo `croma-analisis-main` (commit `75cec54`) y harness. Todo lo marcado **[API]** viene resuelto por `croma-api`; la pantalla no calcula reglas.

## 1. Marco común (index.html)
- **Barra de período:** `Desde` / `Hasta` globales (se guardan en la sesión; los cambios abortan las consultas en curso y limpian cachés). Los accesos 30/60/90 días de Oportunidades escriben en estos mismos campos.
- **Sucursales N/6:** panel con casillas por sucursal (Cipo San Martín aparece «cerrada» y desmarcada). Botones *Todas*, *Cancelar*, *Aplicar*. La elección queda en el navegador (`localStorage`) y **afecta stock y ventas** de Dashboard, Marcas, Productos, Talles y colores, Stock Ventas y Oportunidades; no cambia Rotaciones. Si el servidor no devuelve el eco `sucursales`, el botón avisa que la selección no se aplica.
- **Pestañas:** Dashboard · Marcas · Productos · Talles y colores · Stock Ventas · **Oportunidades** · Reglas · Rotaciones. En móvil la barra se desplaza horizontalmente. **Reglas solo existe para administradores** (la pestaña se elimina si el rol no es `admin`).
- **Actualizar:** el manejador recarga el resumen, las series y, si hay un filtro aplicado, la lista completa de Productos (no relanza por sí mismo la consulta de la lista de Oportunidades).

## 2. Oportunidades: filtros
- Campos: **Código exacto** (máx. 40 caracteres, sin caracteres de control), **Marca**, **Rubro**, **Subrubro** (selección múltiple). *Aplicar* y *Limpiar*. Aplicar sin filtros es válido (consulta todo). Solo un valor realmente inválido muestra error y abre el panel.
- **Chips de filtros activos** con «×» por campo.
- **Móvil (≤ 700 px):** los filtros pasan a un desplegable «Filtros · resumen de lo activo», cerrado por defecto; se abre solo ante un error de validación.
- **Prioridad** (todas / alta / media / baja): select del panel de la lista. **Filtros de rotación** (confianza, origen, destino, mínimos de ventas, stock y cobertura) solo cuando la lista es de *posible rotación*.

## 3. Contexto, grupos y conteos
- **Contexto:** período y días, sucursales consideradas (cantidad y nombres), reglas (*estándar* o *conjunto personalizado activo*; el `#id` del conjunto solo lo ve el administrador).
- **Seis grupos** con contador: Todas · Reposición · Rotaciones · Rendimiento · Estancados · Revisar datos. Orden de los 11 estados = urgencia del motor.
- **Semántica de conteos (no cambiar):** un producto cumple un estado si es principal **o** secundario; el contador de un chip = productos que lo cumplen; el de un grupo = productos **únicos** (unión, nunca suma de chips); «Todas» = `total_clasificados`; la suma de grupos puede superar a «Todas». Valor no disponible → «—», **nunca 0**.
- Nota fija «Un producto puede aparecer en varios grupos» con ayuda accesible.
- **Chips de estados** del grupo elegido, con punto de severidad (el color nunca es el único indicador). «Seguimiento» se rotula **«Ingreso reciente»**.

## 4. Lista (tabla en escritorio, tarjetas en móvil)
- **Orden:** fijo «Ordenado por urgencia» (prioridad del estado principal y criterio propio del motor); no hay orden elegible.
- **Columnas:** Producto (código + nombre, marca · rubro, línea de ingreso de proveedor) · Acción / rendimiento (acción con prioridad, «También: estado» si aparece por estado secundario, «Otras acciones», rendimiento, «Validar por variante») · Por qué aparece (motivo corto; en rotación, par destino/origen con nombres de sucursal) · Ventas del período (marca «devoluciones» si es negativa y «muestra chica» si el ratio no es confiable) · Stock sucursales / Depósito 90 · Cobertura · Ver detalle.
- **Cobertura:** días al ritmo del período; sin ventas = «Sin ventas» (no 0 días); se colorea solo en productos con estado de reposición y solo cuando rigen los umbrales globales.
- **Paginación:** 50 por página; «Mostrando a–b de N»; ‹ páginas con «…» › ; si el offset queda fuera de rango vuelve a la última página válida; cambiar filtros vuelve a la página 1.
- **Contador:** cuando el filtro de prioridad reduce la lista, «X de Y productos».

## 5. Detalle expandido
- Uno a la vez; abrir/cerrar conserva filtros, página, scroll y devuelve el foco al botón de la fila.
- Contenido: acción sugerida, rendimiento, ventas y stock, **ingresos de proveedor** (último ingreso, cantidad, período), **Por qué aparece** (desplegable), stock por sucursal, desbalance entre sucursales, tendencia (se carga al abrir) y accesos «Ver en Productos / Talles y colores».
- **Solo administradores:** bloque técnico (huellas, perfil y conjunto aplicados).

## 6. Estados y avisos
- **Carga:** «Calculando oportunidades del período…» / «Actualizando…», contadores en «—», `aria-busy`.
- **Error:** mensaje con la causa y botón **Reintentar**.
- **Vacío:** mensajes distintos para Depósito 90, filtros activos y sin oportunidades.
- **Avisos:** «Sucursales no consideradas» (p. ej. Cipo, cerrada: conserva consulta histórica en otras secciones); discrepancia entre listado y contador; servidor viejo sin soporte de varios estados («No se puede mostrar este grupo…»).
- **Concurrencia:** cada consulta lleva número de secuencia y `AbortController`; una respuesta vieja no reemplaza a la vigente.

## 7. Permisos
| Elemento | Quién lo ve |
|---|---|
| Pestaña y vista **Reglas**, botón «Ver reglas» | administrador |
| `#id` del conjunto activo, bloque técnico del detalle | administrador |
| Oportunidades (lista, filtros, detalle) | cualquier usuario con acceso a Análisis |

## 8. Móvil (≤ 700 px) y accesibilidad
- Filtros plegables, **tarjetas** (producto, acción, motivo, datos en rejilla, detalle en la misma tarjeta), grupos en 3 columnas, período rápido compacto, pestañas con desplazamiento horizontal. El cambio de ancho redibuja la vista.
- Foco visible en todos los controles, `role="status"/"alert"` en avisos, `aria-expanded` en el detalle, `aria-current` en la paginación. Todo texto de la API entra como `textContent`.

## 9. Ingresos recientes (aún sin pantalla en Croma)
Contrato: `GET /analisis/ingresos-recientes` (commit `5a1ad3a`). Lo que el rediseño debe contemplar (ver `contrato/`):
- **Rango por último ingreso** (7/15/30/60 días o desde–hasta, máx. 180) y **corte** = cierre de ayer (Argentina). Los ingresos de hoy no entran.
- **Fuentes con su fecha:** sucursales por centro (`stock_actual.sucursales.por_centro`, estado `ok`/`atrasado`/`fecha_desconocida`), Depósito 90 (`fecha_actualizacion: null`, en vivo por ADR-032) y Fallados 93 (fecha verificada o `null`).
- **Ventas observadas** (`ventas.completitud: 'desconocida'`): explicación única y accesible, no repetida por fila.
- **Lecturas:** Historial insuficiente · Revisar: sin ventas (con umbral y origen rubro/global) · Sin exposición en sucursales · En observación · Vendió y hoy está agotado · Con ventas. «Arrancó bien» está pendiente.
- **Valores `null` que hay que respetar:** `dias_con_stock_sucursales`, `stock_previo_sucursales`, `variantes_agotadas_con_ventas`, `stock_previo_deposito_90`, `fecha_actualizacion` (Depósito 90).
- **Reingreso con stock previo:** las ventas son del código desde el ingreso; su atribución al lote nuevo está pendiente.
- **Alcance de sucursales siempre visible.** Cipo no se considera (`sucursales_ignoradas`).
- **Decisiones de diseño ya tomadas:** el aviso de stock atrasado lleva la acción **«Revisar sucursales»**; excluir un local debe mostrar con claridad que **cambia el alcance de ventas y de stock** (es una acción explícita del usuario, nunca automática).
