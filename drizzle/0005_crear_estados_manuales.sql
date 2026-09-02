CREATE TABLE "estados_manuales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asistencia_id" uuid NOT NULL REFERENCES "public"."asistencias_esperadas"("id"),
  "tipo" text NOT NULL,
  "comentario" text NOT NULL,
  "responsable_id" uuid NOT NULL REFERENCES "public"."cuentas_locales"("id"),
  "registrado_en" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "estados_manuales_asistencia_id" ON "estados_manuales" USING btree ("asistencia_id");
