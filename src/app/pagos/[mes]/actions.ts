"use server";

import { revalidatePath } from "next/cache";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { MENSAJES_PARA_FINANZAS, MENSAJE_DE_ERROR_AL_GUARDAR, evaluarFinalizacion, finalizarMes, type HuellaDeRevision, type ResultadoDeEvaluacion, type ResultadoDeFinalizacion, type ResumenDeCambio } from "@/pagos/finalizar-mes";
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

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`Falta ${campo}.`);
  return valor.trim();
}
