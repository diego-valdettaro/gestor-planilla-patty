# Regresión PR #50, grupo de sede

Fecha: 2026-09-08

Rama: `agent/issue-39-guardar-grupo-sede`

## Caso corregido

| Caso | Recorrido | Resultado | Evidencia |
| --- | --- | --- | --- |
| PR50-01 | Administración edita el grupo de una sede, guarda, vuelve a editarla y guarda otra vez. | Aprobado por regresión automatizada. Cada éxito devuelve una confirmación distinta, por lo que el editor cliente vuelve a ejecutar su cierre en ambos guardados. | `src/app/configuracion/actions.test.ts`, caso "emite una confirmación distinta en cada guardado para que el editor se cierre también al reabrirlo". |

La prueba verifica las confirmaciones `1` y `2`, junto con ambas asignaciones al repositorio de turnos. El editor observa esa confirmación, de modo que el segundo guardado no reutiliza el estado `true` del primero.

## Entorno y validación

- `pnpm revisar -- --numero 39` creó `planilla_rev_39`, aplicó las 20 migraciones y sembró las cuentas de prueba. No se usó la base local `planilla`.
- `pnpm validate` aprobó el 2026-09-08: 34 archivos de prueba, 132 pruebas, migraciones sobre PostgreSQL desechable, typecheck y build.

## Humo de navegador

Pendiente. La integración DevTools no estaba disponible y el entorno bloqueó el inicio de Chrome con perfil temporal. No se adjunta captura ni se declara una verificación visual que no se pudo ejecutar.
