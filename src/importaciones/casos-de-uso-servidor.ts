import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import {
  importarSemanaPorSede,
  type ResultadoDeImportacion,
  type RepositorioDeImportaciones,
  type SolicitudDeImportacion,
} from "./importar-semana-por-sede";

export function crearCasosDeUsoDeImportaciones(
  repositorio: RepositorioDeImportaciones,
  sesion: SesionDelServidor,
) {
  return {
    async importar(solicitud: SolicitudDeImportacion): Promise<ResultadoDeImportacion> {
      return importarSemanaPorSede(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
  };
}
