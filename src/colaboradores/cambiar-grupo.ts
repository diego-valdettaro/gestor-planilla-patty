import type { Actor, Colaborador, RepositorioDeColaboradores } from "./registrar-colaborador";
import { verificarPermiso } from "./registrar-colaborador";

export interface RepositorioParaCambiarGrupo extends RepositorioDeColaboradores {
  tieneBorradorAbiertoEnGrupo(idHuellero: string, grupo: string): Promise<boolean>;
}

export async function cambiarGrupoDeColaborador(
  repositorio: RepositorioParaCambiarGrupo,
  actor: Actor,
  idHuellero: string,
  grupoNuevo: string,
): Promise<void> {
  verificarPermiso(actor);

  const normalizado = grupoNuevo.trim();
  if (!normalizado) throw new Error("El grupo operativo es obligatorio.");

  const colaborador: Colaborador | undefined = await repositorio.buscarPorIdHuellero(idHuellero);
  if (!colaborador) throw new Error("No existe un colaborador con ese ID de huellero.");

  if (colaborador.grupo === normalizado) return;

  if (await repositorio.tieneBorradorAbiertoEnGrupo(idHuellero, colaborador.grupo)) {
    throw new Error("No se puede cambiar de grupo: el colaborador tiene un plan semanal en borrador en su grupo actual.");
  }

  await repositorio.actualizar({ ...colaborador, grupo: normalizado });
}
