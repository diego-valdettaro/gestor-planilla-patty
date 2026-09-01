import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import {
  importarSemanaPorSede,
  type RepositorioDeImportaciones,
  type SolicitudDeImportacion,
} from "./importar-semana-por-sede";

export function crearCasosDeUsoDeImportaciones(
  repositorio: RepositorioDeImportaciones,
  sesion: SesionDelServidor,
) {
  return {
    async importar(solicitud: SolicitudDeImportacion): Promise<void> {
      await importarSemanaPorSede(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
  };
}
