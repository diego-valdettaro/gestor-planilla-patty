export type Rol = "operaciones" | "administracion" | "finanzas";

export interface Actor {
  id: string;
  rol: Rol;
  nombreUsuario?: string;
}

export interface Colaborador {
  dni: string;
  nombre: string;
  sede: string;
  grupo: string;
  activo: boolean;
}

export interface RepositorioDeColaboradores {
  buscarPorDni(dni: string): Promise<Colaborador | undefined>;
  guardar(colaborador: Colaborador): Promise<void>;
  actualizar(colaborador: Colaborador): Promise<void>;
}

export async function registrarColaborador(
  repositorio: RepositorioDeColaboradores,
  actor: Actor,
  colaborador: Colaborador,
): Promise<void> {
  verificarPermiso(actor);
  validarDni(colaborador.dni);

  if (await repositorio.buscarPorDni(colaborador.dni)) {
    throw new Error("El DNI ya pertenece a un colaborador.");
  }

  await repositorio.guardar(colaborador);
}

export async function consultarColaborador(
  repositorio: RepositorioDeColaboradores,
  actor: Actor,
  dni: string,
): Promise<Colaborador | undefined> {
  verificarPermiso(actor);

  return repositorio.buscarPorDni(dni);
}

export async function actualizarColaborador(
  repositorio: RepositorioDeColaboradores,
  actor: Actor,
  colaborador: Colaborador,
): Promise<void> {
  verificarPermiso(actor);

  if (!(await repositorio.buscarPorDni(colaborador.dni))) {
    throw new Error("No existe un colaborador con ese DNI.");
  }

  await repositorio.actualizar(colaborador);
}

export const LONGITUD_DNI = 8;
const FORMATO_DNI = new RegExp(`^[0-9]{${LONGITUD_DNI}}$`);

export function validarDni(dni: string): void {
  if (!dni.trim()) throw new Error("El DNI es obligatorio.");
  if (!FORMATO_DNI.test(dni)) throw new Error(`El DNI debe tener exactamente ${LONGITUD_DNI} dígitos.`);
}

export function verificarPermiso(actor: Actor): void {
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") {
    throw new Error("No tiene permiso para administrar colaboradores.");
  }
}
