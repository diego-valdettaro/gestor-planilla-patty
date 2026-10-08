-- Archivos fuente de preliquidación (issue #119, ADR 0005 y 0009). Cada importación de un XLSX normalizado conserva el archivo
-- (ubicación fuera del directorio público), su hash SHA-256, quién lo importó, el tipo de fuente y el mes de pago, y el
-- resultado de la validación. La importación es todo o nada: un archivo rechazado no deja registro. Importar otro archivo del mismo
-- tipo y mes reemplaza al anterior (sus importes se anulan con motivo y la importación queda con `reemplazada_en`); el archivo
-- anterior no se borra.
CREATE TABLE "importaciones_de_fuente" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tipo_de_fuente" text NOT NULL,
  "mes_de_aplicacion" text NOT NULL,
  "archivo_nombre" text NOT NULL,
  "archivo_ubicacion" text NOT NULL,
  "archivo_hash_sha256" text NOT NULL,
  "usuario_id" uuid NOT NULL,
  "importada_en" timestamp with time zone DEFAULT now() NOT NULL,
  "filas" integer NOT NULL,
  -- Céntimos; suma de los importes del archivo, sin signo.
  "total_centimos" bigint NOT NULL,
  -- Conteos de la validación que aprobó el archivo: filas válidas, con error, duplicadas y personas desconocidas.
  "validacion" jsonb NOT NULL,
  "reemplazada_en" timestamp with time zone,
  CONSTRAINT "importaciones_de_fuente_usuario_fk" FOREIGN KEY ("usuario_id") REFERENCES "cuentas_locales"("id"),
  CONSTRAINT "importaciones_de_fuente_mes_valido" CHECK ("mes_de_aplicacion" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "importaciones_de_fuente_hash_valido" CHECK ("archivo_hash_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "importaciones_de_fuente_filas_positivas" CHECK ("filas" > 0 AND "total_centimos" > 0)
);
CREATE INDEX "importaciones_de_fuente_fuente" ON "importaciones_de_fuente" USING btree ("tipo_de_fuente", "mes_de_aplicacion");
-- A lo sumo una importación vigente (no reemplazada) por tipo de fuente y mes de pago.
CREATE UNIQUE INDEX "importaciones_de_fuente_vigente" ON "importaciones_de_fuente" USING btree ("tipo_de_fuente", "mes_de_aplicacion") WHERE "reemplazada_en" IS NULL;

ALTER TABLE "importes_externos" ADD COLUMN "importacion_id" uuid;
ALTER TABLE "importes_externos" ADD CONSTRAINT "importes_externos_importacion_fk" FOREIGN KEY ("importacion_id") REFERENCES "importaciones_de_fuente"("id");
CREATE INDEX "importes_externos_importacion" ON "importes_externos" USING btree ("importacion_id");
