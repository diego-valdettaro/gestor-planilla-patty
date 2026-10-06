// Reglas puras de descanso semanal, feriados y descanso sustitutorio (ADR 0009). Describen hechos del día;
// la valoración monetaria del trabajo en descanso o feriado la hace Pagos.
import type { TipoDeEstadoManual } from "@/asistencias/estado-manual";

export type ClaseDeFeriado = "feriado" | "primero_de_mayo";
export type OrigenDeSustitutorio = "descanso_semanal" | ClaseDeFeriado;
export type EstadoDeSustitutorio = "previsto" | "otorgado" | "no_otorgado";

export interface Feriado {
  fecha: string;
  nombre: string;
  clase: ClaseDeFeriado;
}

/** Descanso semanal asignado desde `vigenteDesde`; `diaDeLaSemana` es ISO: 1 = lunes … 7 = domingo. */
export interface DescansoSemanalAsignado {
  dni: string;
  diaDeLaSemana: number;
  vigenteDesde: string;
}

export interface AsistenciaDelDia {
  estado: "pendiente" | "confirmada" | "manual";
  minutosTrabajados: number | null;
  /** Tipo del último estado manual registrado; solo cuando `estado` es «manual». */
  tipoManual: TipoDeEstadoManual | null;
}

export interface SustitutorioDelDia {
  id: string;
  estado: EstadoDeSustitutorio;
  fechaPrevista: string;
}

/** Lo que pasó en un día de descanso o feriado: una jornada trabajada se distingue de un estado manual. */
export type SituacionDelDia =
  | { tipo: "jornada_trabajada"; minutosTrabajados: number | null }
  | { tipo: "estado_manual"; estado: TipoDeEstadoManual }
  | { tipo: "sin_resolver" };

export interface DiaDeDescansoOFeriado {
  fecha: string;
  descansoSemanal: boolean;
  feriado: { clase: ClaseDeFeriado; nombre: string } | null;
  situacion: SituacionDelDia;
  sustitutorio: SustitutorioDelDia | null;
}

export function diaDeLaSemana(fecha: string): number {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
  return dia === 0 ? 7 : dia;
}

/** El 1 de mayo es un feriado con regla propia; la clase se deriva de la fecha y no la elige quien registra. */
export function claseDeFeriado(fecha: string): ClaseDeFeriado {
  return fecha.slice(5) === "05-01" ? "primero_de_mayo" : "feriado";
}

/** Descanso semanal vigente en una fecha, o null si aún no se asignó uno: nunca se asume el domingo. */
export function descansoSemanalVigente(asignaciones: DescansoSemanalAsignado[], fecha: string): DescansoSemanalAsignado | null {
  let vigente: DescansoSemanalAsignado | null = null;
  for (const asignacion of asignaciones) {
    if (asignacion.vigenteDesde > fecha) continue;
    if (!vigente || asignacion.vigenteDesde > vigente.vigenteDesde) vigente = asignacion;
  }
  return vigente;
}

export function esDescansoSemanal(asignaciones: DescansoSemanalAsignado[], fecha: string): boolean {
  return descansoSemanalVigente(asignaciones, fecha)?.diaDeLaSemana === diaDeLaSemana(fecha);
}

export function situacionDelDia(asistencia: AsistenciaDelDia | null): SituacionDelDia {
  if (asistencia?.estado === "confirmada") return { tipo: "jornada_trabajada", minutosTrabajados: asistencia.minutosTrabajados };
  if (asistencia?.estado === "manual" && asistencia.tipoManual) return { tipo: "estado_manual", estado: asistencia.tipoManual };
  return { tipo: "sin_resolver" };
}

/** Clasifica una fecha para una persona; devuelve null si no es feriado ni su descanso semanal asignado. */
export function clasificarDia(entrada: {
  fecha: string;
  asignaciones: DescansoSemanalAsignado[];
  feriado: Feriado | null;
  asistencia: AsistenciaDelDia | null;
  sustitutorio: SustitutorioDelDia | null;
}): DiaDeDescansoOFeriado | null {
  const descansoSemanal = esDescansoSemanal(entrada.asignaciones, entrada.fecha);
  if (!descansoSemanal && !entrada.feriado) return null;
  return {
    fecha: entrada.fecha,
    descansoSemanal,
    feriado: entrada.feriado ? { clase: entrada.feriado.clase, nombre: entrada.feriado.nombre } : null,
    situacion: situacionDelDia(entrada.asistencia),
    sustitutorio: entrada.sustitutorio,
  };
}

/** Origen de un sustitutorio: el feriado manda sobre el descanso semanal cuando coinciden (el 1 de mayo es el más específico). */
export function origenDeSustitutorio(entrada: { fecha: string; asignaciones: DescansoSemanalAsignado[]; feriado: Feriado | null }): OrigenDeSustitutorio | null {
  if (entrada.feriado) return entrada.feriado.clase;
  return esDescansoSemanal(entrada.asignaciones, entrada.fecha) ? "descanso_semanal" : null;
}
