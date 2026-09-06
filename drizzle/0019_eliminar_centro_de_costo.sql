-- El centro de costo dejó de usarse en toda la aplicación. Se elimina la
-- columna de colaboradores; el contenido previo no se conserva.
ALTER TABLE "colaboradores"
  DROP COLUMN IF EXISTS "centro_de_costo";
