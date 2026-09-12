import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import type { Grupo } from "./configurar-equipos-operativos";
import { jornadasPlanificadasSonIguales, motivoPlanificadoDe, validarJornadaPlanificada } from "./jornada-planificada";
import type { CeldaDePlanSemanalEnBorrador, PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";
import { desplazarFecha } from "./semana";

type SeleccionDeCelda = Pick<CeldaDePlanSemanalEnBorrador, "idHuellero" | "fecha" | "sede">;
type HorarioParaAplicar = Pick<CeldaDePlanSemanalEnBorrador, "modeloHorarioId" | "entradaProgramada" | "salidaProgramada" | "descanso" | "motivoNoAsistencia">;

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
    async obtenerOCrear(semana: string, equipo: Grupo): Promise<PlanSemanalEnBorrador> {
      await autorizar();
      return repositorio.obtenerOCrear(semana, equipo);
    },
    async guardarCelda(
      planId: string,
      celda: Omit<CeldaDePlanSemanalEnBorrador, "planId">,
    ): Promise<void> {
      await autorizar();
      const plan = await obtenerPlan(repositorio, planId);
      await verificarQueNoEsteProcesado(repositorio, celda.idHuellero, plan.semana);
      await validarCelda(repositorio, plan, celda);
      if (!(await repositorio.colaboradorPerteneceAEquipo(celda.idHuellero, plan.equipo))) {
        throw new Error("El colaborador no pertenece al equipo operativo del plan.");
      }
      await verificarQueNoSeaPublicadoProcesado(repositorio, celda);
      await repositorio.guardarCelda({ planId, ...celda });
    },
    async guardarBorrador(
      planId: string,
      celdas: Array<Omit<CeldaDePlanSemanalEnBorrador, "planId">>,
    ): Promise<void> {
      await autorizar();
      const plan = await obtenerPlan(repositorio, planId);
      const celdasProcesadas = new Map<string, CeldaDePlanSemanalEnBorrador>();
      for (const celda of plan.celdas) {
        if (await repositorio.horarioSemanalEstaProcesado?.(celda.idHuellero, plan.semana)) {
          celdasProcesadas.set(claveDeCelda(celda), celda);
        }
      }
      const celdasEditables: CeldaDePlanSemanalEnBorrador[] = [];
      for (const celda of celdas) {
        const celdaProcesada = celdasProcesadas.get(claveDeCelda(celda));
        if (celdaProcesada) {
          if (!jornadasPlanificadasSonIguales(celda, celdaProcesada)) throw new Error("El horario semanal ya fue procesado y no se puede editar.");
          continue;
        }
        await verificarQueNoEsteProcesado(repositorio, celda.idHuellero, plan.semana);
        await validarCelda(repositorio, plan, celda);
        if (!(await repositorio.colaboradorPerteneceAEquipo(celda.idHuellero, plan.equipo))) {
          throw new Error("El colaborador no pertenece al equipo operativo del plan.");
        }
        await verificarQueNoSeaPublicadoProcesado(repositorio, celda);
        celdasEditables.push({ planId, ...celda });
      }
      await repositorio.reemplazarCeldasDelPlan(planId, [...celdasEditables, ...celdasProcesadas.values()]);
    },
    async borrarCelda(planId: string, idHuellero: string, fecha: string): Promise<void> {
      await autorizar();
      const plan = await obtenerPlan(repositorio, planId);
      if (!fechaPerteneceALaSemana(fecha, plan.semana)) throw new Error("La fecha no pertenece a la semana del plan.");
      if (!(await repositorio.colaboradorPerteneceAEquipo(idHuellero, plan.equipo))) {
        throw new Error("El colaborador no pertenece al equipo operativo del plan.");
      }
      await verificarQueNoEsteProcesado(repositorio, idHuellero, plan.semana);
      await verificarQueNoEstePublicado(repositorio, idHuellero, fecha);
      await repositorio.borrarCelda(planId, idHuellero, fecha);
    },
    async copiarSemanaAnterior(planId: string): Promise<void> {
      await autorizar();
      const plan = await obtenerPlan(repositorio, planId);
      const semanaAnterior = desplazarFecha(plan.semana, -7);
      const horarios = await repositorio.listarHorariosPublicadosDelEquipoEnSemana(semanaAnterior, plan.equipo);
      const celdasCopia: CeldaDePlanSemanalEnBorrador[] = [];
      for (const horario of horarios) {
        if (!(await repositorio.colaboradorPerteneceAEquipo(horario.idHuellero, plan.equipo))) continue;
        const celda = { ...horario, planId, fecha: desplazarFecha(horario.fecha, 7) };
        await validarCelda(repositorio, plan, celda);
        celdasCopia.push(celda);
      }
      const idsProcesados = new Set<string>();
      for (const { idHuellero } of celdasCopia) {
        if (await repositorio.horarioSemanalEstaProcesado?.(idHuellero, plan.semana)) idsProcesados.add(idHuellero);
      }
      const celdas = celdasCopia.filter(({ idHuellero }) => !idsProcesados.has(idHuellero));
      await Promise.all(celdas.map((celda) => verificarQueNoEstePublicado(repositorio, celda.idHuellero, celda.fecha)));
      const celdasProcesadas = [] as CeldaDePlanSemanalEnBorrador[];
      for (const celda of plan.celdas) {
        if (idsProcesados.has(celda.idHuellero) || await repositorio.horarioSemanalEstaProcesado?.(celda.idHuellero, plan.semana)) celdasProcesadas.push(celda);
      }
      await repositorio.reemplazarCeldasDelPlan(planId, [...celdasProcesadas, ...celdas]);
    },
    async aplicarHorarioACeldas(planId: string, seleccion: SeleccionDeCelda[], horario: HorarioParaAplicar): Promise<void> {
      await autorizar();
      if (!seleccion.length) throw new Error("Seleccione al menos una celda para aplicar el horario.");
      const plan = await obtenerPlan(repositorio, planId);
      const celdas = seleccion.map((celda) => ({
        planId,
        ...celda,
        ...horario,
        sede: horario.motivoNoAsistencia || horario.descanso ? null : celda.sede,
      }));
      for (const celda of celdas) {
        await verificarQueNoEsteProcesado(repositorio, celda.idHuellero, plan.semana);
        await validarCelda(repositorio, plan, celda);
        if (!(await repositorio.colaboradorPerteneceAEquipo(celda.idHuellero, plan.equipo))) {
          throw new Error("El colaborador no pertenece al equipo operativo del plan.");
        }
        await verificarQueNoSeaPublicadoProcesado(repositorio, celda);
      }
      await repositorio.guardarCeldas(celdas);
    },
  };
}

async function verificarQueNoEsteProcesado(repositorio: RepositorioDePlanesSemanales, idHuellero: string, semana: string): Promise<void> {
  if (await repositorio.horarioSemanalEstaProcesado?.(idHuellero, semana)) {
    throw new Error("El horario semanal ya fue procesado y no se puede editar.");
  }
}

async function verificarQueNoSeaPublicadoProcesado(
  repositorio: RepositorioDePlanesSemanales,
  celda: Omit<CeldaDePlanSemanalEnBorrador, "planId">,
): Promise<void> {
  const publicado = await repositorio.buscarPublicado(celda.idHuellero, celda.fecha);
  if (publicado && !jornadasPlanificadasSonIguales(celda, publicado)) {
    const procesada = await repositorio.asistenciaEstaProcesada?.(celda.idHuellero, celda.fecha);
    if (procesada) throw new Error("El horario semanal ya fue procesado y no se puede corregir.");
  }
}

async function verificarQueNoEstePublicado(repositorio: RepositorioDePlanesSemanales, idHuellero: string, fecha: string): Promise<void> {
  if (await repositorio.buscarPublicado(idHuellero, fecha)) {
    throw new Error("El horario semanal ya fue publicado y no se puede editar desde el borrador.");
  }
}

function claveDeCelda(celda: Pick<CeldaDePlanSemanalEnBorrador, "idHuellero" | "fecha">): string {
  return `${celda.idHuellero}:${celda.fecha}`;
}

async function obtenerPlan(repositorio: RepositorioDePlanesSemanales, id: string): Promise<PlanSemanalEnBorrador> {
  const plan = await repositorio.buscarPorId(id);
  if (!plan) throw new Error("El plan semanal en borrador no existe.");
  return plan;
}

async function validarCelda(repositorio: RepositorioDePlanesSemanales, plan: PlanSemanalEnBorrador, celda: Omit<CeldaDePlanSemanalEnBorrador, "planId">): Promise<void> {
  if (!fechaPerteneceALaSemana(celda.fecha, plan.semana)) throw new Error("La fecha no pertenece a la semana del plan.");
  await validarJornadaPlanificada(repositorio, plan.equipo, celda);
}

function fechaPerteneceALaSemana(fecha: string, semana: string): boolean {
  const inicio = new Date(`${semana}T00:00:00Z`);
  const dia = new Date(`${fecha}T00:00:00Z`);
  const diferencia = (dia.getTime() - inicio.getTime()) / 86_400_000;
  return Number.isInteger(diferencia) && diferencia >= 0 && diferencia < 7;
}
