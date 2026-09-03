# Progreso de Ralph

- #17: modelos de horario por sede administrables por Operaciones y Administración, auditados en PostgreSQL y seleccionables solo para la sede real del colaborador; añade esquema, migración, configuración y persistencia en planes/horarios. Afecta `src/turnos`, Configuración y migración 0013; las pruebas de integración PostgreSQL siguen condicionadas a `TEST_DATABASE_URL`.

- #16: elimina minutos de almuerzo de contratos, UI, persistencia e instantáneas; la migración 0012 limpia instantáneas y normaliza descansos a horarios sin horas. Afecta `src/turnos`, `src/asistencias`, esquema y migraciones; las pruebas de integración PostgreSQL siguen condicionadas a `TEST_DATABASE_URL`.

- #10: las jornadas con Horario semanal publicado se muestran solo en consulta y el servidor rechaza guardar, borrar, aplicar en lote o copiar sobre sus celdas de borrador. Afecta `src/turnos` y la grilla de horarios; las pruebas de integración PostgreSQL siguen condicionadas a `TEST_DATABASE_URL`.

- #13: copia los horarios semanales publicados de la semana previa al plan semanal en borrador y aplica horario o descanso solo a celdas seleccionadas; las escrituras en lote son atómicas en PostgreSQL. Afecta `src/turnos` y la grilla de horarios; las pruebas de integración PostgreSQL siguen condicionadas a `TEST_DATABASE_URL`.

- #14: revisión y publicación atómica de planes semanales seleccionados; valida celdas, período abierto, duplicados y autorización, y crea Horarios semanales, historial y Asistencias esperadas dentro de una transacción. Afecta `src/turnos` y la grilla; las pruebas de integración PostgreSQL quedan condicionadas a `TEST_DATABASE_URL`.

- #12: plan semanal en borrador persistente por semana y equipo operativo, con celdas editables, descanso explícito y borrado a Sin definir; `src/turnos`, grilla de horarios, esquema y migración 0011. Copia en lote y publicación atómica quedan para #13 y #14.

- #11: equipos operativos configurables por sede activa y consulta semanal agrupada; `src/turnos`, configuración, esquema y migración 0010. Los borradores y la publicación atómica quedan para #12 y #14.

- #7: políticas por sede y tardanzas calculadas al confirmar; `src/tardanzas`, asistencia, esquema y migración 0006. Resumen, cierre y extras quedan para #8 y #9.

Memoria temporal del backlog actual. Ralph añade una entrada breve al terminar cada issue.
