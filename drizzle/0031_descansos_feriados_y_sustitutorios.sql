-- Descanso semanal asignado, calendario de feriados y descansos sustitutorios (issue #113, ADR 0009).
-- Son hechos de Asistencia que Pagos usará para valorar el trabajo en descanso o feriado; aquí no hay importes.
-- Los datos actuales son de desarrollo: nadie tiene descanso asignado hasta que Finanzas lo registre.

-- Descanso semanal por persona y vigencia. dia_semana es ISO: 1 = lunes … 7 = domingo. Sin fila vigente no hay
-- descanso: nunca se asume el domingo. Un valor nuevo agrega una vigencia y no reescribe las anteriores.
CREATE TABLE "descansos_semanales_asignados" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dni" text NOT NULL,
  "dia_semana" smallint NOT NULL,
  "vigente_desde" date NOT NULL,
  "registrado_por_id" uuid NOT NULL,
  "registrado_en" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "descansos_semanales_dni_fk" FOREIGN KEY ("dni") REFERENCES "colaboradores"("dni"),
  CONSTRAINT "descansos_semanales_registrado_por_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "cuentas_locales"("id"),
  CONSTRAINT "descansos_semanales_dia_valido" CHECK ("dia_semana" BETWEEN 1 AND 7)
);
CREATE UNIQUE INDEX "descansos_semanales_dni_vigencia" ON "descansos_semanales_asignados" USING btree ("dni", "vigente_desde");

-- Calendario de feriados, global. El 1 de mayo es el único con clase propia y la base lo exige.
CREATE TABLE "feriados" (
  "fecha" date PRIMARY KEY NOT NULL,
  "nombre" text NOT NULL,
  "clase" text NOT NULL,
  "registrado_por_id" uuid NOT NULL,
  "registrado_en" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "feriados_registrado_por_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "cuentas_locales"("id"),
  CONSTRAINT "feriados_nombre_valido" CHECK (char_length(btrim("nombre")) BETWEEN 1 AND 100),
  CONSTRAINT "feriados_clase_valida" CHECK ("clase" IN ('feriado', 'primero_de_mayo')),
  CONSTRAINT "feriados_clase_segun_fecha" CHECK (("clase" = 'primero_de_mayo') = (EXTRACT(MONTH FROM "fecha") = 5 AND EXTRACT(DAY FROM "fecha") = 1))
);

-- Descanso sustitutorio previsto para un descanso semanal o feriado, y su verificación posterior. origen_tipo
-- congela qué se sustituye aunque el calendario o el descanso asignado cambien después.
CREATE TABLE "descansos_sustitutorios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dni" text NOT NULL,
  "origen_fecha" date NOT NULL,
  "origen_tipo" text NOT NULL,
  "fecha_prevista" date NOT NULL,
  "estado" text DEFAULT 'previsto' NOT NULL,
  "verificado_por_id" uuid,
  "verificado_en" timestamp with time zone,
  "registrado_por_id" uuid NOT NULL,
  "registrado_en" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "descansos_sustitutorios_dni_fk" FOREIGN KEY ("dni") REFERENCES "colaboradores"("dni"),
  CONSTRAINT "descansos_sustitutorios_verificado_por_fk" FOREIGN KEY ("verificado_por_id") REFERENCES "cuentas_locales"("id"),
  CONSTRAINT "descansos_sustitutorios_registrado_por_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "cuentas_locales"("id"),
  CONSTRAINT "descansos_sustitutorios_origen_valido" CHECK ("origen_tipo" IN ('descanso_semanal', 'feriado', 'primero_de_mayo')),
  CONSTRAINT "descansos_sustitutorios_estado_valido" CHECK ("estado" IN ('previsto', 'otorgado', 'no_otorgado')),
  CONSTRAINT "descansos_sustitutorios_otro_dia" CHECK ("fecha_prevista" <> "origen_fecha"),
  CONSTRAINT "descansos_sustitutorios_verificacion_completa" CHECK (
    ("estado" = 'previsto' AND "verificado_por_id" IS NULL AND "verificado_en" IS NULL)
    OR ("estado" <> 'previsto' AND "verificado_por_id" IS NOT NULL AND "verificado_en" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "descansos_sustitutorios_dni_origen" ON "descansos_sustitutorios" USING btree ("dni", "origen_fecha");
-- Un mismo día previsto no puede sustituir dos orígenes de la persona; uno no otorgado libera su día.
CREATE UNIQUE INDEX "descansos_sustitutorios_dni_fecha_prevista" ON "descansos_sustitutorios" USING btree ("dni", "fecha_prevista") WHERE "estado" <> 'no_otorgado';
