# QA básico del issue #122

## Entorno

- Fecha: 2026-10-10.
- Rama: `agent/issue-122-pagos-horas-extra`, commit `529abfa`.
- App: `pnpm revisar` en `http://127.0.0.1:3122`, con PostgreSQL desechable `planilla_rev_122` y seed de demo.
- Navegador: Chromium mediante Playwright, con observación de consola, excepciones y respuestas HTTP 500 o mayores. Cuenta `finanzas` del seed. No se usó DevTools.

## Recorridos

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| `/periodos`: candidata pendiente de Carla y decisión de descarte con causa `marca_erronea` y motivo. Tras recargar, quedó descartada (45 min al 25 %, 0 pendientes). El formulario no ofrece descanso compensatorio. | Aprobado | [Períodos después del descarte](issue-122-periodos-descarte-1280.png), [ancho 375](issue-122-periodos-375.png) |
| `/asistencias` y `/asistencias/importar`: ambas rutas cargan. El calendario de Beto muestra la asistencia usada para la valoración. | Aprobado para carga; no se importó un archivo en este humo | [Asistencias](issue-122-asistencias-1280.png), [importación](issue-122-importar-1280.png) |
| `/pagos/condiciones-laborales` y detalle de Beto: muestran «Asignación familiar otorgada» y los valores vigentes. | Aprobado | [Lista](issue-122-condiciones-1280.png), [detalle a 375](issue-122-condiciones-beto-375.png) |
| `/pagos/2026-10`: muestra el borrador y las horas extra calculadas. Sigue rotulado «Incompleto» porque hay datos y jornadas pendientes ajenos a este cálculo. | Aprobado | [Mes a 1280](issue-122-pagos-mes-1280.png), [mes a 375](issue-122-pagos-mes-375.png) |
| `/pagos/2026-10/99900002`: Beto tiene 120 min al 25 % por S/ 18,23 y 30 min al 35 % por S/ 4,92; total S/ 23,15. «Ver jornada» abre la asistencia del 06/10/2026. | Aprobado | [Detalle a 1280](issue-122-pagos-beto-1280.png), [detalle a 375](issue-122-pagos-beto-375.png) |
| Consola, render y red de los recorridos finales. Sin errores de consola ni excepciones, todas las rutas respondieron 200, sin HTTP 500 o mayores. Las páginas comprobadas a 375 px no desbordan el documento. | Aprobado | Registro de Playwright del humo |

## Límites

- El seed no incluye trabajo nocturno. Su bloqueo visible se prueba en el cálculo y en las pruebas de página, pero este humo no lo generó por UI.
- Todavía no existe la acción de finalizar una preliquidación. El bloqueo nocturno se muestra en el borrador y su contrato queda listo para esa acción futura.
- No se importó un XLSX en este humo; `pnpm validate` cubre el parser y los recorridos automatizados de importación.

Las modificaciones del humo quedaron en la base desechable de revisión; `pnpm revisar:limpiar` la elimina.
