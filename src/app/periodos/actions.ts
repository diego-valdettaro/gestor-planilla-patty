"use server";
import { revalidatePath } from "next/cache";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDePeriodos } from "@/periodos/casos-de-uso-servidor";
import { HuecoEntrePeriodosError } from "@/periodos/periodo-planilla";
import { repositorioDePeriodos } from "@/periodos/servicio";
export async function cerrarPeriodoDesdeFormulario(formData: FormData): Promise<void> { const casos = crearCasosDeUsoDePeriodos(repositorioDePeriodos, { obtenerActorActual }); await casos.cerrar(obtenerTexto(formData, "periodoId")); revalidatePath("/periodos"); }
export async function reabrirPeriodoDesdeFormulario(formData: FormData): Promise<void> { const casos = crearCasosDeUsoDePeriodos(repositorioDePeriodos, { obtenerActorActual }); await casos.reabrir(obtenerTexto(formData, "periodoId"), obtenerTexto(formData, "motivo")); revalidatePath("/periodos"); }
export async function decidirHorasExtraDesdeFormulario(formData: FormData): Promise<void> {
  const decision = obtenerTexto(formData, "decision");
  if (decision !== "aprobada" && decision !== "descartada") throw new Error("La decisión de horas extra no es válida.");
  const horasExtraIds = formData.getAll("horaExtraId").filter((valor): valor is string => typeof valor === "string" && Boolean(valor.trim()));
  const casos = crearCasosDeUsoDePeriodos(repositorioDePeriodos, { obtenerActorActual });
  await casos.decidirHorasExtra({
    periodoId: obtenerTexto(formData, "periodoId"),
    horasExtraIds,
    decision,
    causa: formData.get("causa")?.toString(),
    motivo: formData.get("motivo")?.toString(),
  });
  revalidatePath("/periodos");
}

export interface EstadoDeAprobacionDeAsistencia { error?: string; listo?: boolean; }

/** El gerente (o el Administrador) aprueba la asistencia de un grupo; el error se muestra junto al botón en lugar de romper la página. */
export async function aprobarAsistenciaDesdeFormulario(_estadoAnterior: EstadoDeAprobacionDeAsistencia, formData: FormData): Promise<EstadoDeAprobacionDeAsistencia> {
  try {
    const casos = crearCasosDeUsoDePeriodos(repositorioDePeriodos, { obtenerActorActual });
    await casos.aprobarAsistencia({ periodoId: obtenerTexto(formData, "periodoId"), grupo: obtenerTexto(formData, "grupo") });
    revalidatePath("/periodos");
    return { listo: true };
  } catch (causa) {
    // Refresca la lista de quienes bloquean: pudo cambiar desde que se cargó la página.
    revalidatePath("/periodos");
    return { error: causa instanceof Error ? causa.message : "No se pudo aprobar la asistencia." };
  }
}

export interface EstadoDeCreacionDePeriodo { error?: string; advertencia?: string; valores?: { inicio: string; fin: string }; listo?: boolean; }

export async function crearPeriodoDesdeFormulario(_estadoAnterior: EstadoDeCreacionDePeriodo, formData: FormData): Promise<EstadoDeCreacionDePeriodo> {
  const inicio = obtenerTexto(formData, "inicio");
  const fin = obtenerTexto(formData, "fin");
  const confirmarHueco = formData.get("confirmarHueco") === "true";
  try {
    const casos = crearCasosDeUsoDePeriodos(repositorioDePeriodos, { obtenerActorActual });
    await casos.crear({ inicio, fin, confirmarHueco });
    revalidatePath("/periodos");
    return { listo: true };
  } catch (causa) {
    if (causa instanceof HuecoEntrePeriodosError) return { advertencia: causa.message, valores: { inicio, fin } };
    return { error: causa instanceof Error ? causa.message : "No se pudo crear el período.", valores: { inicio, fin } };
  }
}

function obtenerTexto(formData: FormData, nombre: string): string { const valor = formData.get(nombre); if (typeof valor !== "string" || !valor.trim()) throw new Error(`El campo ${nombre} es obligatorio.`); return valor.trim(); }
