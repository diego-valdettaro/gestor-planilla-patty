ALTER TABLE "sedes" ADD COLUMN "equipo_operativo" text;
ALTER TABLE "sedes" ADD CONSTRAINT "sedes_equipo_operativo_valido" CHECK ("equipo_operativo" IN ('tiendas', 'taller'));
