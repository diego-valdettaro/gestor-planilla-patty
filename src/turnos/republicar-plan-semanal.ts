import type { Actor } from "@/colaboradores/registrar-colaborador";

import type { PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";
import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";
import { diasDeLaSemana } from "./semana";

type RepositorioParaRepublicar = RepositorioDePlanesSemanales & RepositorioDeTurnos;

export async function republicarPlanSemanal(
  repositorio: RepositorioParaRepublicar,
  actor: Actor,
  planId: string,
  idHuellero: string,
  motivo: string,
): Promise<void> {
  if (actor.rol !== "operaciones" && actor.rol !== "administracion") throw new Error("No tiene permiso para republicar horarios semanales.");
  if (!motivo.trim() || motivo.trim().length > 250) throw new Error("El motivo de republicación es obligatorio y no puede superar 250 caracteres.");
  const plan = await repositorio.buscarPorId(planId);
  if (!plan) throw new Error("El plan semanal en borrador no existe.");
  if (!(await repositorio.colaboradorPerteneceAEquipo(idHuellero, plan.equipo))) throw new Error("El colaborador no pertenece al equipo operativo del plan.");

  const turnos = await obtenerSemanaCorregida(repositorio, plan, idHuellero);
  for (const turno of turnos) {
    if (!(await repositorio.perteneceAPeriodoAbierto(turno.fecha))) throw new Error("La fecha no pertenece a un período de planilla abierto.");
    if (await repositorio.asistenciaEstaProcesada(idHuellero, turno.fecha)) throw new Error("No se puede corregir un horario semanal que ya fue procesado.");
  }
  await repositorio.reemplazarSemanaPublicada(turnos, actor, motivo.trim());
}

async function obtenerSemanaCorregida(repositorio: RepositorioParaRepublicar, plan: PlanSemanalEnBorrador, idHuellero: string): Promise<TurnoPublicado[]> {
  const fechas = diasDeLaSemana(plan.semana);
  const celdas = new Map(plan.celdas.filter((celda) => celda.idHuellero === idHuellero).map((celda) => [celda.fecha, celda]));
  const turnos: TurnoPublicado[] = [];
  let hayCambios = false;
  for (const fecha of fechas) {
    const celda = celdas.get(fecha);
    const publicado = await repositorio.buscarPublicado(idHuellero, fecha);
    if (!celda || !publicado) throw new Error("La corrección debe incluir los siete días publicados del colaborador.");
    if (!esValido(celda)) throw new Error("El horario semanal no es válido.");
    const turno = { ...celda };
    delete (turno as { planId?: string }).planId;
    turnos.push(turno);
    hayCambios ||= !sonIguales(turno, publicado);
  }
  if (!hayCambios) throw new Error("No hay cambios sin publicar para republicar.");
  return turnos;
}

function esValido(turno: TurnoPublicado): boolean {
  if (turno.descanso) return turno.entradaProgramada === null && turno.salidaProgramada === null;
  return Boolean(turno.sede.trim() && turno.entradaProgramada && turno.salidaProgramada);
}

function sonIguales(a: TurnoPublicado, b: TurnoPublicado): boolean {
  return a.sede === b.sede && a.modeloHorarioId === b.modeloHorarioId && a.entradaProgramada === b.entradaProgramada
    && a.salidaProgramada === b.salidaProgramada && a.descanso === b.descanso;
}
