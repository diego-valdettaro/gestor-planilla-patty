"use server";

import { revalidatePath } from "next/cache";

import { exigir, puedeConsultarHorarios, puedeOperarAsistenciaDelGrupo } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDeTurnos } from "@/turnos/casos-de-uso-servidor";
import {
  aplicarPatronSemanalAlMes,
  crearCasosDeUsoDePlanesSemanales,
  exigirPermisoParaEditarPlanSemanal,
  validarMesDelPatron,
  type PatronSemanalMensual,
  type ResultadoDelPatronMensual,
} from "@/turnos/casos-de-uso-planes-semanales";
import { publicarPlanSemanal } from "@/turnos/publicar-plan-semanal";
import { republicarPlanSemanal } from "@/turnos/republicar-plan-semanal";
import { repositorioDeModelosDeHorario, repositorioDeTurnos } from "@/turnos/servicio";
import { estaVigenteEn } from "@/relaciones-laborales/vigencia";
import { esMotivoPlanificadoDeNoAsistencia, type MotivoPlanificadoDeNoAsistencia } from "@/turnos/jornada-planificada";

export async function publicarTurnoDesdeGrilla(formData: FormData): Promise<void> {
  const horario = formData.get("horario");
  const datosDelHorario = typeof horario === "string" ? interpretarHorario(horario) : undefined;

  const casosDeUso = crearCasosDeUsoDeTurnos(repositorioDeTurnos, {
    obtenerActorActual,
  });
  await casosDeUso.publicar({
    dni: obtenerTexto(formData, "dni"),
    fecha: obtenerTexto(formData, "fecha"),
    sede: obtenerTexto(formData, "sede"),
    entradaProgramada: datosDelHorario?.entrada ?? obtenerTexto(formData, "entradaProgramada"),
    salidaProgramada: datosDelHorario?.salida ?? obtenerTexto(formData, "salidaProgramada"),
    descanso: datosDelHorario?.descanso ?? formData.get("descanso") === "on",
  });

  revalidatePath("/turnos");
}

// Rechaza antes de consultar modelos de horario: la lectura previa no debe servir a un rol sin acceso a Horarios.
async function exigirAccesoAHorarios(): Promise<void> {
  exigir(puedeConsultarHorarios(await obtenerActorActual()), "No tiene permiso para editar planes semanales en borrador.");
}

export async function guardarCeldaDelBorrador(formData: FormData): Promise<void> {
  await exigirAccesoAHorarios();
  if (!formData.has("planId")) {
    await guardarCeldaMensual(formData);
    revalidatePath("/turnos");
    return;
  }
  const sede = obtenerTexto(formData, "sede");
  const datosDelHorario = await interpretarHorarioParaSede(obtenerTexto(formData, "horario"), sede);
  if (!datosDelHorario) throw new Error("El horario seleccionado no es válido.");
  await casosDeUsoDePlanesSemanales().guardarCelda(obtenerTexto(formData, "planId"), {
    dni: obtenerTexto(formData, "dni"), fecha: obtenerTexto(formData, "fecha"), sede,
    modeloHorarioId: datosDelHorario.modeloHorarioId,
    entradaProgramada: datosDelHorario.entrada, salidaProgramada: datosDelHorario.salida,
    descanso: datosDelHorario.descanso,
  });
  revalidatePath("/turnos");
}

export async function guardarPatronSemanalDelMes(formData: FormData): Promise<ResultadoDelPatronMensual> {
  const actor = await obtenerActorActual();
  const equipo = obtenerTexto(formData, "equipo");
  exigirPermisoParaEditarPlanSemanal(actor, equipo);
  const dni = obtenerTexto(formData, "dni");
  const mes = obtenerTexto(formData, "mes");
  validarMesDelPatron(mes);

  const patron: PatronSemanalMensual = {};
  for (const dia of [0, 1, 2, 3, 4, 5, 6] as const) {
    const seleccion = formData.get(`dia-${dia}`);
    if (seleccion === null || seleccion === "") continue;
    if (seleccion === "descanso") {
      patron[dia] = "descanso";
      continue;
    }
    const modelo = typeof seleccion === "string"
      ? /^modelo:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i.exec(seleccion)
      : null;
    if (!modelo) throw new Error("El horario seleccionado no es válido.");
    patron[dia] = { modeloHorarioId: modelo[1] };
  }

  const resultado = await repositorioDeTurnos.enTransaccionDePatronMensual(dni, repositorio =>
    aplicarPatronSemanalAlMes(repositorio, { obtenerActorActual: async () => actor }, { equipo, dni, mes, patron }));
  revalidatePath("/turnos");
  return resultado;
}

async function seleccionMensualEditable(formData: FormData) {
  const equipo = obtenerTexto(formData, "equipo");
  exigir(puedeOperarAsistenciaDelGrupo(await obtenerActorActual(), equipo), "No tiene permiso para editar planes semanales de este grupo.");
  const fecha = obtenerTexto(formData, "fecha");
  const fechaUtc = new Date(`${fecha}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(fechaUtc.getTime()) || fechaUtc.toISOString().slice(0, 10) !== fecha) {
    throw new Error("La fecha seleccionada no es válida.");
  }
  const { cerradas } = await repositorioDeTurnos.consultarEstadoDeFechas(fecha, fecha);
  if (cerradas.includes(fecha)) throw new Error("La fecha seleccionada está cerrada y requiere reapertura.");

  return { equipo, fecha, dni: obtenerTexto(formData, "dni") };
}

async function guardarCeldaMensual(formData: FormData): Promise<void> {
  const { equipo, fecha, dni } = await seleccionMensualEditable(formData);
  const horario = obtenerTexto(formData, "horario");
  const casos = casosDeUsoDePlanesSemanales();
  if (esMotivoPlanificadoDeNoAsistencia(horario) && horario !== "sin_relacion_laboral") {
    await casos.guardarCeldaPorFecha(equipo, {
      dni, fecha, sede: null, entradaProgramada: null, salidaProgramada: null,
      ...(horario === "descanso" ? { descanso: true } : { motivoNoAsistencia: horario }),
    });
    return;
  }

  const sede = obtenerTexto(formData, "sede");
  const datos = await interpretarHorarioParaSede(horario, sede);
  if (!datos) throw new Error("El horario seleccionado no es válido.");
  await casos.guardarCeldaPorFecha(equipo, {
    dni, fecha, sede, modeloHorarioId: datos.modeloHorarioId,
    entradaProgramada: datos.entrada, salidaProgramada: datos.salida, descanso: datos.descanso,
  });
}

export async function guardarBorradorDesdeGrilla(planId: string, celdasJson: string): Promise<void> {
  await exigirAccesoAHorarios();
  let celdas: Array<{ dni: string; fecha: string; sede: string | null; modeloHorarioId?: string | null; entradaProgramada: string | null; salidaProgramada: string | null; descanso?: boolean; motivoNoAsistencia?: MotivoPlanificadoDeNoAsistencia | null }>;
  try {
    celdas = JSON.parse(celdasJson);
  } catch {
    throw new Error("El borrador contiene datos inv\u00e1lidos.");
  }
  if (!Array.isArray(celdas)) throw new Error("El borrador contiene datos inv\u00e1lidos.");
  for (const celda of celdas) {
    if (!celda || typeof celda.dni !== "string" || typeof celda.fecha !== "string" || (celda.sede !== null && typeof celda.sede !== "string")
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
  if (!formData.has("planId")) {
    await exigirAccesoAHorarios();
    const { equipo, fecha, dni } = await seleccionMensualEditable(formData);
    if (!estaVigenteEn(await repositorioDeTurnos.listarVigenciasConfirmadas(dni), fecha)) {
      throw new Error("La fecha está fuera de la relación laboral confirmada.");
    }
    const celdas = await repositorioDeTurnos.listarBorradoresDelEquipoEnRango(equipo, fecha, fecha);
    const celda = celdas.find(jornada => jornada.dni === dni);
    if (celda) await casosDeUsoDePlanesSemanales().borrarCelda(celda.planId, dni, fecha);
  } else {
    await casosDeUsoDePlanesSemanales().borrarCelda(obtenerTexto(formData, "planId"), obtenerTexto(formData, "dni"), obtenerTexto(formData, "fecha"));
  }
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
      const celda = JSON.parse(valor) as { dni?: unknown; fecha?: unknown; sede?: unknown };
      return typeof celda.dni === "string" && typeof celda.fecha === "string" && typeof celda.sede === "string"
        ? [{ dni: celda.dni, fecha: celda.fecha, sede: celda.sede }]
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
  const seleccion = formData.getAll("dni").filter((valor): valor is string => typeof valor === "string" && valor.trim().length > 0);
  if (!seleccion.length) throw new Error("Seleccione al menos un colaborador para publicar.");
  const resultado = await publicarPlanSemanal(repositorioDeTurnos, await obtenerActorActual(), obtenerTexto(formData, "planId"), seleccion);
  if (resultado.errores.length) throw new Error(resultado.errores.map(({ dni, fecha, mensaje }) => `${dni} ${fecha}: ${mensaje}`).join(" "));
  revalidatePath("/turnos");
}

export async function republicarPlanSemanalDesdeGrilla(formData: FormData): Promise<void> {
  await republicarPlanSemanal(
    repositorioDeTurnos,
    await obtenerActorActual(),
    obtenerTexto(formData, "planId"),
    obtenerTexto(formData, "dni"),
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
