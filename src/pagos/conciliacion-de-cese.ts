import type { ImporteExterno } from "@/fuentes-externas/gestionar-fuentes-externas";
import { buscarTipoDeFuente } from "@/fuentes-externas/tipos-de-fuente";
import type { RelacionConPersona } from "@/relaciones-laborales/gestionar-relaciones-laborales";

import type { LineaDeBorrador } from "./calcular-borrador";

// Reglas puras de la conciliación de la liquidación por cese (#128, ADR 0009). Los importes los carga Finanzas y no se calculan aquí:
// no entran al neto ni a las bases; estas reglas solo detectan el cese sin conciliar y la duplicación con lo que el pago mensual ya incluye.

const TIPO_DE_CONCILIACION = "conciliacion_de_liquidacion_por_cese";
const CONCEPTO_DE_ABONO = "abono_de_liquidacion";

/** Totales aparte de la conciliación: los conceptos de la liquidación y los abonos ya pagados fuera, sin netearlos entre sí. */
export interface TotalesDeConciliacion {
  conceptosCentimos: number;
  abonosCentimos: number;
}

export function esConceptoDeConciliacion(codigo: string): boolean {
  return buscarTipoDeFuente(TIPO_DE_CONCILIACION)?.conceptos.includes(codigo) ?? false;
}

const BLOQUEO_DE_CESE = " no tiene su liquidación conciliada.";

/** Texto del diseño 5.1/5.2; el mes y la persona muestran la misma causa. */
export function bloqueoPorCeseSinConciliar(nombre: string): string {
  return `El cese de ${nombre}${BLOQUEO_DE_CESE}`;
}

export function esBloqueoPorCeseSinConciliar(bloqueo: string): boolean {
  return bloqueo.startsWith("El cese de ") && bloqueo.endsWith(BLOQUEO_DE_CESE);
}

/** Totales de los importes vigentes de la persona (ya sin anulados ni duplicados exactos). */
export function totalesDeConciliacion(vigentes: ImporteExterno[]): TotalesDeConciliacion {
  const totales = { conceptosCentimos: 0, abonosCentimos: 0 };
  for (const importe of vigentes.filter(({ concepto }) => esConceptoDeConciliacion(concepto))) {
    if (importe.concepto === CONCEPTO_DE_ABONO) totales.abonosCentimos += importe.monto;
    else totales.conceptosCentimos += importe.monto;
  }
  return totales;
}

/**
 * Cese confirmado dentro del mes de pago (mes calendario) sin conciliar: el tipo no está confirmado o la persona no tiene
 * ninguna fila vigente. Un cese sin confirmar o de otro mes no bloquea.
 */
export function bloqueoDeCese(relacion: RelacionConPersona, mesDePago: string, vigentes: ImporteExterno[], conciliacionConfirmada: boolean): string | null {
  if (!relacion.ceseConfirmado || relacion.cese?.slice(0, 7) !== mesDePago) return null;
  const hayFilas = vigentes.some(({ concepto }) => esConceptoDeConciliacion(concepto));
  return conciliacionConfirmada && hayFilas ? null : bloqueoPorCeseSinConciliar(relacion.nombre);
}

/**
 * Un concepto de la liquidación equivalente a uno que el pago mensual ya incluye o a un importe ya cargado, con el mismo mes de
 * devengue, bloquea a la persona para corregir la fuente. Vacaciones truncas ↔ remuneración vacacional (línea del borrador);
 * gratificación trunca ↔ gratificación legal (fuente cargada).
 */
export function bloqueosPorDuplicacion(vigentes: ImporteExterno[], lineas: LineaDeBorrador[]): string[] {
  const avisos = new Set<string>();
  for (const importe of vigentes) {
    if (importe.concepto === "vacaciones_truncas" && lineas.some((linea) => linea.concepto === "remuneracion_vacacional" && linea.mesDeDevengue === importe.mesDeDevengue)) {
      avisos.add("Duplicación: vacaciones truncas ya incluidas en el pago mensual.");
    }
    if (importe.concepto === "gratificacion_trunca" && vigentes.some((otro) => otro.concepto === "gratificacion_legal" && otro.mesDeDevengue === importe.mesDeDevengue)) {
      avisos.add("Duplicación: gratificación trunca ya cargada como gratificación legal del mismo devengue.");
    }
  }
  return [...avisos];
}
