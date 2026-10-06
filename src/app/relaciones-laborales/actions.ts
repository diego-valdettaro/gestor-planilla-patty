"use server";

import { revalidatePath } from "next/cache";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDeRelacionesLaborales } from "@/relaciones-laborales/casos-de-uso-servidor";
import { repositorioDeRelacionesLaborales } from "@/relaciones-laborales/servicio";

export interface EstadoDeFormularioDeRelacionLaboral {
  error?: string;
  listo?: number;
}

function casosDeUso() {
  return crearCasosDeUsoDeRelacionesLaborales(repositorioDeRelacionesLaborales, { obtenerActorActual });
}

function refrescar(): void {
  revalidatePath("/relaciones-laborales");
  // Horarios decide qué se puede publicar según estas fechas.
  revalidatePath("/turnos");
}

async function ejecutar(estadoAnterior: EstadoDeFormularioDeRelacionLaboral, operacion: () => Promise<void>, mensajeDeError: string): Promise<EstadoDeFormularioDeRelacionLaboral> {
  try {
    await operacion();
    refrescar();
    return { listo: (estadoAnterior.listo ?? 0) + 1 };
  } catch (causa) {
    return { error: causa instanceof Error ? causa.message : mensajeDeError };
  }
}

export async function registrarIngresoDesdeFormulario(estadoAnterior: EstadoDeFormularioDeRelacionLaboral, formData: FormData): Promise<EstadoDeFormularioDeRelacionLaboral> {
  return ejecutar(estadoAnterior, async () => { await casosDeUso().registrarIngreso({ dni: texto(formData, "dni"), ingreso: texto(formData, "ingreso") }); }, "No se pudo registrar el ingreso.");
}

export async function corregirIngresoDesdeFormulario(estadoAnterior: EstadoDeFormularioDeRelacionLaboral, formData: FormData): Promise<EstadoDeFormularioDeRelacionLaboral> {
  return ejecutar(estadoAnterior, () => casosDeUso().corregirIngreso(texto(formData, "relacionId"), texto(formData, "fecha")), "No se pudo corregir el ingreso.");
}

export async function registrarCeseDesdeFormulario(estadoAnterior: EstadoDeFormularioDeRelacionLaboral, formData: FormData): Promise<EstadoDeFormularioDeRelacionLaboral> {
  return ejecutar(estadoAnterior, () => casosDeUso().registrarCese(texto(formData, "relacionId"), texto(formData, "fecha")), "No se pudo registrar el cese.");
}

export async function confirmarIngresoDesdeFormulario(estadoAnterior: EstadoDeFormularioDeRelacionLaboral, formData: FormData): Promise<EstadoDeFormularioDeRelacionLaboral> {
  return ejecutar(estadoAnterior, () => casosDeUso().confirmarIngreso(texto(formData, "relacionId")), "No se pudo confirmar el ingreso.");
}

export async function confirmarCeseDesdeFormulario(estadoAnterior: EstadoDeFormularioDeRelacionLaboral, formData: FormData): Promise<EstadoDeFormularioDeRelacionLaboral> {
  return ejecutar(estadoAnterior, () => casosDeUso().confirmarCese(texto(formData, "relacionId")), "No se pudo confirmar el cese.");
}

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`El campo ${campo} es obligatorio.`);
  return valor.trim();
}
