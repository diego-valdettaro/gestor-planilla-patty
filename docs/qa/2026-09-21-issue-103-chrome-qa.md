# Humo funcional #103: estados vacíos y mensajes de operación

Entorno: `pnpm revisar` desde la rama `agent/issue-103-estados-vacios-y-mensajes` (base desechable `planilla_rev_103`, seed de revisión, puerto 3103). Navegador: Chromium con Playwright (script ad hoc), 1280×900, cuentas del seed. Alcance: QA básico de cada ruta que toca el diff.

| Cuenta | Ruta | Resultado | Consola |
| --- | --- | --- | --- |
| admin | `/configuracion` | Carga, encabezado visible | Sin errores |
| admin | `/turnos` | Carga, encabezado visible | Sin errores |
| admin | `/asistencias` | Carga, matriz semanal | Sin errores |
| admin | `/asistencias/importar` | Carga, formulario | Sin errores |
| admin | `/periodos` | Carga, encabezado visible | Sin errores |
| operaciones | `/configuracion` | Solo modelos de horario | Sin errores |
| operaciones | `/asistencias` | `estado-vacio` «Sin permiso» | Sin errores |
| finanzas | `/configuracion` | `estado-vacio` «Sin permiso» | Sin errores |
| finanzas | `/turnos` | Carga | Sin errores |

Los estados vacíos por ausencia de datos (sin grupo, sin modelos, sedes o colaboradores, sin períodos) no se reproducen en el seed, que siempre trae datos; los cubren las pruebas de página. Un primer intento mostró avisos de hidratación en consola; eran un artefacto del script (captura antes de hidratar, Playwright inyecta `caret-color`) y desaparecieron esperando `networkidle`.

Capturas: `docs/qa/issue-103-*.png`.
