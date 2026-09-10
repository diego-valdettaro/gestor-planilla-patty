import type { Actor } from "@/colaboradores/registrar-colaborador";

export interface RepositorioDeGrupos {
  crear(nombre: string): Promise<void>;
}

export class GrupoDuplicadoError extends Error {
  constructor() {
    super("Ya existe un grupo con ese nombre.");
  }
}

export async function crearGrupo(repositorio: RepositorioDeGrupos, actor: Actor, nombre: string): Promise<void> {
  if (actor.rol !== "administracion") throw new Error("No tiene permiso para cambiar la configuracion.");
  const normalizado = nombre.trim();
  if (!normalizado) throw new Error("El nombre del grupo es obligatorio.");
  await repositorio.crear(normalizado);
}
