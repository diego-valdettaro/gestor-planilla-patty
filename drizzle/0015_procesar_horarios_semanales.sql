CREATE TABLE "horarios_semanales_procesados" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "id_huellero" text NOT NULL REFERENCES "colaboradores"("id_huellero"),
  "semana" date NOT NULL,
  "equipo" text NOT NULL CHECK ("equipo" IN ('tiendas', 'taller')),
  "responsable_id" uuid NOT NULL REFERENCES "cuentas_locales"("id"),
  "procesado_en" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "horarios_semanales_procesados_colaborador_semana" UNIQUE("id_huellero", "semana")
);
