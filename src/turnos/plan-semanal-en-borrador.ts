import type { EquipoOperativo } from "./configurar-equipos-operativos";

export interface CeldaDePlanSemanalEnBorrador {
  planId: string;
  idHuellero: string;
  fecha: string;
  sede: string;
  entradaProgramada: string;
  salidaProgramada: string;
  minutosDeAlmuerzo: number;
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
  entradaProgramada: string;
  salidaProgramada: string;
  minutosDeAlmuerzo: number;
  descanso: boolean;
}

export interface RepositorioDePlanesSemanales {
  obtenerOCrear(semana: string, equipo: EquipoOperativo): Promise<PlanSemanalEnBorrador>;
  buscarPorId(id: string): Promise<PlanSemanalEnBorrador | undefined>;
  guardarCelda(celda: CeldaDePlanSemanalEnBorrador): Promise<void>;
  guardarCeldas(celdas: CeldaDePlanSemanalEnBorrador[]): Promise<void>;
  borrarCelda(planId: string, idHuellero: string, fecha: string): Promise<void>;
  colaboradorPerteneceAEquipo(idHuellero: string, equipo: EquipoOperativo): Promise<boolean>;
  listarHorariosPublicadosDelEquipoEnSemana(semana: string, equipo: EquipoOperativo): Promise<HorarioSemanalParaCopiar[]>;
}
