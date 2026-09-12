"use server";
import { revalidatePath } from "next/cache";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDePeriodos } from "@/periodos/casos-de-uso-servidor";
import { HuecoEntrePeriodosError } from "@/periodos/periodo-planilla";
import { repositorioDePeriodos } from "@/periodos/servicio";
export async function cerrarPeriodoDesdeFormulario(formData: FormData): Promise<void> { const casos = crearCasosDeUsoDePeriodos(repositorioDePeriodos, { obtenerActorActual }); await casos.cerrar(obtenerTexto(formData, "periodoId")); revalidatePath("/periodos"); }
export async function reabrirPeriodoDesdeFormulario(formData: FormData): Promise<void> { const casos = crearCasosDeUsoDePeriodos(repositorioDePeriodos, { obtenerActorActual }); await casos.reabrir(obtenerTexto(formData, "periodoId"), obtenerTexto(formData, "motivo")); revalidatePath("/periodos"); }

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
