ALTER TABLE "asistencias_esperadas" ADD COLUMN "entrada_propuesta" text;
ALTER TABLE "asistencias_esperadas" ADD COLUMN "salida_propuesta" text;

CREATE TABLE "importaciones_semanales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sede" text NOT NULL,
  "semana" date NOT NULL,
  "archivo_nombre" text NOT NULL,
  "archivo_ubicacion" text NOT NULL,
  "archivo_hash_sha256" text NOT NULL,
  "usuario_id" uuid NOT NULL REFERENCES "public"."cuentas_locales"("id"),
  "importada_en" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "marcas_crudas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "importacion_id" uuid NOT NULL REFERENCES "public"."importaciones_semanales"("id"),
  "id_huellero" text NOT NULL,
  "fecha" date NOT NULL,
  "instante" text NOT NULL
);
CREATE INDEX "marcas_crudas_importacion_id" ON "marcas_crudas" USING btree ("importacion_id");

CREATE TABLE "incidencias_de_importacion" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "importacion_id" uuid NOT NULL REFERENCES "public"."importaciones_semanales"("id"),
  "id_huellero" text NOT NULL,
  "fecha" date NOT NULL,
  "motivo" text NOT NULL
);
CREATE INDEX "incidencias_importacion_id" ON "incidencias_de_importacion" USING btree ("importacion_id");
