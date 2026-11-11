# Recursos visuales y tokens de Croma Análisis

## Ubicación (rutas absolutas, repo `croma-analisis-main`)
| Recurso | Ruta | Notas |
|---|---|---|
| Tridente (logo de marca) | `D:\Documentos\Croma app\croma-analisis-main\tridente_solo.png` | PNG de 536 KB; se usa en la barra superior. Studio puede referenciarlo como recurso propio (`asset:`). |
| Design system base | `D:\Documentos\Croma app\croma-analisis-main\croma-ds.css` | Tokens + botones, tarjetas, formularios, badges. Se carga antes que el CSS de la pantalla. |
| Íconos | `D:\Documentos\Croma app\croma-analisis-main\croma-icons.js` | Íconos SVG propios (store, warehouse, package, eye, filter, search, calendar, clock, check, info, bell, refresh, users, user, edit, save, trash, plus, x…). |
| CSS de Oportunidades | `…\oportunidades-vista.css` (clases `ov-*`) y `…\oportunidades-reglas.css` | Usan solo tokens del design system. |
| Estilos de la barra y pestañas | `…\index.html` (bloque `<style>`, clases `.tabs`, `.tab`, `.btn-sm`, `.rt-*`) | Pestañas: fondo blanco, borde `--gray-100`, radio 12, pestaña activa negra con texto blanco. |
| Tipografías | Google Fonts (CSP permite `fonts.googleapis.com` / `fonts.gstatic.com`) | Títulos **Bebas Neue**; texto **DM Sans**. |

## Tokens (de `croma-ds.css`, `:root`)
**Marca:** negro `#0d0d0d` (`--croma-black`, `--black`), rojo `#e8251a` (`--croma-red`, `--accent`), blanco `#ffffff`.
**Fondos y grises:** `--bg` `#f7f7f5` · `--gray-50` `#f7f7f5` · `--gray-100` `#efefec` · `--gray-200` `#ddddd8` · `--gray-300` `#cfcfc8` · `--gray-400` `#a0a09a` · `--gray-500` `#8a8a84` · `--gray-600` `#666660` · `--gray-800` `#333330`.
**Estados (texto / fondo):** success `#16a34a` / `#dcfce7` · warning `#d97706` / `#fef3c7` · danger `#dc2626` / `#fee2e2` · info `#2563eb` / `#dbeafe`. En Oportunidades las píldoras usan además `#92400e` (ámbar sobre fondo cálido) y `#166534` (verde).
**Sucursales (color / fondo suave):** Paseo 01 `#185FA5` / `#E6F1FB` · Wave 05 `#0F6E56` / `#E1F5EE` · Cipo 09 `#B45309` / `#FEF3C7` · Perito Moreno 10 `#9B2563` / `#FCE7F3` · Centenario 12 `#534AB7` / `#EEEDFE` · Roca 14 `#3B6D11` / `#EAF3DE` · Depósito `#475569` / `#E2E8F0`.
**Tipografía:** `--font-display: 'Bebas Neue', sans-serif` · `--font-body: 'DM Sans', sans-serif`. Cuerpo 13–15 px; encabezados de tabla 11 px en mayúsculas con `letter-spacing: .05em`; números tabulares en tablas.
**Radios:** sm 6 · md 10 · lg 14 · xl 20 · pill 999. **Sombras:** sm `0 1px 3px rgba(0,0,0,.08)` · md `0 4px 16px rgba(0,0,0,.10)` · lg `0 12px 32px rgba(0,0,0,.16)`.
**Espaciado:** 4 · 8 · 12 · 16 · 20 · 24 · 32 px (`--space-1…8`). **Transiciones:** `.12s` / `.2s ease`.
**Foco:** anillo `0 0 0 3px rgba(232,37,26,.35)` en botones del DS; `3px solid var(--info)` con `outline-offset: 2px` en Oportunidades.

## Componentes del DS reutilizables
Botones `.btn` (`-primary` rojo, `-secondary` negro, `-outline`, `-ghost`, `-danger`, `-success`, `-icon`, `-block`), `.btn-sm` (acciones de barra), tarjeta `.card` / `.card-hover`, formulario `.form-control` / `.form-select`, `.badge` (`-success`, `-warning`, `-danger`, `-neutral`), pestañas `.tabs` / `.tab`. En Oportunidades: píldora `.ov-pill-{danger|warning|success|neutral}`, chip `.ov-chip`, tarjeta de grupo `.ov-grupo` (borde izquierdo del color del grupo; seleccionada = borde negro grueso + tilde).

## Reglas visuales vigentes
- **Rojo = urgencia/advertencia; ámbar = atención; verde = rendimiento.** El color nunca es el único indicador (siempre hay texto, tilde o ícono).
- Tabla con encabezado fijo bajo la barra superior (`--ov-sticky-top`), filas de 12 px de relleno, hover gris, fila activa celeste suave.
- Radio 14 en paneles, 10 en tarjetas y controles, 6 en píldoras, 999 en chips.
