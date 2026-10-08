# QA básico en Chromium de issue #117

## Contexto y alcance

- Fecha: 2026-10-08.
- Versión: commit `ed9d074` de la rama `agent/issue-117-reglas-legales-vigencia`.
- Entorno: `pnpm revisar`, base desechable `planilla_rev_117`, `http://127.0.0.1:3117`. El recorrido completo se corrió sobre un entorno recién sembrado.
- Roles: Finanzas y Administrador del sistema, con las cuentas del seed de revisión.
- Navegador: Chromium headless mediante Playwright (el repo ya lo incluye). Se observaron consola, errores de página y respuestas con estado ≥ 400. No hubo conexión directa a Chrome DevTools.
- Tamaños: 1280 x 900 y 375 x 812.
- Alcance: `/pagos/reglas-legales` y `/pagos/reglas-legales/[codigo]`, con el recorrido corto de cada criterio de aceptación.
- Los valores del seed son de demostración y su fuente lo dice; no son valores oficiales.

## Cobertura

| Caso | Flujo y rol | Comprobación final | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| Lista | Finanzas abre Reglas legales | Una fila por valor legal: EsSalud 9,00 %, RMV S/ 1.000,00, ONP 12,00 % con «Programado: 13,00 % desde el 01/11/2026»; los 15 valores sin regla dicen «Pendiente» y «Sin regla vigente», nunca `S/ 0,00` ni `0,00 %` | aprobado | [Lista 1280](evidencia-issue117/01-lista-1280.png), [Lista 375](evidencia-issue117/01-lista-375.png) |
| Historial | Finanzas abre Tasa de EsSalud | Dos versiones con vigencias contiguas, fuente oficial y responsable | aprobado | [Detalle 1280](evidencia-issue117/02-detalle-1280.png), [Detalle 375](evidencia-issue117/02-detalle-375.png) |
| Consultar una fecha | Fecha 01/01/2020 | «Sin regla vigente en esa fecha (01/01/2020)», con insignia «Pendiente» | aprobado | [Consulta 1280](evidencia-issue117/03-consulta-sin-regla-1280.png), [Consulta 375](evidencia-issue117/03-consulta-sin-regla-375.png) |
| Activar | Finanzas activa 9,5 % desde 01/01/2031 con fuente | El título, el alcance, la consecuencia y la cancelación siguen el texto 6.7; al confirmar queda «Programado», con su fuente y «finanzas» como responsable | aprobado | [Diálogo 1280](evidencia-issue117/04-dialogo-activar-1280.png), [Diálogo 375](evidencia-issue117/04-dialogo-activar-375.png), [Historial](evidencia-issue117/05-historial-tras-activar-1280.png) |
| Corregir | Finanzas reemplaza 9,5 % por 9,6 % con motivo | La versión anterior queda «Reemplazado» con «Motivo: Error de digitación» y otra ocupa la misma vigencia | aprobado | [Diálogo](evidencia-issue117/06-dialogo-corregir-1280.png) |
| Valor inexistente | `/pagos/reglas-legales/centro_de_costo` | Estado vacío «No existe ese valor legal», no la pantalla de error | aprobado | Playwright |
| Sin permiso | El Administrador abre la lista y el detalle | «Sin permiso» y ningún importe | aprobado | [Sin permiso](evidencia-issue117/07-sin-permiso-admin-1280.png) |
| Ancho estrecho | Finanzas a 375 px | La página no se desplaza; la tabla sí, dentro de su región; el diálogo cabe en pantalla y apila «Activar valor» sobre «Cancelar» | aprobado | capturas a 375 px |
| Consola | Los dos roles, ambos anchos | Sin errores ni advertencias de consola y sin respuestas ≥ 400 | aprobado | Playwright |

19 comprobaciones aprobadas, 0 fallidas.

## Observaciones

- Con `caret: "hide"` (el valor por defecto de las capturas de Playwright) la consola mostró un aviso de hidratación: Playwright inyecta `caret-color: transparent` en los `input` y, si la captura se toma mientras la página se hidrata, el HTML no coincide con el del servidor. Se comprobó aparte: con el cursor oculto el aviso aparece en 3 de 4 intentos y con `caret: "initial"` en 0 de 4, sin cambios en la aplicación. Las capturas de esta evidencia se tomaron con `caret: "initial"`. Es el mismo artefacto que documentó #116.
- A 1280 px la lista sigue desplazándose horizontalmente (5 columnas con la fuente oficial en varias líneas). El diseño lo acepta con la primera columna fija y el aviso de desplazamiento.

## Pendientes

- No se probó el estado «Cargando» ni el de error de ruta en navegador; quedan cubiertos solo por revisión de código, igual que en #116.
- El enlace «bloqueo del mes (5.1)» del diseño 4.10 no existe porque esa pantalla todavía no está construida.
- «Corregir» bloqueado por una versión finalizada solo está probado con repositorio en memoria: `versionesFinalizadasQueUsan` devuelve vacío hasta que exista la finalización (#129).
- Los datos creados (9,5 % y 9,6 % desde 01/01/2031) viven en la base desechable; `pnpm revisar:limpiar` la elimina.
