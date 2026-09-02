import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { ajustesDeAsistencia, asistenciasEsperadas, turnosPublicados } from "@/db/schema";

import type {
  AsistenciaConfirmada,
  RepositorioDeAsistencias,
  AjusteDeAsistencia,
  TurnoParaConfirmar,
} from "./confirmar-y-ajustar-asistencia";

export class RepositorioPostgresDeAsistencias implements RepositorioDeAsistencias {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async buscarTurnoPublicado(idHuellero: string, fecha: string): Promise<TurnoParaConfirmar | undefined> {
    const [turno] = await this.db.select({
      idHuellero: turnosPublicados.idHuellero, fecha: turnosPublicados.fecha, sede: turnosPublicados.sede,
      entradaProgramada: turnosPublicados.entradaProgramada, salidaProgramada: turnosPublicados.salidaProgramada,
      minutosDeAlmuerzo: turnosPublicados.minutosDeAlmuerzo, descanso: turnosPublicados.descanso,
    }).from(turnosPublicados).where(and(eq(turnosPublicados.idHuellero, idHuellero), eq(turnosPublicados.fecha, fecha)));
    return turno;
  }

  async confirmar(asistencia: AsistenciaConfirmada): Promise<void> {
    const resultado = await this.db.update(asistenciasEsperadas).set({
      estado: "confirmada", entradaReal: asistencia.entradaReal, salidaReal: asistencia.salidaReal,
      minutosTrabajados: asistencia.minutosTrabajados,
      instantaneaDeTurno: asistencia.instantaneaDeTurno, confirmadoPorId: asistencia.confirmadoPorId,
      confirmadoEn: asistencia.confirmadoEn,
    }).where(and(eq(asistenciasEsperadas.idHuellero, asistencia.idHuellero), eq(asistenciasEsperadas.fecha, asistencia.fecha), eq(asistenciasEsperadas.estado, "pendiente"))).returning({ id: asistenciasEsperadas.id });
    if (!resultado.length) throw new Error("La asistencia no está pendiente de revisión.");
  }

  async ajustar(solicitud: AjusteDeAsistencia, responsableId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [asistencia] = await tx.update(asistenciasEsperadas).set({
        entradaReal: solicitud.entradaReal, salidaReal: solicitud.salidaReal, minutosTrabajados: solicitud.minutosTrabajados,
      }).where(and(eq(asistenciasEsperadas.idHuellero, solicitud.idHuellero), eq(asistenciasEsperadas.fecha, solicitud.fecha), eq(asistenciasEsperadas.estado, "confirmada"))).returning({ id: asistenciasEsperadas.id });
      if (!asistencia) throw new Error("La asistencia debe estar confirmada para ajustarla.");
      await tx.insert(ajustesDeAsistencia).values({
        asistenciaId: asistencia.id, entradaReal: solicitud.entradaReal, salidaReal: solicitud.salidaReal,
        motivo: solicitud.motivo, responsableId,
      });
    });
  }
}
