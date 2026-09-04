import type { EquipoOperativo } from "./configurar-equipos-operativos";

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
  equipo: EquipoOperativo;
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
  obtenerOCrear(semana: string, equipo: EquipoOperativo): Promise<PlanSemanalEnBorrador>;
  buscarPorId(id: string): Promise<PlanSemanalEnBorrador | undefined>;
  guardarCelda(celda: CeldaDePlanSemanalEnBorrador): Promise<void>;
  guardarCeldas(celdas: CeldaDePlanSemanalEnBorrador[]): Promise<void>;
  reemplazarCeldasDelPlan(planId: string, celdas: CeldaDePlanSemanalEnBorrador[]): Promise<void>;
  borrarCelda(planId: string, idHuellero: string, fecha: string): Promise<void>;
  colaboradorPerteneceAEquipo(idHuellero: string, equipo: EquipoOperativo): Promise<boolean>;
  obtenerSedeDelColaborador(idHuellero: string): Promise<string | undefined>;
  buscarPublicado(idHuellero: string, fecha: string): Promise<HorarioSemanalParaCopiar | undefined>;
  listarHorariosPublicadosDelEquipoEnSemana(semana: string, equipo: EquipoOperativo): Promise<HorarioSemanalParaCopiar[]>;
  asistenciaEstaProcesada?(idHuellero: string, fecha: string): Promise<boolean>;
}
