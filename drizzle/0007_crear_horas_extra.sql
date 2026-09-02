CREATE TABLE "horas_extra" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asistencia_id" uuid NOT NULL UNIQUE REFERENCES "public"."asistencias_esperadas"("id"),
  "minutos_al_25" integer NOT NULL,
  "minutos_al_35" integer NOT NULL,
  "estado" text DEFAULT 'pendiente' NOT NULL,
  "decidida_por_id" uuid REFERENCES "public"."cuentas_locales"("id"),
  "decidida_en" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "horas_extra_asistencia_id" ON "horas_extra" USING btree ("asistencia_id");
