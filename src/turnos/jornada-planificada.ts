import type { ModeloDeHorario } from "./gestionar-modelos-de-horario";

export const MOTIVOS_PLANIFICADOS_DE_NO_ASISTENCIA = [
  "descanso",
  "feriado",
  "vacaciones",
  "permiso",
  "suspension",
] as const;

export type MotivoPlanificadoDeNoAsistencia = typeof MOTIVOS_PLANIFICADOS_DE_NO_ASISTENCIA[number];

export interface DatosDeJornadaPlanificada {
  sede: string | null;
  modeloHorarioId?: string | null;
  entradaProgramada: string | null;
  salidaProgramada: string | null;
  motivoNoAsistencia?: MotivoPlanificadoDeNoAsistencia | null;
  /** Compatibilidad temporal con consumidores que todavía distinguen descanso con un booleano. */
  descanso?: boolean;
}

export interface RepositorioParaValidarJornadaPlanificada {
  sedeActivaPerteneceAlGrupo(sede: string, grupo: string): Promise<boolean>;
  buscarModeloDeHorario(id: string): Promise<ModeloDeHorario | undefined>;
}

export async function validarJornadaPlanificada(
  repositorio: RepositorioParaValidarJornadaPlanificada,
  grupo: string,
  jornada: DatosDeJornadaPlanificada,
): Promise<void> {
  if (jornada.motivoNoAsistencia && !esMotivoPlanificadoDeNoAsistencia(jornada.motivoNoAsistencia)) {
    throw new Error("El motivo planificado de no asistencia no es válido.");
  }
  const motivo = motivoPlanificadoDe(jornada);
  if (motivo) {
    if (jornada.sede !== null || jornada.modeloHorarioId != null || jornada.entradaProgramada !== null || jornada.salidaProgramada !== null) {
      throw new Error("Una no asistencia planificada no tiene sede, modelo ni horas.");
    }
    return;
  }

  if (!jornada.sede?.trim()) throw new Error("La sede es obligatoria para una jornada laboral.");
  if (!(await repositorio.sedeActivaPerteneceAlGrupo(jornada.sede, grupo))) {
    throw new Error("La sede debe estar activa y pertenecer al grupo del colaborador.");
  }
  if (!esHorarioValido(jornada.entradaProgramada, jornada.salidaProgramada)) {
    throw new Error("Las horas programadas no son válidas.");
  }
  if (!jornada.modeloHorarioId) return;

  const modelo = await repositorio.buscarModeloDeHorario(jornada.modeloHorarioId);
  if (!modelo) throw new Error("El modelo de horario no existe.");
  if (!modelo.activo) throw new Error("El modelo de horario seleccionado no está activo.");
  if (modelo.sede !== jornada.sede) throw new Error("El modelo de horario no corresponde a la sede elegida.");
  if (modelo.entrada !== jornada.entradaProgramada || modelo.salida !== jornada.salidaProgramada) {
    throw new Error("Las horas programadas no corresponden al modelo de horario.");
  }
}

export function motivoPlanificadoDe(jornada: DatosDeJornadaPlanificada): MotivoPlanificadoDeNoAsistencia | null {
  if (jornada.motivoNoAsistencia && esMotivoPlanificadoDeNoAsistencia(jornada.motivoNoAsistencia)) return jornada.motivoNoAsistencia;
  return jornada.descanso ? "descanso" : null;
}

export function jornadasPlanificadasSonIguales(
  a: DatosDeJornadaPlanificada,
  b: DatosDeJornadaPlanificada,
): boolean {
  return a.sede === b.sede
    && (a.modeloHorarioId ?? null) === (b.modeloHorarioId ?? null)
    && a.entradaProgramada === b.entradaProgramada
    && a.salidaProgramada === b.salidaProgramada
    && motivoPlanificadoDe(a) === motivoPlanificadoDe(b);
}

export function esMotivoPlanificadoDeNoAsistencia(valor: string): valor is MotivoPlanificadoDeNoAsistencia {
  return MOTIVOS_PLANIFICADOS_DE_NO_ASISTENCIA.some((motivo) => motivo === valor);
}

function esHorarioValido(entrada: string | null, salida: string | null): boolean {
  return Boolean(entrada && salida && /^([01]\d|2[0-3]):[0-5]\d$/.test(entrada)
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(salida) && salida > entrada);
}
