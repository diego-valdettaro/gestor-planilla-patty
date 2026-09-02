"use server";

import { revalidatePath } from "next/cache";

import { crearCasosDeUsoDeTurnos } from "@/turnos/casos-de-uso-servidor";
import { crearCasosDeUsoDePlanesSemanales } from "@/turnos/casos-de-uso-planes-semanales";
import { publicarPlanSemanal } from "@/turnos/publicar-plan-semanal";
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

export async function guardarCeldaDelBorrador(formData: FormData): Promise<void> {
  const datosDelHorario = interpretarHorario(obtenerTexto(formData, "horario"));
  if (!datosDelHorario) throw new Error("El horario seleccionado no es válido.");
  await casosDeUsoDePlanesSemanales().guardarCelda(obtenerTexto(formData, "planId"), {
    idHuellero: obtenerTexto(formData, "idHuellero"), fecha: obtenerTexto(formData, "fecha"), sede: obtenerTexto(formData, "sede"),
    entradaProgramada: datosDelHorario.entrada, salidaProgramada: datosDelHorario.salida,
    minutosDeAlmuerzo: datosDelHorario.minutosDeAlmuerzo, descanso: datosDelHorario.descanso,
  });
  revalidatePath("/turnos");
}

export async function borrarCeldaDelBorrador(formData: FormData): Promise<void> {
  await casosDeUsoDePlanesSemanales().borrarCelda(obtenerTexto(formData, "planId"), obtenerTexto(formData, "idHuellero"), obtenerTexto(formData, "fecha"));
  revalidatePath("/turnos");
}

export async function copiarSemanaAnteriorEnBorrador(formData: FormData): Promise<void> {
  await casosDeUsoDePlanesSemanales().copiarSemanaAnterior(obtenerTexto(formData, "planId"));
  revalidatePath("/turnos");
}

export async function aplicarHorarioEnLoteAlBorrador(formData: FormData): Promise<void> {
  const datosDelHorario = interpretarHorario(obtenerTexto(formData, "horario"));
  if (!datosDelHorario) throw new Error("El horario seleccionado no es válido.");
  const seleccion = formData.getAll("celda").flatMap((valor) => {
    if (typeof valor !== "string") return [];
    try {
      const celda = JSON.parse(valor) as { idHuellero?: unknown; fecha?: unknown; sede?: unknown };
      return typeof celda.idHuellero === "string" && typeof celda.fecha === "string" && typeof celda.sede === "string"
        ? [{ idHuellero: celda.idHuellero, fecha: celda.fecha, sede: celda.sede }]
        : [];
    } catch {
      return [];
    }
  });
  await casosDeUsoDePlanesSemanales().aplicarHorarioACeldas(obtenerTexto(formData, "planId"), seleccion, {
    entradaProgramada: datosDelHorario.entrada,
    salidaProgramada: datosDelHorario.salida,
    minutosDeAlmuerzo: datosDelHorario.minutosDeAlmuerzo,
    descanso: datosDelHorario.descanso,
  });
  revalidatePath("/turnos");
}

export async function publicarPlanSemanalDesdeGrilla(formData: FormData): Promise<void> {
  const personasSeleccionadas = formData.getAll("idHuellero").filter((valor): valor is string => typeof valor === "string" && Boolean(valor));
  if (!personasSeleccionadas.length) throw new Error("Seleccione al menos una persona para publicar.");
  const resultado = await publicarPlanSemanal(repositorioDeTurnos, await obtenerActorActual(), obtenerTexto(formData, "planId"), personasSeleccionadas);
  if (resultado.errores.length) throw new Error(resultado.errores.map(({ idHuellero, fecha, mensaje }) => `${idHuellero} ${fecha}: ${mensaje}`).join(" "));
  revalidatePath("/turnos");
}

function casosDeUsoDePlanesSemanales() {
  return crearCasosDeUsoDePlanesSemanales(repositorioDeTurnos, { obtenerActorActual });
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
