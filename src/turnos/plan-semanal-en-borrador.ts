import type { Grupo } from "./configurar-equipos-operativos";
import type { DatosDeJornadaPlanificada, RepositorioParaValidarJornadaPlanificada } from "./jornada-planificada";

export interface CeldaDePlanSemanalEnBorrador extends DatosDeJornadaPlanificada {
  planId: string;
  idHuellero: string;
  fecha: string;
  grupo?: Grupo;
}

export interface PlanSemanalEnBorrador {
  id: string;
  semana: string;
  equipo: Grupo;
  actualizadoEn?: Date;
  celdas: CeldaDePlanSemanalEnBorrador[];
}

export interface HorarioSemanalParaCopiar extends DatosDeJornadaPlanificada {
  idHuellero: string;
  fecha: string;
  grupo?: Grupo;
}

export interface RepositorioDePlanesSemanales extends RepositorioParaValidarJornadaPlanificada {
  obtenerOCrear(semana: string, equipo: Grupo): Promise<PlanSemanalEnBorrador>;
  buscarPorId(id: string): Promise<PlanSemanalEnBorrador | undefined>;
  guardarCelda(celda: CeldaDePlanSemanalEnBorrador): Promise<void>;
  guardarCeldas(celdas: CeldaDePlanSemanalEnBorrador[]): Promise<void>;
  reemplazarCeldasDelPlan(planId: string, celdas: CeldaDePlanSemanalEnBorrador[]): Promise<void>;
  borrarCelda(planId: string, idHuellero: string, fecha: string): Promise<void>;
  colaboradorPerteneceAEquipo(idHuellero: string, equipo: Grupo): Promise<boolean>;
  buscarPublicado(idHuellero: string, fecha: string): Promise<HorarioSemanalParaCopiar | undefined>;
  listarHorariosPublicadosDelEquipoEnSemana(semana: string, equipo: Grupo): Promise<HorarioSemanalParaCopiar[]>;
  listarColaboradoresActivosPorEquipo(equipo: Grupo): Promise<Array<{ idHuellero: string; nombre: string; sede: string }>>;
  asistenciaEstaProcesada?(idHuellero: string, fecha: string): Promise<boolean>;
  horarioSemanalEstaProcesado?(idHuellero: string, semana: string): Promise<boolean>;
}
