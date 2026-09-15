import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import {
  aplicarImportacion,
  previsualizarImportacion,
  type RepositorioDeImportaciones,
  type SolicitudDeAplicacion,
  type SolicitudDePrevalidacion,
} from "./importar-semana-por-sede";

export function crearCasosDeUsoDeImportaciones(
  repositorio: RepositorioDeImportaciones,
  sesion: SesionDelServidor,
) {
  return {
    async previsualizar(solicitud: SolicitudDePrevalidacion) {
      return previsualizarImportacion(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
    async aplicar(solicitud: SolicitudDeAplicacion) {
      return aplicarImportacion(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
  };
}
