// Catálogo de las condiciones laborales con vigencia (ADR 0008). Agregar una AFP u otro valor de lista exige este
// catálogo, el enum de `condicionesLaborales` en `src/db/schema.ts` y una migración que amplíe su CHECK.

export const DATOS_LABORALES = [
  "sueldo",
  "jornada_ordinaria_diaria",
  "regimen_laboral",
  "afiliacion_pensionaria",
  "comision_afp",
  "elegibilidad_familiar",
  "sede_de_adscripcion",
] as const;

export type DatoLaboral = (typeof DATOS_LABORALES)[number];

export const NOMBRE_DE_DATO: Record<DatoLaboral, string> = {
  sueldo: "Sueldo",
  jornada_ordinaria_diaria: "Jornada ordinaria diaria",
  regimen_laboral: "Régimen laboral",
  afiliacion_pensionaria: "Afiliación pensionaria",
  comision_afp: "Esquema de comisión AFP",
  elegibilidad_familiar: "Elegibilidad familiar",
  sede_de_adscripcion: "Sede de adscripción",
};

export const REGIMENES = ["general", "remype_pequena_empresa"] as const;
export type Regimen = (typeof REGIMENES)[number];
export const NOMBRE_DE_REGIMEN: Record<Regimen, string> = {
  general: "General",
  remype_pequena_empresa: "REMYPE pequeña empresa",
};

export const AFILIACIONES = ["onp", "afp_habitat", "afp_integra", "afp_prima", "afp_profuturo"] as const;
export type Afiliacion = (typeof AFILIACIONES)[number];
export const NOMBRE_DE_AFILIACION: Record<Afiliacion, string> = {
  onp: "ONP",
  afp_habitat: "AFP Habitat",
  afp_integra: "AFP Integra",
  afp_prima: "AFP Prima",
  afp_profuturo: "AFP Profuturo",
};

export const ESQUEMAS_DE_COMISION = ["flujo", "mixta"] as const;
export type EsquemaDeComision = (typeof ESQUEMAS_DE_COMISION)[number];
export const NOMBRE_DE_ESQUEMA: Record<EsquemaDeComision, string> = { flujo: "Flujo", mixta: "Mixta" };

/** Valor de una condición: céntimos, minutos, texto del catálogo, booleano o nombre de sede según el dato. */
export type ValorLaboral = number | string | boolean;

export function esAfp(afiliacion: ValorLaboral | undefined): boolean {
  return typeof afiliacion === "string" && afiliacion !== "onp" && (AFILIACIONES as readonly string[]).includes(afiliacion);
}

/** «Régimen laboral» → «régimen laboral», para frases como «Falta: sueldo, régimen laboral». */
export function enMinuscula(texto: string): string {
  return texto.charAt(0).toLocaleLowerCase("es") + texto.slice(1);
}
