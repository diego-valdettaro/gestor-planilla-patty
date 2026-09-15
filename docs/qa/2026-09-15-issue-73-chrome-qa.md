# Reporte de QA en Chromium, issue #73

## Contexto y alcance

- Fecha: 2026-09-15.
- Rama: `agent/issue-73-aplicar-reemplazos-importacion`.
- Entorno: `pnpm revisar`, base descartable `planilla_rev_73`, seed de revisión y `http://localhost:3073`.
- Rol: Administración.
- Herramienta: Chromium con Playwright vía un script ad hoc (no había conexión de Chrome DevTools MCP disponible en el entorno).
- Alcance: QA básico del flujo nuevo de importación en `/asistencias/importar`: vista previa con conteos y lista de filas, confirmación única antes de reemplazar asistencias ya confirmadas o manuales, y verificación en base de la persistencia atómica y auditada.
- Archivo de prueba: XLSX con 4 filas para `DEMO-BETO` (sede "Tienda Benavides"), cada una apuntando a un caso distinto ya sembrado por `scripts/sembrar-base.ts`: una jornada confirmada que cambia, una confirmada idéntica (no-op), una en estado manual (feriado) que cambia, y una pendiente que cambia.

## Cobertura

| Caso | Flujo y rol | Comprobación final | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| Carga del formulario | Administración abre `/asistencias/importar` | Carga sin error de render ni de consola | Aprobado | `2026-09-15-issue-73-formulario.png` |
| Vista previa con conteos y lista | Sube el XLSX y envía "Importar" | Se abre el diálogo de confirmación con los conteos exactos (Nuevas 0, Sin cambios 1, Pendientes que cambian 1, Confirmadas que cambiarían 2) y la lista de las 4 filas con su categoría | Aprobado | `2026-09-15-issue-73-dialogo-confirmacion.png` |
| Cancelar | Cierra el diálogo sin confirmar | No aparece mensaje de éxito ni de error; nada se persiste | Aprobado | Registro Playwright |
| Confirmación única | Reenvía el mismo archivo y confirma el reemplazo | Un solo clic aplica toda la carga; mensaje "Se importaron 3 jornadas" con el mismo resumen de conteos y lista | Aprobado | `2026-09-15-issue-73-resultado.png` |
| Persistencia atómica y auditada (verificado en base) | Tras confirmar | Las dos jornadas resueltas (confirmada y manual) vuelven a `pendiente` con la nueva propuesta, `entradaReal/salidaReal/confirmadoPorId/confirmadoEn` en `null`, y quedan sus filas de auditoría en `reemplazos_de_asistencia_importada` con el valor anterior exacto; la jornada idéntica no se tocó; la pendiente se actualizó; los días ausentes del archivo (p. ej. sábado) siguieron intactos | Aprobado | Consulta directa a `planilla_rev_73` |
| Navegación tras el cambio | Visita `/asistencias` | Carga sin errores de consola | Aprobado | `2026-09-15-issue-73-asistencias.png` |

## Hallazgos y pendientes

- **Corregido durante el humo:** el primer intento reveló que React limpia el `<input type="file">` no controlado tras el primer envío exitoso de la acción (el que solo devuelve la vista previa), por lo que el segundo envío ("Confirmar reemplazo") se quedaba sin archivo y el diálogo nunca volvía a abrirse. Se agregó una reposición del archivo seleccionado vía `DataTransfer` en `formulario-de-importacion.tsx` antes de mostrar la confirmación. Repetido el recorrido completo después del arreglo: pasa limpio.
- Un solo `console.error` de hidratación (`caret-color: transparent` agregado al `<input type="file">`) apareció únicamente en el entorno automatizado; es un atributo que Chromium inyecta en inputs de archivo bajo automatización (CDP), no algo que el componente renderice condicionalmente ni que dependa de `Date.now()`/`window`. No se reprodujo ningún otro mensaje de consola ni fallo de red en todo el recorrido.
- No se probó el caso "nuevo" (fila sin `asistencia_esperada` previa) porque el seed de revisión crea esa fila para todo día publicado; ese caso ya está cubierto por pruebas unitarias con un repositorio en memoria (`casos-de-uso-servidor.test.ts`).
- La base descartable `planilla_rev_73` se eliminó al cerrar el entorno (`pnpm revisar:limpiar`); no quedan datos de prueba persistentes.
