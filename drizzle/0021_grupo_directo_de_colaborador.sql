ALTER TABLE "colaboradores" ADD COLUMN "grupo" text;

UPDATE "colaboradores" c
SET "grupo" = s."grupo"
FROM "sedes" s
WHERE s."nombre" = c."sede";

ALTER TABLE "colaboradores" ALTER COLUMN "grupo" SET NOT NULL;
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_grupo_fk" FOREIGN KEY ("grupo") REFERENCES "grupos"("nombre");
