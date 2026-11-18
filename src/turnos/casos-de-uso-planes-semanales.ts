import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import { exigir, puedeConsultarHorarios, puedeOperarAsistenciaDelGrupo, type Actor } from "@/autenticacion/permisos";

import type { Grupo } from "./configurar-equipos-operativos";
import { jornadasPlanificadasSonIguales, motivoPlanificadoDe, validarJornadaPlanificada } from "./jornada-planificada";
import type { CeldaDePlanSemanalEnBorrador, PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";
import { FechasCerradasError } from "./publicar-plan-semanal";
import { estaVigenteEn, type Vigencia } from "@/relaciones-laborales/vigencia";

import { desplazarFecha, inicioDeSemana } from "./semana";
import { esDiaSinRelacionLaboral } from "./semana-con-relacion-laboral";

export type JornadaDelPatronMensual = Omit<CeldaDePlanSemanalEnBorrador, "planId">;
export type PatronSemanalMensual = Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, "descanso" | { modeloHorarioId: string }>>;
export type MotivoDeOmisionDelPatron = "Asignación existente" | "Fecha cerrada" | "Sin relación laboral" | "Semana liquidada";
export type ResultadoDelPatronMensual = {
  guardadas: string[];
  omitidas: Array<{ fecha: string; motivo: MotivoDeOmisionDelPatron }>;
};

export type RepositorioDelPatronMensual = Pick<RepositorioDePlanesSemanales,
  "colaboradorPerteneceAEquipo" | "buscarModeloDeHorario" | "sedeActivaPerteneceAlGrupo" |
  "listarVigenciasConfirmadas" | "buscarPublicado" | "horarioSemanalEstaProcesado"
> & {
  consultarEstadoDeFechas(inicio: string, fin: string): Promise<{ cerradas: string[] }>;
  listarBorradoresDelEquipoEnRango(equipo: Grupo, inicio: string, fin: string): Promise<Array<Pick<JornadaDelPatronMensual, "dni" | "fecha">>>;
  guardarNuevasJornadasDelMes(equipo: Grupo, jornadas: JornadaDelPatronMensual[]): Promise<ResultadoDelPatronMensual>;
};

export async function aplicarPatronSemanalAlMes(
  repositorio: RepositorioDelPatronMensual,
  sesion: SesionDelServidor,
  { equipo, dni, mes, patron }: { equipo: Grupo; dni: string; mes: string; patron: PatronSemanalMensual },
): Promise<ResultadoDelPatronMensual> {
  exigirPermisoParaEditarPlanSemanal(await sesion.obtenerActorActual(), equipo);
  exigir(await repositorio.colaboradorPerteneceAEquipo(dni, equipo), "El colaborador no pertenece al equipo operativo del plan.");
  validarMesDelPatron(mes);

  const horarios = new Map<number, Omit<JornadaDelPatronMensual, "dni" | "fecha">>();
  for (const [dia, seleccion] of Object.entries(patron)) {
    if (seleccion === "descanso") {
      horarios.set(Number(dia), { descanso: true, motivoNoAsistencia: "descanso", sede: null, entradaProgramada: null, salidaProgramada: null });
      continue;
    }
    const modelo = await repositorio.buscarModeloDeHorario(seleccion.modeloHorarioId);
    if (!modelo) throw new Error("El modelo de horario no existe.");
    if (!modelo.activo) throw new Error("El modelo de horario seleccionado no está activo.");
    if (!(await repositorio.sedeActivaPerteneceAlGrupo(modelo.sede, equipo))) {
      throw new Error("La sede debe estar activa y pertenecer al grupo del colaborador.");
    }
    horarios.set(Number(dia), {
      modeloHorarioId: modelo.id, sede: modelo.sede, entradaProgramada: modelo.entrada, salidaProgramada: modelo.salida,
    });
  }

  const jornadas: JornadaDelPatronMensual[] = [];
  for (let fecha = `${mes}-01`; fecha.startsWith(mes); fecha = desplazarFecha(fecha, 1)) {
    const dia = (new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7;
    const horario = horarios.get(dia);
    if (horario) jornadas.push({ dni, fecha, ...horario });
  }
  if (!jornadas.length) return { guardadas: [], omitidas: [] };

  const inicio = jornadas[0].fecha;
  const fin = jornadas.at(-1)!.fecha;
  const [estado, borradores, vigencias] = await Promise.all([
    repositorio.consultarEstadoDeFechas(inicio, fin),
    repositorio.listarBorradoresDelEquipoEnRango(equipo, inicio, fin),
    repositorio.listarVigenciasConfirmadas(dni),
  ]);
  const cerradas = new Set(estado.cerradas);
  const conBorrador = new Set(borradores.filter(borrador => borrador.dni === dni).map(borrador => borrador.fecha));
  const semanasProcesadas = new Map<string, Promise<boolean>>();
  const omitidas: ResultadoDelPatronMensual["omitidas"] = [];
  const nuevas: JornadaDelPatronMensual[] = [];

  for (const jornada of jornadas) {
    const { fecha } = jornada;
    if (cerradas.has(fecha)) {
      omitidas.push({ fecha, motivo: "Fecha cerrada" });
    } else if (!estaVigenteEn(vigencias, fecha)) {
      omitidas.push({ fecha, motivo: "Sin relación laboral" });
    } else if (conBorrador.has(fecha) || await repositorio.buscarPublicado(dni, fecha)) {
      omitidas.push({ fecha, motivo: "Asignación existente" });
    } else {
      const semana = inicioDeSemana(fecha);
      if (!semanasProcesadas.has(semana)) {
        semanasProcesadas.set(semana, repositorio.horarioSemanalEstaProcesado?.(dni, semana) ?? Promise.resolve(false));
      }
      if (await semanasProcesadas.get(semana)) {
        omitidas.push({ fecha, motivo: "Semana liquidada" });
      } else {
        nuevas.push(jornada);
      }
    }
  }

  if (!nuevas.length) return { guardadas: [], omitidas };
  const resultado = await repositorio.guardarNuevasJornadasDelMes(equipo, nuevas);
  return {
    guardadas: resultado.guardadas,
    omitidas: [...omitidas, ...resultado.omitidas].sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}

export function validarMesDelPatron(mes: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes) || mes.startsWith("0000")) {
    throw new Error("Seleccione un mes válido.");
  }
}

export function exigirPermisoParaEditarPlanSemanal(actor: Actor, equipo?: Grupo): void {
  exigir(puedeConsultarHorarios(actor), "No tiene permiso para editar planes semanales en borrador.");
  if (equipo !== undefined) exigir(puedeOperarAsistenciaDelGrupo(actor, equipo), "No tiene permiso para editar planes semanales de este grupo.");
}

type SeleccionDeCelda = Pick<CeldaDePlanSemanalEnBorrador, "dni" | "fecha" | "sede">;
type HorarioParaAplicar = Pick<CeldaDePlanSemanalEnBorrador, "modeloHorarioId" | "entradaProgramada" | "salidaProgramada" | "descanso" | "motivoNoAsistencia">;

export function crearCasosDeUsoDePlanesSemanales(
  repositorio: RepositorioDePlanesSemanales,
  sesion: SesionDelServidor,
) {
  async function autorizar(equipo?: Grupo): Promise<void> {
    exigirPermisoParaEditarPlanSemanal(await sesion.obtenerActorActual(), equipo);
  }

  async function validarGuardadoPuntual(
    plan: Pick<PlanSemanalEnBorrador, "semana" | "equipo">,
    celda: Omit<CeldaDePlanSemanalEnBorrador, "planId">,
  ): Promise<void> {
    await verificarQueNoEsteProcesado(repositorio, celda.dni, plan.semana);
    await validarCelda(repositorio, plan, celda);
    if (!(await repositorio.colaboradorPerteneceAEquipo(celda.dni, plan.equipo))) {
      throw new Error("El colaborador no pertenece al equipo operativo del plan.");
    }
    await verificarQueNoSeaPublicadoProcesado(repositorio, celda);
  }

  return {
    async guardarCeldaPorFecha(
      equipo: Grupo,
      celda: Omit<CeldaDePlanSemanalEnBorrador, "planId">,
    ): Promise<void> {
      await autorizar(equipo);
      const semana = inicioDeSemana(celda.fecha);
      await validarGuardadoPuntual({ semana, equipo }, celda);
      const plan = await repositorio.obtenerOCrear(semana, equipo);
      await repositorio.guardarCelda({ planId: plan.id, ...celda });
    },
    async obtenerOCrear(semana: string, equipo: Grupo): Promise<PlanSemanalEnBorrador> {
      await autorizar(equipo);
      return repositorio.obtenerOCrear(semana, equipo);
    },
    async guardarCelda(
      planId: string,
      celda: Omit<CeldaDePlanSemanalEnBorrador, "planId">,
    ): Promise<void> {
      await autorizar();
      const plan = await obtenerPlan(repositorio, planId);
      await autorizar(plan.equipo);
      await validarGuardadoPuntual(plan, celda);
      await exigirQueNoSeModifiquenFechasCerradas(repositorio, plan.celdas, [{ planId, ...celda }]);
      await repositorio.guardarCelda({ planId, ...celda });
    },
    async guardarBorrador(
      planId: string,
      celdas: Array<Omit<CeldaDePlanSemanalEnBorrador, "planId">>,
    ): Promise<void> {
      await autorizar();
      const plan = await obtenerPlan(repositorio, planId);
      await autorizar(plan.equipo);
      const celdasProcesadas = new Map<string, CeldaDePlanSemanalEnBorrador>();
      for (const celda of plan.celdas) {
        if (await repositorio.horarioSemanalEstaProcesado?.(celda.dni, plan.semana)) {
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
        await verificarQueNoEsteProcesado(repositorio, celda.dni, plan.semana);
        await validarCelda(repositorio, plan, celda);
        if (!(await repositorio.colaboradorPerteneceAEquipo(celda.dni, plan.equipo))) {
          throw new Error("El colaborador no pertenece al equipo operativo del plan.");
        }
        await verificarQueNoSeaPublicadoProcesado(repositorio, celda);
        celdasEditables.push({ planId, ...celda });
      }
      const celdasNuevas = [...celdasEditables, ...celdasProcesadas.values()];
      await exigirQueNoSeModifiquenFechasCerradas(repositorio, plan.celdas, celdasNuevas, { reemplazaElPlan: true });
      await repositorio.reemplazarCeldasDelPlan(planId, celdasNuevas);
    },
    async borrarCelda(planId: string, dni: string, fecha: string): Promise<void> {
      await autorizar();
      const plan = await obtenerPlan(repositorio, planId);
      await autorizar(plan.equipo);
      if (!fechaPerteneceALaSemana(fecha, plan.semana)) throw new Error("La fecha no pertenece a la semana del plan.");
      if (!(await repositorio.colaboradorPerteneceAEquipo(dni, plan.equipo))) {
        throw new Error("El colaborador no pertenece al equipo operativo del plan.");
      }
      await verificarQueNoEsteProcesado(repositorio, dni, plan.semana);
      await verificarQueNoEstePublicado(repositorio, dni, fecha);
      await repositorio.borrarCelda(planId, dni, fecha);
    },
    async copiarSemanaAnterior(planId: string): Promise<void> {
      await autorizar();
      const plan = await obtenerPlan(repositorio, planId);
      await autorizar(plan.equipo);
      const semanaAnterior = desplazarFecha(plan.semana, -7);
      const horarios = await repositorio.listarHorariosPublicadosDelEquipoEnSemana(semanaAnterior, plan.equipo);
      const celdasCopia: CeldaDePlanSemanalEnBorrador[] = [];
      const vigenciasPorPersona = new Map<string, Promise<Vigencia[]>>();
      const vigenciasDe = (dni: string) => vigenciasPorPersona.get(dni) ?? vigenciasPorPersona.set(dni, repositorio.listarVigenciasConfirmadas(dni)).get(dni)!;
      for (const horario of horarios) {
        if (!(await repositorio.colaboradorPerteneceAEquipo(horario.dni, plan.equipo))) continue;
        const celda = { ...horario, planId, fecha: desplazarFecha(horario.fecha, 7) };
        // Los días fuera de la relación laboral confirmada no se copian: el sistema los marca «Sin relación laboral».
        if (esDiaSinRelacionLaboral(horario) || !estaVigenteEn(await vigenciasDe(horario.dni), celda.fecha)) continue;
        await validarCelda(repositorio, plan, celda);
        celdasCopia.push(celda);
      }
      const idsProcesados = new Set<string>();
      for (const { dni } of celdasCopia) {
        if (await repositorio.horarioSemanalEstaProcesado?.(dni, plan.semana)) idsProcesados.add(dni);
      }
      const celdas = celdasCopia.filter(({ dni }) => !idsProcesados.has(dni));
      await Promise.all(celdas.map((celda) => verificarQueNoEstePublicado(repositorio, celda.dni, celda.fecha)));
      const celdasProcesadas = [] as CeldaDePlanSemanalEnBorrador[];
      for (const celda of plan.celdas) {
        if (idsProcesados.has(celda.dni) || await repositorio.horarioSemanalEstaProcesado?.(celda.dni, plan.semana)) celdasProcesadas.push(celda);
      }
      await repositorio.reemplazarCeldasDelPlan(planId, [...celdasProcesadas, ...celdas]);
    },
    async aplicarHorarioACeldas(planId: string, seleccion: SeleccionDeCelda[], horario: HorarioParaAplicar): Promise<void> {
      await autorizar();
      if (!seleccion.length) throw new Error("Seleccione al menos una celda para aplicar el horario.");
      const plan = await obtenerPlan(repositorio, planId);
      await autorizar(plan.equipo);
      const celdas = seleccion.map((celda) => ({
        planId,
        ...celda,
        ...horario,
        sede: horario.motivoNoAsistencia || horario.descanso ? null : celda.sede,
      }));
      for (const celda of celdas) {
        await verificarQueNoEsteProcesado(repositorio, celda.dni, plan.semana);
        await validarCelda(repositorio, plan, celda);
        if (!(await repositorio.colaboradorPerteneceAEquipo(celda.dni, plan.equipo))) {
          throw new Error("El colaborador no pertenece al equipo operativo del plan.");
        }
        await verificarQueNoSeaPublicadoProcesado(repositorio, celda);
      }
      await exigirQueNoSeModifiquenFechasCerradas(repositorio, plan.celdas, celdas);
      await repositorio.guardarCeldas(celdas);
    },
  };
}

/** Rechaza el guardado si cambia alguna fecha de un período cerrado; las celdas que quedan iguales no cuentan. */
async function exigirQueNoSeModifiquenFechasCerradas(
  repositorio: RepositorioDePlanesSemanales,
  actuales: CeldaDePlanSemanalEnBorrador[],
  nuevas: CeldaDePlanSemanalEnBorrador[],
  { reemplazaElPlan = false }: { reemplazaElPlan?: boolean } = {},
): Promise<void> {
  const celdasActuales = new Map(actuales.map((celda) => [claveDeCelda(celda), celda]));
  const celdasNuevas = new Map(nuevas.map((celda) => [claveDeCelda(celda), celda]));
  const modificadas = new Set<string>();
  for (const [clave, celda] of celdasNuevas) {
    const actual = celdasActuales.get(clave);
    // Un día «Sin relación laboral» que la grilla agrega solo (sin celda de trabajo previa) no es una modificación.
    if (esDiaSinRelacionLaboral(celda) && (!actual || esDiaSinRelacionLaboral(actual))) continue;
    if (!actual || !jornadasPlanificadasSonIguales(actual, celda)) modificadas.add(celda.fecha);
  }
  if (reemplazaElPlan) {
    for (const [clave, celda] of celdasActuales) if (!celdasNuevas.has(clave) && !esDiaSinRelacionLaboral(celda)) modificadas.add(celda.fecha);
  }
  if (!modificadas.size) return;
  const fechas = [...modificadas].sort();
  const { cerradas } = await repositorio.consultarEstadoDeFechas(fechas[0], fechas[fechas.length - 1]);
  const cerradasModificadas = fechas.filter((fecha) => cerradas.includes(fecha));
  if (cerradasModificadas.length) throw new FechasCerradasError(cerradasModificadas);
}

async function verificarQueNoEsteProcesado(repositorio: RepositorioDePlanesSemanales, dni: string, semana: string): Promise<void> {
  if (await repositorio.horarioSemanalEstaProcesado?.(dni, semana)) {
    throw new Error("El horario semanal ya fue procesado y no se puede editar.");
  }
}

async function verificarQueNoSeaPublicadoProcesado(
  repositorio: RepositorioDePlanesSemanales,
  celda: Omit<CeldaDePlanSemanalEnBorrador, "planId">,
): Promise<void> {
  const publicado = await repositorio.buscarPublicado(celda.dni, celda.fecha);
  if (publicado && !jornadasPlanificadasSonIguales(celda, publicado)) {
    const procesada = await repositorio.asistenciaEstaProcesada?.(celda.dni, celda.fecha);
    if (procesada) throw new Error("El horario semanal ya fue procesado y no se puede corregir.");
  }
}

async function verificarQueNoEstePublicado(repositorio: RepositorioDePlanesSemanales, dni: string, fecha: string): Promise<void> {
  if (await repositorio.buscarPublicado(dni, fecha)) {
    throw new Error("El horario semanal ya fue publicado y no se puede editar desde el borrador.");
  }
}

function claveDeCelda(celda: Pick<CeldaDePlanSemanalEnBorrador, "dni" | "fecha">): string {
  return `${celda.dni}:${celda.fecha}`;
}

async function obtenerPlan(repositorio: RepositorioDePlanesSemanales, id: string): Promise<PlanSemanalEnBorrador> {
  const plan = await repositorio.buscarPorId(id);
  if (!plan) throw new Error("El plan semanal en borrador no existe.");
  return plan;
}

async function validarCelda(repositorio: RepositorioDePlanesSemanales, plan: Pick<PlanSemanalEnBorrador, "semana" | "equipo">, celda: Omit<CeldaDePlanSemanalEnBorrador, "planId">): Promise<void> {
  if (!fechaPerteneceALaSemana(celda.fecha, plan.semana)) throw new Error("La fecha no pertenece a la semana del plan.");
  await validarJornadaPlanificada(repositorio, plan.equipo, celda);
}

function fechaPerteneceALaSemana(fecha: string, semana: string): boolean {
  const inicio = new Date(`${semana}T00:00:00Z`);
  const dia = new Date(`${fecha}T00:00:00Z`);
  const diferencia = (dia.getTime() - inicio.getTime()) / 86_400_000;
  return Number.isInteger(diferencia) && diferencia >= 0 && diferencia < 7;
}
