import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import {
  ajustarAsistencia,
  aprobarHoraExtra,
  confirmarAsistencia,
  rechazarHoraExtra,
  registrarEstadoManual,
  type RepositorioDeAsistencias,
  type SolicitudDeAjuste,
  type SolicitudDeConfirmacion,
  type SolicitudDeDecisionDeHoraExtra,
  type SolicitudDeEstadoManual,
} from "./confirmar-y-ajustar-asistencia";

export function crearCasosDeUsoDeAsistencias(
  repositorio: RepositorioDeAsistencias,
  sesion: SesionDelServidor,
) {
  return {
    async confirmar(solicitud: SolicitudDeConfirmacion): Promise<void> {
      await confirmarAsistencia(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
    async ajustar(solicitud: SolicitudDeAjuste): Promise<void> {
      await ajustarAsistencia(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
    async aprobarHoraExtra(solicitud: SolicitudDeDecisionDeHoraExtra): Promise<void> {
      await aprobarHoraExtra(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
    async rechazarHoraExtra(solicitud: SolicitudDeDecisionDeHoraExtra): Promise<void> {
      await rechazarHoraExtra(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
    async registrarEstadoManual(solicitud: SolicitudDeEstadoManual): Promise<void> {
      await registrarEstadoManual(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
  };
}
