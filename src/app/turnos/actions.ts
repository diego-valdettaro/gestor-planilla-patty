"use server";

import { revalidatePath } from "next/cache";

import { crearCasosDeUsoDeTurnos } from "@/turnos/casos-de-uso-servidor";
import { repositorioDeTurnos } from "@/turnos/servicio";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";

export async function publicarTurnoDesdeGrilla(formData: FormData): Promise<void> {
  const minutosDeAlmuerzo = Number(obtenerTexto(formData, "minutosDeAlmuerzo"));

  if (!Number.isInteger(minutosDeAlmuerzo) || minutosDeAlmuerzo < 0) {
    throw new Error("Los minutos de almuerzo deben ser un número entero mayor o igual que cero.");
  }

  const casosDeUso = crearCasosDeUsoDeTurnos(repositorioDeTurnos, {
    obtenerActorActual,
  });
  await casosDeUso.publicar({
    idHuellero: obtenerTexto(formData, "idHuellero"),
    fecha: obtenerTexto(formData, "fecha"),
    sede: obtenerTexto(formData, "sede"),
    entradaProgramada: obtenerTexto(formData, "entradaProgramada"),
    salidaProgramada: obtenerTexto(formData, "salidaProgramada"),
    minutosDeAlmuerzo,
    descanso: formData.get("descanso") === "on",
  });

  revalidatePath("/turnos");
}

function obtenerTexto(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre);

  if (typeof valor !== "string" || !valor.trim()) {
    throw new Error(`El campo ${nombre} es obligatorio.`);
  }

  return valor.trim();
}
