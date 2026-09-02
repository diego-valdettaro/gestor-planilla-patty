CREATE TABLE "politicas_de_penalizacion_por_tardanzas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sede" text NOT NULL,
  "tolerancia_en_minutos" integer NOT NULL,
  "tardanzas_acumuladas" integer NOT NULL,
  "horas_penalizadas" integer NOT NULL,
  "version" integer NOT NULL,
  "vigente_desde" date NOT NULL,
  "configurada_por_id" uuid NOT NULL REFERENCES "public"."cuentas_locales"("id"),
  "configurada_en" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "politicas_tardanzas_sede_version" ON "politicas_de_penalizacion_por_tardanzas" USING btree ("sede", "version");
CREATE UNIQUE INDEX "politicas_tardanzas_sede_vigencia" ON "politicas_de_penalizacion_por_tardanzas" USING btree ("sede", "vigente_desde");

CREATE TABLE "tardanzas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asistencia_id" uuid NOT NULL UNIQUE REFERENCES "public"."asistencias_esperadas"("id"),
  "minutos_de_tardanza" integer NOT NULL,
  "minutos_penalizados" integer NOT NULL,
  "politica_version" integer NOT NULL
);
CREATE INDEX "tardanzas_asistencia_id" ON "tardanzas" USING btree ("asistencia_id");
