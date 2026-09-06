CREATE TABLE "planes_semanales_en_borrador" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "semana" date NOT NULL,
  "equipo" text NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "planes_borrador_equipo_valido" CHECK ("equipo" IN ('tiendas', 'taller'))
);
CREATE UNIQUE INDEX "planes_borrador_semana_equipo" ON "planes_semanales_en_borrador" USING btree ("semana", "equipo");

CREATE TABLE "celdas_planes_semanales_en_borrador" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_id" uuid NOT NULL REFERENCES "planes_semanales_en_borrador"("id"),
  "id_huellero" text NOT NULL REFERENCES "colaboradores"("id_huellero"),
  "fecha" date NOT NULL,
  "sede" text NOT NULL,
  "entrada_programada" text NOT NULL,
  "salida_programada" text NOT NULL,
  "minutos_de_almuerzo" integer NOT NULL,
  "descanso" boolean NOT NULL
);
CREATE UNIQUE INDEX "celdas_borrador_plan_colaborador_fecha" ON "celdas_planes_semanales_en_borrador" USING btree ("plan_id", "id_huellero", "fecha");
