import { MENSAJE_SIN_VERSION_FINALIZADA } from "@/pagos/confirmar-pago";
import { MENSAJE_DE_PAGO_CONFIRMADO } from "@/pagos/finalizar-mes";

// Qué muestra la cabecera de /pagos/[mes] según el estado del mes (interacción §3, §4.2, §4.6, ADR 0013, D19): una sola decisión fija
// la insignia, la acción principal y la causa que la acompaña, para que ninguna combinación quede sin resolver.
export interface EntradaDelEstadoDelMes {
  personas: number;
  /** Bloqueos del mes más personas bloqueadas: el mismo N del título del panel «Bloqueos del mes (N)». */
  bloqueos: number;
  /** Número de la versión finalizada más reciente; undefined mientras el mes sea un borrador. */
  ultimaVersion?: number;
  pagoConfirmado: boolean;
}

export type AccionPrincipalDelMes =
  | { tipo: "ninguna"; explicacion: string }
  /** Sin versión: «Finalizar mes» y, junto a él, por qué todavía no hay nada que confirmar. */
  | { tipo: "finalizar"; etiqueta: string; causaDeshabilitado?: string; nota: string }
  /** Con versión y sin pago (§4.2, §4.7): la confirmación no depende de los bloqueos del borrador, que solo afectan a la nueva versión. */
  | { tipo: "confirmar_pago"; etiqueta: string };

/** Acción secundaria del mismo contexto (§6.1, D19): antes del pago puede crearse otra versión. */
export interface OtraVersionDelMes {
  etiqueta: string;
  causaDeshabilitado?: string;
}

export interface EstadoDelMes {
  insignia: { texto: string; clase: "advertencia" | "ok" };
  accion: AccionPrincipalDelMes;
  otraVersion?: OtraVersionDelMes;
}

export function estadoDelMes({ personas, bloqueos, ultimaVersion, pagoConfirmado }: EntradaDelEstadoDelMes): EstadoDelMes {
  if (pagoConfirmado) return { insignia: { texto: "Pago realizado confirmado", clase: "ok" }, accion: { tipo: "ninguna", explicacion: MENSAJE_DE_PAGO_CONFIRMADO } };
  const causaDeshabilitado = personas === 0 ? "Este mes no incluye personas"
    : bloqueos > 0 ? (bloqueos === 1 ? "Resuelva el bloqueo para finalizar" : `Resuelva los ${bloqueos} bloqueos para finalizar`) : undefined;
  if (ultimaVersion === undefined) {
    return { insignia: { texto: "Borrador", clase: "advertencia" }, accion: { tipo: "finalizar", etiqueta: "Finalizar mes", causaDeshabilitado, nota: MENSAJE_SIN_VERSION_FINALIZADA } };
  }
  return { insignia: { texto: `Finalizada, versión ${ultimaVersion}`, clase: "ok" }, accion: { tipo: "confirmar_pago", etiqueta: "Confirmar pago realizado" }, otraVersion: { etiqueta: "Crear otra versión", causaDeshabilitado } };
}
