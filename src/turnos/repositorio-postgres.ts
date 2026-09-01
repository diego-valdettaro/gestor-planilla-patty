import { and, eq, gte, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import {
  asistenciasEsperadas,
  historialDeTurnosPublicados,
  periodosPlanilla,
  turnosPublicados,
} from "@/db/schema";

import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";

export class RepositorioPostgresDeTurnos implements RepositorioDeTurnos {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async buscarPublicado(
    idHuellero: string,
    fecha: string,
  ): Promise<TurnoPublicado | undefined> {
    const [turno] = await this.db
      .select({
        idHuellero: turnosPublicados.idHuellero,
        fecha: turnosPublicados.fecha,
        sede: turnosPublicados.sede,
        entradaProgramada: turnosPublicados.entradaProgramada,
        salidaProgramada: turnosPublicados.salidaProgramada,
        minutosDeAlmuerzo: turnosPublicados.minutosDeAlmuerzo,
        descanso: turnosPublicados.descanso,
      })
      .from(turnosPublicados)
      .where(
        and(
          eq(turnosPublicados.idHuellero, idHuellero),
          eq(turnosPublicados.fecha, fecha),
        ),
      );

    return turno;
  }

  async publicar(turno: TurnoPublicado): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [turnoPublicado] = await tx
        .insert(turnosPublicados)
        .values(turno)
        .returning({ id: turnosPublicados.id });

      await tx.insert(historialDeTurnosPublicados).values({
        turnoPublicadoId: turnoPublicado.id,
      });
      await tx.insert(asistenciasEsperadas).values({
        idHuellero: turno.idHuellero,
        fecha: turno.fecha,
        estado: "pendiente",
      });
    });
  }

  async perteneceAPeriodoAbierto(fecha: string): Promise<boolean> {
    const [periodo] = await this.db
      .select({ id: periodosPlanilla.id })
      .from(periodosPlanilla)
      .where(
        and(
          eq(periodosPlanilla.estado, "abierto"),
          lte(periodosPlanilla.inicio, fecha),
          gte(periodosPlanilla.fin, fecha),
        ),
      );

    return Boolean(periodo);
  }
}
