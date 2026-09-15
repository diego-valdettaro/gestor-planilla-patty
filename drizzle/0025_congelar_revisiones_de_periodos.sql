CREATE TABLE "revisiones_periodos_planilla" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "periodo_id" uuid NOT NULL REFERENCES "public"."periodos_planilla"("id"),
  "numero" integer NOT NULL,
  "resumen" jsonb NOT NULL,
  "responsable_id" uuid NOT NULL REFERENCES "public"."cuentas_locales"("id"),
  "cerrada_en" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX "revisiones_periodo_numero"
  ON "revisiones_periodos_planilla" ("periodo_id", "numero");
