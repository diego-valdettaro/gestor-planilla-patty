import type { Actor } from "@/colaboradores/registrar-colaborador";

export interface InstantaneaDeTurno {
  sede: string;
  entradaProgramada: string;
  salidaProgramada: string;
  minutosDeAlmuerzo: number;
  descanso: boolean;
}

export interface TurnoParaConfirmar extends InstantaneaDeTurno {
  idHuellero: string;
  fecha: string;
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
}

export interface SolicitudDeConfirmacion {
  idHuellero: string;
  fecha: string;
  entradaReal: string;
  salidaReal: string;
}

export interface SolicitudDeAjuste extends SolicitudDeConfirmacion {
  motivo: string;
}

export interface AjusteDeAsistencia extends SolicitudDeAjuste {
  minutosTrabajados: number;
}

export interface RepositorioDeAsistencias {
  buscarTurnoPublicado(idHuellero: string, fecha: string): Promise<TurnoParaConfirmar | undefined>;
  confirmar(asistencia: AsistenciaConfirmada): Promise<void>;
  ajustar(solicitud: AjusteDeAsistencia, responsableId: string): Promise<void>;
}

export async function confirmarAsistencia(
  repositorio: RepositorioDeAsistencias,
  actor: Actor,
  solicitud: SolicitudDeConfirmacion,
): Promise<void> {
  autorizarRevision(actor);
  const turno = await repositorio.buscarTurnoPublicado(solicitud.idHuellero, solicitud.fecha);
  if (!turno) throw new Error("No existe un turno publicado para confirmar esta asistencia.");
  await repositorio.confirmar({
    ...solicitud,
    minutosTrabajados: calcularMinutosTrabajados(solicitud.entradaReal, solicitud.salidaReal),
    instantaneaDeTurno: {
      sede: turno.sede,
      entradaProgramada: turno.entradaProgramada,
      salidaProgramada: turno.salidaProgramada,
      minutosDeAlmuerzo: turno.minutosDeAlmuerzo,
      descanso: turno.descanso,
    },
    confirmadoPorId: actor.id,
    confirmadoEn: new Date(),
  });
}

export async function ajustarAsistencia(
  repositorio: RepositorioDeAsistencias,
  actor: Actor,
  solicitud: SolicitudDeAjuste,
): Promise<void> {
  autorizarRevision(actor);
  if (!solicitud.motivo.trim()) throw new Error("El ajuste de asistencia requiere un motivo.");
  await repositorio.ajustar({
    ...solicitud,
    motivo: solicitud.motivo.trim(),
    minutosTrabajados: calcularMinutosTrabajados(solicitud.entradaReal, solicitud.salidaReal),
  }, actor.id);
}

function calcularMinutosTrabajados(entradaReal: string, salidaReal: string): number {
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
