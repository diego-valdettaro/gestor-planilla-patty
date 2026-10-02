-- El identificador de negocio del colaborador pasa de «id_huellero» a «dni» (ADR 0010).
-- Renombra la columna en todas las tablas (las llaves foráneas y únicos siguen la columna).
DO $$
DECLARE
  columna record;
BEGIN
  FOR columna IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'id_huellero'
  LOOP
    EXECUTE format('ALTER TABLE %I RENAME COLUMN "id_huellero" TO "dni"', columna.table_name);
  END LOOP;
END $$;

-- Las instantáneas JSON (revisiones de período, horarios publicados, historial y ajustes)
-- guardaban la clave «idHuellero»; se reescribe a «dni» para que sigan siendo legibles.
DO $$
DECLARE
  columna record;
BEGIN
  FOR columna IN
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'jsonb'
  LOOP
    EXECUTE format(
      'UPDATE %1$I SET %2$I = replace(%2$I::text, ''"idHuellero":'', ''"dni":'')::jsonb WHERE %2$I::text LIKE ''%%"idHuellero":%%''',
      columna.table_name, columna.column_name
    );
  END LOOP;
END $$;

-- El DNI son exactamente 8 dígitos. NOT VALID exige el formato a toda fila nueva o modificada
-- sin invalidar las filas de desarrollo ya existentes.
ALTER TABLE "colaboradores"
  ADD CONSTRAINT "colaboradores_dni_ocho_digitos" CHECK ("dni" ~ '^[0-9]{8}$') NOT VALID;
