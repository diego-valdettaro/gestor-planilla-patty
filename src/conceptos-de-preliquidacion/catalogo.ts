// Catálogo tipado de conceptos de la preliquidación (ADR 0009). La preliquidación se compone solo de estos conceptos:
// cada uno fija de antemano su tipo, su efecto en el neto, su efecto en cada base legal y su código PLAME. Ninguna
// línea es libre ni «otros descuentos». Agregar un concepto es agregar una entrada: no exige migración.
//
// Códigos y afectaciones: los códigos salen de la Tabla 22 «Ingresos, tributos y descuentos» de SUNAT
// (https://orientacion.sunat.gob.pe/sites/default/files/inline-files/Tabla%20N22%20Definici%C3%B3n%20Conceptos%20Plame.pdf).
// Las afectaciones siguen lo que esa tabla indica para cada concepto (las gratificaciones y la bonificación extraordinaria
// son inafectas a EsSalud, SNP y SPP pero gravadas con la renta de quinta; la movilidad supeditada a asistencia, según el
// inc. e) del art. 19 del TUO del D. Leg. 650, no integra las bases pensionarias ni de EsSalud, pero #96 la incluye en la
// de quinta). VALIDAR CON EL CONTADOR antes de usar la preliquidación en producción, en particular:
//  - el código 0312 de la bonificación extraordinaria: la Tabla 22 consultada lo acota a los ejercicios 2009-2014;
//  - los códigos 0705 y 0706, que agrupan varios conceptos de este catálogo (falta, ausencia sin goce y descanso semanal;
//    incidencias y cuotas de préstamo).
// No se incluye la «remuneración ordinaria computable»: qué conceptos la integran lo decide el ticket que valora las horas extra.

export const TIPOS_DE_CONCEPTO = [
  "ingreso_remunerativo",
  "ingreso_no_remunerativo",
  "reduccion",
  "deduccion_del_trabajador",
  "aporte_patronal",
] as const;
export type TipoDeConcepto = (typeof TIPOS_DE_CONCEPTO)[number];

/** `del_concepto_ajustado`: solo el ajuste de preliquidación, que corrige otro concepto y toma su efecto. */
export type EfectoEnNeto = "suma" | "resta" | "ninguno" | "del_concepto_ajustado";
export type EfectoEnBase = "suma" | "resta" | "no_afecta" | "del_concepto_ajustado";

export interface EfectosEnBases {
  pensionaria: EfectoEnBase;
  essalud: EfectoEnBase;
  quinta: EfectoEnBase;
}

/** De dónde nace la línea: se calcula de asistencia y reglas, la carga Finanzas en una fuente externa, o corrige otra línea. */
export type OrigenDeConcepto = "calculado" | "fuente_externa" | "ajuste";

export interface ConceptoDePreliquidacion {
  codigo: string;
  nombre: string;
  /** `del_concepto_ajustado`: solo el ajuste de preliquidación, que toma el tipo del concepto que corrige. */
  tipo: TipoDeConcepto | "del_concepto_ajustado";
  efectoEnNeto: EfectoEnNeto;
  bases: EfectosEnBases;
  /** Código de la Tabla 22 de SUNAT; null en el ajuste, que usa el del concepto que corrige. */
  codigoPlame: string | null;
  origen: OrigenDeConcepto;
}

/** Un concepto con tipo propio, es decir, todos menos el ajuste. */
export type ConceptoConTipo = ConceptoDePreliquidacion & { tipo: TipoDeConcepto };

export function tieneTipoPropio(concepto: ConceptoDePreliquidacion): concepto is ConceptoConTipo {
  return concepto.tipo !== "del_concepto_ajustado";
}

export function efectoDelTipoEnNeto(tipo: TipoDeConcepto): Exclude<EfectoEnNeto, "del_concepto_ajustado"> {
  switch (tipo) {
    case "ingreso_remunerativo":
    case "ingreso_no_remunerativo": return "suma";
    case "reduccion":
    case "deduccion_del_trabajador": return "resta";
    case "aporte_patronal": return "ninguno";
  }
}

const TODAS_SUMAN: EfectosEnBases = { pensionaria: "suma", essalud: "suma", quinta: "suma" };
const TODAS_RESTAN: EfectosEnBases = { pensionaria: "resta", essalud: "resta", quinta: "resta" };
const NINGUNA: EfectosEnBases = { pensionaria: "no_afecta", essalud: "no_afecta", quinta: "no_afecta" };
const SOLO_QUINTA: EfectosEnBases = { pensionaria: "no_afecta", essalud: "no_afecta", quinta: "suma" };
const DEL_AJUSTADO: EfectosEnBases = { pensionaria: "del_concepto_ajustado", essalud: "del_concepto_ajustado", quinta: "del_concepto_ajustado" };

function concepto(codigo: string, nombre: string, tipo: TipoDeConcepto, codigoPlame: string, origen: OrigenDeConcepto, bases: EfectosEnBases): ConceptoDePreliquidacion {
  return { codigo, nombre, tipo, efectoEnNeto: efectoDelTipoEnNeto(tipo), bases, codigoPlame, origen };
}

export const CONCEPTOS: readonly ConceptoDePreliquidacion[] = [
  // Ingresos remunerativos
  concepto("sueldo_basico", "Sueldo básico", "ingreso_remunerativo", "0121", "calculado", TODAS_SUMAN),
  concepto("remuneracion_vacacional", "Remuneración vacacional", "ingreso_remunerativo", "0118", "calculado", TODAS_SUMAN),
  concepto("asignacion_familiar", "Asignación familiar", "ingreso_remunerativo", "0201", "calculado", TODAS_SUMAN),
  concepto("horas_extra_25", "Hora extra 25 %", "ingreso_remunerativo", "0105", "calculado", TODAS_SUMAN),
  concepto("horas_extra_35", "Hora extra 35 %", "ingreso_remunerativo", "0106", "calculado", TODAS_SUMAN),
  concepto("trabajo_en_descanso_o_feriado", "Trabajo en descanso o feriado sin sustitución", "ingreso_remunerativo", "0107", "calculado", TODAS_SUMAN),
  concepto("comision_de_ventas", "Comisión de ventas", "ingreso_remunerativo", "0103", "fuente_externa", TODAS_SUMAN),
  // Ingresos no remunerativos
  concepto("movilidad_supeditada_a_asistencia", "Movilidad supeditada a asistencia", "ingreso_no_remunerativo", "0909", "fuente_externa", SOLO_QUINTA),
  concepto("gratificacion_legal", "Gratificación legal", "ingreso_no_remunerativo", "0401", "fuente_externa", SOLO_QUINTA),
  concepto("bonificacion_extraordinaria", "Bonificación extraordinaria", "ingreso_no_remunerativo", "0312", "fuente_externa", SOLO_QUINTA),
  // Reducciones de remuneración devengada
  concepto("reduccion_por_falta", "Reducción por falta", "reduccion", "0705", "calculado", TODAS_RESTAN),
  concepto("reduccion_por_descanso_semanal", "Reducción por descanso semanal", "reduccion", "0705", "calculado", TODAS_RESTAN),
  concepto("reduccion_por_tardanza", "Tardanza real", "reduccion", "0704", "calculado", TODAS_RESTAN),
  concepto("reduccion_por_ausencia_sin_goce", "Ausencia sin goce", "reduccion", "0705", "calculado", TODAS_RESTAN),
  // Deducciones del trabajador
  concepto("aporte_onp", "Aporte ONP", "deduccion_del_trabajador", "0607", "calculado", NINGUNA),
  concepto("aporte_obligatorio_afp", "Aporte obligatorio al fondo AFP", "deduccion_del_trabajador", "0608", "calculado", NINGUNA),
  concepto("prima_de_seguro_afp", "Prima de seguro AFP", "deduccion_del_trabajador", "0606", "calculado", NINGUNA),
  concepto("comision_afp", "Comisión AFP", "deduccion_del_trabajador", "0601", "calculado", NINGUNA),
  concepto("retencion_de_quinta", "Retención de quinta categoría (externa)", "deduccion_del_trabajador", "0605", "fuente_externa", NINGUNA),
  concepto("descuento_autorizado_por_incidencia", "Descuento autorizado por incidencia", "deduccion_del_trabajador", "0706", "fuente_externa", NINGUNA),
  concepto("adelanto", "Adelanto", "deduccion_del_trabajador", "0701", "fuente_externa", NINGUNA),
  concepto("cuota_de_prestamo", "Cuota de préstamo", "deduccion_del_trabajador", "0706", "fuente_externa", NINGUNA),
  // Ajuste: corrige otro concepto y toma su efecto en el neto y en las bases; lo registra el flujo de ajustes de preliquidación.
  {
    codigo: "ajuste_de_preliquidacion", nombre: "Ajuste de preliquidación", tipo: "del_concepto_ajustado", efectoEnNeto: "del_concepto_ajustado",
    bases: DEL_AJUSTADO, codigoPlame: null, origen: "ajuste",
  },
  // Aportes del empleador
  concepto("essalud_patronal", "EsSalud patronal", "aporte_patronal", "0804", "calculado", NINGUNA),
];

export function buscarConcepto(codigo: string): ConceptoDePreliquidacion | undefined {
  return CONCEPTOS.find((candidato) => candidato.codigo === codigo);
}
