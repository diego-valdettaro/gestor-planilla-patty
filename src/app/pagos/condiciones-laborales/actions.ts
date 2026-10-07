"use server";

import { revalidatePath } from "next/cache";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDeCondicionesLaborales } from "@/condiciones-laborales/casos-de-uso-servidor";
import { repositorioDeCondicionesLaborales } from "@/condiciones-laborales/servicio";

export interface EstadoDeFormularioDeCondicion {
  error?: string;
  listo?: number;
}

function casosDeUso() {
  return crearCasosDeUsoDeCondicionesLaborales(repositorioDeCondicionesLaborales, { obtenerActorActual });
}

function refrescar(): void {
  revalidatePath("/pagos/condiciones-laborales");
  revalidatePath("/pagos/condiciones-laborales/[relacionId]", "page");
}

async function ejecutar(estadoAnterior: EstadoDeFormularioDeCondicion, operacion: () => Promise<unknown>, mensajeDeError: string): Promise<EstadoDeFormularioDeCondicion> {
  try {
    await operacion();
    refrescar();
    return { listo: (estadoAnterior.listo ?? 0) + 1 };
  } catch (causa) {
    return { error: causa instanceof Error ? causa.message : mensajeDeError };
  }
}

export async function registrarCondicionDesdeFormulario(estadoAnterior: EstadoDeFormularioDeCondicion, formData: FormData): Promise<EstadoDeFormularioDeCondicion> {
  return ejecutar(estadoAnterior, () => casosDeUso().registrar({
    relacionId: texto(formData, "relacionId"), dato: texto(formData, "dato"), valor: texto(formData, "valor", "el valor"), vigenteDesde: texto(formData, "vigenteDesde", "«Vigente desde»"),
  }), "No se pudo registrar el valor.");
}

export async function corregirCondicionDesdeFormulario(estadoAnterior: EstadoDeFormularioDeCondicion, formData: FormData): Promise<EstadoDeFormularioDeCondicion> {
  return ejecutar(estadoAnterior, () => casosDeUso().corregir({
    condicionId: texto(formData, "condicionId"), valor: texto(formData, "valor", "el valor"), motivo: texto(formData, "motivo", "el motivo de la corrección"),
  }), "No se pudo corregir el valor.");
}

function texto(formData: FormData, campo: string, etiqueta = campo): string {
  const valor = formData.get(campo);
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`Falta ${etiqueta}.`);
  return valor.trim();
}
