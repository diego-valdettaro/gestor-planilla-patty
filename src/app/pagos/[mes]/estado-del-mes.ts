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
  | { tipo: "finalizar" | "crear_otra_version"; etiqueta: string; causaDeshabilitado?: string };

export interface EstadoDelMes {
  insignia: { texto: string; clase: "advertencia" | "ok" };
  accion: AccionPrincipalDelMes;
}

export function estadoDelMes({ personas, bloqueos, ultimaVersion, pagoConfirmado }: EntradaDelEstadoDelMes): EstadoDelMes {
  if (pagoConfirmado) return { insignia: { texto: "Pago realizado confirmado", clase: "ok" }, accion: { tipo: "ninguna", explicacion: MENSAJE_DE_PAGO_CONFIRMADO } };
  const insignia = ultimaVersion === undefined ? { texto: "Borrador", clase: "advertencia" as const } : { texto: `Finalizada, versión ${ultimaVersion}`, clase: "ok" as const };
  const tipo = ultimaVersion === undefined ? "finalizar" : "crear_otra_version";
  const etiqueta = ultimaVersion === undefined ? "Finalizar mes" : "Crear otra versión";
  if (personas === 0) return { insignia, accion: { tipo, etiqueta, causaDeshabilitado: "Este mes no incluye personas" } };
  if (bloqueos > 0) return { insignia, accion: { tipo, etiqueta, causaDeshabilitado: bloqueos === 1 ? "Resuelva el bloqueo para finalizar" : `Resuelva los ${bloqueos} bloqueos para finalizar` } };
  return { insignia, accion: { tipo, etiqueta } };
}
