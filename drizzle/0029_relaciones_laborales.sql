-- Relaciones laborales (issue #109, ADR 0012): Recursos Humanos registra y confirma el ingreso y el
-- cese de cada relación laboral. Una persona (DNI) puede tener relaciones sucesivas; ese intervalo
-- define cuándo se publican horarios y quién entra en Pagos. Los datos actuales son de desarrollo:
-- no se crean relaciones para los colaboradores existentes, Recursos Humanos las registra.
CREATE TABLE "relaciones_laborales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dni" text NOT NULL,
  "ingreso" date NOT NULL,
  "cese" date,
  "ingreso_confirmado_por_id" uuid,
  "ingreso_confirmado_en" timestamp with time zone,
  "cese_confirmado_por_id" uuid,
  "cese_confirmado_en" timestamp with time zone,
  "registrada_por_id" uuid NOT NULL,
  "registrada_en" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "relaciones_laborales_dni_fk" FOREIGN KEY ("dni") REFERENCES "colaboradores"("dni"),
  CONSTRAINT "relaciones_laborales_registrada_por_fk" FOREIGN KEY ("registrada_por_id") REFERENCES "cuentas_locales"("id"),
  CONSTRAINT "relaciones_laborales_ingreso_confirmado_por_fk" FOREIGN KEY ("ingreso_confirmado_por_id") REFERENCES "cuentas_locales"("id"),
  CONSTRAINT "relaciones_laborales_cese_confirmado_por_fk" FOREIGN KEY ("cese_confirmado_por_id") REFERENCES "cuentas_locales"("id"),
  CONSTRAINT "relaciones_laborales_cese_no_anterior_al_ingreso" CHECK ("cese" IS NULL OR "cese" >= "ingreso"),
  CONSTRAINT "relaciones_laborales_ingreso_confirmado_completo" CHECK (("ingreso_confirmado_por_id" IS NULL) = ("ingreso_confirmado_en" IS NULL)),
  CONSTRAINT "relaciones_laborales_cese_confirmado_completo" CHECK (("cese_confirmado_por_id" IS NULL) = ("cese_confirmado_en" IS NULL)),
  CONSTRAINT "relaciones_laborales_cese_confirmado_con_cese" CHECK ("cese_confirmado_en" IS NULL OR "cese" IS NOT NULL),
  CONSTRAINT "relaciones_laborales_cese_confirmado_tras_ingreso" CHECK ("cese_confirmado_en" IS NULL OR "ingreso_confirmado_en" IS NOT NULL)
);
CREATE INDEX "relaciones_laborales_dni" ON "relaciones_laborales" USING btree ("dni", "ingreso");
-- A lo sumo una relación sin cese por persona: para registrar un reingreso la anterior debe tener cese.
CREATE UNIQUE INDEX "relaciones_laborales_una_sin_cese_por_dni" ON "relaciones_laborales" USING btree ("dni") WHERE "cese" IS NULL;

-- Estado planificado «Sin relación laboral»: los días de una semana fuera de la relación laboral
-- confirmada (antes del ingreso, después del cese o en el hueco entre dos relaciones).
ALTER TABLE "turnos_publicados" DROP CONSTRAINT "turnos_publicados_motivo_planificable";
ALTER TABLE "turnos_publicados" ADD CONSTRAINT "turnos_publicados_motivo_planificable" CHECK (
  "motivo_no_asistencia" IS NULL OR "motivo_no_asistencia" IN ('descanso', 'feriado', 'vacaciones', 'permiso', 'suspension', 'sin_relacion_laboral')
);
ALTER TABLE "celdas_planes_semanales_en_borrador" DROP CONSTRAINT "celdas_borrador_motivo_planificable";
ALTER TABLE "celdas_planes_semanales_en_borrador" ADD CONSTRAINT "celdas_borrador_motivo_planificable" CHECK (
  "motivo_no_asistencia" IS NULL OR "motivo_no_asistencia" IN ('descanso', 'feriado', 'vacaciones', 'permiso', 'suspension', 'sin_relacion_laboral')
);
