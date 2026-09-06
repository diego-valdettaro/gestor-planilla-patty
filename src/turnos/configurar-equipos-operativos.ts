import type { Actor } from "@/colaboradores/registrar-colaborador";

export type EquipoOperativo = "tiendas" | "taller";

export interface RepositorioDeEquiposOperativos {
  asignar(sede: string, equipo: EquipoOperativo): Promise<void>;
}

export async function asignarEquipoOperativo(
  repositorio: RepositorioDeEquiposOperativos,
  actor: Actor,
  sede: string,
  equipo: EquipoOperativo,
): Promise<void> {
  if (actor.rol !== "administracion") throw new Error("No tiene permiso para cambiar la configuración.");
  await repositorio.asignar(sede, equipo);
}
