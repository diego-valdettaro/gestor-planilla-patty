CREATE TABLE "sedes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nombre" text NOT NULL UNIQUE,
  "activa" boolean DEFAULT true NOT NULL,
  "creada_en" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "sedes" ("nombre") VALUES
  ('Taller'),
  ('Tienda Benavides'),
  ('Tienda San Isidro')
ON CONFLICT ("nombre") DO NOTHING;
