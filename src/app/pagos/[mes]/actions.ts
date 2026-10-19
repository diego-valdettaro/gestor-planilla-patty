"use server";

import { revalidatePath } from "next/cache";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { confirmarPago, MENSAJE_DE_ERROR_AL_CONFIRMAR, MENSAJE_DE_FECHA_FUTURA, MENSAJE_DE_FECHA_INVALIDA, MENSAJE_DE_VERSION_OBSOLETA, MENSAJE_SIN_VERSION_FINALIZADA } from "@/pagos/confirmar-pago";
import { MENSAJE_DE_MES_YA_CONFIRMADO, MENSAJE_DE_PERIODO_FUENTE_REABIERTO } from "@/pagos/constancias-de-pago";
import { MENSAJES_PARA_FINANZAS, MENSAJE_DE_ERROR_AL_GUARDAR, MENSAJE_SIN_PERMISO, evaluarFinalizacion, finalizarMes, type HuellaDeRevision, type ResultadoDeEvaluacion, type ResultadoDeFinalizacion, type ResumenDeCambio } from "@/pagos/finalizar-mes";
import { dependenciasDeFinalizacion } from "@/pagos/servicio";

export interface EstadoDeFinalizacion {
  error?: string;
  listo?: number;
  version?: number;
  mensaje?: string;
  cambio?: ResumenDeCambio;
  bloqueado?: string[];
}

export async function finalizarMesDesdeFormulario(estadoAnterior: EstadoDeFinalizacion, formData: FormData): Promise<EstadoDeFinalizacion> {
  try {
    const actor = await obtenerActorActual().catch(() => undefined);
    const mes = texto(formData, "mes");
    const huella = JSON.parse(texto(formData, "huella")) as HuellaDeRevision;
    const resultado = await finalizarMes(dependenciasDeFinalizacion, actor, { mes, huella });
    if (resultado.estado === "cambio") return { cambio: resultado.resumen };
    if (resultado.estado !== "finalizada") return estadoDeImpedimento(resultado, mes);
    revalidatePath(`/pagos/${mes}`);
    return { listo: (estadoAnterior.listo ?? 0) + 1, version: resultado.version.numero, mensaje: `Versión ${resultado.version.numero} guardada. Ya no se puede editar.` };
  } catch (causa) {
    return { error: mensajeParaFinanzas(causa) };
  }
}

export interface EstadoDeConfirmacionDePago {
  error?: string;
  listo?: number;
  mensaje?: string;
}

/** Finanzas confirma que pagó la versión que vio en el diálogo (§6.2); la constancia se refleja en el mes y en /periodos, donde sus períodos fuente dejan de poder reabrirse (D10). */
export async function confirmarPagoDesdeFormulario(estadoAnterior: EstadoDeConfirmacionDePago, formData: FormData): Promise<EstadoDeConfirmacionDePago> {
  try {
    const actor = await obtenerActorActual().catch(() => undefined);
    const mes = texto(formData, "mes");
    const numeroDeVersion = Number(texto(formData, "version"));
    if (!Number.isInteger(numeroDeVersion)) throw new Error("La versión del formulario no es un número.");
    await confirmarPago(dependenciasDeFinalizacion, actor, { mes, numeroDeVersion, fechaDelPago: fechaDelFormulario(formData) });
    revalidatePath(`/pagos/${mes}`);
    revalidatePath("/periodos");
    return { listo: (estadoAnterior.listo ?? 0) + 1, mensaje: "Pago realizado confirmado." };
  } catch (causa) {
    // Lo que no es un rechazo del dominio es un detalle técnico que la pantalla no debe filtrar.
    return { error: causa instanceof Error && MENSAJES_DE_CONFIRMACION.includes(causa.message) ? causa.message : MENSAJE_DE_ERROR_AL_CONFIRMAR };
  }
}

/** Los rechazos del dominio que Finanzas debe leer tal cual al confirmar el pago. */
const MENSAJES_DE_CONFIRMACION: readonly string[] = [
  MENSAJE_SIN_PERMISO, MENSAJE_DE_FECHA_FUTURA, MENSAJE_DE_FECHA_INVALIDA, MENSAJE_DE_MES_YA_CONFIRMADO, MENSAJE_SIN_VERSION_FINALIZADA, MENSAJE_DE_VERSION_OBSOLETA, MENSAJE_DE_PERIODO_FUENTE_REABIERTO,
];

/** Antes de abrir el diálogo: si ya hay bloqueos nuevos no se abre y la pantalla se actualiza para mostrarlos (interacción §6.1.c). */
export async function verificarFinalizacionDesdeFormulario(estadoAnterior: EstadoDeFinalizacion, formData: FormData): Promise<EstadoDeFinalizacion> {
  try {
    const actor = await obtenerActorActual().catch(() => undefined);
    const mes = texto(formData, "mes");
    const resultado = await evaluarFinalizacion(dependenciasDeFinalizacion, actor, { mes });
    if (resultado.estado === "lista") return { listo: (estadoAnterior.listo ?? 0) + 1 };
    return estadoDeImpedimento(resultado, mes);
  } catch (causa) {
    return { error: mensajeParaFinanzas(causa) };
  }
}

/** Lo que impide finalizar vuelve como estado y la página del mes se refresca para mostrarlo. */
function estadoDeImpedimento(resultado: Exclude<ResultadoDeEvaluacion, { estado: "lista" }> | Extract<ResultadoDeFinalizacion, { estado: "bloqueado" | "sin_personas" }>, mes: string): EstadoDeFinalizacion {
  if (resultado.estado === "sin_personas") return { error: resultado.mensaje };
  revalidatePath(`/pagos/${mes}`);
  return { bloqueado: [...resultado.bloqueos.delMes, ...resultado.bloqueos.porPersona.flatMap(({ bloqueos }) => bloqueos)] };
}

/** El mensaje de un error pensado para Finanzas; el resto se reemplaza para no filtrar detalles técnicos. */
function mensajeParaFinanzas(causa: unknown): string {
  return causa instanceof Error && MENSAJES_PARA_FINANZAS.includes(causa.message) ? causa.message : MENSAJE_DE_ERROR_AL_GUARDAR;
}

/** Una fecha ausente o vacía llega al caso de uso como texto vacío: allí es una fecha inválida y Finanzas lee su mensaje (QA-F01). */
function fechaDelFormulario(formData: FormData): string {
  const valor = formData.get("fecha");
  return typeof valor === "string" ? valor.trim() : "";
}

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`Falta ${campo}.`);
  return valor.trim();
}
