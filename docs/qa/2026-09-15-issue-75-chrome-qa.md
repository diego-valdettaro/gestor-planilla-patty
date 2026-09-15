# QA básico de liquidaciones, issue #75

## Contexto y alcance

- Fecha: 2026-09-15
- URL: `http://localhost:3075/periodos`
- Entorno: `pnpm revisar -- --numero 75`, base desechable `planilla_rev_75`
- Commit: `7878b5e1bf4d0af8941d0ab00a2d307446673913`
- Roles: Finanzas y Administración del seed de revisión
- Tamaño: Chromium headless, 1440 × 1000
- Herramienta: Playwright instalado en el proyecto, con observación de consola, errores de página, peticiones fallidas y respuestas HTTP desde 400

Se probó la única ruta modificada, `/periodos`. El control Chrome conectado no pudo cargar el módulo Playwright del worktree, por lo que se ejecutó Playwright directamente, salida permitida por el flujo del repositorio. No se capturó una traza CDP.

## Cobertura

| Caso | Flujo y rol | Comprobación final | Estado | Evidencia o bloqueo |
| --- | --- | --- | --- | --- |
| Carga de Liquidaciones | Finanzas abre `/periodos` | La ruta responde, renderiza el título y muestra el período abierto | aprobado | Sin errores de consola, página, red ni HTTP |
| Decisión en lote | Finanzas abre Aprobar horas extra, selecciona el registro pendiente y confirma | El botón de confirmación inicia deshabilitado, se habilita con la selección y el registro deja de aparecer como pendiente | aprobado | [Diálogo de aprobación](./issue-75-decision-horas-extra.png) |
| Bloqueos del período completo | Finanzas revisa el período abierto | La página enumera asistencias y horas extra pendientes del rango completo | aprobado | [Diálogo y bloqueos visibles](./issue-75-decision-horas-extra.png) |
| Reapertura y nuevo cierre | Finanzas selecciona el período cerrado, completa un motivo, reabre y vuelve a cerrar desde el diálogo | El motivo es obligatorio, el período pasa a abierto y termina cerrado otra vez | aprobado | [Período cerrado tras la nueva revisión](./issue-75-periodo-cerrado.png) |
| Restricción por rol | Administración abre `/periodos` | No aparecen acciones para decidir horas extra, cerrar o reabrir | aprobado | [Vista de Administración](./issue-75-administracion-sin-acciones.png) |

Resultado: cinco casos aprobados. No hubo hallazgos funcionales.

## Pendientes y siguiente acción

La atomicidad ante una selección inválida, el bloqueo transaccional y el contenido inmutable de las revisiones no son observables por completo desde la interfaz. Las pruebas de integración PostgreSQL cubren esos casos. Los datos del humo quedaron solo en la base desechable `planilla_rev_75`, que se elimina al cerrar el entorno de revisión.
