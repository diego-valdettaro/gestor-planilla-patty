"use server";

import { revalidatePath } from "next/cache";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDeReglasLegales } from "@/reglas-legales/casos-de-uso-servidor";
import { repositorioDeReglasLegales } from "@/reglas-legales/servicio";

export interface EstadoDeFormularioDeRegla {
  error?: string;
  listo?: number;
}

function casosDeUso() {
  return crearCasosDeUsoDeReglasLegales(repositorioDeReglasLegales, { obtenerActorActual });
}

function refrescar(): void {
  revalidatePath("/pagos/reglas-legales");
  revalidatePath("/pagos/reglas-legales/[codigo]", "page");
}

async function ejecutar(estadoAnterior: EstadoDeFormularioDeRegla, operacion: () => Promise<unknown>, mensajeDeError: string): Promise<EstadoDeFormularioDeRegla> {
  try {
    await operacion();
    refrescar();
    return { listo: (estadoAnterior.listo ?? 0) + 1 };
  } catch (causa) {
    return { error: causa instanceof Error ? causa.message : mensajeDeError };
  }
}

export async function activarReglaDesdeFormulario(estadoAnterior: EstadoDeFormularioDeRegla, formData: FormData): Promise<EstadoDeFormularioDeRegla> {
  return ejecutar(estadoAnterior, () => casosDeUso().activar({
    codigo: texto(formData, "codigo", "el valor legal"), valor: texto(formData, "valor", "el valor"),
    vigenteDesde: texto(formData, "vigenteDesde", "«Vigente desde»"), fuenteOficial: texto(formData, "fuenteOficial", "la fuente oficial"),
  }), "No se pudo activar el valor.");
}

export async function corregirReglaDesdeFormulario(estadoAnterior: EstadoDeFormularioDeRegla, formData: FormData): Promise<EstadoDeFormularioDeRegla> {
  return ejecutar(estadoAnterior, () => casosDeUso().corregir({
    reglaId: texto(formData, "reglaId"), valor: texto(formData, "valor", "el valor"),
    fuenteOficial: formData.get("fuenteOficial")?.toString(), motivo: texto(formData, "motivo", "el motivo de la corrección"),
  }), "No se pudo corregir el valor.");
}

function texto(formData: FormData, campo: string, etiqueta = campo): string {
  const valor = formData.get(campo);
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`Falta ${etiqueta}.`);
  return valor.trim();
}
