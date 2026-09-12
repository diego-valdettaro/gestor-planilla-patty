# Reporte de QA en Chrome — issue #61

## Contexto y alcance

- Fecha: 2026-09-12.
- Rama: `agent/issue-61-grupo-colaborador`, commit `4153bfe`.
- Entorno: `pnpm revisar` (base `planilla_rev_61`, `next dev` en `http://localhost:3061`), seed de `scripts/sembrar-base.ts`.
- Rol usado: cuenta `admin` (administración) del seed.
- Herramienta: sin `chrome_devtools` disponible en este entorno; se usó Chromium real vía Playwright (`@playwright/test`, ya instalado en el proyecto) con un script ad hoc, no la suite `tests/e2e`. Se instrumentó consola, `pageerror`, `requestfailed` y respuestas 5xx.
- Alcance: QA básico sobre las dos rutas que toca el diff: `/configuracion` (UI nueva) y `/turnos` (cambio de lógica de pertenencia a equipo, sin cambio de UI).

## Cobertura

| Caso | Flujo y rol | Comprobación final | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| Columna Grupo | `/configuracion`, admin | Cada colaborador de demo muestra el grupo esperado (Tiendas/Taller/Administración) | aprobado | `configuracion-antes.png` |
| Selector Grupo al crear | `/configuracion`, admin | El formulario "Crear colaborador" tiene un `select` Grupo obligatorio con las 3 opciones | aprobado | `configuracion-antes.png` |
| Cambiar grupo de un colaborador | `/configuracion`, admin | Cambié DEMO-GABI de Taller a Tiendas y de vuelta a Taller; la tabla reflejó el cambio tras recargar en ambos sentidos | aprobado | `configuracion-despues.png` |
| Equipo Tiendas en Horarios | `/turnos?equipo=Tiendas`, admin | Los 5 colaboradores del grupo (Ana, Beto, Carla, Darío, Elena) siguen apareciendo con sus estados previos | aprobado | `turnos-tiendas.png` |
| Consola/red durante el recorrido | ambas rutas | 0 errores propios de la app | aprobado | ver Hallazgos |

## Hallazgos

Ningún hallazgo bloqueante. Dos observaciones no atribuibles a este cambio:

- **Advertencia de hidratación por `caret-color: transparent`**: aparece en inputs no enfocados de toda la página (incluidas secciones que el diff no toca, como "Modelos de horario"), solo al lanzar Chromium con `chromium.launch()` directo. La suite oficial `tests/e2e/recorridos-criticos.spec.ts`, que sí corre dentro de `pnpm validate` y exige cero errores de consola, pasó en verde sobre las mismas rutas. Se interpreta como artefacto del lanzamiento ad hoc del navegador, no una regresión del código.
- **Peticiones `_rsc` abortadas** (`net::ERR_ABORTED`) durante navegaciones rápidas consecutivas del script: patrón conocido de prefetch de Next.js interrumpido por la siguiente navegación, no un fallo de red real.

## Pendientes y siguiente acción

- El seed ahora crea el grupo "Administración" (antes esa sede no tenía grupo). Como consecuencia, `/turnos` sin `?equipo=` en la URL pasa a mostrar por defecto el grupo "Administración" en vez de "Tiendas" (orden alfabético, comportamiento preexistente de la página). No es un defecto: seleccionar "Tiendas" en el filtro muestra el resultado correcto. Se deja como nota para quien revise el entorno de `pnpm revisar` manualmente.
- No se creó ni quedó ningún dato de prueba fuera del seed estándar: el cambio de grupo de DEMO-GABI se revirtió a su valor original (Taller) antes de cerrar el recorrido.
