# QA básico de la importación XLSX, issue #71

## Contexto y alcance

- Fecha: 2026-09-13.
- Entorno: `pnpm revisar`, base aislada `planilla_rev_71`, `http://127.0.0.1:3071`.
- Rol: Administración.
- Herramienta: Playwright con Chromium. El entorno no expuso DevTools; se capturaron consola, respuestas y una captura con el navegador del proyecto.
- Alcance: carga de `/asistencias/importar`, mensaje de rechazo estructural y consola.

## Cobertura

| Caso | Flujo y rol | Comprobación final | Estado | Evidencia o bloqueo |
| --- | --- | --- | --- | --- |
| Carga de la ruta | Administración abre `/asistencias/importar` | Se muestran el campo único de archivo XLSX, los encabezados requeridos y el botón Importar | Aprobado | Respuesta 200 y captura final |
| Rechazo estructural | Administración carga un XLSX sin la hoja `Asistencias` | La carga no se guarda y enumera `Fila 1: Falta la hoja obligatoria "Asistencias".` | Aprobado | [captura](2026-09-13-issue-71-importar-rechazo.png) |
| Consola y red | Mismo recorrido | Sin errores de consola ni `pageerror`; las respuestas de la ruta y recursos cargados fueron 200 | Aprobado | Captura de eventos del navegador durante el recorrido |

## Hallazgos

No se reprodujeron fallos en el alcance probado.

## Pendientes y siguiente acción

No se creó una importación aceptada durante el humo, para no dejar un archivo fuente en el entorno de revisión. La aceptación se cubrió con pruebas de parser, caso de uso e integración PostgreSQL dentro de `pnpm validate`.
