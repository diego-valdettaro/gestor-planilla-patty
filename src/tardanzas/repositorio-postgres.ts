import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { asistenciasEsperadas, politicasDePenalizacionPorTardanzas, tardanzas } from "@/db/schema";

import type { PoliticaDePenalizacionPorTardanzas, RepositorioDeTardanzas } from "./politica-de-penalizacion";

export class RepositorioPostgresDeTardanzas implements RepositorioDeTardanzas {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async guardarPolitica(politica: PoliticaDePenalizacionPorTardanzas): Promise<void> {
    await this.db.insert(politicasDePenalizacionPorTardanzas).values(politica);
  }

  async buscarPoliticaVigente(sede: string, fecha: string) {
    const [politica] = await this.db.select().from(politicasDePenalizacionPorTardanzas)
      .where(and(eq(politicasDePenalizacionPorTardanzas.sede, sede), lte(politicasDePenalizacionPorTardanzas.vigenteDesde, fecha)))
      .orderBy(desc(politicasDePenalizacionPorTardanzas.vigenteDesde)).limit(1);
    return politica;
  }

  async contarTardanzas(idHuellero: string, inicio: string, fin: string): Promise<number> {
    const filas = await this.db.select({ id: tardanzas.id }).from(tardanzas)
      .innerJoin(asistenciasEsperadas, eq(tardanzas.asistenciaId, asistenciasEsperadas.id))
      .where(and(eq(asistenciasEsperadas.idHuellero, idHuellero), gte(asistenciasEsperadas.fecha, inicio), lte(asistenciasEsperadas.fecha, fin)));
    return filas.length;
  }
}
