import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import {
  importarAsistencias,
  prevalidarImportacion,
  type RepositorioDeImportaciones,
  type SolicitudDeImportacion,
  type SolicitudDePrevalidacion,
} from "./importar-semana-por-sede";

export function crearCasosDeUsoDeImportaciones(
  repositorio: RepositorioDeImportaciones,
  sesion: SesionDelServidor,
) {
  return {
    async prevalidar(solicitud: SolicitudDePrevalidacion) {
      return prevalidarImportacion(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
    async importar(solicitud: SolicitudDeImportacion) {
      return importarAsistencias(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
  };
}
