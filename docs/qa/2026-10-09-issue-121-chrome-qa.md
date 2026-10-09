# QA básico de Pagos, issue #121

## Contexto

- Fecha: 2026-10-09.
- Entorno: `pnpm revisar`, PostgreSQL desechable `planilla_rev_121`, `http://localhost:3121`.
- Rama: `agent/issue-121-borrador-sueldo`, commit `670eb918`.
- Herramienta: Chromium con Playwright. Se observaron errores de consola, excepciones de página y respuestas HTTP 5xx durante el recorrido. No se usó DevTools.
- Roles: Finanzas y Administrador del sistema, con cuentas del seed. Anchos: 1280 px y 375 px.

## Cobertura

| Caso | Comprobación final | Estado | Evidencia |
| --- | --- | --- | --- |
| Finanzas abre la lista de meses y el mes 10/2026 | La lista y el borrador cargan; el mes muestra bloqueos, sueldo calculado y neto incompleto | Aprobado | [Lista](evidencia-issue121/01-meses-1280.png), [mes](evidencia-issue121/02-mes-1280.png) |
| Finanzas filtra por Ana y abre su detalle | El filtro deja solo a Ana; el detalle separa mes de pago, corte de incidencias y mes de devengue | Aprobado | [Detalle](evidencia-issue121/03-persona-1280.png) |
| Lista, mes y detalle a 375 px | Las tres rutas cargan y el documento no se desborda horizontalmente | Aprobado | [Lista](evidencia-issue121/04-meses-375.png), [mes](evidencia-issue121/05-mes-375.png), [detalle](evidencia-issue121/06-persona-375.png) |
| Administrador entra por URL a las tres rutas | El servidor presenta «Sin permiso» en las tres | Aprobado | [Detalle denegado](evidencia-issue121/07-sin-permiso-admin-1280.png) |
| Consola y red de esas rutas | Sin errores de consola, excepciones de página ni HTTP 5xx en la pasada final | Aprobado | Registro del humo local |

## Hallazgo corregido durante el humo

La primera pasada mostró «No se pudo cargar la pantalla de Pagos» al abrir la lista y el mes. El seed tenía un período cerrado sin revisión congelada. La corrección `670eb918` creó la revisión del seed y convirtió una revisión ausente en bloqueo visible del mes. La segunda pasada cargó ambas rutas; una prueba PostgreSQL y un e2e cubren la regresión.

## Pendientes

No se probaron finalización, exportación ni cálculo del neto, que pertenecen a tickets posteriores. El seed y las sesiones de prueba son desechables; `pnpm revisar:limpiar` los elimina.
