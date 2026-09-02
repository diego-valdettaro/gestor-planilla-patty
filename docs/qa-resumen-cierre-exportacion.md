# QA: resumen, cierre y exportación del período

Issue: #9  
Commit probado: `7a7f152`  
Ruta principal: `/periodos`

## Objetivo

Comprobar que Administración y Finanzas pueden consultar el resumen de un período, cerrarlo, reabrirlo con motivo y exportarlo a XLSX. También comprobar que el cierre no acepta asistencias pendientes y que la exportación solo incluye horas extra aprobadas.

## Preparación

1. Aplicar las migraciones, incluida `drizzle/0008_resumen_y_cierre_periodos.sql`.
2. Levantar PostgreSQL y configurar las variables de entorno usadas por `src/db/client.ts`.
3. Crear cuentas para los roles `administracion`, `finanzas` y `operaciones`.
4. Crear al menos dos colaboradores en sedes distintas.
5. Crear un período abierto del día 26 al día 25 siguiente.
6. Crear turnos y asistencias que cubran estos casos:
   - una asistencia confirmada con minutos trabajados y tardanza;
   - una asistencia confirmada con hora extra pendiente;
   - una hora extra aprobada y otra rechazada;
   - una asistencia pendiente;
   - un estado manual.

## Casos funcionales

| ID | Caso | Pasos | Resultado esperado |
|---|---|---|---|
| QA-01 | Acceso por rol | Iniciar sesión como Administración o Finanzas y abrir `/periodos`. | La página muestra períodos y resumen. |
| QA-02 | Bloqueo de Operaciones | Iniciar sesión como Operaciones e intentar abrir `/periodos`. | El usuario no puede consultar ni gestionar períodos. |
| QA-03 | Resumen completo | Abrir un período con datos. | Cada colaborador muestra horas trabajadas, cantidad de tardanzas, saldo penalizado, extras 25% y extras 35%. |
| QA-04 | Filtro por período | Seleccionar otro período. | Cambian las filas y los totales al período seleccionado. |
| QA-05 | Filtro por sede | Informar una sede y pulsar `Filtrar`. | Solo aparecen colaboradores de esa sede. |
| QA-06 | Filtro por colaborador | Informar un ID de huellero y pulsar `Filtrar`. | Solo aparece ese colaborador. |
| QA-07 | Extras aprobadas | Dejar una hora extra pendiente, una aprobada y una rechazada. | El resumen suma solo la aprobada en sus tramos correspondientes. |
| QA-08 | Cierre bloqueado | Conservar una asistencia en estado pendiente y pulsar `Cerrar período`. | El cierre falla con un mensaje que indica que existen asistencias pendientes. El período permanece abierto. |
| QA-09 | Cierre válido | Confirmar o registrar manualmente todas las asistencias y pulsar `Cerrar período`. | El período pasa a `cerrado`, guarda responsable y fecha, y registra una auditoría de cierre. |
| QA-10 | Reapertura sin motivo | En un período cerrado, enviar el formulario con motivo vacío. | El formulario impide el envío o la acción falla. El período permanece cerrado. |
| QA-11 | Reapertura con motivo | Informar un motivo y pulsar `Reabrir período`. | El período pasa a `abierto` y registra responsable, fecha, acción y motivo. |
| QA-12 | Exportación | Aplicar filtros y pulsar `Exportar XLSX`. | Descarga un archivo XLSX con las filas filtradas y las columnas del resumen. |
| QA-13 | Auditoría de exportación | Abrir el archivo descargado. | Existe una hoja `Auditoría` con período, usuario, fecha de generación y la indicación de que solo se exportan extras aprobadas. |
| QA-14 | Permisos en servidor | Con una sesión de Operaciones llamar a la ruta de exportación. | La respuesta es HTTP 403 y no descarga datos. |

## Comprobaciones de regresión

Ejecutar desde la raíz del repositorio:

```powershell
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Resultado esperado:

- `typecheck` termina sin errores.
- Todos los tests aplicables pasan. Los tests de integración solo pueden omitirse si no hay PostgreSQL disponible.
- `build` termina correctamente y registra `/periodos` y `/api/periodos/[periodoId]/exportar`.
- `git diff --check` no encuentra errores de espacios.

## Evidencia a guardar

Para cada caso registrar estado `PASS` o `FAIL`, fecha, usuario usado y una captura o salida relevante. En QA-08 y QA-09 guardar también el estado del período antes y después. En QA-13 conservar el XLSX descargado y verificar ambas hojas.

## Defectos

Registrar cada fallo con:

- caso QA afectado;
- pasos exactos para reproducirlo;
- resultado actual y resultado esperado;
- usuario, período y datos usados;
- captura, respuesta HTTP o log;
- severidad.
