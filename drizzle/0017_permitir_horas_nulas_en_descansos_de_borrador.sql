-- Algunas instalaciones registraron 0012 sin retirar estas restricciones.
-- Los descansos se persisten sin horas programadas.
ALTER TABLE "celdas_planes_semanales_en_borrador"
  ALTER COLUMN "entrada_programada" DROP NOT NULL,
  ALTER COLUMN "salida_programada" DROP NOT NULL;

UPDATE "celdas_planes_semanales_en_borrador"
SET "entrada_programada" = NULL, "salida_programada" = NULL
WHERE "descanso" = true;
