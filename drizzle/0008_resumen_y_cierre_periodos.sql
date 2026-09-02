ALTER TABLE "periodos_planilla"
  ADD COLUMN "cerrado_por_id" uuid REFERENCES "public"."cuentas_locales"("id"),
  ADD COLUMN "cerrado_en" timestamp with time zone;

CREATE TABLE "auditoria_periodos_planilla" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "periodo_id" uuid NOT NULL REFERENCES "public"."periodos_planilla"("id"),
  "accion" text NOT NULL,
  "responsable_id" uuid NOT NULL REFERENCES "public"."cuentas_locales"("id"),
  "motivo" text,
  "registrado_en" timestamp with time zone DEFAULT now() NOT NULL
);
