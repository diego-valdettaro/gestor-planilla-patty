-- Conserva segundos de las marcas y sus fracciones de minuto hasta la valoración monetaria.
ALTER TABLE "asistencias_esperadas" ALTER COLUMN "minutos_trabajados" TYPE double precision;
ALTER TABLE "horas_extra" ALTER COLUMN "minutos_al_25" TYPE double precision;
ALTER TABLE "horas_extra" ALTER COLUMN "minutos_al_35" TYPE double precision;
