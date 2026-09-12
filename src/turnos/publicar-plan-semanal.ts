import type { Actor } from "@/colaboradores/registrar-colaborador";

import type { PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";
import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";
import { validarJornadaPlanificada } from "./jornada-planificada";
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

export async function reemplazarPlanSemanalCompleto(
  repositorio: RepositorioParaPublicarPlan,
  actor: Actor,
  planId: string,
): Promise<ResultadoDePublicacionDePlan> {
  const plan = await repositorio.buscarPorId(planId);
  if (!plan) throw new Error("El plan semanal en borrador no existe.");
  const colaboradores = await repositorio.listarColaboradoresActivosPorEquipo(plan.equipo);
  const { idsSeleccionados, errores } = await revisarPlanSemanal(repositorio, actor, planId, colaboradores.map(({ idHuellero }) => idHuellero), true);
  if (errores.length) return { publicados: 0, errores };

  const turnos = plan.celdas
    .filter((celda) => idsSeleccionados.includes(celda.idHuellero))
    .map(({ planId: _planId, ...turno }) => turno);

  const faltanPublicados = await Promise.all(turnos.map(async ({ idHuellero, fecha }) => !(await repositorio.buscarPublicado(idHuellero, fecha))));
  if (faltanPublicados.some(Boolean)) {
    throw new Error("La planificación publicada está incompleta y no se puede reemplazar.");
  }

  await repositorio.reemplazarSemanaPublicada(turnos, actor, "Reemplazo completo de la planificación semanal.");
  return { publicados: idsSeleccionados.length, errores: [] };
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
  permitePublicados = false,
): Promise<{ idsSeleccionados: string[]; plan: PlanSemanalEnBorrador; errores: ErrorDePublicacionDePlan[] }> {
  if (actor.rol !== "operaciones" && actor.rol !== "administracion") throw new Error("No tiene permiso para publicar planes semanales.");
  const plan = await repositorio.buscarPorId(planId);
  if (!plan) throw new Error("El plan semanal en borrador no existe.");
  const idsSeleccionados = [...new Set(personasSeleccionadas)];
  const errores = (await Promise.all(idsSeleccionados.map((idHuellero) => validarPersona(repositorio, plan, idHuellero, permitePublicados)))).flat();
  return { idsSeleccionados, plan, errores };
}

async function validarPersona(
  repositorio: RepositorioParaPublicarPlan,
  plan: PlanSemanalEnBorrador,
  idHuellero: string,
  permitePublicados = false,
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
    try {
      await validarJornadaPlanificada(repositorio, plan.equipo, celda);
    } catch (error) {
      errores.push({ idHuellero, fecha, mensaje: error instanceof Error ? error.message : "El horario semanal no es válido." });
    }
    if (!(await repositorio.perteneceAPeriodoAbierto(fecha))) errores.push({ idHuellero, fecha, mensaje: "La fecha no pertenece a un período de planilla abierto." });
    if (!permitePublicados && await repositorio.buscarPublicado(idHuellero, fecha)) errores.push({ idHuellero, fecha, mensaje: "Ya existe un horario semanal publicado para este colaborador y fecha." });
  }
  return errores;
}
