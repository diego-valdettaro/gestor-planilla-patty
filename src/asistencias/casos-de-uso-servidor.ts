import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import {
  ajustarAsistencia,
  confirmarAsistencia,
  type RepositorioDeAsistencias,
  type SolicitudDeAjuste,
  type SolicitudDeConfirmacion,
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
  };
}
