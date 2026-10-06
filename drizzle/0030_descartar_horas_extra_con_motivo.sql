-- Una hora extra descartada conserva la evidencia (marca errónea o permanencia sin trabajo) y el
-- motivo con que Finanzas la descartó. El estado «rechazada» pasa a llamarse «descartada»: la falta
-- de autorización previa no es causa de descarte (ADR 0009).
ALTER TABLE "horas_extra"
  ADD COLUMN "causa_de_descarte" text,
  ADD COLUMN "motivo_de_descarte" text;

-- Datos de desarrollo: las horas extra rechazadas antes de esta migración no tienen evidencia ni motivo.
UPDATE "horas_extra"
SET "estado" = 'descartada',
    "causa_de_descarte" = 'marca_erronea',
    "motivo_de_descarte" = 'Descartada antes de exigir motivo y evidencia.'
WHERE "estado" = 'rechazada';

-- Las revisiones cerradas guardan el resumen como JSON con el nombre anterior del estado.
UPDATE "revisiones_periodos_planilla"
SET "resumen" = replace("resumen"::text, '"rechazada"', '"descartada"')::jsonb
WHERE "resumen"::text LIKE '%"rechazada"%';

ALTER TABLE "horas_extra" ADD CONSTRAINT "horas_extra_descarte_con_evidencia" CHECK (
  CASE "estado"
    WHEN 'descartada' THEN
      "causa_de_descarte" IN ('marca_erronea', 'permanencia_sin_trabajo')
      AND length(btrim(coalesce("motivo_de_descarte", ''))) > 0
    ELSE "causa_de_descarte" IS NULL AND "motivo_de_descarte" IS NULL
  END
);
