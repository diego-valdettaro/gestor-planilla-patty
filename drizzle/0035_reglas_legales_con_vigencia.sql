-- Reglas legales con vigencia (issue #117, ADR 0008). Tasas, topes, RMV y demás valores legales que Finanzas activa con
-- fecha de vigencia, fuente oficial y responsable. Cada fila es una versión de un valor: una versión nueva agrega otra
-- fila y no reescribe las anteriores. La base no trae ningún valor legal: nadie tiene reglas hasta que Finanzas las active.
-- El catálogo de códigos vive en el código (src/reglas-legales/catalogo.ts), no en un CHECK, para que ampliarlo no exija migración.
CREATE TABLE "reglas_legales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "codigo" text NOT NULL,
  -- Exactamente una de estas columnas está llena: la que corresponde a la unidad del código.
  "tasa_centesimas_de_punto" integer,
  "importe_centimos" integer,
  "vigente_desde" date NOT NULL,
  "fuente_oficial" text NOT NULL,
  "activada_por_id" uuid NOT NULL,
  "activada_en" timestamp with time zone DEFAULT now() NOT NULL,
  -- Corrección: la fila anterior queda reemplazada, con motivo, y otra fila ocupa su vigencia.
  "reemplazada_en" timestamp with time zone,
  "motivo_de_reemplazo" text,
  CONSTRAINT "reglas_legales_activada_por_fk" FOREIGN KEY ("activada_por_id") REFERENCES "cuentas_locales"("id"),
  CONSTRAINT "reglas_legales_una_sola_columna" CHECK (num_nonnulls("tasa_centesimas_de_punto", "importe_centimos") = 1),
  CONSTRAINT "reglas_legales_tasa_valida" CHECK ("tasa_centesimas_de_punto" IS NULL OR "tasa_centesimas_de_punto" BETWEEN 0 AND 10000),
  CONSTRAINT "reglas_legales_importe_positivo" CHECK ("importe_centimos" IS NULL OR "importe_centimos" > 0),
  CONSTRAINT "reglas_legales_fuente_valida" CHECK (char_length(btrim("fuente_oficial")) BETWEEN 1 AND 500),
  CONSTRAINT "reglas_legales_reemplazo_con_motivo" CHECK (("reemplazada_en" IS NULL) = ("motivo_de_reemplazo" IS NULL)),
  CONSTRAINT "reglas_legales_motivo_valido" CHECK ("motivo_de_reemplazo" IS NULL OR char_length(btrim("motivo_de_reemplazo")) BETWEEN 1 AND 250)
);
CREATE INDEX "reglas_legales_codigo" ON "reglas_legales" USING btree ("codigo");
-- Una sola versión activa por código y fecha: otra fecha agrega una vigencia; la misma fecha se corrige.
CREATE UNIQUE INDEX "reglas_legales_una_activa_por_vigencia" ON "reglas_legales" USING btree ("codigo", "vigente_desde") WHERE "reemplazada_en" IS NULL;
