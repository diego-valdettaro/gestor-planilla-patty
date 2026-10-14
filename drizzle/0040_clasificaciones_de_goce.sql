-- Clasificación de goce de permisos y suspensiones (#123): una decisión vigente por jornada (dni + fecha), con su actor y fecha.
CREATE TABLE "clasificaciones_de_goce" (
  "dni" text NOT NULL,
  "fecha" date NOT NULL,
  "con_goce" boolean NOT NULL,
  "clasificado_por_id" uuid NOT NULL,
  "clasificado_en" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "clasificaciones_de_goce_pk" PRIMARY KEY ("dni", "fecha"),
  CONSTRAINT "clasificaciones_de_goce_dni_fk" FOREIGN KEY ("dni") REFERENCES "colaboradores"("dni"),
  CONSTRAINT "clasificaciones_de_goce_clasificado_por_fk" FOREIGN KEY ("clasificado_por_id") REFERENCES "cuentas_locales"("id")
);
