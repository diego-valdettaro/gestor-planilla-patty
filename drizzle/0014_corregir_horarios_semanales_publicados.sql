ALTER TABLE "historial_turnos_publicados"
  ADD COLUMN "horario" jsonb,
  ADD COLUMN "responsable_id" uuid REFERENCES "cuentas_locales"("id"),
  ADD COLUMN "motivo" text;

UPDATE "historial_turnos_publicados" AS historial
SET "horario" = jsonb_build_object(
  'idHuellero', turno."id_huellero",
  'fecha', turno."fecha",
  'sede', turno."sede",
  'modeloHorarioId', turno."modelo_horario_id",
  'entradaProgramada', turno."entrada_programada",
  'salidaProgramada', turno."salida_programada",
  'descanso', turno."descanso"
)
FROM "turnos_publicados" AS turno
WHERE turno."id" = historial."turno_publicado_id";

ALTER TABLE "historial_turnos_publicados"
  ALTER COLUMN "horario" SET NOT NULL,
  ADD CONSTRAINT "historial_republicacion_auditada"
    CHECK (
      "motivo" IS NULL
      OR ("responsable_id" IS NOT NULL AND char_length(btrim("motivo")) BETWEEN 1 AND 250)
    );
