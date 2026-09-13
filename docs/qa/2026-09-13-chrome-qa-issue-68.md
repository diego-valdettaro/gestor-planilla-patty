# QA básico de #68

Entorno: `pnpm revisar`, base desechable `planilla_rev_68`, `http://localhost:3068`.
Rol: Administración, cuenta `admin` del seed. No había conexión de DevTools disponible; se usó Chromium mediante Playwright con captura de consola, `pageerror`, fallos de red y respuestas 4xx/5xx.

| Recorrido | Resultado | Evidencia |
| --- | --- | --- |
| Semana actual de Tiendas | Aprobado | La matriz muestra cinco colaboradores, siete días, sede y horas reales de Beto, Feriado y Pendiente de revisión. [Captura](issue-68-asistencias-semanal.png) |
| Semana cerrada de Tiendas | Aprobado | Elena muestra seis jornadas Liquidado con candado y una jornada sin planificación fuera de su horario publicado. [Captura](issue-68-asistencias-liquidada.png) |
| Ancho estrecho 390 x 844 | Aprobado | La tabla conserva desplazamiento horizontal, sin truncar columnas. [Captura](issue-68-asistencias-semanal-mobile.png) |
| Consola y red | Aprobado | Cero errores de consola, `pageerror`, respuestas 4xx/5xx y fallos de red desde la carga de `/asistencias`. |

No se modificaron datos durante el humo. `pnpm revisar:limpiar` elimina la base de revisión al cerrar el entorno.
