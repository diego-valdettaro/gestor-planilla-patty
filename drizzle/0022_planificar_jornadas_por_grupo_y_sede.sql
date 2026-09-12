ALTER TABLE "turnos_publicados" ADD COLUMN "grupo" text;
ALTER TABLE "turnos_publicados" ADD COLUMN "motivo_no_asistencia" text;
ALTER TABLE "celdas_planes_semanales_en_borrador" ADD COLUMN "grupo" text;
ALTER TABLE "celdas_planes_semanales_en_borrador" ADD COLUMN "motivo_no_asistencia" text;
ALTER TABLE "turnos_publicados" ALTER COLUMN "sede" DROP NOT NULL;
ALTER TABLE "celdas_planes_semanales_en_borrador" ALTER COLUMN "sede" DROP NOT NULL;

UPDATE "turnos_publicados" AS turno
SET "grupo" = colaborador."grupo",
    "motivo_no_asistencia" = CASE WHEN turno."descanso" THEN 'descanso' ELSE NULL END,
    "sede" = CASE WHEN turno."descanso" THEN NULL ELSE turno."sede" END
FROM "colaboradores" AS colaborador
WHERE colaborador."id_huellero" = turno."id_huellero";

UPDATE "celdas_planes_semanales_en_borrador" AS celda
SET "grupo" = plan."equipo",
    "motivo_no_asistencia" = CASE WHEN celda."descanso" THEN 'descanso' ELSE NULL END,
    "sede" = CASE WHEN celda."descanso" THEN NULL ELSE celda."sede" END
FROM "planes_semanales_en_borrador" AS plan
WHERE plan."id" = celda."plan_id";

ALTER TABLE "turnos_publicados"
  ALTER COLUMN "grupo" SET NOT NULL,
  ADD CONSTRAINT "turnos_publicados_grupo_fk" FOREIGN KEY ("grupo") REFERENCES "grupos"("nombre"),
  ADD CONSTRAINT "turnos_publicados_motivo_planificable" CHECK (
    "motivo_no_asistencia" IS NULL OR "motivo_no_asistencia" IN ('descanso', 'feriado', 'vacaciones', 'permiso', 'suspension')
  ),
  ADD CONSTRAINT "turnos_publicados_jornada_valida" CHECK (
    ("motivo_no_asistencia" IS NULL AND "descanso" = false AND "sede" IS NOT NULL AND "entrada_programada" IS NOT NULL AND "salida_programada" IS NOT NULL)
    OR
    ("motivo_no_asistencia" IS NOT NULL AND "descanso" = true AND "sede" IS NULL AND "modelo_horario_id" IS NULL AND "entrada_programada" IS NULL AND "salida_programada" IS NULL)
  );

ALTER TABLE "celdas_planes_semanales_en_borrador"
  ALTER COLUMN "grupo" SET NOT NULL,
  ADD CONSTRAINT "celdas_borrador_grupo_fk" FOREIGN KEY ("grupo") REFERENCES "grupos"("nombre"),
  ADD CONSTRAINT "celdas_borrador_motivo_planificable" CHECK (
    "motivo_no_asistencia" IS NULL OR "motivo_no_asistencia" IN ('descanso', 'feriado', 'vacaciones', 'permiso', 'suspension')
  ),
  ADD CONSTRAINT "celdas_borrador_jornada_valida" CHECK (
    ("motivo_no_asistencia" IS NULL AND "descanso" = false AND "sede" IS NOT NULL AND "entrada_programada" IS NOT NULL AND "salida_programada" IS NOT NULL)
    OR
    ("motivo_no_asistencia" IS NOT NULL AND "descanso" = true AND "sede" IS NULL AND "modelo_horario_id" IS NULL AND "entrada_programada" IS NULL AND "salida_programada" IS NULL)
  );
