ALTER TABLE "turnos_publicados" DROP COLUMN "minutos_de_almuerzo";
ALTER TABLE "celdas_planes_semanales_en_borrador" DROP COLUMN "minutos_de_almuerzo";
ALTER TABLE "turnos_publicados" ALTER COLUMN "entrada_programada" DROP NOT NULL;
ALTER TABLE "turnos_publicados" ALTER COLUMN "salida_programada" DROP NOT NULL;
ALTER TABLE "celdas_planes_semanales_en_borrador" ALTER COLUMN "entrada_programada" DROP NOT NULL;
ALTER TABLE "celdas_planes_semanales_en_borrador" ALTER COLUMN "salida_programada" DROP NOT NULL;
UPDATE "turnos_publicados"
SET "entrada_programada" = NULL, "salida_programada" = NULL
WHERE "descanso" = true;
UPDATE "celdas_planes_semanales_en_borrador"
SET "entrada_programada" = NULL, "salida_programada" = NULL
WHERE "descanso" = true;
UPDATE "asistencias_esperadas"
SET "instantanea_de_turno" = "instantanea_de_turno" - 'minutosDeAlmuerzo'
WHERE "instantanea_de_turno" ? 'minutosDeAlmuerzo';
