# QA básico del issue #125

## Entorno

- Fecha: 2026-10-10.
- Rama: `agent/issue-125-vacaciones-entre-meses`.
- App: `pnpm revisar` en `http://127.0.0.1:3125`, con PostgreSQL desechable `planilla_rev_125` y el seed de demo.
- Navegador: Chromium mediante Playwright, con observación de consola, excepciones y respuestas HTTP 400 o mayores. Cuenta `finanzas` del seed. No se usó DevTools.

## Recorridos

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| `/pagos/2026-10/99900007` (Franco Díaz): «Vacaciones del mes» muestra el descanso del 29/09 al 04/10 (6 días), con 2 días en 09/2026 y 4 en 10/2026. El abono de S/ 300,00 del 28/09 se asigna S/ 100,00 a septiembre y S/ 200,00 a octubre; cada saldo lo reduce una vez (S/ 46,67 y S/ 93,34). | Aprobado | [Detalle a 1280](issue-125-pagos-franco-1280.png), [a 375](issue-125-pagos-franco-375.png) |
| Conceptos de Franco: dos líneas de remuneración vacacional (2 días cada una, tramos antes y después del cambio de sueldo), una línea «Ajuste por variación de sueldo en vacaciones» por S/ 13,33 y sueldo básico de 26 días. El total de sueldo calculado es S/ 2.386,67, igual a 2 días a S/ 2.200 más 28 a S/ 2.400. | Aprobado | Mismas capturas |
| `/pagos/2026-09/99900007`: septiembre muestra los mismos 6 días con el desglose por mes y el aviso de vacaciones de períodos abiertos. | Aprobado | [Septiembre a 1280](issue-125-pagos-franco-septiembre-1280.png), [a 375](issue-125-pagos-franco-septiembre-375.png) |
| `/pagos/fuentes-externas/abonos_vacacionales?mes=2026-10`: formulario con DNI, fecha del abono e importe; sin XLSX ni días del descanso; la fila del abono de Franco se lista. | Aprobado | [Fuente a 1280](issue-125-fuente-abonos-1280.png), [a 375](issue-125-fuente-abonos-375.png) |
| `/pagos/fuentes-externas` y `/pagos/2026-10`: el tipo nuevo aparece pendiente como los demás. | Aprobado | [Fuentes](issue-125-fuentes-1280.png), [mes](issue-125-pagos-mes-1280.png) |
| Consola, render y red de todas las rutas a 1280 y 375 px: sin errores de consola ni excepciones, todas respondieron sin HTTP 400 o mayores. Ninguna página desborda el documento a 375 px; las tablas se desplazan dentro de su región. | Aprobado | Registro de Playwright del humo |

## Límites

- El humo no creó un abono nuevo por UI; el registro y el rechazo de duplicados se cubren con pruebas de caso de uso y de página, y `pnpm validate` corre los recorridos automatizados existentes.
- El grupo Administración no tiene calendario de asistencia y no recibe este desglose (límite conocido, ver `docs/diseno-software-pagos.md`).
- Los meses de 28, 30 y 31 días se verifican con pruebas de cálculo, no con el seed.

Las modificaciones del humo quedaron en la base desechable, que `pnpm revisar:limpiar` eliminó.
