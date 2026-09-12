import type { Actor, Colaborador } from "./registrar-colaborador";
import {
  actualizarColaborador,
  consultarColaborador,
  registrarColaborador,
} from "./registrar-colaborador";
import type { RepositorioParaCambiarGrupo } from "./cambiar-grupo";
import { cambiarGrupoDeColaborador } from "./cambiar-grupo";

export interface SesionDelServidor {
  obtenerActorActual(): Promise<Actor>;
}

export function crearCasosDeUsoDeColaboradores(
  repositorio: RepositorioParaCambiarGrupo,
  sesion: SesionDelServidor,
) {
  return {
    async registrar(colaborador: Colaborador): Promise<void> {
      await registrarColaborador(
        repositorio,
        await sesion.obtenerActorActual(),
        colaborador,
      );
    },
    async consultar(idHuellero: string): Promise<Colaborador | undefined> {
      return consultarColaborador(
        repositorio,
        await sesion.obtenerActorActual(),
        idHuellero,
      );
    },
    async actualizar(colaborador: Colaborador): Promise<void> {
      await actualizarColaborador(
        repositorio,
        await sesion.obtenerActorActual(),
        colaborador,
      );
    },
    async cambiarGrupo(idHuellero: string, grupoNuevo: string): Promise<void> {
      await cambiarGrupoDeColaborador(
        repositorio,
        await sesion.obtenerActorActual(),
        idHuellero,
        grupoNuevo,
      );
    },
  };
}
