CREATE TABLE "cuentas_locales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nombre_usuario" text NOT NULL UNIQUE,
  "hash_contrasena" text NOT NULL,
  "rol" text NOT NULL,
  "creada_en" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "sesiones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cuenta_id" uuid NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "vence_en" timestamp with time zone NOT NULL,
  "creada_en" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sesiones_cuenta_id_cuentas_locales_id_fk"
    FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas_locales"("id")
);
CREATE INDEX "sesiones_cuenta_id" ON "sesiones" USING btree ("cuenta_id");
