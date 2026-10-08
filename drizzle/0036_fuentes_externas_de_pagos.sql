-- Fuentes externas de Pagos (issue #118, ADR 0009). Los importes que Finanzas carga por persona desde fuera del huellero y
-- la confirmación de cada tipo de fuente para el mes de pago. Los catálogos de conceptos y de tipos de fuente viven en el código
-- (src/conceptos-de-preliquidacion, src/fuentes-externas), no en un CHECK, para que ampliarlos no exija migración.
-- Los meses son texto AAAA-MM. Un importe no se edita: se anula con motivo y queda en el historial.
CREATE TABLE "importes_externos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tipo_de_fuente" text NOT NULL,
  "dni" text NOT NULL,
  "concepto" text NOT NULL,
  "fecha_del_hecho" date NOT NULL,
  "mes_de_devengue" text NOT NULL,
  "mes_de_aplicacion" text NOT NULL,
  -- Céntimos, siempre positivo: el signo sobre el neto lo da el concepto.
  "monto_centimos" integer NOT NULL,
  "procedencia" text NOT NULL,
  "registrado_por_id" uuid NOT NULL,
  "registrado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "anulado_en" timestamp with time zone,
  "motivo_de_anulacion" text,
  CONSTRAINT "importes_externos_dni_fk" FOREIGN KEY ("dni") REFERENCES "colaboradores"("dni"),
  CONSTRAINT "importes_externos_registrado_por_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "cuentas_locales"("id"),
  CONSTRAINT "importes_externos_monto_positivo" CHECK ("monto_centimos" > 0),
  CONSTRAINT "importes_externos_meses_validos" CHECK ("mes_de_devengue" ~ '^\d{4}-(0[1-9]|1[0-2])$' AND "mes_de_aplicacion" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "importes_externos_procedencia_valida" CHECK (char_length(btrim("procedencia")) BETWEEN 1 AND 200),
  CONSTRAINT "importes_externos_anulacion_con_motivo" CHECK (("anulado_en" IS NULL) = ("motivo_de_anulacion" IS NULL)),
  CONSTRAINT "importes_externos_motivo_valido" CHECK ("motivo_de_anulacion" IS NULL OR char_length(btrim("motivo_de_anulacion")) BETWEEN 1 AND 250)
);
CREATE INDEX "importes_externos_fuente" ON "importes_externos" USING btree ("tipo_de_fuente", "mes_de_aplicacion");
CREATE INDEX "importes_externos_dni" ON "importes_externos" USING btree ("dni", "mes_de_aplicacion");
-- Un importe idéntico a otro no anulado es un duplicado y la base lo rechaza.
CREATE UNIQUE INDEX "importes_externos_sin_duplicados" ON "importes_externos" USING btree ("dni", "concepto", "fecha_del_hecho", "mes_de_devengue", "mes_de_aplicacion", "monto_centimos") WHERE "anulado_en" IS NULL;

CREATE TABLE "confirmaciones_de_fuente" (
  "tipo_de_fuente" text NOT NULL,
  "mes_de_aplicacion" text NOT NULL,
  "confirmada_por_id" uuid NOT NULL,
  "confirmada_en" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "confirmaciones_de_fuente_pk" PRIMARY KEY ("tipo_de_fuente", "mes_de_aplicacion"),
  CONSTRAINT "confirmaciones_de_fuente_confirmada_por_fk" FOREIGN KEY ("confirmada_por_id") REFERENCES "cuentas_locales"("id"),
  CONSTRAINT "confirmaciones_de_fuente_mes_valido" CHECK ("mes_de_aplicacion" ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
