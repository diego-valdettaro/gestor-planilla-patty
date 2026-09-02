"use server";
import { revalidatePath } from "next/cache";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDePeriodos } from "@/periodos/casos-de-uso-servidor";
import { repositorioDePeriodos } from "@/periodos/servicio";
export async function cerrarPeriodoDesdeFormulario(formData: FormData): Promise<void> { const casos = crearCasosDeUsoDePeriodos(repositorioDePeriodos, { obtenerActorActual }); await casos.cerrar(obtenerTexto(formData, "periodoId")); revalidatePath("/periodos"); }
export async function reabrirPeriodoDesdeFormulario(formData: FormData): Promise<void> { const casos = crearCasosDeUsoDePeriodos(repositorioDePeriodos, { obtenerActorActual }); await casos.reabrir(obtenerTexto(formData, "periodoId"), obtenerTexto(formData, "motivo")); revalidatePath("/periodos"); }
function obtenerTexto(formData: FormData, nombre: string): string { const valor = formData.get(nombre); if (typeof valor !== "string" || !valor.trim()) throw new Error(`El campo ${nombre} es obligatorio.`); return valor.trim(); }
