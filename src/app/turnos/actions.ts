"use server";

import { revalidatePath } from "next/cache";

import { crearCasosDeUsoDeTurnos } from "@/turnos/casos-de-uso-servidor";
import { crearCasosDeUsoDePlanesSemanales } from "@/turnos/casos-de-uso-planes-semanales";
import { publicarPlanSemanalCompleto, reemplazarPlanSemanalCompleto } from "@/turnos/publicar-plan-semanal";
import { republicarPlanSemanal } from "@/turnos/republicar-plan-semanal";
import { repositorioDeModelosDeHorario, repositorioDeTurnos } from "@/turnos/servicio";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { esMotivoPlanificadoDeNoAsistencia, type MotivoPlanificadoDeNoAsistencia } from "@/turnos/jornada-planificada";

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
  let celdas: Array<{ idHuellero: string; fecha: string; sede: string | null; modeloHorarioId?: string | null; entradaProgramada: string | null; salidaProgramada: string | null; descanso?: boolean; motivoNoAsistencia?: MotivoPlanificadoDeNoAsistencia | null }>;
  try {
    celdas = JSON.parse(celdasJson);
  } catch {
    throw new Error("El borrador contiene datos inv\u00e1lidos.");
  }
  if (!Array.isArray(celdas)) throw new Error("El borrador contiene datos inv\u00e1lidos.");
  for (const celda of celdas) {
    if (!celda || typeof celda.idHuellero !== "string" || typeof celda.fecha !== "string" || (celda.sede !== null && typeof celda.sede !== "string")
      || (celda.descanso !== undefined && typeof celda.descanso !== "boolean") || (celda.entradaProgramada !== null && typeof celda.entradaProgramada !== "string")
      || (celda.salidaProgramada !== null && typeof celda.salidaProgramada !== "string")) throw new Error("El borrador contiene datos inv\u00e1lidos.");
    if (celda.motivoNoAsistencia != null && (typeof celda.motivoNoAsistencia !== "string" || !esMotivoPlanificadoDeNoAsistencia(celda.motivoNoAsistencia))) {
      throw new Error("El motivo planificado de no asistencia no es válido.");
    }
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
  const resultado = await publicarPlanSemanalCompleto(repositorioDeTurnos, await obtenerActorActual(), obtenerTexto(formData, "planId"));
  if (resultado.errores.length) throw new Error(resultado.errores.map(({ idHuellero, fecha, mensaje }) => `${idHuellero} ${fecha}: ${mensaje}`).join(" "));
  revalidatePath("/turnos");
}

export async function reemplazarPlanificacionSemanalDesdeGrilla(formData: FormData): Promise<void> {
  const resultado = await reemplazarPlanSemanalCompleto(repositorioDeTurnos, await obtenerActorActual(), obtenerTexto(formData, "planId"));
  if (resultado.errores.length) throw new Error("No se pudo reemplazar la planificación semanal.");
  revalidatePath("/turnos");
}

export async function republicarPlanSemanalDesdeGrilla(formData: FormData): Promise<void> {
  await republicarPlanSemanal(
    repositorioDeTurnos,
    await obtenerActorActual(),
    obtenerTexto(formData, "planId"),
    obtenerTexto(formData, "idHuellero"),
    obtenerTexto(formData, "motivo"),
  );
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
