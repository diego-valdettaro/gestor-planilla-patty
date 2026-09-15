import type { Actor } from "@/colaboradores/registrar-colaborador";
import { calcularTardanza, type PoliticaDePenalizacionPorTardanzas, type TardanzaCalculada } from "@/tardanzas/politica-de-penalizacion";

import { calcularHoraExtra, type EstadoDeHoraExtra, type HoraExtraCalculada } from "./calcular-hora-extra";
import { nombreDelMotivoPlanificado, type MotivoPlanificadoDeNoAsistencia, type TipoDeEstadoManualRegistrable } from "./estado-manual";

export type { TipoDeEstadoManual } from "./estado-manual";

export interface InstantaneaDeTurno {
  sede: string;
  entradaProgramada: string | null;
  salidaProgramada: string | null;
  descanso: boolean;
}

export interface TurnoParaConfirmar {
  idHuellero: string;
  fecha: string;
  sede: string | null;
  entradaProgramada: string | null;
  salidaProgramada: string | null;
  descanso: boolean;
  motivoNoAsistencia: MotivoPlanificadoDeNoAsistencia | null;
}

export interface AsistenciaConfirmada {
  idHuellero: string;
  fecha: string;
  entradaReal: string;
  salidaReal: string;
  minutosTrabajados: number;
  instantaneaDeTurno: InstantaneaDeTurno;
  confirmadoPorId: string;
  confirmadoEn: Date;
  tardanza?: TardanzaCalculada;
  horaExtra?: HoraExtraCalculada;
}

export interface SolicitudDeConfirmacion {
  idHuellero: string;
  fecha: string;
  sede: string;
  entradaReal: string;
  salidaReal: string;
}

export interface SolicitudDeAjuste {
  idHuellero: string;
  fecha: string;
  entradaReal: string;
  salidaReal: string;
  motivo: string;
}

export interface SolicitudDeEstadoManual {
  idHuellero: string;
  fecha: string;
  tipo: TipoDeEstadoManualRegistrable;
  comentario: string;
}

export interface EstadoManual extends SolicitudDeEstadoManual {
  responsableId: string;
  registradoEn: Date;
}

export interface AjusteDeAsistencia extends SolicitudDeAjuste {
  minutosTrabajados: number;
}

export interface RepositorioDeAsistencias {
  buscarTurnoPublicado(idHuellero: string, fecha: string): Promise<TurnoParaConfirmar | undefined>;
  confirmar(asistencia: AsistenciaConfirmada): Promise<void>;
  buscarInstantaneaDeTurno(idHuellero: string, fecha: string): Promise<InstantaneaDeTurno | undefined>;
  ajustar(solicitud: AjusteDeAsistencia, responsableId: string, horaExtra: HoraExtraCalculada | undefined): Promise<void>;
  decidirHoraExtra(idHuellero: string, fecha: string, estado: EstadoDeHoraExtra, responsableId: string): Promise<void>;
  registrarEstadoManual(estadoManual: EstadoManual): Promise<void>;
  buscarPoliticaVigente(sede: string, fecha: string): Promise<PoliticaDePenalizacionPorTardanzas | undefined>;
  contarTardanzas(idHuellero: string, inicio: string, fin: string): Promise<number>;
}

export interface SolicitudDeDecisionDeHoraExtra {
  idHuellero: string;
  fecha: string;
}

export async function confirmarAsistencia(
  repositorio: RepositorioDeAsistencias,
  actor: Actor,
  solicitud: SolicitudDeConfirmacion,
): Promise<void> {
  autorizarRevision(actor);
  const turno = await repositorio.buscarTurnoPublicado(solicitud.idHuellero, solicitud.fecha);
  if (!turno) throw new Error("No existe un turno publicado para confirmar esta asistencia.");
  if (turno.motivoNoAsistencia || turno.descanso) {
    throw new Error(`El horario semanal tiene ${nombreDelMotivoPlanificado(turno.motivoNoAsistencia ?? "descanso")} planificado. Corrija y republique el horario antes de registrar la asistencia.`);
  }
  if (!turno.sede || !turno.entradaProgramada || !turno.salidaProgramada) throw new Error("La jornada laboral publicada está incompleta.");
  if (solicitud.sede !== turno.sede) {
    throw new Error(`La sede registrada no coincide con la sede planificada (${turno.sede}). Corrija y republique el horario semanal.`);
  }
  const tardanza = await calcularTardanza(repositorio, {
    idHuellero: solicitud.idHuellero, sede: turno.sede, fecha: solicitud.fecha,
    entradaProgramada: turno.entradaProgramada, entradaReal: solicitud.entradaReal,
  });
  await repositorio.confirmar({
    ...solicitud,
    minutosTrabajados: calcularMinutosTrabajados(solicitud.entradaReal, solicitud.salidaReal),
    instantaneaDeTurno: {
      sede: turno.sede,
      entradaProgramada: turno.entradaProgramada,
      salidaProgramada: turno.salidaProgramada,
      descanso: turno.descanso,
    },
    confirmadoPorId: actor.id,
    confirmadoEn: new Date(),
    tardanza,
    horaExtra: calcularHoraExtra(turno.salidaProgramada, solicitud.salidaReal),
  });
}

export async function ajustarAsistencia(
  repositorio: RepositorioDeAsistencias,
  actor: Actor,
  solicitud: SolicitudDeAjuste,
): Promise<void> {
  autorizarRevision(actor);
  if (!solicitud.motivo.trim()) throw new Error("El ajuste de asistencia requiere un motivo.");
  const instantaneaDeTurno = await repositorio.buscarInstantaneaDeTurno(solicitud.idHuellero, solicitud.fecha);
  if (!instantaneaDeTurno) throw new Error("La asistencia debe estar confirmada para ajustarla.");
  if (instantaneaDeTurno.descanso || !instantaneaDeTurno.salidaProgramada) throw new Error("Un descanso no puede ajustarse como asistencia.");
  await repositorio.ajustar({
    ...solicitud,
    motivo: solicitud.motivo.trim(),
    minutosTrabajados: calcularMinutosTrabajados(solicitud.entradaReal, solicitud.salidaReal),
  }, actor.id, calcularHoraExtra(instantaneaDeTurno.salidaProgramada, solicitud.salidaReal));
}

export async function aprobarHoraExtra(
  repositorio: RepositorioDeAsistencias,
  actor: Actor,
  solicitud: SolicitudDeDecisionDeHoraExtra,
): Promise<void> {
  autorizarFinanzas(actor);
  await repositorio.decidirHoraExtra(solicitud.idHuellero, solicitud.fecha, "aprobada", actor.id);
}

export async function rechazarHoraExtra(
  repositorio: RepositorioDeAsistencias,
  actor: Actor,
  solicitud: SolicitudDeDecisionDeHoraExtra,
): Promise<void> {
  autorizarFinanzas(actor);
  await repositorio.decidirHoraExtra(solicitud.idHuellero, solicitud.fecha, "rechazada", actor.id);
}

export async function registrarEstadoManual(
  repositorio: RepositorioDeAsistencias,
  actor: Actor,
  solicitud: SolicitudDeEstadoManual,
): Promise<void> {
  autorizarRevision(actor);
  const comentario = solicitud.comentario.trim();
  if (!comentario) throw new Error("El estado manual requiere un comentario.");
  const turno = await repositorio.buscarTurnoPublicado(solicitud.idHuellero, solicitud.fecha);
  if (!turno) throw new Error("No existe un turno publicado para registrar este resultado.");
  if (turno.motivoNoAsistencia || turno.descanso) {
    throw new Error(`El horario semanal tiene ${nombreDelMotivoPlanificado(turno.motivoNoAsistencia ?? "descanso")} planificado. No puede reemplazarse con otro estado manual.`);
  }
  await repositorio.registrarEstadoManual({ ...solicitud, comentario, responsableId: actor.id, registradoEn: new Date() });
}

export function calcularMinutosTrabajados(entradaReal: string, salidaReal: string): number {
  const minutos = (new Date(salidaReal).getTime() - new Date(entradaReal).getTime()) / 60_000;
  if (!Number.isInteger(minutos) || minutos < 0) {
    throw new Error("La salida real debe ser posterior a la entrada real.");
  }
  return minutos;
}

function autorizarRevision(actor: Actor): void {
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") {
    throw new Error("No tiene permiso para revisar asistencias.");
  }
}

function autorizarFinanzas(actor: Actor): void {
  if (actor.rol !== "finanzas") throw new Error("No tiene permiso para decidir horas extra.");
}
