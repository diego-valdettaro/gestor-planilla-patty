# QA básico de #67

Entorno: `pnpm revisar --numero 67`, base aislada `planilla_rev_67`, Chrome controlado con Playwright. No había conexión de DevTools disponible.

| Recorrido | Resultado | Evidencia |
| --- | --- | --- |
| Administración abre `/asistencias` y selecciona una jornada esperada de Beto Publicado | Aprobado | La página cargó sin errores de consola. |
| Trabajo con una sede distinta de la publicada | Aprobado | El diálogo quedó abierto y mostró: `La sede registrada no coincide con la sede planificada (Tienda Benavides). Corrija y republique el horario semanal.` |
| Falta real sobre la jornada laboral publicada | Aprobado | Se guardó con el comentario `No asistió por enfermedad.`, el diálogo se cerró y la celda quedó como `Falta`. Captura: `docs/qa/issue-67-asistencias.png`. |

No se observaron errores de consola durante el recorrido. La prueba creó una falta en la base desechable `planilla_rev_67`; no modificó la base local `planilla`.
