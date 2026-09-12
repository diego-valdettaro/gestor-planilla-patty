# Reporte de QA en Chrome, issue #62

## Contexto y alcance

- Fecha: 2026-09-12.
- Rama: `agent/issue-62-planificacion-grupo-sede`, commit `773334d`.
- Entorno: `pnpm revisar`, base desechable `planilla_rev_62`, `next dev` en `http://localhost:3062` y seed de `scripts/sembrar-base.ts`.
- Rol: Operaciones con la cuenta del seed.
- Herramienta: Chromium mediante `@playwright/test`. No había conexión `chrome_devtools`; se instrumentaron consola, `pageerror`, `requestfailed` y respuestas HTTP 4xx/5xx.
- Tamaños: escritorio 1440 x 1000 y comprobación estrecha 390 x 844.
- Alcance: QA básico de `/turnos`, única ruta tocada por el diff.

## Cobertura

| Caso | Flujo y rol | Comprobación final | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| Vista semanal por grupo | `/turnos?semana=2026-09-07&equipo=Tiendas`, Operaciones | La ruta responde, muestra 5 colaboradores del grupo y 2 sedes | aprobado | [grilla final](evidencia-issue-62-turnos.png) |
| Opciones de jornada | Abrir una celda editable | Aparecen Descanso, Feriado, Vacaciones, Permiso y Suspensión; Falta no aparece; se ofrecen modelos de Benavides y San Isidro | aprobado | [opciones](evidencia-issue-62-opciones-jornada.png) |
| Jornada multisedes y personalizada | Convertir el jueves de Ana desde Benavides 08:00–16:00 a San Isidro 10:00–19:00 y guardar | La grilla conserva la nueva sede y horas tras el guardado y refresco | aprobado | [grilla final](evidencia-issue-62-turnos.png) |
| Reapertura de horario personalizado | Reabrir la misma celda guardada | El radio personalizado queda marcado y el editor recupera San Isidro 10:00–19:00 | aprobado | [editor personalizado](evidencia-issue-62-horario-personalizado.png) |
| Diálogos y ancho estrecho | Inspección de nombres accesibles y tabla a 390 px | Los diálogos enlazan sus títulos con `aria-labelledby`; la tabla mantiene desplazamiento horizontal `auto` | aprobado | capturas anteriores |
| Consola y red | Todo el recorrido | 0 errores de consola, 0 `pageerror`, 0 respuestas 4xx/5xx y 0 fallos de red en la comprobación final | aprobado | instrumentación Playwright |

## Hallazgos

Sin hallazgos abiertos. El primer humo detectó que el editor personalizado podía reutilizar valores de una apertura anterior. Se corrigió en `d02d72a` y `773334d`; el recorrido de regresión y este humo final verifican la reapertura estable.

Durante navegación y `router.refresh` se observaron peticiones `_rsc` canceladas por Next.js antes de reiniciar la medición final. No hubo respuesta HTTP fallida ni error visible asociado.

## Pendientes y siguiente acción

No quedan casos bloqueados dentro del alcance. La prueba modificó solo el borrador de Ana en `planilla_rev_62`; `pnpm revisar:limpiar` elimina esa base al cerrar el entorno.
