import type { Actor } from "@/colaboradores/registrar-colaborador";

import type { PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";
import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";
import { diasDeLaSemana } from "./semana";

export interface ErrorDePublicacionDePlan {
  idHuellero: string;
  fecha: string;
  mensaje: string;
}

export interface ResultadoDePublicacionDePlan {
  publicados: number;
  errores: ErrorDePublicacionDePlan[];
}

type RepositorioParaPublicarPlan = RepositorioDePlanesSemanales & RepositorioDeTurnos;

export async function publicarPlanSemanalCompleto(
  repositorio: RepositorioParaPublicarPlan,
  actor: Actor,
  planId: string,
): Promise<ResultadoDePublicacionDePlan> {
  const plan = await repositorio.buscarPorId(planId);
  if (!plan) throw new Error("El plan semanal en borrador no existe.");
  const colaboradores = await repositorio.listarColaboradoresActivosPorEquipo(plan.equipo);
  return publicarPlanSemanal(repositorio, actor, planId, colaboradores.map(({ idHuellero }) => idHuellero));
}

export async function publicarPlanSemanal(
  repositorio: RepositorioParaPublicarPlan,
  actor: Actor,
  planId: string,
  personasSeleccionadas: string[],
): Promise<ResultadoDePublicacionDePlan> {
  const { idsSeleccionados, plan, errores } = await revisarPlanSemanal(repositorio, actor, planId, personasSeleccionadas);
  if (errores.length) return { publicados: 0, errores };

  const turnos = plan.celdas
    .filter((celda) => idsSeleccionados.includes(celda.idHuellero))
    .map(({ planId: _planId, ...turno }) => turno);
  try {
    await repositorio.publicarEnLote(turnos, actor);
  } catch (error) {
    const revisionPosterior = (await Promise.all(idsSeleccionados.map((idHuellero) => validarPersona(repositorio, plan, idHuellero)))).flat();
    if (revisionPosterior.length) return { publicados: 0, errores: revisionPosterior };
    throw error;
  }
  return { publicados: idsSeleccionados.length, errores: [] };
}

export async function revisarPlanSemanal(
  repositorio: RepositorioParaPublicarPlan,
  actor: Actor,
  planId: string,
  personasSeleccionadas: string[],
): Promise<{ idsSeleccionados: string[]; plan: PlanSemanalEnBorrador; errores: ErrorDePublicacionDePlan[] }> {
  if (actor.rol !== "operaciones" && actor.rol !== "administracion") throw new Error("No tiene permiso para publicar planes semanales.");
  const plan = await repositorio.buscarPorId(planId);
  if (!plan) throw new Error("El plan semanal en borrador no existe.");
  const idsSeleccionados = [...new Set(personasSeleccionadas)];
  const errores = (await Promise.all(idsSeleccionados.map((idHuellero) => validarPersona(repositorio, plan, idHuellero)))).flat();
  return { idsSeleccionados, plan, errores };
}

async function validarPersona(
  repositorio: RepositorioParaPublicarPlan,
  plan: PlanSemanalEnBorrador,
  idHuellero: string,
): Promise<ErrorDePublicacionDePlan[]> {
  const errores: ErrorDePublicacionDePlan[] = [];
  const fechas = diasDeLaSemana(plan.semana);
  const celdasPorFecha = new Map(plan.celdas.filter((celda) => celda.idHuellero === idHuellero).map((celda) => [celda.fecha, celda]));

  if (!(await repositorio.colaboradorPerteneceAEquipo(idHuellero, plan.equipo))) {
    return fechas.map((fecha) => ({ idHuellero, fecha, mensaje: "El colaborador no pertenece al equipo operativo del plan." }));
  }

  for (const fecha of fechas) {
    const celda = celdasPorFecha.get(fecha);
    if (!celda) {
      errores.push({ idHuellero, fecha, mensaje: "La celda está sin definir." });
      continue;
    }
    if (!esHorarioValido(celda)) errores.push({ idHuellero, fecha, mensaje: "El horario semanal no es válido." });
    if (!(await repositorio.perteneceAPeriodoAbierto(fecha))) errores.push({ idHuellero, fecha, mensaje: "La fecha no pertenece a un período de planilla abierto." });
    if (await repositorio.buscarPublicado(idHuellero, fecha)) errores.push({ idHuellero, fecha, mensaje: "Ya existe un horario semanal publicado para este colaborador y fecha." });
  }
  return errores;
}

function esHorarioValido(turno: TurnoPublicado): boolean {
  if (turno.descanso) return turno.entradaProgramada === null && turno.salidaProgramada === null;
  return Boolean(turno.sede.trim())
    && esHoraValida(turno.entradaProgramada) && esHoraValida(turno.salidaProgramada);
}

function esHoraValida(hora: string | null): boolean {
  if (!hora) return false;
  const partes = /^(\d{2}):(\d{2})$/.exec(hora);
  return Boolean(partes && Number(partes[1]) < 24 && Number(partes[2]) < 60);
}
