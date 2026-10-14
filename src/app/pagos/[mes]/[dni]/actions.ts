"use server";

import { revalidatePath } from "next/cache";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { clasificarGoce } from "@/clasificaciones-de-goce/gestionar-clasificaciones";
import { repositorioDeClasificacionesDeGoce } from "@/clasificaciones-de-goce/servicio";

export interface EstadoDeFormularioDeGoce {
  error?: string;
  listo?: number;
}

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

export async function clasificarGoceDesdeFormulario(estadoAnterior: EstadoDeFormularioDeGoce, formData: FormData): Promise<EstadoDeFormularioDeGoce> {
  try {
    const goce = texto(formData, "goce");
    if (goce !== "con_goce" && goce !== "sin_goce") throw new Error("Falta elegir si es con goce o sin goce.");
    await clasificarGoce(repositorioDeClasificacionesDeGoce, await obtenerActorActual(), { dni: texto(formData, "dni"), fecha: texto(formData, "fecha"), conGoce: goce === "con_goce" });
    revalidatePath("/pagos/[mes]/[dni]", "page");
    return { listo: (estadoAnterior.listo ?? 0) + 1 };
  } catch (causa) {
    return { error: causa instanceof Error ? causa.message : "No se pudo guardar la clasificación." };
  }
}
