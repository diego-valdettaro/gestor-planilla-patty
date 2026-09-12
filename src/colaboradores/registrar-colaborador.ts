export type Rol = "operaciones" | "administracion" | "finanzas";

export interface Actor {
  id: string;
  rol: Rol;
  nombreUsuario?: string;
}

export interface Colaborador {
  idHuellero: string;
  nombre: string;
  sede: string;
  grupo: string;
  activo: boolean;
}

export interface RepositorioDeColaboradores {
  buscarPorIdHuellero(idHuellero: string): Promise<Colaborador | undefined>;
  guardar(colaborador: Colaborador): Promise<void>;
  actualizar(colaborador: Colaborador): Promise<void>;
}

export async function registrarColaborador(
  repositorio: RepositorioDeColaboradores,
  actor: Actor,
  colaborador: Colaborador,
): Promise<void> {
  verificarPermiso(actor);

  if (await repositorio.buscarPorIdHuellero(colaborador.idHuellero)) {
    throw new Error("El ID de huellero ya pertenece a un colaborador.");
  }

  await repositorio.guardar(colaborador);
}

export async function consultarColaborador(
  repositorio: RepositorioDeColaboradores,
  actor: Actor,
  idHuellero: string,
): Promise<Colaborador | undefined> {
  verificarPermiso(actor);

  return repositorio.buscarPorIdHuellero(idHuellero);
}

export async function actualizarColaborador(
  repositorio: RepositorioDeColaboradores,
  actor: Actor,
  colaborador: Colaborador,
): Promise<void> {
  verificarPermiso(actor);

  if (!(await repositorio.buscarPorIdHuellero(colaborador.idHuellero))) {
    throw new Error("No existe un colaborador con ese ID de huellero.");
  }

  await repositorio.actualizar(colaborador);
}

export function verificarPermiso(actor: Actor): void {
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") {
    throw new Error("No tiene permiso para administrar colaboradores.");
  }
}
