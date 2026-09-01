CREATE TABLE "periodos_planilla" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "inicio" date NOT NULL,
  "fin" date NOT NULL,
  "estado" text NOT NULL
);

CREATE TABLE "turnos_publicados" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "id_huellero" text NOT NULL,
  "fecha" date NOT NULL,
  "sede" text NOT NULL,
  "entrada_programada" text NOT NULL,
  "salida_programada" text NOT NULL,
  "minutos_de_almuerzo" integer NOT NULL,
  "descanso" boolean NOT NULL,
  "publicado_en" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "turnos_publicados_id_huellero_colaboradores_id_huellero_fk"
    FOREIGN KEY ("id_huellero") REFERENCES "public"."colaboradores"("id_huellero")
);
CREATE UNIQUE INDEX "turnos_publicados_colaborador_fecha"
  ON "turnos_publicados" USING btree ("id_huellero", "fecha");

CREATE TABLE "historial_turnos_publicados" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "turno_publicado_id" uuid NOT NULL,
  "publicado_en" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "historial_turnos_publicados_turno_publicado_id_turnos_publicados_id_fk"
    FOREIGN KEY ("turno_publicado_id") REFERENCES "public"."turnos_publicados"("id")
);

CREATE TABLE "asistencias_esperadas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "id_huellero" text NOT NULL,
  "fecha" date NOT NULL,
  "estado" text DEFAULT 'pendiente' NOT NULL,
  "creada_en" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "asistencias_esperadas_id_huellero_colaboradores_id_huellero_fk"
    FOREIGN KEY ("id_huellero") REFERENCES "public"."colaboradores"("id_huellero")
);
CREATE UNIQUE INDEX "asistencias_esperadas_colaborador_fecha"
  ON "asistencias_esperadas" USING btree ("id_huellero", "fecha");
