CREATE TABLE "modelos_de_horario" (
  "id" uuid PRIMARY KEY NOT NULL,
  "sede" text NOT NULL REFERENCES "sedes"("nombre"),
  "nombre" text NOT NULL,
  "entrada" text NOT NULL,
  "salida" text NOT NULL,
  "activo" boolean DEFAULT true NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "modelos_horario_sede_nombre" ON "modelos_de_horario" USING btree ("sede", "nombre");
CREATE TABLE "auditoria_modelos_de_horario" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "modelo_id" uuid NOT NULL,
  "accion" text NOT NULL,
  "modelo" jsonb NOT NULL,
  "responsable_id" uuid NOT NULL REFERENCES "cuentas_locales"("id"),
  "registrado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "turnos_publicados" ADD COLUMN "modelo_horario_id" uuid REFERENCES "modelos_de_horario"("id");
ALTER TABLE "celdas_planes_semanales_en_borrador" ADD COLUMN "modelo_horario_id" uuid REFERENCES "modelos_de_horario"("id");
