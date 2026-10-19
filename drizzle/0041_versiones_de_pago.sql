-- Versiones finalizadas de la preliquidación del mes (#129, ADR 0007 y 0014). Una versión guarda el mes completo: su cabecera
-- (mes, número, quién y cuándo la finalizó, el corte, las reglas usadas, las revisiones de asistencia y el estado de las fuentes
-- de origen) y una fila por persona con su subtotal «Neto antes de aportes del trabajador», sus líneas y sus bases, en céntimos.
-- Los meses son texto AAAA-MM. Además del esquema trae las restricciones con
-- comportamiento propio: número único por mes y versión inmutable (disparadores al final); el subtotal entero lo exige el tipo.
CREATE TABLE "versiones_de_pago" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "mes_de_pago" text NOT NULL,
  "numero" integer NOT NULL,
  "finalizada_por_id" uuid NOT NULL,
  "finalizada_en" timestamp with time zone NOT NULL,
  "corte_inicio" date NOT NULL,
  "corte_fin" date NOT NULL,
  "reglas" jsonb NOT NULL,
  "revisiones" jsonb NOT NULL,
  "fuentes" jsonb NOT NULL,
  "huella" text NOT NULL,
  CONSTRAINT "versiones_de_pago_finalizada_por_fk" FOREIGN KEY ("finalizada_por_id") REFERENCES "cuentas_locales"("id")
);
CREATE UNIQUE INDEX "versiones_de_pago_mes" ON "versiones_de_pago" USING btree ("mes_de_pago", "numero");

CREATE TABLE "versiones_de_pago_personas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version_id" uuid NOT NULL,
  "relacion_id" uuid NOT NULL,
  "dni" text NOT NULL,
  "nombre" text NOT NULL,
  "subtotal_centimos" integer NOT NULL,
  "lineas" jsonb NOT NULL,
  "bases" jsonb NOT NULL,
  CONSTRAINT "versiones_de_pago_personas_version_fk" FOREIGN KEY ("version_id") REFERENCES "versiones_de_pago"("id"),
  CONSTRAINT "versiones_de_pago_personas_relacion_fk" FOREIGN KEY ("relacion_id") REFERENCES "relaciones_laborales"("id")
);
CREATE INDEX "versiones_de_pago_personas_version" ON "versiones_de_pago_personas" USING btree ("version_id");

-- Una versión finalizada es inmutable (ADR 0007): la base rechaza modificar o borrar cualquiera de sus registros, también fuera
-- del caso de uso. Una corrección crea otra versión. Solo se agregan filas.
CREATE FUNCTION "rechazar_cambios_en_versiones_de_pago"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las versiones finalizadas no se modifican ni se borran; cree otra versión.' USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
CREATE TRIGGER "versiones_de_pago_inmutable" BEFORE UPDATE OR DELETE ON "versiones_de_pago"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_cambios_en_versiones_de_pago"();
CREATE TRIGGER "versiones_de_pago_personas_inmutable" BEFORE UPDATE OR DELETE ON "versiones_de_pago_personas"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_cambios_en_versiones_de_pago"();
