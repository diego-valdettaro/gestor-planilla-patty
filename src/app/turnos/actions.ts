"use server";

import { revalidatePath } from "next/cache";

import { crearCasosDeUsoDeTurnos } from "@/turnos/casos-de-uso-servidor";
import { repositorioDeTurnos } from "@/turnos/servicio";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";

export async function publicarTurnoDesdeGrilla(formData: FormData): Promise<void> {
  const horario = formData.get("horario");
  const datosDelHorario = typeof horario === "string" ? interpretarHorario(horario) : undefined;
  const minutosDeAlmuerzo = datosDelHorario?.minutosDeAlmuerzo ?? Number(obtenerTexto(formData, "minutosDeAlmuerzo"));

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
    entradaProgramada: datosDelHorario?.entrada ?? obtenerTexto(formData, "entradaProgramada"),
    salidaProgramada: datosDelHorario?.salida ?? obtenerTexto(formData, "salidaProgramada"),
    minutosDeAlmuerzo,
    descanso: datosDelHorario?.descanso ?? formData.get("descanso") === "on",
  });

  revalidatePath("/turnos");
}

function interpretarHorario(valor: string): { entrada: string; salida: string; minutosDeAlmuerzo: number; descanso: boolean } | undefined {
  if (valor === "descanso") return { entrada: "00:00", salida: "00:00", minutosDeAlmuerzo: 0, descanso: true };
  const [entrada, salida, minutos] = valor.split("|");
  if (!entrada || !salida || !minutos || !/^\d{2}:\d{2}$/.test(entrada) || !/^\d{2}:\d{2}$/.test(salida)) throw new Error("El horario seleccionado no es válido.");
  const minutosDeAlmuerzo = Number(minutos);
  if (!Number.isInteger(minutosDeAlmuerzo) || minutosDeAlmuerzo < 0) throw new Error("El horario seleccionado no es válido.");
  return { entrada, salida, minutosDeAlmuerzo, descanso: false };
}

function obtenerTexto(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre);

  if (typeof valor !== "string" || !valor.trim()) {
    throw new Error(`El campo ${nombre} es obligatorio.`);
  }

  return valor.trim();
}
