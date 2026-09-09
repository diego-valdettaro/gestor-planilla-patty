CREATE TABLE "grupos" (
  "nombre" text PRIMARY KEY,
  "creado_en" timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO "grupos" ("nombre") VALUES ('Tiendas'), ('Taller');

ALTER TABLE "sedes" DROP CONSTRAINT "sedes_equipo_operativo_valido";
ALTER TABLE "sedes" RENAME COLUMN "equipo_operativo" TO "grupo";
UPDATE "sedes" SET "grupo" = CASE "grupo" WHEN 'tiendas' THEN 'Tiendas' WHEN 'taller' THEN 'Taller' ELSE "grupo" END;
ALTER TABLE "sedes" ADD CONSTRAINT "sedes_grupo_fk" FOREIGN KEY ("grupo") REFERENCES "grupos"("nombre");

ALTER TABLE "planes_semanales_en_borrador" DROP CONSTRAINT "planes_borrador_equipo_valido";
UPDATE "planes_semanales_en_borrador" SET "equipo" = CASE "equipo" WHEN 'tiendas' THEN 'Tiendas' WHEN 'taller' THEN 'Taller' ELSE "equipo" END;
UPDATE "horarios_semanales_procesados" SET "equipo" = CASE "equipo" WHEN 'tiendas' THEN 'Tiendas' WHEN 'taller' THEN 'Taller' ELSE "equipo" END;
ALTER TABLE "horarios_semanales_procesados" DROP CONSTRAINT IF EXISTS "horarios_semanales_procesados_equipo_check";
