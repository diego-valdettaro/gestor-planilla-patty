import { and, asc, gte, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { clasificacionesDeGoce } from "@/db/schema";

type Db = NodePgDatabase<typeof schema>;

/** Decisión vigente de Finanzas sobre una jornada de permiso o suspensión. */
export interface ClasificacionGuardada {
  dni: string;
  fecha: string;
  conGoce: boolean;
  clasificadoPorId: string;
  clasificadoEn: Date;
}

const columnas = {
  dni: clasificacionesDeGoce.dni,
  fecha: clasificacionesDeGoce.fecha,
  conGoce: clasificacionesDeGoce.conGoce,
  clasificadoPorId: clasificacionesDeGoce.clasificadoPorId,
  clasificadoEn: clasificacionesDeGoce.clasificadoEn,
};

export class RepositorioPostgresDeClasificacionesDeGoce {
  constructor(private readonly db: Db) {}

  /** Una decisión vigente por jornada: reclasificar reemplaza la anterior con su nuevo actor y fecha. */
  async guardar(solicitud: { dni: string; fecha: string; conGoce: boolean; clasificadoPorId: string }): Promise<ClasificacionGuardada> {
    const [fila] = await this.db.insert(clasificacionesDeGoce).values(solicitud).onConflictDoUpdate({
      target: [clasificacionesDeGoce.dni, clasificacionesDeGoce.fecha],
      set: { conGoce: solicitud.conGoce, clasificadoPorId: solicitud.clasificadoPorId, clasificadoEn: new Date() },
    }).returning(columnas);
    return fila;
  }

  async listarEntre(desde: string, hasta: string): Promise<ClasificacionGuardada[]> {
    return this.db.select(columnas).from(clasificacionesDeGoce)
      .where(and(gte(clasificacionesDeGoce.fecha, desde), lte(clasificacionesDeGoce.fecha, hasta)))
      .orderBy(asc(clasificacionesDeGoce.fecha), asc(clasificacionesDeGoce.dni));
  }
}
