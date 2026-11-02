# Harness de verificación de la interfaz (Fase 5)

Levanta el frontend y los routers reales de `croma-api` (repo hermano `../croma-api`, o `CROMA_API_DIR`) en un solo origen local.

```bash
node tests/harness/servidor.js --puerto=8795          # normal (migrada, perfiles habilitados)
node tests/harness/servidor.js --puerto=8796 --sin-migrar   # estado "módulo no listo"
node tests/harness/servidor.js --sin-senal            # perfiles no habilitados
```
Cerrar con Ctrl+C (borra la SQLite temporal, que vive en el directorio temporal del sistema). Entradas de `.claude/launch.json`: `fase5-harness` y `fase5-harness-sin-migrar`.
Sin credenciales: el token admin se firma con un secreto propio del harness. Datos: universo sintético de `croma-api/scripts/fixtures`.

## Qué NO prueba (no reemplaza una prueba en el entorno real)
- **Sysneo**: el pool SQL es simulado y solo responde Oportunidades y catálogo; Dashboard, Marcas y demás pestañas que dependen de `/analisis/resumen`, `/series`, etc. devuelven vacío y muestran error. Su integración NO se verificó con este harness.
- **CSP**: el harness sirve una copia del `index.html` con `connect-src 'self'` (en producción es `https://stock-api.croma-app.com.ar`) y con `STOCK_API_URL` vacío. El archivo del repo no se modifica. Los recursos nuevos (`oportunidades-*.js`/`.css`) son del mismo origen y entran en `script-src 'self'` / `style-src 'self'`; no usan `innerHTML` con datos ni scripts inline nuevos.
- **Auth real, CORS entre `analisis.croma-app.com.ar` y `stock-api`, PM2, Caddy y la base de DEPO BASE**: no se simulan (mismo origen, token de prueba, SQLite temporal).
- Los controles `?rol=`, `?expirado=` y `/__h/*` existen solo aquí.
