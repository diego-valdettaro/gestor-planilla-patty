import type { Grupo } from "./configurar-equipos-operativos";

export interface CeldaDePlanSemanalEnBorrador {
  planId: string;
  idHuellero: string;
  fecha: string;
  sede: string;
  modeloHorarioId?: string | null;
  entradaProgramada: string | null;
  salidaProgramada: string | null;
  descanso: boolean;
}

export interface PlanSemanalEnBorrador {
  id: string;
  semana: string;
  equipo: Grupo;
  actualizadoEn?: Date;
  celdas: CeldaDePlanSemanalEnBorrador[];
}

export interface HorarioSemanalParaCopiar {
  idHuellero: string;
  fecha: string;
  sede: string;
  modeloHorarioId?: string | null;
  entradaProgramada: string | null;
  salidaProgramada: string | null;
  descanso: boolean;
}

export interface RepositorioDePlanesSemanales {
  obtenerOCrear(semana: string, equipo: Grupo): Promise<PlanSemanalEnBorrador>;
  buscarPorId(id: string): Promise<PlanSemanalEnBorrador | undefined>;
  guardarCelda(celda: CeldaDePlanSemanalEnBorrador): Promise<void>;
  guardarCeldas(celdas: CeldaDePlanSemanalEnBorrador[]): Promise<void>;
  reemplazarCeldasDelPlan(planId: string, celdas: CeldaDePlanSemanalEnBorrador[]): Promise<void>;
  borrarCelda(planId: string, idHuellero: string, fecha: string): Promise<void>;
  colaboradorPerteneceAEquipo(idHuellero: string, equipo: Grupo): Promise<boolean>;
  obtenerSedeDelColaborador(idHuellero: string): Promise<string | undefined>;
  buscarPublicado(idHuellero: string, fecha: string): Promise<HorarioSemanalParaCopiar | undefined>;
  listarHorariosPublicadosDelEquipoEnSemana(semana: string, equipo: Grupo): Promise<HorarioSemanalParaCopiar[]>;
  listarColaboradoresActivosPorEquipo(equipo: Grupo): Promise<Array<{ idHuellero: string; nombre: string; sede: string }>>;
  asistenciaEstaProcesada?(idHuellero: string, fecha: string): Promise<boolean>;
  horarioSemanalEstaProcesado?(idHuellero: string, semana: string): Promise<boolean>;
}
