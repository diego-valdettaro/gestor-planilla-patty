ALTER TABLE "importaciones_semanales" ALTER COLUMN "sede" DROP NOT NULL;
ALTER TABLE "importaciones_semanales" ALTER COLUMN "semana" DROP NOT NULL;
ALTER TABLE "marcas_crudas" ADD COLUMN "sede" text;
