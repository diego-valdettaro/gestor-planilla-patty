# QA básico del issue #120

## Contexto y alcance

- Fecha: 2026-10-08.
- Rama: `agent/issue-120-incidencias-ajustes`, probada antes del commit.
- Entorno: `pnpm revisar`, PostgreSQL desechable `planilla_rev_120`, `http://127.0.0.1:3120`.
- Herramienta: Chromium mediante Playwright; se observaron errores de consola, excepciones de página y respuestas HTTP 500 o mayores. No se usó DevTools.
- Roles: Finanzas y Administrador del sistema del seed. Tamaños: 1280 y 375 px.
- Rutas: `/pagos/fuentes-externas`, `/pagos/fuentes-externas/incidencias_de_tienda`, `/pagos/fuentes-externas/ajustes_de_preliquidacion` y `/pagos/fuentes-externas/importar`.

## Cobertura

| Caso | Comprobación final | Estado | Evidencia |
| --- | --- | --- | --- |
| Lista de fuentes | Muestra incidencias y ajustes, sin ofrecer importación XLSX para esos flujos | Aprobado | [Lista](issue-120-fuentes-1280.png) |
| Incidencia sin autorización | S/ 17,00 queda fuera del total y pasa a «En investigación (fuera del neto)» | Aprobado | [Incidencias](issue-120-incidencias-1280.png) |
| Incidencia autorizada | Sustento, autorizador y fecha quedan visibles; solo sus S/ 19,00 integran el total de dos filas. El listado se confirmó sin bloquearse por la incidencia en investigación | Aprobado | [Listado confirmado](issue-120-incidencias-confirmada-1280.png) |
| Ajuste | Se guarda el hecho, devengue, aplicación, concepto corregido, importe, motivo y responsable | Aprobado | [Ajustes](issue-120-ajustes-1280.png) |
| Importación | La pantalla genérica carga sin error y no ofrece los dos tipos con flujo propio | Aprobado | [Importar](issue-120-importar-1280.png) |
| Acceso sin permiso | El Administrador ve «Sin permiso» en ambas rutas específicas | Aprobado | Comprobación en navegador |
| Ancho estrecho | Incidencias y ajustes no desbordan la página a 375 px; la tabla se desplaza dentro de su región | Aprobado | [Incidencias](issue-120-incidencias-375.png), [ajustes](issue-120-ajustes-375.png) |
| Consola y red | Sin errores de consola, excepciones de página ni respuestas HTTP 500 o mayores en el recorrido final | Aprobado | Registro de Playwright |

## Hallazgos corregidos durante el humo

- Los dos botones de decisión compartían un formulario y el servidor no recibía el valor del botón pulsado. Ahora cada acción envía una decisión explícita. La prueba de presentación verifica ambos valores.
- «No descontar en este pago» enviaba una fecha vacía y PostgreSQL rechazaba el cambio. El caso de uso convierte el campo vacío en ausente; una prueba de integración reproduce el envío del navegador.

El recorrido final se repitió sobre una base recién sembrada y pasó completo. Los registros de prueba quedaron solo en esa base desechable; `pnpm revisar:limpiar` la elimina.

## Límite de la comprobación

La app aún no tiene el flujo de cálculo ni la tabla de versiones finalizadas de Pagos. En este ticket se verificó la exclusión de incidencias del contrato de fuentes y la persistencia del ajuste; la inmutabilidad de una versión final deberá comprobarse cuando exista ese flujo.
