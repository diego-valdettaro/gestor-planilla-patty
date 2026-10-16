import { buscarConcepto, efectosDeAjuste, type EfectoEnBase, type EfectosEnBases } from "@/conceptos-de-preliquidacion/catalogo";
import { claveDeImporte } from "@/fuentes-externas/duplicados";
import type { ImporteExterno } from "@/fuentes-externas/gestionar-fuentes-externas";
import type { Corte } from "@/periodos/hechos-para-pagos";

/** Las seis fuentes que llegan al neto en #127. Retención de quinta, gratificación y bonificación, y abonos vacacionales exigen confirmación pero no entran. */
export const CONCEPTOS_EN_EL_NETO = ["comision_de_ventas", "movilidad_supeditada_a_asistencia", "adelanto", "cuota_de_prestamo", "descuento_autorizado_por_incidencia", "ajuste_de_preliquidacion"] as const;
export type ConceptoExterno = (typeof CONCEPTOS_EN_EL_NETO)[number];

const FUENTES_FUERA_DEL_NETO: readonly string[] = ["retencion_de_quinta", "gratificacion_legal", "bonificacion_extraordinaria", "abono_anticipado_de_remuneracion_vacacional"];
const APORTES_DEL_TRABAJADOR = new Set(["aporte_onp", "aporte_obligatorio_afp", "prima_de_seguro_afp", "comision_afp"]);

const esDelNeto = (codigo: string): codigo is ConceptoExterno => (CONCEPTOS_EN_EL_NETO as readonly string[]).includes(codigo);

/** Línea que nace de un importe de fuente externa (#127), cuya confirmación se consulta por tipo y mes. El importe es positivo; el efecto en el neto lo da el catálogo. */
export interface LineaDeFuenteExterna {
  concepto: ConceptoExterno;
  tipoDeFuente: ImporteExterno["tipoDeFuente"];
  conceptoAjustado?: string;
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

/** Selección común para líneas y bases: misma población, vigencia y clave de duplicado. */
export function importesVigentesDePersona(importes: ImporteExterno[], dni: string, mesDePago: string): ImporteExterno[] {
  // Solo importes vigentes (no anulados) cuyo mes de aplicación es el mes de pago; el duplicado exacto cuenta una vez.
  const vistas = new Set<string>();
  return importes.filter((importe) => {
    if (importe.dni !== dni || importe.anuladoEn !== null || importe.mesDeAplicacion !== mesDePago) return false;
    if (importe.tipoDeFuente === "incidencias_de_tienda" && importe.estadoDeIncidencia !== "descuento_autorizado") return false;
    const clave = `${claveDeImporte(importe)}|${importe.conceptoAjustado ?? ""}|${importe.sentidoAjuste ?? ""}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}

export function lineasDeFuentesExternas(importes: ImporteExterno[], dni: string, mesDePago: string, corte: Corte): LineaDeFuenteExterna[] {
  return importesVigentesDePersona(importes, dni, mesDePago).flatMap((importe) => {
    const concepto = buscarConcepto(importe.concepto);
    if (!concepto || !esDelNeto(concepto.codigo)) return [];
    // Un ajuste sobre una de las cuatro fuentes fuera del neto (B1) tampoco entra; sobre un concepto calculado sí.
    if (importe.conceptoAjustado && FUENTES_FUERA_DEL_NETO.includes(importe.conceptoAjustado)) return [];
    // Un ajuste toma el efecto del concepto que corrige (invertido si resta).
    const efectos = importe.conceptoAjustado && importe.sentidoAjuste
      ? efectosDeAjuste(importe.conceptoAjustado, importe.sentidoAjuste)
      : { efectoEnNeto: concepto.efectoEnNeto, bases: concepto.bases };
    if (efectos.efectoEnNeto !== "suma" && efectos.efectoEnNeto !== "resta") return [];
    return [{ tipoDeFuente: importe.tipoDeFuente, concepto: concepto.codigo, ...(importe.conceptoAjustado ? { conceptoAjustado: importe.conceptoAjustado } : {}), importeCentimos: importe.monto, efectoEnNeto: efectos.efectoEnNeto, efectosEnBases: { pensionaria: haciaBase(efectos.bases.pensionaria), essalud: haciaBase(efectos.bases.essalud), quinta: haciaBase(efectos.bases.quinta) }, origen: "Fuente externa" as const,
      procedencia: importe.procedencia, fechaDelHecho: importe.fechaDelHecho, mesDeDevengue: importe.mesDeDevengue, mesDePago, corte }];
  });
}

/** Sueldo, remuneración vacacional y su ajuste ya cuentan en el sueldo calculado: no se suman otra vez. */
const YA_EN_EL_SUELDO = new Set(["sueldo_basico", "remuneracion_vacacional", "ajuste_por_variacion_de_sueldo_en_vacaciones"]);

/**
 * Subtotal antes de aportes: sueldo calculado y demás líneas con el efecto del catálogo.
 * Las líneas pensionarias de #126 y sus ajustes se conservan, pero no integran este subtotal (B3/C7).
 */
export function netoDe(lineas: Array<{ concepto: string; conceptoAjustado?: string; importeCentimos: number; efectoEnNeto?: string }>, sueldo: number): number {
  return lineas.reduce((neto, linea) => {
    if (YA_EN_EL_SUELDO.has(linea.concepto)) return neto;
    if (APORTES_DEL_TRABAJADOR.has(linea.concepto) || (linea.conceptoAjustado && APORTES_DEL_TRABAJADOR.has(linea.conceptoAjustado))) return neto;
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

/** Rótulo del subtotal de #127; no es el neto definitivo tras aportes. */
export const ROTULO_DEL_NETO = "Neto antes de aportes del trabajador";

export function estadoDeLaPersona({ netoCentimos, bloqueos }: { netoCentimos: number | null; bloqueos: string[] }): "Calculada" | "Bloqueada" | "Pendiente" {
  return netoCentimos !== null ? "Calculada" : bloqueos.length ? "Bloqueada" : "Pendiente";
}
