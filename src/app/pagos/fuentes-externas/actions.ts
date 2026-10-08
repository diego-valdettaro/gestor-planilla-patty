"use server";

import { revalidatePath } from "next/cache";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDeFuentesExternas } from "@/fuentes-externas/casos-de-uso-servidor";
import { repositorioDeFuentesExternas } from "@/fuentes-externas/servicio";

export interface EstadoDeFormularioDeFuente {
  error?: string;
  listo?: number;
  /** Aviso que acompaña a un éxito, por ejemplo que la fuente volvió a Pendiente. */
  aviso?: string;
}

function casosDeUso() {
  return crearCasosDeUsoDeFuentesExternas(repositorioDeFuentesExternas, { obtenerActorActual });
}

function refrescar(): void {
  revalidatePath("/pagos/fuentes-externas");
  revalidatePath("/pagos/fuentes-externas/[tipo]", "page");
}

async function ejecutar(estadoAnterior: EstadoDeFormularioDeFuente, operacion: () => Promise<{ volvioAPendiente?: boolean } | void>, mensajeDeError: string): Promise<EstadoDeFormularioDeFuente> {
  try {
    const resultado = await operacion();
    refrescar();
    return { listo: (estadoAnterior.listo ?? 0) + 1, aviso: resultado?.volvioAPendiente ? "La fuente estaba confirmada y volvió a Pendiente: confirme de nuevo su listado." : undefined };
  } catch (causa) {
    return { error: causa instanceof Error ? causa.message : mensajeDeError };
  }
}

export async function registrarImporteDesdeFormulario(estadoAnterior: EstadoDeFormularioDeFuente, formData: FormData): Promise<EstadoDeFormularioDeFuente> {
  return ejecutar(estadoAnterior, () => casosDeUso().registrar({
    tipoDeFuente: texto(formData, "tipoDeFuente", "el tipo de fuente"), dni: texto(formData, "dni", "el DNI"), concepto: texto(formData, "concepto", "el concepto"),
    fechaDelHecho: texto(formData, "fechaDelHecho", "la fecha del hecho"), mesDeDevengue: texto(formData, "mesDeDevengue", "el mes de devengue"),
    mesDeAplicacion: texto(formData, "mesDeAplicacion", "el mes de aplicación"), monto: texto(formData, "monto", "el importe"),
  }), "No se pudo registrar el importe.");
}

export async function anularImporteDesdeFormulario(estadoAnterior: EstadoDeFormularioDeFuente, formData: FormData): Promise<EstadoDeFormularioDeFuente> {
  return ejecutar(estadoAnterior, () => casosDeUso().anular({ importeId: texto(formData, "importeId"), motivo: texto(formData, "motivo", "el motivo de la anulación") }), "No se pudo anular el importe.");
}

export async function confirmarFuenteDesdeFormulario(estadoAnterior: EstadoDeFormularioDeFuente, formData: FormData): Promise<EstadoDeFormularioDeFuente> {
  return ejecutar(estadoAnterior, async () => { await casosDeUso().confirmar({ tipoDeFuente: texto(formData, "tipoDeFuente"), mes: texto(formData, "mes") }); }, "No se pudo confirmar la fuente.");
}

export async function volverAPendienteDesdeFormulario(estadoAnterior: EstadoDeFormularioDeFuente, formData: FormData): Promise<EstadoDeFormularioDeFuente> {
  return ejecutar(estadoAnterior, () => casosDeUso().volverAPendiente({ tipoDeFuente: texto(formData, "tipoDeFuente"), mes: texto(formData, "mes") }), "No se pudo volver la fuente a Pendiente.");
}

function texto(formData: FormData, campo: string, etiqueta = campo): string {
  const valor = formData.get(campo);
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`Falta ${etiqueta}.`);
  return valor.trim();
}
