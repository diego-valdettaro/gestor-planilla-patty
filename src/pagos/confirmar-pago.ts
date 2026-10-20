import type { Actor } from "@/autenticacion/permisos";
import { fechaDeHoyEnLima } from "@/condiciones-laborales/vigencia";
import { validarFechaDeRelacion } from "@/relaciones-laborales/gestionar-relaciones-laborales";

import { ErrorDeMesYaConfirmado, type ConstanciaDePago } from "./constancias-de-pago";
import { exigirFinanzas, type DependenciasDeFinalizacion } from "./finalizar-mes";

// Confirmar el pago realizado del mes (#130, ADR 0013): Finanzas registra, una sola vez por mes, que pagó la versión finalizada vigente.

export type DependenciasDeConfirmacion = Pick<DependenciasDeFinalizacion, "versiones" | "pago" | "ahora">;

export const MENSAJE_DE_FECHA_FUTURA = "La fecha del pago no puede ser futura.";
export const MENSAJE_SIN_VERSION_FINALIZADA = "Finalice el mes para poder confirmar el pago";
/** Lo único que Finanzas lee cuando falla por un motivo técnico (§4.7 «Error»). */
export const MENSAJE_DE_ERROR_AL_CONFIRMAR = "No se registró el pago";
export const MENSAJE_DE_VERSION_OBSOLETA = "La versión mostrada ya no es la vigente; revise y vuelva a confirmar.";
export const MENSAJE_DE_FECHA_INVALIDA = "Indique una fecha de pago válida.";

/** La fecha es un día real del calendario (AAAA-MM-DD) y no es posterior a hoy en Lima. */
function validarFechaDelPago(fechaDelPago: string, ahora: Date): void {
  try {
    validarFechaDeRelacion(fechaDelPago, "pago");
  } catch {
    throw new Error(MENSAJE_DE_FECHA_INVALIDA);
  }
  if (fechaDelPago > fechaDeHoyEnLima(ahora)) throw new Error(MENSAJE_DE_FECHA_FUTURA);
}

export async function confirmarPago(
  dependencias: DependenciasDeConfirmacion,
  actor: Actor | undefined,
  solicitud: { mes: string; /** La versión que Finanzas vio en el diálogo. */ numeroDeVersion: number; fechaDelPago: string },
): Promise<ConstanciaDePago> {
  exigirFinanzas(actor);
  validarFechaDelPago(solicitud.fechaDelPago, dependencias.ahora());
  if (await dependencias.pago.mesConPagoConfirmado(solicitud.mes)) throw new ErrorDeMesYaConfirmado();
  const versiones = await dependencias.versiones.listarVersiones(solicitud.mes);
  if (versiones.length === 0) throw new Error(MENSAJE_SIN_VERSION_FINALIZADA);
  const vigente = Math.max(...versiones.map(({ numero }) => numero));
  if (solicitud.numeroDeVersion !== vigente) throw new Error(MENSAJE_DE_VERSION_OBSOLETA);
  return dependencias.pago.confirmar({
    mesDePago: solicitud.mes, numeroDeVersion: vigente, fechaDelPago: solicitud.fechaDelPago, confirmadaPorId: actor.id, confirmadaEn: dependencias.ahora(),
  });
}

export async function consultarConstancia(dependencias: DependenciasDeConfirmacion, actor: Actor | undefined, mes: string): Promise<ConstanciaDePago | undefined> {
  exigirFinanzas(actor);
  return dependencias.pago.buscar(mes);
}
