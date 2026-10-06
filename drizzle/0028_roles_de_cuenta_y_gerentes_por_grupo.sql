-- ADR 0012: roles administrador / gerente_de_area / recursos_humanos / finanzas.
--
-- Regla de migración de cuentas existentes:
--   administracion -> administrador        (conserva la configuración global; ya no define autorización operativa por grupo)
--   operaciones    -> gerente_de_area      (sin grupos asignados: Finanzas o el Administrador los asignan)
--   finanzas       -> finanzas             (sin cambio)
UPDATE "cuentas_locales" SET "rol" = CASE "rol"
  WHEN 'administracion' THEN 'administrador'
  WHEN 'operaciones' THEN 'gerente_de_area'
  ELSE "rol"
END;

ALTER TABLE "cuentas_locales" ADD CONSTRAINT "cuentas_locales_rol_valido"
  CHECK ("rol" IN ('administrador', 'gerente_de_area', 'recursos_humanos', 'finanzas'));

-- Atributo de grupo «Gestiona asistencia y horarios». El grupo Administración entra en planilla
-- pero no marca, así que queda fuera de horarios, asistencias y aprobación.
ALTER TABLE "grupos" ADD COLUMN "gestiona_asistencia" boolean NOT NULL DEFAULT true;
UPDATE "grupos" SET "gestiona_asistencia" = false WHERE "nombre" = 'Administración';

CREATE TABLE "gerentes_de_grupo" (
  "grupo" text PRIMARY KEY,
  "cuenta_id" uuid NOT NULL,
  "asignado_en" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gerentes_de_grupo_grupo_fk" FOREIGN KEY ("grupo") REFERENCES "grupos"("nombre"),
  CONSTRAINT "gerentes_de_grupo_cuenta_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_locales"("id")
);
CREATE INDEX "gerentes_de_grupo_cuenta_id" ON "gerentes_de_grupo" USING btree ("cuenta_id");
