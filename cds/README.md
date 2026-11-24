# cds/ · Croma Design System 2.0 en Croma Análisis (Etapa A: base visual)

Estado: **bandera `cds-v3` APAGADA por defecto**. Sin ella la aplicación es idéntica a la anterior y no se descarga ningún archivo de esta carpeta.

## Cómo se enciende y se apaga
- Abrir la aplicación con `?cds-v3=1` (se recuerda en este navegador, en `localStorage` con la clave `cds-v3`) y `?cds-v3=0` para volver. Es una preferencia de interfaz, no un dato de negocio.
- Para que sea la interfaz por defecto de todos los usuarios hay que cambiar `CDS_V3_POR_DEFECTO` a `true` en el bloque de `index.html`; incluso entonces `?cds-v3=0` la apaga en ese navegador. **No se cambió: requiere aprobación.**
- Reversión: quitar el bloque de `index.html` (o dejar la constante en `false`). Ninguna otra parte del código depende de esta carpeta.

## Qué hay
| Archivo | Contenido |
|---|---|
| `tokens.css` | Tokens del sistema (color, tipografía, espaciado, radios, elevación, movimiento, medidas). **Todos con prefijo `--cds-`** para no chocar con `croma-ds.css` ni con `index.html` (por ejemplo, `--info-bg` existe en ambos con otro valor). |
| `componentes.css` | Componentes reutilizables `cds-*` (botones, campos, filtros, indicadores, tabla compacta, tarjeta móvil, avisos, panel de detalle, modal, estados, etc.). Sin resets globales: no toca `body`, `html` ni `button`. Los estados comerciales usan `[data-cds-g]`. |
| `app-shell.css` | Estructura de la aplicación bajo `html.cds-v3`: barra lateral (riel de iconos ≤ 1100 px), barra inferior móvil (≤ 760 px), encabezado, márgenes y piel de la barra superior existente. |
| `shell.js` | Crea la barra lateral, la barra inferior y la hoja «Más» **delegando en las pestañas existentes** (`#rtTabs .tab`): hace click sobre ellas, así `rtCambiarVista()` y todo lo que ya cuelga de esa pestaña ocurre igual. Refleja en espejo la pestaña activa y la presencia de cada una (Reglas desaparece para quien no es administrador). |

## Qué NO cambia en esta etapa
Las vistas (`#rtPanelHost`), los filtros, los endpoints, los cálculos, los permisos y las demás pestañas. Las pestañas viejas siguen en el DOM (ocultas con la bandera) y siguen siendo la única fuente de la navegación.
Las seis decisiones funcionales aprobadas (búsqueda por nombre, Aplicar/Limpiar con pendientes, vista «Por acción», seguimiento, Talle y color e ingreso/rendimiento en el detalle) **no se implementan aquí**: son las Etapas B a D.

## Diferencias respecto del prototipo aprobado (`v3-conceptos/A-refinado`)
- Variables con prefijo `--cds-` y atributo `data-cds-g` (el prototipo usaba nombres sin prefijo).
- El shell no reescribe las pestañas: las acciona. La barra superior legacy se reutiliza como encabezado (conserva sesión, Hub, «Sucursales» y «Actualizar»).
- La tipografía Geist se aplica solo a la interfaz nueva (barra lateral, barra inferior, hoja «Más», encabezado de sección); el contenido de las vistas conserva su tipografía actual hasta que cada vista se migre.
- Sin «Mis seguimientos» ni «Por acción» (Etapas B y D). La navegación tiene las 8 secciones actuales.
- El enlace «Saltar al contenido» y `tabindex="-1"` en `#rtPanelHost` son nuevos (solo con la bandera).

## Pruebas
`node --test tests/*.test.js` (incluye `tests/cds-v3.test.js`: bandera y guardas estáticas) y, con el harness levantado (`node tests/harness/servidor.js --puerto=8797`), `node tests/harness/validacion-cds-v3.js` (72 comprobaciones) y `node tests/harness/capturas-cds-v3.js` (capturas y huella del DOM).

## Etapa D1B · «Mis seguimientos» (interfaz)
Solo con la bandera `cds-v3`. Archivos: `seguimientos-api.js` (lógica y cliente HTTP, sin DOM, probado en Node), `seguimientos.js` (interfaz) y `seguimientos.css`.
- **Se activa solo si el servidor lo habilita para la persona**: al cargar hace un sondeo (`GET /seguimientos/?limit=1`). Con el interruptor del servidor apagado (404), sin permiso (401/403) o sin sesión, **no agrega nada** (ni pestaña ni estrellas). Con 503 muestra la sección con un estado de error y «Reintentar».
- **Estrella «Seguir»** (`.cds-seg-estrella`) en filas, tarjetas y cabecera del detalle de Oportunidades, variantes por talle y color y distribución por sucursal. Se engancha a los atributos `data-cds-*` de C3 con un `MutationObserver`: no modifica esas vistas. El estado de todas las estrellas visibles se pide **por lote** (`GET /seguimientos/claves`, máximo 100 claves por solicitud).
- **Diálogo** de alta: 5 niveles (los no disponibles desde ese contexto explican por qué), motivo opcional, aviso de seguimiento ya existente (bloquea) o de nivel superior (no bloquea), protección de doble clic (botón deshabilitado + clave de idempotencia que cambia solo si cambia el pedido), errores del servidor traducidos.
- **Sección «Mis seguimientos»** (grupo Decisiones): resumen de activos/finalizados, búsqueda por código y nombre, filtros por nivel, sucursal y propietario («todos» = solo lectura), tabla en escritorio y tarjetas en móvil, paginación. Sin gráficos ni novedades: la evolución real es D2.
- **Detalle**: información inicial, referencia al iniciar (o el motivo por el que no está disponible), notas, historial, editar motivo, finalizar (con confirmación) y reabrir. Respeta versiones (`If-Match`, 412 recarga la versión vigente sin perder el texto escrito) e idempotencia. En seguimientos ajenos es solo lectura.
- **No usa `localStorage`** para nada comercial. Los permisos y la sesión los valida el servidor.
- Pruebas: `node --test tests/cds-seguimientos-d1b.test.js` (unitarias) y, con el harness `--seguimientos` contra el backend real de la rama `seguimientos-d1a`, `node tests/harness/validacion-d1b.js` (E2E, 113 comprobaciones). Ver `docs/cds-v3/d1b/`.
