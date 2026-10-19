-- Constancia del pago realizado de un mes (#130, ADR 0013). Finanzas confirma, fuera de la app, que se pagó la versión finalizada
-- de un mes: la constancia guarda el mes (texto AAAA-MM con CHECK de formato, como en las demás tablas de Pagos), la versión
-- pagada (clave foránea compuesta a la versión del mes), la fecha del pago, quién lo confirmó y cuándo.
CREATE TABLE "constancias_de_pago" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "mes_de_pago" text NOT NULL,
  "numero_de_version" integer NOT NULL,
  "fecha_del_pago" date NOT NULL,
  "confirmada_por_id" uuid NOT NULL,
  "confirmada_en" timestamp with time zone NOT NULL,
  CONSTRAINT "constancias_de_pago_version_fk" FOREIGN KEY ("mes_de_pago", "numero_de_version") REFERENCES "versiones_de_pago"("mes_de_pago", "numero"),
  CONSTRAINT "constancias_de_pago_confirmada_por_fk" FOREIGN KEY ("confirmada_por_id") REFERENCES "cuentas_locales"("id"),
  CONSTRAINT "constancias_de_pago_mes_valido" CHECK ("mes_de_pago" ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

-- Un mes se paga una sola vez (ADR 0013): la base rechaza una segunda constancia del mismo mes, también si llegan a la vez.
CREATE UNIQUE INDEX "constancias_de_pago_mes" ON "constancias_de_pago" USING btree ("mes_de_pago");

-- La constancia es irreversible (ADR 0013, mismo patrón que la migración 0041): la base rechaza modificarla o borrarla, también fuera
-- del caso de uso. Solo se agregan filas.
CREATE FUNCTION "rechazar_cambios_en_constancias_de_pago"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las constancias de pago realizado no se modifican ni se borran.' USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
CREATE TRIGGER "constancias_de_pago_inmutable" BEFORE UPDATE OR DELETE ON "constancias_de_pago"
  FOR EACH ROW EXECUTE FUNCTION "rechazar_cambios_en_constancias_de_pago"();
