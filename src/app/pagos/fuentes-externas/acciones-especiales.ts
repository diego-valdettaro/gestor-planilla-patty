"use server";

import { revalidatePath } from "next/cache";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { decidirIncidencia, registrarAjuste, registrarIncidencia } from "@/fuentes-externas/incidencias-y-ajustes";
import { repositorioDeFuentesExternas } from "@/fuentes-externas/servicio";

export interface EstadoEspecial { error?: string; listo?: number }

function texto(datos: FormData, clave: string): string {
  const valor = datos.get(clave);
  return typeof valor === "string" ? valor.trim() : "";
}

async function ejecutar(anterior: EstadoEspecial, operacion: () => Promise<unknown>): Promise<EstadoEspecial> {
  try {
    await operacion();
    revalidatePath("/pagos/fuentes-externas");
    revalidatePath("/pagos/fuentes-externas/[tipo]", "page");
    return { listo: (anterior.listo ?? 0) + 1 };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar el cambio." };
  }
}

function comunes(datos: FormData) {
  return { dni: texto(datos, "dni"), fechaDelHecho: texto(datos, "fechaDelHecho"), mesDeDevengue: texto(datos, "mesDeDevengue"), mesDeAplicacion: texto(datos, "mesDeAplicacion"), monto: texto(datos, "monto") };
}

export async function registrarIncidenciaDesdeFormulario(anterior: EstadoEspecial, datos: FormData): Promise<EstadoEspecial> {
  return ejecutar(anterior, async () => { await registrarIncidencia(repositorioDeFuentesExternas, await obtenerActorActual(), comunes(datos)); });
}

export async function decidirIncidenciaDesdeFormulario(anterior: EstadoEspecial, datos: FormData): Promise<EstadoEspecial> {
  return ejecutar(anterior, async () => {
    await decidirIncidencia(repositorioDeFuentesExternas, await obtenerActorActual(), {
      id: texto(datos, "id"), decision: texto(datos, "decision") as "autorizar" | "no_descontar",
      sustento: texto(datos, "sustento"), autorizadoPor: texto(datos, "autorizadoPor"), fechaDeAutorizacion: texto(datos, "fechaDeAutorizacion"),
    });
  });
}

export async function registrarAjusteDesdeFormulario(anterior: EstadoEspecial, datos: FormData): Promise<EstadoEspecial> {
  return ejecutar(anterior, async () => {
    await registrarAjuste(repositorioDeFuentesExternas, await obtenerActorActual(), { ...comunes(datos), conceptoAjustado: texto(datos, "conceptoAjustado"), sentidoAjuste: texto(datos, "sentidoAjuste") as "suma" | "resta", motivo: texto(datos, "motivo") });
  });
}
