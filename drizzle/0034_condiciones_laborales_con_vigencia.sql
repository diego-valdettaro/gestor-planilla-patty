-- Condiciones laborales con vigencia por relación laboral (issue #116, ADR 0008). Sueldo, jornada ordinaria diaria,
-- régimen laboral, afiliación pensionaria, esquema de comisión AFP, elegibilidad familiar y sede de adscripción.
-- Cada fila es un dato con su vigencia: un valor nuevo agrega otra fila y no reescribe las anteriores. Los datos
-- actuales son de desarrollo: nadie tiene condiciones hasta que Finanzas las registre. No guarda datos bancarios.
CREATE TABLE "condiciones_laborales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "relacion_laboral_id" uuid NOT NULL,
  "dato" text NOT NULL,
  -- Exactamente una de estas columnas está llena: la que corresponde a "dato".
  "sueldo_centimos" integer,
  "jornada_minutos" integer,
  "regimen" text,
  "afiliacion_pensionaria" text,
  "comision_afp" text,
  "elegible_asignacion_familiar" boolean,
  -- La sede de adscripción reutiliza las sedes existentes: no hay otro catálogo de centros de costo.
  "sede_de_adscripcion" text,
  "vigente_desde" date NOT NULL,
  "registrado_por_id" uuid NOT NULL,
  "registrado_en" timestamp with time zone DEFAULT now() NOT NULL,
  -- Corrección: la fila anterior queda reemplazada, con motivo, y otra fila ocupa su vigencia.
  "reemplazada_en" timestamp with time zone,
  "motivo_de_reemplazo" text,
  CONSTRAINT "condiciones_laborales_relacion_fk" FOREIGN KEY ("relacion_laboral_id") REFERENCES "relaciones_laborales"("id"),
  CONSTRAINT "condiciones_laborales_sede_fk" FOREIGN KEY ("sede_de_adscripcion") REFERENCES "sedes"("nombre"),
  CONSTRAINT "condiciones_laborales_registrado_por_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "cuentas_locales"("id"),
  CONSTRAINT "condiciones_laborales_dato_valido" CHECK ("dato" IN ('sueldo', 'jornada_ordinaria_diaria', 'regimen_laboral', 'afiliacion_pensionaria', 'comision_afp', 'elegibilidad_familiar', 'sede_de_adscripcion')),
  CONSTRAINT "condiciones_laborales_una_sola_columna" CHECK (num_nonnulls("sueldo_centimos", "jornada_minutos", "regimen", "afiliacion_pensionaria", "comision_afp", "elegible_asignacion_familiar", "sede_de_adscripcion") = 1),
  CONSTRAINT "condiciones_laborales_columna_segun_dato" CHECK (
    CASE "dato"
      WHEN 'sueldo' THEN "sueldo_centimos" IS NOT NULL
      WHEN 'jornada_ordinaria_diaria' THEN "jornada_minutos" IS NOT NULL
      WHEN 'regimen_laboral' THEN "regimen" IS NOT NULL
      WHEN 'afiliacion_pensionaria' THEN "afiliacion_pensionaria" IS NOT NULL
      WHEN 'comision_afp' THEN "comision_afp" IS NOT NULL
      WHEN 'elegibilidad_familiar' THEN "elegible_asignacion_familiar" IS NOT NULL
      WHEN 'sede_de_adscripcion' THEN "sede_de_adscripcion" IS NOT NULL
    END
  ),
  CONSTRAINT "condiciones_laborales_sueldo_positivo" CHECK ("sueldo_centimos" IS NULL OR "sueldo_centimos" > 0),
  CONSTRAINT "condiciones_laborales_jornada_valida" CHECK ("jornada_minutos" IS NULL OR "jornada_minutos" BETWEEN 1 AND 1440),
  CONSTRAINT "condiciones_laborales_regimen_valido" CHECK ("regimen" IS NULL OR "regimen" IN ('general', 'remype_pequena_empresa')),
  CONSTRAINT "condiciones_laborales_afiliacion_valida" CHECK ("afiliacion_pensionaria" IS NULL OR "afiliacion_pensionaria" IN ('onp', 'afp_habitat', 'afp_integra', 'afp_prima', 'afp_profuturo')),
  CONSTRAINT "condiciones_laborales_comision_valida" CHECK ("comision_afp" IS NULL OR "comision_afp" IN ('flujo', 'mixta')),
  CONSTRAINT "condiciones_laborales_reemplazo_con_motivo" CHECK (("reemplazada_en" IS NULL) = ("motivo_de_reemplazo" IS NULL)),
  CONSTRAINT "condiciones_laborales_motivo_valido" CHECK ("motivo_de_reemplazo" IS NULL OR char_length(btrim("motivo_de_reemplazo")) BETWEEN 1 AND 250)
);
CREATE INDEX "condiciones_laborales_relacion_dato" ON "condiciones_laborales" USING btree ("relacion_laboral_id", "dato");
-- Una sola vigencia activa por relación, dato y fecha: otra fecha agrega una vigencia; la misma fecha se corrige.
CREATE UNIQUE INDEX "condiciones_laborales_una_activa_por_vigencia" ON "condiciones_laborales" USING btree ("relacion_laboral_id", "dato", "vigente_desde") WHERE "reemplazada_en" IS NULL;
