import { asc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
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
