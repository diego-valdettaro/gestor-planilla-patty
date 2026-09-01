import type {
  Actor,
  Colaborador,
  RepositorioDeColaboradores,
} from "./registrar-colaborador";
import {
  actualizarColaborador,
  consultarColaborador,
  registrarColaborador,
} from "./registrar-colaborador";

export interface SesionDelServidor {
  obtenerActorActual(): Promise<Actor>;
}

export function crearCasosDeUsoDeColaboradores(
  repositorio: RepositorioDeColaboradores,
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
  };
}
