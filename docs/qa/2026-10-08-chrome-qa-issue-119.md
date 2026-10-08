# QA básico en Chromium de issue #119

## Contexto y alcance

- Fecha: 2026-10-08.
- Versión: rama `agent/issue-119-importar-fuentes-xlsx` sobre `origin/master` `d9209d3`, commit `09f1535` (incluye la corrección del selector de tipo y de los títulos descrita abajo).
- Entorno: `pnpm revisar`, base desechable `planilla_rev_119`, `http://127.0.0.1:3119`, recién sembrada. Los archivos XLSX se generaron en el momento con DNI sintéticos del seed (99900001…) e importes inventados; ninguno se guardó en el repositorio.
- Roles: Finanzas y Administrador del sistema, con las cuentas del seed de revisión.
- Navegador: Chromium headless mediante Playwright (el repo ya lo incluye). Se observaron consola (errores y advertencias), errores de página y respuestas con estado ≥ 400. No hubo conexión directa a Chrome DevTools.
- Tamaños: 1280 x 900 y 375 x 812. Las capturas se tomaron con `caret: "initial"` (ver #117).
- Alcance: `/pagos/fuentes-externas`, `/pagos/fuentes-externas/importar`, `/pagos/fuentes-externas/[tipo]` y `/pagos/fuentes-externas/plantilla`, con el recorrido corto de cada criterio de aceptación. Se entró siempre por el enlace «Importar XLSX» de la fila de Retención de quinta categoría.

## Cobertura

| Caso | Flujo y rol | Comprobación final | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| Lista | Finanzas abre Fuentes externas | Cada tipo tiene «Importar XLSX» (6 enlaces) | aprobado | [Lista 1280](evidencia-issue119/01-lista-1280.png), [Lista 375](evidencia-issue119/01-lista-375.png) |
| Pantalla inicial | Finanzas pulsa «Importar XLSX» de Retención de quinta | Tipo preseleccionado, enlace a la plantilla, solo «Validar archivo» y sin vista previa; sin desborde horizontal | aprobado | [Inicial 1280](evidencia-issue119/02-importar-inicial-1280.png), [Inicial 375](evidencia-issue119/02-importar-inicial-375.png) |
| Archivo inválido | DNI desconocido y DNI mal formado | «El archivo tiene 2 errores: no se importa ninguna fila hasta corregirlo», con «Fila 3 · 00000000 · DNI desconocido…» y «Fila 4 · abc · El DNI debe tener exactamente 8 dígitos»; «Importar» deshabilitado y «Corrija el archivo y vuelva a validarlo» | aprobado | [Errores 1280](evidencia-issue119/03-validacion-con-errores-1280.png), [Errores 375](evidencia-issue119/03-validacion-con-errores-375.png) |
| Archivo válido | 2 filas, S/ 170,50 | Conteos Filas válidas 2, con error 0, Duplicadas 0, Personas desconocidas 0; «Validar archivo» pasa a secundario y «Importar 2 filas» es la única acción principal | aprobado | [Válido 1280](evidencia-issue119/04-validacion-correcta-1280.png), [Válido 375](evidencia-issue119/04-validacion-correcta-375.png) |
| Confirmar | «Importar 2 filas» | El diálogo da tipo, mes, filas, total, archivo y hash abreviado, y dice que importar no confirma la fuente; cabe en 375 px | aprobado | [Diálogo 1280](evidencia-issue119/05-dialogo-importar-1280.png), [Diálogo 375](evidencia-issue119/05-dialogo-importar-375.png) |
| Resultado | Se confirma la importación | «Se importaron 2 filas (S/ 170,50)», archivo, hash, responsable y fecha, y enlace «Volver a fuentes externas» | aprobado | [Resultado 1280](evidencia-issue119/06-resultado-1280.png), [Resultado 375](evidencia-issue119/06-resultado-375.png) |
| Fuente tras importar | Volver a la lista y abrir el detalle | La fuente sigue «Pendiente», origen «Archivo retencion.xlsx», 2 filas con su procedencia | aprobado | [Lista 1280](evidencia-issue119/07-lista-tras-importar-1280.png), [Detalle 1280](evidencia-issue119/08-detalle-1280.png), [Detalle 375](evidencia-issue119/08-detalle-375.png) |
| Mismo archivo | Se vuelve a cargar `retencion.xlsx` | «Este archivo ya se importó en Retención de quinta categoría de 10/2026: retencion.xlsx, por finanzas el 08/10/2026» | aprobado | [Mismo archivo 1280](evidencia-issue119/09-mismo-archivo-1280.png), [Mismo archivo 375](evidencia-issue119/09-mismo-archivo-375.png) |
| Filas duplicadas | Dos filas iguales en el archivo | Rechazo con «Duplicada: repite la fila N del archivo» | aprobado | [Duplicadas 1280](evidencia-issue119/10-filas-duplicadas-1280.png), [Duplicadas 375](evidencia-issue119/10-filas-duplicadas-375.png) |
| Reemplazo | Otro archivo del mismo tipo y mes | El diálogo dice «Reemplaza las filas del archivo anterior y devuelve la fuente a Pendiente»; el resultado confirma el reemplazo y el detalle queda con 1 fila vigente | aprobado | [Diálogo 1280](evidencia-issue119/11-dialogo-reemplazo-1280.png), [Detalle 1280](evidencia-issue119/12-detalle-tras-reemplazo-1280.png), [Detalle 375](evidencia-issue119/12-detalle-tras-reemplazo-375.png) |
| Plantilla | GET `/pagos/fuentes-externas/plantilla?tipo=retencion_de_quinta` | 200; hojas «Importes» (solo encabezados) e «Instrucciones» | aprobado | Playwright |
| Sin permiso | El Administrador abre la pantalla y pide la plantilla | «Sin permiso» y 403 | aprobado | [Sin permiso](evidencia-issue119/13-sin-permiso-admin-1280.png) |
| Selector de tipo | Se valida con y sin errores | El tipo sigue siendo Retención de quinta categoría (ver Observaciones) | aprobado | Playwright |
| Ancho estrecho | Finanzas a 375 px en todo el recorrido | Sin desborde horizontal de la página en la pantalla inicial, con errores, con el diálogo y en el detalle | aprobado | capturas a 375 px |
| Consola | Los dos roles, ambos anchos | Sin errores ni advertencias de consola y sin respuestas ≥ 400 | aprobado | Playwright |

42 comprobaciones aprobadas, 0 fallidas.

## Observaciones

- La primera pasada encontró dos fallos propios de este cambio, corregidos en `09f1535` y comprobados de nuevo en esta pasada:
  - Al entrar por el enlace de la fila (navegación del lado del cliente) y validar, el selector «Tipo de fuente» volvía a «Comisiones de ventas» aunque se procesaba Retención de quinta. React reinicia el formulario al terminar la acción; ahora el valor se reasigna desde el estado y el recorrido e2e lo comprueba.
  - Los títulos «Resultado de la validación» y «Archivo importado» salían con el tamaño por defecto; ahora usan el estilo de los demás paneles.
- La pasada a 375 px se hizo sobre la misma base que la de 1280 px, no sobre una recién sembrada: por eso en esas capturas aparece el aviso «Ya hay un archivo de Retención de quinta categoría para este mes (retencion-v2.xlsx…)» y el resultado menciona el reemplazo.
- La lista conserva el aviso «Desplácese horizontalmente para ver todas las columnas» ya existente desde #118.

## Pendientes

- No se probó el estado «Validando archivo…» ni el de error del servidor en navegador; quedan cubiertos por pruebas de componente/acción y revisión de código.
- El tope de 1 MB por archivo (límite de las acciones de servidor) solo se probó con la comprobación del lado del cliente en pruebas, no con un archivo grande real en navegador.
- Los datos creados viven en la base desechable; `pnpm revisar:limpiar` la eliminó.
