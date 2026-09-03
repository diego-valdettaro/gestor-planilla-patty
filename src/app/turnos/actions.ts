"use server";

import { revalidatePath } from "next/cache";

import { crearCasosDeUsoDeTurnos } from "@/turnos/casos-de-uso-servidor";
import { crearCasosDeUsoDePlanesSemanales } from "@/turnos/casos-de-uso-planes-semanales";
import { publicarPlanSemanal } from "@/turnos/publicar-plan-semanal";
import { repositorioDeModelosDeHorario, repositorioDeTurnos } from "@/turnos/servicio";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";

export async function publicarTurnoDesdeGrilla(formData: FormData): Promise<void> {
  const horario = formData.get("horario");
  const datosDelHorario = typeof horario === "string" ? interpretarHorario(horario) : undefined;

  const casosDeUso = crearCasosDeUsoDeTurnos(repositorioDeTurnos, {
    obtenerActorActual,
  });
  await casosDeUso.publicar({
    idHuellero: obtenerTexto(formData, "idHuellero"),
    fecha: obtenerTexto(formData, "fecha"),
    sede: obtenerTexto(formData, "sede"),
    entradaProgramada: datosDelHorario?.entrada ?? obtenerTexto(formData, "entradaProgramada"),
    salidaProgramada: datosDelHorario?.salida ?? obtenerTexto(formData, "salidaProgramada"),
    descanso: datosDelHorario?.descanso ?? formData.get("descanso") === "on",
  });

  revalidatePath("/turnos");
}

export async function guardarCeldaDelBorrador(formData: FormData): Promise<void> {
  const sede = obtenerTexto(formData, "sede");
  const datosDelHorario = await interpretarHorarioParaSede(obtenerTexto(formData, "horario"), sede);
  if (!datosDelHorario) throw new Error("El horario seleccionado no es válido.");
  await casosDeUsoDePlanesSemanales().guardarCelda(obtenerTexto(formData, "planId"), {
    idHuellero: obtenerTexto(formData, "idHuellero"), fecha: obtenerTexto(formData, "fecha"), sede,
    modeloHorarioId: datosDelHorario.modeloHorarioId,
    entradaProgramada: datosDelHorario.entrada, salidaProgramada: datosDelHorario.salida,
    descanso: datosDelHorario.descanso,
  });
  revalidatePath("/turnos");
}

export async function guardarBorradorDesdeGrilla(planId: string, celdasJson: string): Promise<void> {
  let celdas: Array<{ idHuellero: string; fecha: string; sede: string; modeloHorarioId?: string; entradaProgramada: string | null; salidaProgramada: string | null; descanso: boolean }>;
  try {
    celdas = JSON.parse(celdasJson);
  } catch {
    throw new Error("El borrador contiene datos inv\u00e1lidos.");
  }
  if (!Array.isArray(celdas)) throw new Error("El borrador contiene datos inv\u00e1lidos.");
  for (const celda of celdas) {
    if (!celda || typeof celda.idHuellero !== "string" || typeof celda.fecha !== "string" || typeof celda.sede !== "string"
      || typeof celda.descanso !== "boolean" || (celda.entradaProgramada !== null && typeof celda.entradaProgramada !== "string")
      || (celda.salidaProgramada !== null && typeof celda.salidaProgramada !== "string")) throw new Error("El borrador contiene datos inv\u00e1lidos.");
    if (celda.modeloHorarioId) {
      const modelo = await repositorioDeModelosDeHorario.buscarPorId(celda.modeloHorarioId);
      if (!modelo || !modelo.activo || modelo.sede !== celda.sede || modelo.entrada !== celda.entradaProgramada || modelo.salida !== celda.salidaProgramada) {
        throw new Error("El modelo de horario seleccionado no es válido.");
      }
    }
  }
  await casosDeUsoDePlanesSemanales().guardarBorrador(planId, celdas);
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

async function interpretarHorarioParaSede(valor: string, sede: string): Promise<{ entrada: string | null; salida: string | null; descanso: boolean; modeloHorarioId?: string } | undefined> {
  if (valor === "descanso") return { entrada: null, salida: null, descanso: true };
  if (valor.startsWith("modelo:")) {
    const modelo = await repositorioDeModelosDeHorario.buscarPorId(valor.slice("modelo:".length));
    if (!modelo || !modelo.activo || modelo.sede !== sede) throw new Error("El modelo de horario seleccionado no es válido.");
    return { entrada: modelo.entrada, salida: modelo.salida, descanso: false, modeloHorarioId: modelo.id };
  }
  return interpretarHorario(valor);
}

function interpretarHorario(valor: string): { entrada: string | null; salida: string | null; descanso: boolean } | undefined {
  if (valor === "descanso") return { entrada: null, salida: null, descanso: true };
  const [entrada, salida] = valor.split("|");
  if (!entrada || !salida || !/^\d{2}:\d{2}$/.test(entrada) || !/^\d{2}:\d{2}$/.test(salida)) throw new Error("El horario seleccionado no es válido.");
  return { entrada, salida, descanso: false };
}

function obtenerTexto(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre);

  if (typeof valor !== "string" || !valor.trim()) {
    throw new Error(`El campo ${nombre} es obligatorio.`);
  }

  return valor.trim();
}
