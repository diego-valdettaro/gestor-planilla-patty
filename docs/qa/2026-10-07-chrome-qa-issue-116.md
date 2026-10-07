# QA básico en Chromium de issue #116

## Contexto y alcance

- Fecha: 2026-10-07.
- Versión: `ed97dcf` más el ajuste de CSS de la columna «Estado» de la lista (sin commitear al ejecutar el humo; va en el commit siguiente), rama `agent/issue-116-condiciones-laborales-vigencia`.
- Entorno: `pnpm revisar`, base desechable `planilla_rev_116`, `http://127.0.0.1:3116`. Se repitió el humo en un entorno nuevo después de cambiar CSS y volver a pasar `pnpm validate`.
- Roles: Finanzas y Administrador del sistema, con las cuentas del seed de revisión.
- Navegador: Chromium headless mediante Playwright (el repo ya lo incluye). Se observaron consola, errores de página y peticiones fallidas. No hubo conexión directa a Chrome DevTools.
- Tamaños: 1280 x 900 y 375 x 812.
- Alcance: `/pagos`, `/pagos/condiciones-laborales` y `/pagos/condiciones-laborales/[relacionId]`, con el recorrido corto de cada criterio de aceptación.

## Cobertura

| Caso | Flujo y rol | Comprobación final | Estado | Evidencia o bloqueo |
| --- | --- | --- | --- | --- |
| Entrada | Finanzas abre `/pagos` desde el menú | Redirige a Condiciones laborales; «Pagos» queda como sección actual | aprobado | [Lista](evidencia-issue116/01-lista-1280.png) |
| Lista | Finanzas abre Condiciones laborales | 14 relaciones confirmadas; valores vigentes hoy; dato faltante = «Pendiente», nunca `S/ 0,00`; Karen con dos relaciones | aprobado | [Lista](evidencia-issue116/01-lista-1280.png), [columna Estado](evidencia-issue116/01b-lista-1280-columna-estado.png) |
| Filtros | Grupo Taller y «Solo con datos faltantes» | Solo Taller; el alcance se rotula «N de 14 relaciones»; Beto (completo) desaparece | aprobado | URL y texto comprobados por Playwright |
| Valor vigente por fecha / dos vigencias | Finanzas abre Ana Borrador (sueldo 1.500 → 1.800 el día 16) | Dos filas con vigencias contiguas (hasta 15/10, desde 16/10) y siete paneles, uno por dato | aprobado | [Detalle de Ana](evidencia-issue116/02-detalle-ana-1280.png) |
| Registrar valor | Finanzas registra S/ 1.500,00 desde 16/10/2026 para Carla Cambios | Título y alcance se actualizan con la fecha; el historial muestra S/ 1.300,00 hasta 15/10/2026 y S/ 1.500,00 «Programado»; sigue vigente hoy S/ 1.300,00; tras recargar persiste | aprobado | [Diálogo](evidencia-issue116/03-dialogo-registro-1280.png) |
| Fecha repetida | Finanzas intenta otro valor desde el mismo día | El formulario no se envía (el campo exige una fecha posterior a la última vigencia); sigue habiendo dos filas | aprobado | Playwright |
| Teclado | Escape en el diálogo | Se cierra y el foco vuelve a «Registrar nuevo valor» | aprobado | Playwright |
| Corregir | Finanzas reemplaza S/ 1.500,00 por S/ 1.550,00 | Sin motivo no se envía; con motivo queda S/ 1.500,00 «Reemplazado» con su motivo y S/ 1.550,00 con la misma vigencia | aprobado | [Diálogo](evidencia-issue116/05-dialogo-correccion-1280.png), [Resultado](evidencia-issue116/04-detalle-carla-final-1280.png) |
| Identificador inválido | Finanzas abre `/pagos/condiciones-laborales/abc` | Estado vacío «No existe esa relación laboral confirmada», no la pantalla de error | aprobado | Playwright |
| Sin permiso | Administrador abre `/pagos/condiciones-laborales` y `/pagos` | «Sin permiso», sin ningún importe; el menú no ofrece Pagos | aprobado | [Sin permiso](evidencia-issue116/06-sin-permiso-admin-1280.png) |
| Ancho estrecho: lista | Finanzas a 375 px | La página no se desplaza; la tabla sí, dentro de su región, con la persona fija; aviso de desplazamiento visible | aprobado | [Lista 375](evidencia-issue116/07-lista-375.png) |
| Ancho estrecho: detalle y diálogo | Finanzas a 375 px | Sin desborde de la página; el diálogo cabe en pantalla y apila «Registrar valor» sobre «Cancelar» | aprobado | [Detalle 375](evidencia-issue116/08-detalle-375.png), [Diálogo 375](evidencia-issue116/09-dialogo-375.png) |
| Consola sin capturas | Lista y detalle sin usar capturas | Sin errores ni advertencias de consola, sin respuestas ≥ 400 | aprobado | Playwright |

32 comprobaciones aprobadas, 0 fallidas.

## Observaciones

- Durante las capturas de pantalla la consola mostró un aviso de hidratación por un `style="caret-color: transparent"` en los `input`. Lo inyecta Playwright (`caret: "hide"`) al capturar; sin capturas la consola queda vacía. No es un defecto de la aplicación.
- Playwright registró `net::ERR_ABORTED` en peticiones de navegación que se cancelaron al cambiar de página enseguida (carga de detalle y `POST /iniciar-sesion` a 375 px). La página siguiente cargó con normalidad; no hay respuestas con error.
- Defectos visuales propios, corregidos durante el humo y comprobados de nuevo: la última fila de cada tabla de historial dejaba una raya bajo la primera celda, y la columna «Estado» de la lista quedaba oculta tras el desplazamiento con texto en una sola línea. Ahora el texto envuelve en una celda de ancho razonable.
- A 1280 px la lista sigue desplazándose horizontalmente (8 columnas). El diseño lo acepta con la primera columna fija y el aviso de desplazamiento.

## Hallazgos

No quedan fallos funcionales dentro del alcance.

## Pendientes y siguiente acción

- No se probó el estado «Cargando» (`loading.tsx`) ni el de error de ruta (`error.tsx`) en navegador: las rutas cargan demasiado rápido y no hay una forma limpia de forzar el error sin tocar el código. Quedan cubiertos solo por revisión de código.
- El enlace de «Corregir» a las fuentes externas (diseño 4.9) no existe porque esa pantalla (4.4) todavía no está construida. La restricción «lo usa una versión finalizada» está probada con repositorio en memoria; con PostgreSQL no se puede ejercitar hasta que exista la finalización.
- Los datos creados (Carla Cambios, sueldos 1.500 y 1.550 desde 16/10/2026) viven en la base desechable; `pnpm revisar:limpiar` la elimina.
