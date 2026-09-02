import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import type { EquipoOperativo } from "./configurar-equipos-operativos";
import type { CeldaDePlanSemanalEnBorrador, PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";
import { desplazarFecha } from "./semana";

type SeleccionDeCelda = Pick<CeldaDePlanSemanalEnBorrador, "idHuellero" | "fecha" | "sede">;
type HorarioParaAplicar = Pick<CeldaDePlanSemanalEnBorrador, "entradaProgramada" | "salidaProgramada" | "minutosDeAlmuerzo" | "descanso">;

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
      await verificarQueNoEstePublicado(repositorio, celda.idHuellero, celda.fecha);
      await repositorio.guardarCelda({ planId, ...celda });
    },
    async borrarCelda(planId: string, idHuellero: string, fecha: string): Promise<void> {
      await autorizar();
      const plan = await obtenerPlan(repositorio, planId);
      if (!fechaPerteneceALaSemana(fecha, plan.semana)) throw new Error("La fecha no pertenece a la semana del plan.");
      if (!(await repositorio.colaboradorPerteneceAEquipo(idHuellero, plan.equipo))) {
        throw new Error("El colaborador no pertenece al equipo operativo del plan.");
      }
      await verificarQueNoEstePublicado(repositorio, idHuellero, fecha);
      await repositorio.borrarCelda(planId, idHuellero, fecha);
    },
    async copiarSemanaAnterior(planId: string): Promise<void> {
      await autorizar();
      const plan = await obtenerPlan(repositorio, planId);
      const semanaAnterior = desplazarFecha(plan.semana, -7);
      const horarios = await repositorio.listarHorariosPublicadosDelEquipoEnSemana(semanaAnterior, plan.equipo);
      const celdas = horarios.map((horario) => ({
        ...horario,
        planId,
        fecha: desplazarFecha(horario.fecha, 7),
      }));
      await Promise.all(celdas.map((celda) => verificarQueNoEstePublicado(repositorio, celda.idHuellero, celda.fecha)));
      await repositorio.guardarCeldas(celdas);
    },
    async aplicarHorarioACeldas(planId: string, seleccion: SeleccionDeCelda[], horario: HorarioParaAplicar): Promise<void> {
      await autorizar();
      if (!seleccion.length) throw new Error("Seleccione al menos una celda para aplicar el horario.");
      const plan = await obtenerPlan(repositorio, planId);
      const celdas = seleccion.map((celda) => ({ planId, ...celda, ...horario }));
      for (const celda of celdas) {
        validarCelda(plan, celda);
        if (!(await repositorio.colaboradorPerteneceAEquipo(celda.idHuellero, plan.equipo))) {
          throw new Error("El colaborador no pertenece al equipo operativo del plan.");
        }
        await verificarQueNoEstePublicado(repositorio, celda.idHuellero, celda.fecha);
      }
      await repositorio.guardarCeldas(celdas);
    },
  };
}

async function verificarQueNoEstePublicado(repositorio: RepositorioDePlanesSemanales, idHuellero: string, fecha: string): Promise<void> {
  if (await repositorio.buscarPublicado(idHuellero, fecha)) {
    throw new Error("El horario semanal ya fue publicado y no se puede editar desde el borrador.");
  }
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
