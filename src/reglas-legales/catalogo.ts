// Catálogo de las reglas legales con vigencia (ADR 0008): tasas, topes, RMV y demás valores que Finanzas activa con
// fecha de vigencia y fuente oficial. Aquí solo viven el código, el nombre y la unidad de cada valor legal; los
// valores nunca se escriben en el código. Agregar un valor legal es agregar una entrada: no exige migración.

import { AFILIACIONES, NOMBRE_DE_AFILIACION, type Afiliacion } from "@/condiciones-laborales/catalogo";

export type UnidadDeRegla = "porcentaje" | "importe";

type AfpAfiliada = Exclude<Afiliacion, "onp">;
type CodigoDeComision = `${AfpAfiliada}_comision_${"flujo" | "mixta"}`;

export type CodigoDeReglaLegal =
  | "rmv"
  | "essalud_tasa"
  | "essalud_base_minima"
  | "onp_tasa"
  | "afp_aporte_obligatorio"
  | "afp_prima_seguro"
  | "afp_remuneracion_maxima_asegurable"
  | "asignacion_familiar_porcentaje_de_rmv"
  | "horas_extra_sobretasa_primeras_dos_horas"
  | "horas_extra_sobretasa_horas_posteriores"
  | CodigoDeComision;

export interface DefinicionDeReglaLegal {
  codigo: CodigoDeReglaLegal;
  nombre: string;
  unidad: UnidadDeRegla;
  /** Los textos del diseño (6.7) dicen «la Tasa de EsSalud»; solo el aporte al fondo es masculino. */
  masculino?: true;
}

/** «la Tasa de EsSalud», «el Aporte obligatorio al fondo AFP». */
export function conArticulo(definicion: Pick<DefinicionDeReglaLegal, "nombre" | "masculino">): string {
  return `${definicion.masculino ? "el" : "la"} ${definicion.nombre}`;
}

const AFPS = AFILIACIONES.filter((afiliacion): afiliacion is AfpAfiliada => afiliacion !== "onp");

const COMISIONES_DE_AFP: DefinicionDeReglaLegal[] = AFPS.flatMap((afp) => [
  { codigo: `${afp}_comision_flujo` as const, nombre: `Comisión ${NOMBRE_DE_AFILIACION[afp]} sobre flujo`, unidad: "porcentaje" as const },
  { codigo: `${afp}_comision_mixta` as const, nombre: `Comisión ${NOMBRE_DE_AFILIACION[afp]} mixta`, unidad: "porcentaje" as const },
]);

export const REGLAS_LEGALES: readonly DefinicionDeReglaLegal[] = [
  { codigo: "rmv", nombre: "RMV (remuneración mínima vital)", unidad: "importe" },
  { codigo: "asignacion_familiar_porcentaje_de_rmv", nombre: "Asignación familiar (% de la RMV)", unidad: "porcentaje" },
  { codigo: "essalud_tasa", nombre: "Tasa de EsSalud", unidad: "porcentaje" },
  { codigo: "essalud_base_minima", nombre: "Base mínima de EsSalud", unidad: "importe" },
  { codigo: "onp_tasa", nombre: "Tasa de ONP", unidad: "porcentaje" },
  { codigo: "afp_aporte_obligatorio", nombre: "Aporte obligatorio al fondo AFP", unidad: "porcentaje", masculino: true },
  { codigo: "afp_prima_seguro", nombre: "Prima de seguro AFP", unidad: "porcentaje" },
  ...COMISIONES_DE_AFP,
  { codigo: "afp_remuneracion_maxima_asegurable", nombre: "Remuneración máxima asegurable AFP", unidad: "importe" },
  { codigo: "horas_extra_sobretasa_primeras_dos_horas", nombre: "Sobretasa de horas extra: primeras dos horas diarias", unidad: "porcentaje" },
  { codigo: "horas_extra_sobretasa_horas_posteriores", nombre: "Sobretasa de horas extra: horas posteriores", unidad: "porcentaje" },
];

export function buscarDefinicion(codigo: string): DefinicionDeReglaLegal | undefined {
  return REGLAS_LEGALES.find((definicion) => definicion.codigo === codigo);
}
