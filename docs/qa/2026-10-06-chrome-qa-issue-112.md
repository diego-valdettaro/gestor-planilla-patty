# QA en navegador · issue #112

Entorno: `pnpm revisar` en la rama `agent/issue-112-tardanzas-descarte-extra` (base `planilla_rev_112`, Chromium con Playwright). Cuentas del seed: `admin` y `finanzas`.

| Recorrido | Resultado |
|---|---|
| `/asistencias`: Beto Publicado, 2026-10-05, ajustar ingreso de 08:18 a 08:05 | El ajuste se confirma. En `/periodos` la jornada pasa de «Tardanza 18 min» a «0 min», con 7 h 55 min trabajadas y el contador de tardanzas del colaborador en 0. |
| `/periodos` con Finanzas: «Descartar horas extra» | El diálogo exige «Evidencia» y «Motivo del descarte»: sin evidencia o sin motivo no se envía (validación nativa). Con ambos, la hora queda «Descartada» y los totales muestran «Descartadas 25% 45 min». |
| Vocabulario | No aparece «Rechazar» ni «no autorizada»; el diálogo aclara que no se descarta por falta de autorización previa. |
| Consola y red | Sin errores ni avisos al cargar `/periodos` y `/asistencias` con Finanzas. |
| Ancho 375 px | `/periodos` sin desbordamiento horizontal. |

Capturas en `2026-10-06-issue-112-evidencia/`.

Nota: la primera pasada mostró un aviso de hidratación en consola que provenía de Playwright (inyecta `caret-color: transparent` en los inputs al capturar pantalla), no de la aplicación; no reaparece sin capturas.

Seed: las asistencias confirmadas del seed ahora conservan la instantánea del horario publicado, como al confirmar de verdad; sin ella no se podían ajustar.
