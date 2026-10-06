-- Aprobación de asistencias por grupo y período (issue #114, ADR 0012): el gerente de área aprueba la situación
-- de todas las personas de su grupo para un período y Finanzas solo cierra cuando todos los grupos que gestionan
-- asistencia están aprobados. Una corrección de asistencias invalida la aprobación del grupo afectado: la fila no
-- se borra (invalidada_en + motivo), así el historial de aprobaciones se conserva junto a las revisiones cerradas.
CREATE TABLE "aprobaciones_de_asistencia" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "periodo_id" uuid NOT NULL,
  "grupo" text NOT NULL,
  "aprobada_por_id" uuid NOT NULL,
  "aprobada_en" timestamp with time zone NOT NULL,
  "invalidada_en" timestamp with time zone,
  "motivo_de_invalidacion" text,
  CONSTRAINT "aprobaciones_de_asistencia_periodo_fk" FOREIGN KEY ("periodo_id") REFERENCES "periodos_planilla"("id"),
  CONSTRAINT "aprobaciones_de_asistencia_grupo_fk" FOREIGN KEY ("grupo") REFERENCES "grupos"("nombre"),
  CONSTRAINT "aprobaciones_de_asistencia_aprobada_por_fk" FOREIGN KEY ("aprobada_por_id") REFERENCES "cuentas_locales"("id"),
  CONSTRAINT "aprobaciones_de_asistencia_invalidacion_completa" CHECK (("invalidada_en" IS NULL) = ("motivo_de_invalidacion" IS NULL))
);
CREATE INDEX "aprobaciones_de_asistencia_periodo_grupo" ON "aprobaciones_de_asistencia" USING btree ("periodo_id", "grupo");
-- A lo sumo una aprobación vigente por período y grupo; las invalidadas quedan como historial.
CREATE UNIQUE INDEX "aprobaciones_de_asistencia_una_vigente" ON "aprobaciones_de_asistencia" USING btree ("periodo_id", "grupo") WHERE "invalidada_en" IS NULL;
