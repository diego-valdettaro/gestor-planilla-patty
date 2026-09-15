# QA básico en Chromium de issue #74

## Contexto y alcance

- Fecha: 2026-09-15.
- Versión: `56d90d9`, rama `agent/issue-74-revisar-periodo`.
- Entorno: `pnpm revisar`, base desechable `planilla_rev_74`, `http://localhost:3074`.
- Rol: Finanzas, con la cuenta del seed de revisión.
- Navegador: Chromium headless mediante Playwright. Se observaron errores de consola, errores de página y peticiones fallidas. No hubo conexión directa a Chrome DevTools.
- Tamaños: 1440 x 1100 y 390 x 844.
- Alcance: carga de `/periodos`, resumen completo, detalle diario, filtros, bloqueos de asistencia y hora extra, y descarga XLSX.

## Cobertura

| Caso | Flujo y rol | Comprobación final | Estado | Evidencia o bloqueo |
| --- | --- | --- | --- | --- |
| Carga y resumen | Finanzas inicia sesión y abre `/periodos` | HTTP 200, grupo Tiendas, totales, seis motivos, extras por estado y bloqueos visibles | aprobado | [Vista completa](evidencia-issue74/01-liquidaciones-periodo-completo.png) |
| Detalle diario | Finanzas abre el detalle de Beto Publicado | Se muestran sede de la jornada, resultado y horario reales, tiempo, tardanza, penalización y hora extra | aprobado | [Detalle diario](evidencia-issue74/01-liquidaciones-periodo-completo.png) |
| Bloqueo de asistencia | Finanzas abre el bloqueo de Eva Confirmable del 2026-09-07 | Navega a `/asistencias` mensual con grupo, fecha y `DEMO-EVA` seleccionados | aprobado | URL comprobada por Playwright |
| Bloqueo de hora extra | Finanzas abre el bloqueo de Carla Cambios del 2026-09-07 | Abre el detalle y enfoca `#jornada-DEMO-CARLA-2026-09-07` | aprobado | [Hora extra pendiente](evidencia-issue74/03-liquidaciones-bloqueo-hora-extra.png) |
| Filtro sin cambio contable | Finanzas filtra por Beto Publicado | Los totales del período completo permanecen idénticos y la lista muestra al colaborador elegido | aprobado | [Filtro por colaborador](evidencia-issue74/02-liquidaciones-filtro-colaborador.png) |
| Exportación | Finanzas descarga el XLSX completo | Respuesta HTTP 200, archivo `resumen-2026-09-01.xlsx` de 19.376 bytes | aprobado | Descarga comprobada por Playwright |
| Ancho estrecho | Finanzas abre `/periodos` a 390 x 844 | La ruta carga, los controles siguen operables y las tablas conservan desplazamiento horizontal | aprobado | [Vista móvil](evidencia-issue74/04-liquidaciones-movil.png) |

No aparecieron errores de consola ni de página. Playwright registró `net::ERR_ABORTED` al entregar el XLSX al gestor de descargas; el servidor respondió 200 y el archivo se descargó completo. No hubo otras peticiones fallidas.

## Hallazgos

No se encontraron fallos funcionales dentro del alcance.

## Pendientes y siguiente acción

- La navegación lateral existente deja poco ancho útil a 390 px. El contenido nuevo usa el desplazamiento horizontal definido para tablas, pero la lectura móvil sigue siendo incómoda. Es una limitación global previa y no se cambió en #74.
- No se crearon ni modificaron datos durante el humo. `pnpm revisar:limpiar` eliminó la base y el `.env` de revisión.
