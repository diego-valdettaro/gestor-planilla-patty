import { buscarConcepto, efectosDeAjuste, type EfectoEnBase, type EfectosEnBases } from "@/conceptos-de-preliquidacion/catalogo";
import { claveDeImporte } from "@/fuentes-externas/duplicados";
import type { ImporteExterno } from "@/fuentes-externas/gestionar-fuentes-externas";
import type { Corte } from "@/periodos/hechos-para-pagos";

/** Las seis fuentes que llegan al neto en #127. Retención de quinta, gratificación y bonificación, y abonos vacacionales exigen confirmación pero no entran. */
export const CONCEPTOS_EN_EL_NETO = ["comision_de_ventas", "movilidad_supeditada_a_asistencia", "adelanto", "cuota_de_prestamo", "descuento_autorizado_por_incidencia", "ajuste_de_preliquidacion"] as const;
export type ConceptoExterno = (typeof CONCEPTOS_EN_EL_NETO)[number];

const esDelNeto = (codigo: string): codigo is ConceptoExterno => (CONCEPTOS_EN_EL_NETO as readonly string[]).includes(codigo);

/** Línea que nace de un importe de fuente externa confirmada (#127). El importe es positivo; el efecto en el neto lo da el catálogo. */
export interface LineaDeFuenteExterna {
  concepto: ConceptoExterno;
  dias?: never;
  importeCentimos: number;
  efectoEnNeto: "suma" | "resta";
  efectosEnBases: EfectosEnBases;
  origen: "Fuente externa";
  procedencia: string;
  fechaDelHecho: string;
  mesDeDevengue: string;
  mesDePago: string;
  corte: Corte;
}

const haciaBase = (efecto: EfectoEnBase | "ninguno"): EfectoEnBase => (efecto === "ninguno" ? "no_afecta" : efecto);

export function lineasDeFuentesExternas(importes: ImporteExterno[], dni: string, mesDePago: string, corte: Corte): LineaDeFuenteExterna[] {
  // Solo importes vigentes (no anulados) cuyo mes de aplicación es el mes de pago; el duplicado exacto cuenta una vez.
  const vistas = new Set<string>();
  const vigentes = importes.filter((importe) => {
    if (importe.dni !== dni || importe.anuladoEn !== null || importe.mesDeAplicacion !== mesDePago) return false;
    const clave = `${claveDeImporte(importe)}|${importe.conceptoAjustado ?? ""}|${importe.sentidoAjuste ?? ""}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
  return vigentes.flatMap((importe) => {
    // Solo «descuento autorizado» llega al neto; en investigación o sin sustento queda fuera.
    if (importe.tipoDeFuente === "incidencias_de_tienda" && importe.estadoDeIncidencia !== "descuento_autorizado") return [];
    const concepto = buscarConcepto(importe.concepto);
    if (!concepto || !esDelNeto(concepto.codigo)) return [];
    // Un ajuste que corrige una fuente fuera del neto tampoco entra.
    if (importe.conceptoAjustado && !esDelNeto(importe.conceptoAjustado)) return [];
    // Un ajuste toma el efecto del concepto que corrige (invertido si resta).
    const efectos = importe.conceptoAjustado && importe.sentidoAjuste
      ? efectosDeAjuste(importe.conceptoAjustado, importe.sentidoAjuste)
      : { efectoEnNeto: concepto.efectoEnNeto, bases: concepto.bases };
    if (efectos.efectoEnNeto !== "suma" && efectos.efectoEnNeto !== "resta") return [];
    return [{ concepto: concepto.codigo, importeCentimos: importe.monto, efectoEnNeto: efectos.efectoEnNeto, efectosEnBases: { pensionaria: haciaBase(efectos.bases.pensionaria), essalud: haciaBase(efectos.bases.essalud), quinta: haciaBase(efectos.bases.quinta) }, origen: "Fuente externa" as const,
      procedencia: importe.procedencia, fechaDelHecho: importe.fechaDelHecho, mesDeDevengue: importe.mesDeDevengue, mesDePago, corte }];
  });
}

/** Sueldo, remuneración vacacional y su ajuste ya cuentan en el sueldo calculado: no se suman otra vez. */
const YA_EN_EL_SUELDO = new Set(["sueldo_basico", "remuneracion_vacacional", "ajuste_por_variacion_de_sueldo_en_vacaciones"]);

/**
 * Neto = sueldo calculado + todas las demás líneas con el efecto que fija el catálogo (suma o resta). Los aportes del
 * trabajador no existen todavía como líneas (#126), así que el neto es «antes de aportes».
 */
export function netoDe(lineas: Array<{ concepto: string; importeCentimos: number; efectoEnNeto?: string }>, sueldo: number): number {
  return lineas.reduce((neto, linea) => {
    if (YA_EN_EL_SUELDO.has(linea.concepto)) return neto;
    const efecto = linea.efectoEnNeto ?? buscarConcepto(linea.concepto)?.efectoEnNeto;
    return efecto === "suma" ? neto + linea.importeCentimos : efecto === "resta" ? neto - linea.importeCentimos : neto;
  }, sueldo);
}

/** Soles con signo (U+2212) y céntimos exactos; `formatearSoles` no sirve con negativos con céntimos. */
export function formatearSolesConSigno(centimos: number): string {
  const absoluto = Math.abs(centimos);
  const enteros = Math.floor(absoluto / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${centimos < 0 ? "S/ −" : "S/ "}${enteros},${String(absoluto % 100).padStart(2, "0")}`;
}

export function bloqueoPorNetoNegativo(netoCentimos: number): string {
  return `Neto negativo: ${formatearSolesConSigno(netoCentimos)}. Revise deducciones y adelantos, o registre un ajuste de preliquidación. No se arrastra al mes siguiente.`;
}

export interface TotalDeSede {
  sede: string;
  personas: number;
  calculadas: number;
  /** Suma solo los netos de las personas calculadas. */
  netoCentimos: number;
}

/** Imputación por sede de adscripción: reutiliza el valor de la condición laboral; sin dato, «Sede pendiente». */
export function totalesPorSede(personas: Array<{ sedeDeAdscripcion: string | null; netoCentimos: number | null }>): TotalDeSede[] {
  const sedes = new Map<string, TotalDeSede>();
  for (const { sedeDeAdscripcion, netoCentimos } of personas) {
    const sede = sedeDeAdscripcion ?? "Sede pendiente";
    const total = sedes.get(sede) ?? { sede, personas: 0, calculadas: 0, netoCentimos: 0 };
    total.personas += 1;
    if (netoCentimos !== null) { total.calculadas += 1; total.netoCentimos += netoCentimos; }
    sedes.set(sede, total);
  }
  return [...sedes.values()].sort((a, b) => a.sede.localeCompare(b.sede));
}

/** Rótulo obligatorio del neto mientras #126 (aportes del trabajador) no esté fusionado. */
export const ROTULO_DEL_NETO = "Neto antes de aportes del trabajador";

export function estadoDeLaPersona({ netoCentimos, bloqueos }: { netoCentimos: number | null; bloqueos: string[] }): "Calculada" | "Bloqueada" | "Pendiente" {
  return netoCentimos !== null ? "Calculada" : bloqueos.length ? "Bloqueada" : "Pendiente";
}
