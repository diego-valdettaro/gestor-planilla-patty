import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeConfigurarGlobalmente } from "@/autenticacion/permisos";

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
  exigir(puedeConfigurarGlobalmente(actor), "No tiene permiso para cambiar la configuración.");
  await repositorio.asignar(sede, grupo);
}
