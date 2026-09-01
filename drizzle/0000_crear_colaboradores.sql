CREATE TABLE "colaboradores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "id_huellero" text NOT NULL UNIQUE,
  "nombre" text NOT NULL,
  "sede" text NOT NULL,
  "centro_de_costo" text NOT NULL,
  "activo" boolean DEFAULT true NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
