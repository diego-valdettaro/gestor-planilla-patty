# QA Chrome · issue #40

Fecha: 2026-09-09. Entorno: `http://localhost:3040`, base desechable `planilla_rev_40`, rol `admin`.

## Recorridos

| Ruta | Recorrido | Estado | Evidencia |
|---|---|---|---|
| `/configuracion` | Inicio de sesión, crear `QA Grupo 40`, recargar, asignar sede y comprobar persistencia | aprobado | [captura](qa-issue-40-configuracion-final.png) |
| `/turnos` | Selector incluye `QA Sin Sede` y planificador carga el grupo sin sede activa | aprobado | [captura](qa-issue-40-turnos.png) |

La sesión se inició mediante Chrome CDP en `127.0.0.1:9222`. La captura textual confirmó los catálogos y el selector. No se observaron errores de render en consola durante la navegación. No se creó un registro persistente adicional durante este humo.

La recarga mostró `QA Grupo 40` en el catálogo, el filtro y la sede asignada. Los casos de uso y la integración PostgreSQL cubren alta, duplicado, asignación, planificación y procesamiento dinámicos.
