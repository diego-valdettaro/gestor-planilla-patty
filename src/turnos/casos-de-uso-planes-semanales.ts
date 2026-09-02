import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import type { EquipoOperativo } from "./configurar-equipos-operativos";
import type { CeldaDePlanSemanalEnBorrador, PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";

export function crearCasosDeUsoDePlanesSemanales(
  repositorio: RepositorioDePlanesSemanales,
  sesion: SesionDelServidor,
) {
  async function autorizar(): Promise<void> {
    const actor = await sesion.obtenerActorActual();
    if (actor.rol !== "operaciones" && actor.rol !== "administracion") {
      throw new Error("No tiene permiso para editar planes semanales en borrador.");
    }
  }

  return {
    async obtenerOCrear(semana: string, equipo: EquipoOperativo): Promise<PlanSemanalEnBorrador> {
      await autorizar();
      return repositorio.obtenerOCrear(semana, equipo);
    },
    async guardarCelda(
      planId: string,
      celda: Omit<CeldaDePlanSemanalEnBorrador, "planId">,
    ): Promise<void> {
      await autorizar();
      const plan = await obtenerPlan(repositorio, planId);
      validarCelda(plan, celda);
      if (!(await repositorio.colaboradorPerteneceAEquipo(celda.idHuellero, plan.equipo))) {
        throw new Error("El colaborador no pertenece al equipo operativo del plan.");
      }
      await repositorio.guardarCelda({ planId, ...celda });
    },
    async borrarCelda(planId: string, idHuellero: string, fecha: string): Promise<void> {
      await autorizar();
      const plan = await obtenerPlan(repositorio, planId);
      if (!fechaPerteneceALaSemana(fecha, plan.semana)) throw new Error("La fecha no pertenece a la semana del plan.");
      if (!(await repositorio.colaboradorPerteneceAEquipo(idHuellero, plan.equipo))) {
        throw new Error("El colaborador no pertenece al equipo operativo del plan.");
      }
      await repositorio.borrarCelda(planId, idHuellero, fecha);
    },
  };
}

async function obtenerPlan(repositorio: RepositorioDePlanesSemanales, id: string): Promise<PlanSemanalEnBorrador> {
  const plan = await repositorio.buscarPorId(id);
  if (!plan) throw new Error("El plan semanal en borrador no existe.");
  return plan;
}

function validarCelda(plan: PlanSemanalEnBorrador, celda: Omit<CeldaDePlanSemanalEnBorrador, "planId">): void {
  if (!fechaPerteneceALaSemana(celda.fecha, plan.semana)) throw new Error("La fecha no pertenece a la semana del plan.");
  if (!celda.sede.trim()) throw new Error("La sede es obligatoria.");
  if (!Number.isInteger(celda.minutosDeAlmuerzo) || celda.minutosDeAlmuerzo < 0) throw new Error("Los minutos de almuerzo no son válidos.");
  if (!/^\d{2}:\d{2}$/.test(celda.entradaProgramada) || !/^\d{2}:\d{2}$/.test(celda.salidaProgramada)) throw new Error("Las horas programadas no son válidas.");
}

function fechaPerteneceALaSemana(fecha: string, semana: string): boolean {
  const inicio = new Date(`${semana}T00:00:00Z`);
  const dia = new Date(`${fecha}T00:00:00Z`);
  const diferencia = (dia.getTime() - inicio.getTime()) / 86_400_000;
  return Number.isInteger(diferencia) && diferencia >= 0 && diferencia < 7;
}
