ALTER TABLE "asistencias_esperadas"
  ADD COLUMN "entrada_real" text,
  ADD COLUMN "salida_real" text,
  ADD COLUMN "minutos_trabajados" integer,
  ADD COLUMN "instantanea_de_turno" jsonb,
  ADD COLUMN "confirmado_por_id" uuid REFERENCES "public"."cuentas_locales"("id"),
  ADD COLUMN "confirmado_en" timestamp with time zone;

CREATE TABLE "ajustes_de_asistencia" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asistencia_id" uuid NOT NULL REFERENCES "public"."asistencias_esperadas"("id"),
  "entrada_real" text NOT NULL,
  "salida_real" text NOT NULL,
  "motivo" text NOT NULL,
  "responsable_id" uuid NOT NULL REFERENCES "public"."cuentas_locales"("id"),
  "ajustado_en" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "ajustes_asistencia_id" ON "ajustes_de_asistencia" USING btree ("asistencia_id");
