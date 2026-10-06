import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeConsultarHorarios, puedeOperarAsistenciaDelGrupo } from "@/autenticacion/permisos";

import type { PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";
import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";
import { verificarQueLaSemanaTengaRelacion } from "@/relaciones-laborales/vigencia";

import { validarJornadaPlanificada } from "./jornada-planificada";
import { diasDeLaSemana } from "./semana";
import { ajustarSemanaALaRelacionLaboral } from "./semana-con-relacion-laboral";

export interface ErrorDePublicacionDePlan {
  dni: string;
  fecha: string;
  mensaje: string;
}
export interface ResultadoDePublicacionDePlan {
  publicados: number;
  errores: ErrorDePublicacionDePlan[];
}

type RepositorioParaPublicarPlan = RepositorioDePlanesSemanales & RepositorioDeTurnos;

export async function publicarPlanSemanal(
  repositorio: RepositorioParaPublicarPlan,
  actor: Actor,
  planId: string,
  personasSeleccionadas: string[],
): Promise<ResultadoDePublicacionDePlan> {
  const { idsSeleccionados, plan, errores } = await revisarPlanSemanal(repositorio, actor, planId, personasSeleccionadas);
  if (errores.length) return { publicados: 0, errores };

  const turnos = (await Promise.all(idsSeleccionados.map((dni) => celdasEfectivasDe(repositorio, plan, dni)))).flat()
    .map(({ planId: _planId, ...turno }) => turno as TurnoPublicado & { planId?: string });
  try {
    await repositorio.publicarEnLote(turnos, actor);
  } catch (error) {
    const revisionPosterior = (await Promise.all(idsSeleccionados.map((dni) => validarPersona(repositorio, plan, dni)))).flat();
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
  exigir(puedeConsultarHorarios(actor), "No tiene permiso para publicar planes semanales.");
  const plan = await repositorio.buscarPorId(planId);
  if (!plan) throw new Error("El plan semanal en borrador no existe.");
  exigir(puedeOperarAsistenciaDelGrupo(actor, plan.equipo), "No tiene permiso para publicar planes semanales de este grupo.");
  const idsSeleccionados = [...new Set(personasSeleccionadas)];
  const errores = (await Promise.all(idsSeleccionados.map((dni) => validarPersona(repositorio, plan, dni)))).flat();
  return { idsSeleccionados, plan, errores };
}

/** Las siete celdas de la persona ajustadas a su relación laboral confirmada: los días fuera de ella quedan «Sin relación laboral». */
async function celdasEfectivasDe(
  repositorio: RepositorioParaPublicarPlan,
  plan: PlanSemanalEnBorrador,
  dni: string,
): Promise<Array<TurnoPublicado & { planId?: string }>> {
  const vigencias = await repositorio.listarVigenciasConfirmadas(dni);
  return ajustarSemanaALaRelacionLaboral(vigencias, dni, diasDeLaSemana(plan.semana), plan.celdas.filter((celda) => celda.dni === dni));
}

async function validarPersona(
  repositorio: RepositorioParaPublicarPlan,
  plan: PlanSemanalEnBorrador,
  dni: string,
): Promise<ErrorDePublicacionDePlan[]> {
  const errores: ErrorDePublicacionDePlan[] = [];
  const fechas = diasDeLaSemana(plan.semana);

  if (!(await repositorio.colaboradorPerteneceAEquipo(dni, plan.equipo))) {
    return fechas.map((fecha) => ({ dni, fecha, mensaje: "El colaborador no pertenece al equipo operativo del plan." }));
  }
  try {
    verificarQueLaSemanaTengaRelacion(await repositorio.listarVigenciasConfirmadas(dni), fechas);
  } catch (error) {
    return fechas.map((fecha) => ({ dni, fecha, mensaje: error instanceof Error ? error.message : "La persona no tiene una relación laboral confirmada." }));
  }
  const celdasPorFecha = new Map((await celdasEfectivasDe(repositorio, plan, dni)).map((celda) => [celda.fecha, celda]));

  for (const fecha of fechas) {
    const celda = celdasPorFecha.get(fecha);
    if (!celda) {
      errores.push({ dni, fecha, mensaje: "La celda está sin definir." });
      continue;
    }
    try {
      await validarJornadaPlanificada(repositorio, plan.equipo, celda);
    } catch (error) {
      errores.push({ dni, fecha, mensaje: error instanceof Error ? error.message : "El horario semanal no es válido." });
    }
    if (!(await repositorio.perteneceAPeriodoAbierto(fecha))) errores.push({ dni, fecha, mensaje: "La fecha no pertenece a un período de planilla abierto." });
    if (await repositorio.buscarPublicado(dni, fecha)) errores.push({ dni, fecha, mensaje: "Ya existe un horario semanal publicado para este colaborador y fecha." });
  }
  return errores;
}
