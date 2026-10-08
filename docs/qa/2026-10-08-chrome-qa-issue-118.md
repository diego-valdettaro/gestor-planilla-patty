# QA básico en Chromium de issue #118

## Contexto y alcance

- Fecha: 2026-10-08.
- Versión: rama `agent/issue-118-catalogo-conceptos-fuentes` sobre `origin/master` `e29f749`, con el commit `#118` más los ajustes de interfaz posteriores a la primera pasada (columna de importe de las fuentes pendientes y ancho de la tabla de la lista), que se probaron en esta misma ejecución.
- Entorno: `pnpm revisar`, base desechable `planilla_rev_118`, `http://localhost:3118`, recién sembrada. Los importes del seed son de demostración.
- Roles: Finanzas y Administrador del sistema, con las cuentas del seed de revisión.
- Navegador: Chromium headless mediante Playwright (el repo ya lo incluye). Se observaron consola (errores y advertencias), errores de página y respuestas con estado ≥ 400. No hubo conexión directa a Chrome DevTools.
- Tamaños: 1280 x 900 y 375 x 812.
- Alcance: `/pagos/fuentes-externas` y `/pagos/fuentes-externas/[tipo]`, con el recorrido corto de cada criterio de aceptación. Las capturas se tomaron con `caret: "initial"` (ver #117 sobre el aviso de hidratación que provoca el cursor oculto).

## Cobertura

| Caso | Flujo y rol | Comprobación final | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| Lista | Finanzas abre Fuentes externas | Título con el mes de pago, recordatorio «Una persona sin fila cuenta como cero solo cuando confirma el tipo de fuente.», seis tipos de fuente | aprobado | [Lista 1280](evidencia-issue118/01-lista-1280.png) |
| Estados | Seed | Comisiones «Confirmada con importes» (2 filas, S/ 470,50); Adelantos «Confirmada sin importes» (S/ 0,00); Movilidad «Pendiente» con 1 fila; Préstamos, Retención y Gratificación «Pendiente» con «—» en el importe, nunca S/ 0,00 | aprobado | [Lista 1280](evidencia-issue118/01-lista-1280.png) |
| Confirmar (diálogo 6.3) | Finanzas abre «Confirmar sin importes» de Préstamos y cancela | Alcance, consecuencia («las personas sin fila cuentan como S/ 0,00») y «Cancelar deja la fuente pendiente.»; cancelar no cambia el estado | aprobado | [Diálogo](evidencia-issue118/02-dialogo-confirmar-1280.png) |
| Detalle | Finanzas abre Comisiones de ventas | Cada fila muestra persona, DNI, concepto con su efecto en el neto, fecha del hecho, devengue (con «Devengue anterior»), aplicación, importe y procedencia | aprobado | [Detalle](evidencia-issue118/03-detalle-comisiones-1280.png) |
| Registrar | Finanzas carga S/ 40 a Carla Cambios | La fila aparece (3) y el aviso dice que la fuente confirmada volvió a Pendiente | aprobado | Playwright |
| Duplicado | Mismo importe otra vez | «Ya existe ese importe…»; no se agrega fila | aprobado | [Duplicado](evidencia-issue118/04-duplicado-rechazado-1280.png) |
| DNI inexistente | DNI 00000000 | «No existe una persona con DNI 00000000.» junto al formulario | aprobado | Playwright |
| Anular | Finanzas anula la fila de Carla con motivo | El diálogo pide motivo; la fila desaparece (2), el foco pasa al título y el anuncio dice «Importe de Carla Cambios anulado.» | aprobado | [Diálogo](evidencia-issue118/05-dialogo-anular-1280.png) |
| Confirmar y persistir | Finanzas confirma el listado de Comisiones y recarga | Tras recargar sigue «Confirmada con importes» | aprobado | [Detalle confirmada](evidencia-issue118/06-detalle-confirmada-1280.png) |
| Sin permiso | El Administrador abre la lista y el detalle | «Sin permiso» y ningún importe | aprobado | [Sin permiso](evidencia-issue118/07-sin-permiso-admin-1280.png) |
| Ancho estrecho | Finanzas a 375 px | La página no se desplaza (0 px); la tabla sí, dentro de su región; el diálogo cabe (x = 16, ancho 343) y Escape lo cierra | aprobado | [Lista 375](evidencia-issue118/08-lista-375.png), [Detalle 375](evidencia-issue118/09-detalle-375.png), [Diálogo 375](evidencia-issue118/10-dialogo-375.png) |
| Consola y red | Los tres recorridos | Sin errores ni advertencias de consola, sin errores de página y sin respuestas ≥ 400 | aprobado | Playwright |

25 comprobaciones aprobadas, 0 fallidas.

## Observaciones

- La primera pasada encontró tres detalles que se corrigieron antes de esta ejecución: las acciones de cada fila quedaban fuera de vista por el ancho del nombre del tipo de fuente (ahora el nombre baja de línea; se añadió la clase `tabla-de-fuentes` a `global.css`), las fuentes pendientes sin filas mostraban `S/ 0,00` (ahora «—»; el diseño dice que un faltante no es cero) y la nota del formulario salía con tipografía grande.
- Con 4 pendientes, la lista a 1280 px cabe sin desplazamiento horizontal; a 375 px se desplaza dentro de su región, como pide el diseño.

## Pendientes

- No se probó el estado «Cargando» ni el de error de ruta en navegador; quedan cubiertos solo por el componente de ruta compartido de Pagos, igual que en #116 y #117.
- «Importar XLSX» y la plantilla no existen todavía (#119); incidencias de tienda y ajustes (#120), abonos vacacionales, descansos sustitutorios y la conciliación de liquidación por cese agregan su tipo de fuente en su ticket.
- El bloqueo de un mes finalizado está probado con repositorios en memoria: `mesFinalizado` devuelve `false` hasta que exista la finalización.
- Los datos creados en el recorrido viven en la base desechable; `pnpm revisar:limpiar` la eliminó al terminar.
