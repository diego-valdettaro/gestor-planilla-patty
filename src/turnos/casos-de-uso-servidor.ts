import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";
import { publicarTurnoSemanal } from "./publicar-turno-semanal";

export function crearCasosDeUsoDeTurnos(
  repositorio: RepositorioDeTurnos,
  sesion: SesionDelServidor,
) {
  return {
    async publicar(turno: TurnoPublicado): Promise<void> {
      await publicarTurnoSemanal(
        repositorio,
        await sesion.obtenerActorActual(),
        turno,
      );
    },
  };
}
