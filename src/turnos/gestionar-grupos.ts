import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeConfigurarGlobalmente } from "@/autenticacion/permisos";

export interface RepositorioDeGrupos {
  crear(nombre: string): Promise<void>;
  actualizarGestionDeAsistencia(nombre: string, gestionaAsistencia: boolean): Promise<void>;
}

export class GrupoDuplicadoError extends Error {
  constructor() {
    super("Ya existe un grupo con ese nombre.");
  }
}

export async function crearGrupo(repositorio: RepositorioDeGrupos, actor: Actor, nombre: string): Promise<void> {
  exigir(puedeConfigurarGlobalmente(actor), "No tiene permiso para cambiar la configuracion.");
  const normalizado = nombre.trim();
  if (!normalizado) throw new Error("El nombre del grupo es obligatorio.");
  await repositorio.crear(normalizado);
}

export async function configurarGestionDeAsistenciaDelGrupo(
  repositorio: RepositorioDeGrupos,
  actor: Actor,
  nombre: string,
  gestionaAsistencia: boolean,
): Promise<void> {
  exigir(puedeConfigurarGlobalmente(actor), "No tiene permiso para cambiar la configuracion.");
  await repositorio.actualizarGestionDeAsistencia(nombre, gestionaAsistencia);
}
