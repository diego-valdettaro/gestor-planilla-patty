-- Algunas instalaciones registraron 0012 sin ejecutar este cambio sobre la
-- tabla de borradores. El código ya no persiste este campo.
ALTER TABLE "celdas_planes_semanales_en_borrador"
  DROP COLUMN IF EXISTS "minutos_de_almuerzo";
