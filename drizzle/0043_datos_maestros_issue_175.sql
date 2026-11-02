-- La historia por sede permanece intacta para explicar cierres anteriores.
-- La nueva política operativa es única por grupo; una colisión se deja pendiente.
ALTER TABLE colaboradores ALTER COLUMN sede DROP NOT NULL;
ALTER TABLE importes_externos ADD COLUMN motivo_incidencia text;

CREATE TABLE politicas_tardanzas_grupo (
  grupo text PRIMARY KEY REFERENCES grupos(nombre),
  tolerancia_en_minutos integer,
  tardanzas_acumuladas integer,
  horas_penalizadas integer,
  conflicto boolean NOT NULL DEFAULT false,
  configurada_por_id uuid REFERENCES cuentas_locales(id),
  configurada_en timestamp with time zone,
  CONSTRAINT politica_grupo_completa CHECK (
    conflicto OR (tolerancia_en_minutos IS NOT NULL AND tardanzas_acumuladas IS NOT NULL AND horas_penalizadas IS NOT NULL
      AND tolerancia_en_minutos > 0 AND tardanzas_acumuladas > 0 AND horas_penalizadas > 0
      AND configurada_por_id IS NOT NULL AND configurada_en IS NOT NULL)
  )
);

ALTER TABLE condiciones_laborales
  ADD COLUMN banco_de_pago text,
  ADD COLUMN movilidad_fija_centimos integer,
  DROP CONSTRAINT condiciones_laborales_dato_valido,
  DROP CONSTRAINT condiciones_laborales_una_sola_columna,
  DROP CONSTRAINT condiciones_laborales_columna_segun_dato;

ALTER TABLE condiciones_laborales
  ADD CONSTRAINT condiciones_laborales_dato_valido CHECK (dato IN (
    'sueldo', 'banco_de_pago', 'movilidad_fija', 'jornada_ordinaria_diaria',
    'regimen_laboral', 'afiliacion_pensionaria', 'comision_afp', 'elegibilidad_familiar', 'sede_de_adscripcion'
  )),
  ADD CONSTRAINT condiciones_laborales_una_sola_columna CHECK (num_nonnulls(
    sueldo_centimos, banco_de_pago, movilidad_fija_centimos, jornada_minutos, regimen,
    afiliacion_pensionaria, comision_afp, elegible_asignacion_familiar, sede_de_adscripcion
  ) = 1),
  ADD CONSTRAINT condiciones_laborales_columna_segun_dato CHECK (
    CASE dato
      WHEN 'sueldo' THEN sueldo_centimos IS NOT NULL
      WHEN 'banco_de_pago' THEN nullif(btrim(banco_de_pago), '') IS NOT NULL
      WHEN 'movilidad_fija' THEN movilidad_fija_centimos IS NOT NULL
      WHEN 'jornada_ordinaria_diaria' THEN jornada_minutos IS NOT NULL
      WHEN 'regimen_laboral' THEN regimen IS NOT NULL
      WHEN 'afiliacion_pensionaria' THEN afiliacion_pensionaria IS NOT NULL
      WHEN 'comision_afp' THEN comision_afp IS NOT NULL
      WHEN 'elegibilidad_familiar' THEN elegible_asignacion_familiar IS NOT NULL
      WHEN 'sede_de_adscripcion' THEN sede_de_adscripcion IS NOT NULL
    END
  ),
  ADD CONSTRAINT condiciones_laborales_movilidad_fija_no_negativa CHECK (
    movilidad_fija_centimos IS NULL OR movilidad_fija_centimos BETWEEN 0 AND 2147483647
  );

WITH datos AS (
  SELECT s.grupo, p.sede, p.tolerancia_en_minutos, p.tardanzas_acumuladas,
    p.version,
    p.horas_penalizadas, p.vigente_desde, p.configurada_por_id, p.configurada_en
  FROM politicas_de_penalizacion_por_tardanzas p
  JOIN sedes s ON s.nombre = p.sede
  JOIN grupos g ON g.nombre = s.grupo AND g.gestiona_asistencia
), sedes_con_politica AS (
  SELECT DISTINCT grupo, sede FROM datos
), actuales AS (
  SELECT grupo, sede, tolerancia_en_minutos, tardanzas_acumuladas,
    horas_penalizadas, configurada_por_id, configurada_en
  FROM (
    SELECT datos.*,
      row_number() OVER (PARTITION BY sede ORDER BY vigente_desde DESC, version DESC) AS orden
    FROM datos
    WHERE vigente_desde <= CURRENT_DATE
  ) vigentes
  WHERE orden = 1
), futuras_diferentes AS (
  SELECT DISTINCT futura.grupo
  FROM datos futura
  LEFT JOIN actuales actual ON actual.sede = futura.sede
  WHERE futura.vigente_desde > CURRENT_DATE
    AND (actual.sede IS NULL OR
      (futura.tolerancia_en_minutos, futura.tardanzas_acumuladas, futura.horas_penalizadas)
        IS DISTINCT FROM
      (actual.tolerancia_en_minutos, actual.tardanzas_acumuladas, actual.horas_penalizadas))
), resumen AS (
  SELECT sedes.grupo,
    count(DISTINCT actual.sede) <> count(DISTINCT sedes.sede)
      OR count(DISTINCT (actual.tolerancia_en_minutos, actual.tardanzas_acumuladas, actual.horas_penalizadas)) > 1
      OR bool_or(futuras.grupo IS NOT NULL) AS conflicto,
    min(actual.tolerancia_en_minutos) AS tolerancia,
    min(actual.tardanzas_acumuladas) AS tardanzas,
    min(actual.horas_penalizadas) AS horas
  FROM sedes_con_politica sedes
  LEFT JOIN actuales actual ON actual.sede = sedes.sede
  LEFT JOIN futuras_diferentes futuras ON futuras.grupo = sedes.grupo
  GROUP BY sedes.grupo
), autor AS (
  SELECT DISTINCT ON (grupo) grupo, configurada_por_id, configurada_en
  FROM actuales ORDER BY grupo, configurada_en DESC, configurada_por_id
)
INSERT INTO politicas_tardanzas_grupo (grupo, conflicto, tolerancia_en_minutos, tardanzas_acumuladas, horas_penalizadas, configurada_por_id, configurada_en)
SELECT r.grupo, r.conflicto, CASE WHEN r.conflicto THEN NULL ELSE r.tolerancia END,
  CASE WHEN r.conflicto THEN NULL ELSE r.tardanzas END, CASE WHEN r.conflicto THEN NULL ELSE r.horas END,
  CASE WHEN r.conflicto THEN NULL ELSE a.configurada_por_id END, CASE WHEN r.conflicto THEN NULL ELSE a.configurada_en END
FROM resumen r LEFT JOIN autor a USING (grupo);
