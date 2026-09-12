# Reporte de QA — Issue #72

## Contexto y alcance

- Fecha: 2026-09-12.
- Rama: `agent/issue-72-periodos-por-rango`, commit `3fac7f8`.
- Entorno: `pnpm revisar` (base PostgreSQL desechable `planilla_rev_72`, `next dev` en `http://localhost:3072`), sin cambios locales sin commitear al momento de la corrida.
- Roles usados: `administracion` (admin/admin), `finanzas` (finanzas/finanzas), `operaciones` (operaciones/operaciones), del seed de revisión.
- Tamaño probado: 1280×960 (viewport por defecto de Chromium vía Playwright).
- Herramienta: no había un servidor MCP de Chrome DevTools disponible en el entorno; se usó Playwright (`@playwright/test`, ya dependencia del proyecto) para automatizar Chromium real y capturar consola, red (respuestas ≥500) y errores de página. No es inspección DevTools, pero cubre el mismo objetivo de detectar errores de render/consola/red.
- Alcance: QA básico sobre la única ruta tocada por el diff (`/periodos`), cubriendo los seis criterios de aceptación de la issue.

## Cobertura

| Caso | Flujo y rol | Comprobación final | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| 1 | Administración abre `/periodos` | Ve "Nuevo período" con 2 inputs de fecha; no ve "Cerrar período" | Aprobado | `01-admin-periodos.png` |
| 2 | Administración crea un período con hueco | Aparece advertencia con checkbox y fechas conservadas | Aprobado | `02-admin-advertencia-hueco.png` |
| 3 | Administración confirma el hueco | Período creado, aparece en el selector, advertencia desaparece | Aprobado | `03-admin-periodo-creado.png` |
| 4 | Administración intenta solapar el período abierto | Error de solapamiento, sin advertencia ni checkbox, no se crea nada | Aprobado | `04-admin-error-solapamiento.png` |
| 5 | Finanzas abre `/periodos` | Ve "Cerrar período" (a diferencia de Administración) | Aprobado | `05-finanzas-periodos.png` |
| 6 | Finanzas selecciona el período cerrado del seed | Ve el formulario de reapertura con motivo obligatorio | Aprobado | `06-finanzas-reapertura.png` |
| 7 | Operaciones abre `/periodos` | Ve "Sin permiso" | Aprobado | `07-operaciones-sin-permiso.png` |

7/7 casos aprobados. Sin casos bloqueados.

## Hallazgos

Ningún fallo funcional atribuible al diff.

**Observación no bloqueante — advertencia de hidratación preexistente.** Cada carga de `/periodos` registra en consola un `console.error` de React sobre un mismatch de hidratación en atributos `style={{caret-color:"transparent"}}` en inputs, incluido un `<input type="hidden">` de `BotonDeAccionConfirmada` que este diff no modifica. Es un artefacto conocido de Chromium/Playwright (inyecta ese estilo en inputs enfocados/interactuados) y no un defecto de la aplicación: aparece igual en código no tocado por este cambio. No requiere corrección en este PR.

## Pendientes y siguiente acción

- No quedan casos pendientes dentro del alcance (QA básico de la ruta tocada).
- Datos de prueba: los períodos creados durante la corrida (`2030-03-26`–`2030-04-25` y `2030-04-26`–`2030-05-25`) viven solo en la base desechable `planilla_rev_72`, eliminada con `pnpm revisar:limpiar` al finalizar. No se tocó la base local `planilla`.
