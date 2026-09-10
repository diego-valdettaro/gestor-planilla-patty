import type { Actor } from "@/colaboradores/registrar-colaborador";

export type Grupo = string;

export interface RepositorioDeGruposDeSedes {
  asignar(sede: string, grupo: Grupo): Promise<void>;
}

export async function asignarGrupoASede(
  repositorio: RepositorioDeGruposDeSedes,
  actor: Actor,
  sede: string,
  grupo: Grupo,
): Promise<void> {
  if (actor.rol !== "administracion") throw new Error("No tiene permiso para cambiar la configuración.");
  await repositorio.asignar(sede, grupo);
}
