import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeConsultarHorarios, puedeOperarAsistenciaDelGrupo } from "@/autenticacion/permisos";

import type { PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";
import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";
import { FechasCerradasError } from "./publicar-plan-semanal";
import { jornadasPlanificadasSonIguales, validarJornadaPlanificada } from "./jornada-planificada";
import { diasDeLaSemana } from "./semana";
import { ajustarSemanaALaRelacionLaboral, esDiaSinRelacionLaboral } from "./semana-con-relacion-laboral";

type RepositorioParaRepublicar = RepositorioDePlanesSemanales & RepositorioDeTurnos;

export async function republicarPlanSemanal(
  repositorio: RepositorioParaRepublicar,
  actor: Actor,
  planId: string,
  dni: string,
  motivo: string,
): Promise<void> {
  exigir(puedeConsultarHorarios(actor), "No tiene permiso para republicar horarios semanales.");
  if (!motivo.trim() || motivo.trim().length > 250) throw new Error("El motivo de republicación es obligatorio y no puede superar 250 caracteres.");
  const plan = await repositorio.buscarPorId(planId);
  if (!plan) throw new Error("El plan semanal en borrador no existe.");
  exigir(puedeOperarAsistenciaDelGrupo(actor, plan.equipo), "No tiene permiso para republicar horarios semanales de este grupo.");
  if (!(await repositorio.colaboradorPerteneceAEquipo(dni, plan.equipo))) throw new Error("El colaborador no pertenece al equipo operativo del plan.");
  if (await repositorio.horarioSemanalEstaProcesado?.(dni, plan.semana)) throw new Error("No se puede corregir un horario semanal que ya fue procesado.");

  const { turnos, cambiadas } = await obtenerSemanaCorregida(repositorio, plan, dni);
  const fechas = diasDeLaSemana(plan.semana);
  const { cerradas } = await repositorio.consultarEstadoDeFechas(fechas[0], fechas[fechas.length - 1]);
  // Un día «Sin relación laboral» en fecha cerrada lo fija el sistema: no bloquea y, como toda fecha cerrada, no se escribe.
  const sinRelacion = new Set(turnos.filter(esDiaSinRelacionLaboral).map(({ fecha }) => fecha));
  const cerradasCambiadas = cambiadas.filter((fecha) => cerradas.includes(fecha) && !sinRelacion.has(fecha));
  if (cerradasCambiadas.length) throw new FechasCerradasError(cerradasCambiadas);
  // Una fecha cerrada sin cambios no se toca: se deja fuera de la corrección.
  const aEscribir = turnos.filter(({ fecha }) => !cerradas.includes(fecha));
  for (const turno of aEscribir) {
    if (await repositorio.asistenciaEstaProcesada(dni, turno.fecha)) throw new Error("No se puede corregir un horario semanal que ya fue procesado.");
  }
  await repositorio.reemplazarSemanaPublicada(aEscribir, actor, motivo.trim());
}

async function obtenerSemanaCorregida(repositorio: RepositorioParaRepublicar, plan: PlanSemanalEnBorrador, dni: string): Promise<{ turnos: TurnoPublicado[]; cambiadas: string[] }> {
  const fechas = diasDeLaSemana(plan.semana);
  const vigencias = await repositorio.listarVigenciasConfirmadas(dni);
  const celdas = new Map(ajustarSemanaALaRelacionLaboral(vigencias, dni, fechas, plan.celdas.filter((celda) => celda.dni === dni)).map((celda) => [celda.fecha, celda]));
  const turnos: TurnoPublicado[] = [];
  const cambiadas: string[] = [];
  for (const fecha of fechas) {
    const celda = celdas.get(fecha);
    const publicado = await repositorio.buscarPublicado(dni, fecha);
    if (!celda || !publicado) throw new Error("La corrección debe incluir los siete días publicados del colaborador.");
    await validarJornadaPlanificada(repositorio, plan.equipo, celda);
    const turno = { ...celda };
    delete (turno as { planId?: string }).planId;
    turnos.push(turno);
    if (!jornadasPlanificadasSonIguales(turno, publicado)) cambiadas.push(fecha);
  }
  if (!cambiadas.length) throw new Error("No hay cambios sin publicar para republicar.");
  return { turnos, cambiadas };
}
