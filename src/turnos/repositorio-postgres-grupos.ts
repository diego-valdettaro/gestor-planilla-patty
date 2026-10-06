import { asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import type { Actor } from "@/autenticacion/permisos";
import { puedeOperarAsistenciaDelGrupo, puedeConsultarAsistencias } from "@/autenticacion/permisos";
import { grupos } from "@/db/schema";

import { GrupoDuplicadoError, type RepositorioDeGrupos } from "./gestionar-grupos";

export class RepositorioPostgresDeGrupos implements RepositorioDeGrupos {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async crear(nombre: string): Promise<void> {
    try {
      await this.db.insert(grupos).values({ nombre });
    } catch (causa) {
      if (esViolacionDeUnicidad(causa)) throw new GrupoDuplicadoError();
      throw causa;
    }
  }

  async actualizarGestionDeAsistencia(nombre: string, gestionaAsistencia: boolean): Promise<void> {
    const actualizados = await this.db.update(grupos).set({ gestionaAsistencia }).where(eq(grupos.nombre, nombre)).returning({ nombre: grupos.nombre });
    if (!actualizados.length) throw new Error("El grupo no existe.");
  }

  async listarConAtributos(): Promise<Array<{ nombre: string; gestionaAsistencia: boolean }>> {
    return this.db.select({ nombre: grupos.nombre, gestionaAsistencia: grupos.gestionaAsistencia }).from(grupos).orderBy(asc(grupos.nombre));
  }

  /** Grupos con horarios y asistencias que el actor puede operar. */
  async listarOperablesPor(actor: Actor): Promise<string[]> {
    const todos = await this.listarConAtributos();
    return todos.filter(({ nombre, gestionaAsistencia }) => gestionaAsistencia && puedeVerGrupo(actor, nombre)).map(({ nombre }) => nombre);
  }

  async listar(): Promise<string[]> {
    const items = await this.db.select({ nombre: grupos.nombre }).from(grupos).orderBy(asc(grupos.nombre));
    return items.map(({ nombre }) => nombre);
  }
}

function esViolacionDeUnicidad(causa: unknown): boolean {
  if (typeof causa !== "object" || causa === null) return false;
  if ("code" in causa && causa.code === "23505") return true;
  return "cause" in causa && esViolacionDeUnicidad(causa.cause);
}

// Finanzas consulta asistencias de todos los grupos que las gestionan; el resto, solo los que opera.
function puedeVerGrupo(actor: Actor, grupo: string): boolean {
  return puedeOperarAsistenciaDelGrupo(actor, grupo) || (actor.rol === "finanzas" && puedeConsultarAsistencias(actor));
}
