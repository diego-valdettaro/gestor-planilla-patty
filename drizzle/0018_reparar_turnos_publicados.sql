-- Algunas instalaciones registraron 0012 sin actualizar la tabla de turnos
-- publicados. El código ya no usa minutos de almuerzo y los descansos no
-- tienen horas programadas.
ALTER TABLE "turnos_publicados"
  DROP COLUMN IF EXISTS "minutos_de_almuerzo";

ALTER TABLE "turnos_publicados"
  ALTER COLUMN "entrada_programada" DROP NOT NULL,
  ALTER COLUMN "salida_programada" DROP NOT NULL;

UPDATE "turnos_publicados"
SET "entrada_programada" = NULL, "salida_programada" = NULL
WHERE "descanso" = true;
