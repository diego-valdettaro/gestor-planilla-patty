CREATE TABLE "reemplazos_de_asistencia_importada" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asistencia_id" uuid NOT NULL REFERENCES "public"."asistencias_esperadas"("id"),
  "importacion_id" uuid NOT NULL REFERENCES "public"."importaciones_semanales"("id"),
  "estado_anterior" text NOT NULL,
  "valor_anterior" jsonb NOT NULL,
  "responsable_id" uuid NOT NULL REFERENCES "public"."cuentas_locales"("id"),
  "reemplazado_en" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "reemplazos_asistencia_importada_asistencia_id" ON "reemplazos_de_asistencia_importada" USING btree ("asistencia_id");
CREATE INDEX "reemplazos_asistencia_importada_importacion_id" ON "reemplazos_de_asistencia_importada" USING btree ("importacion_id");
