import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeAdministrarPersonalDelGrupo, puedeConfigurarGlobalmente } from "@/autenticacion/permisos";

export type { Actor, Rol } from "@/autenticacion/permisos";

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
  verificarPermisoSobreGrupo(actor, colaborador.grupo);
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
  const colaborador = await repositorio.buscarPorDni(dni);
  if (colaborador) verificarPermisoSobreGrupo(actor, colaborador.grupo);
  else verificarPermiso(actor);

  return colaborador;
}

export async function actualizarColaborador(
  repositorio: RepositorioDeColaboradores,
  actor: Actor,
  colaborador: Colaborador,
): Promise<void> {
  verificarPermiso(actor);
  const existente = await repositorio.buscarPorDni(colaborador.dni);
  if (!existente) {
    throw new Error("No existe un colaborador con ese DNI.");
  }
  verificarPermisoSobreGrupo(actor, existente.grupo);
  if (colaborador.grupo !== existente.grupo) {
    exigir(puedeConfigurarGlobalmente(actor), "Solo el Administrador del sistema puede cambiar el grupo de un colaborador.");
  }
  if (colaborador.activo !== existente.activo) {
    exigir(puedeConfigurarGlobalmente(actor), "Solo el Administrador del sistema puede activar o desactivar colaboradores.");
  }

  await repositorio.actualizar(colaborador);
}

export const LONGITUD_DNI = 8;
const FORMATO_DNI = new RegExp(`^[0-9]{${LONGITUD_DNI}}$`);

export function validarDni(dni: string): void {
  if (!dni.trim()) throw new Error("El DNI es obligatorio.");
  if (!FORMATO_DNI.test(dni)) throw new Error(`El DNI debe tener exactamente ${LONGITUD_DNI} dígitos.`);
}

/** Rol que puede administrar personal de algún grupo (Administrador o gerente de área con grupos). */
export function verificarPermiso(actor: Actor): void {
  exigir(
    actor.rol === "administrador" || (actor.rol === "gerente_de_area" && (actor.grupos?.length ?? 0) > 0),
    "No tiene permiso para administrar colaboradores.",
  );
}

export function verificarPermisoSobreGrupo(actor: Actor, grupo: string): void {
  exigir(puedeAdministrarPersonalDelGrupo(actor, grupo), "No tiene permiso para administrar colaboradores de este grupo.");
}

export function verificarPermisoDeConfiguracionGlobal(actor: Actor): void {
  exigir(puedeConfigurarGlobalmente(actor), "No tiene permiso para cambiar la configuración.");
}
