import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { ajustesDeAsistencia, asistenciasEsperadas, estadosManuales, marcasCrudas, tardanzas, turnosPublicados } from "@/db/schema";
import { RepositorioPostgresDeTardanzas } from "@/tardanzas/repositorio-postgres";

import type {
  AsistenciaConfirmada,
  RepositorioDeAsistencias,
  AjusteDeAsistencia,
  EstadoManual,
  TurnoParaConfirmar,
} from "./confirmar-y-ajustar-asistencia";

export class RepositorioPostgresDeAsistencias implements RepositorioDeAsistencias {
  private readonly repositorioDeTardanzas: RepositorioPostgresDeTardanzas;

  constructor(private readonly db: NodePgDatabase<typeof schema>) {
    this.repositorioDeTardanzas = new RepositorioPostgresDeTardanzas(db);
  }

  async buscarTurnoPublicado(idHuellero: string, fecha: string): Promise<TurnoParaConfirmar | undefined> {
    const [turno] = await this.db.select({
      idHuellero: turnosPublicados.idHuellero, fecha: turnosPublicados.fecha, sede: turnosPublicados.sede,
      entradaProgramada: turnosPublicados.entradaProgramada, salidaProgramada: turnosPublicados.salidaProgramada,
      minutosDeAlmuerzo: turnosPublicados.minutosDeAlmuerzo, descanso: turnosPublicados.descanso,
    }).from(turnosPublicados).where(and(eq(turnosPublicados.idHuellero, idHuellero), eq(turnosPublicados.fecha, fecha)));
    return turno;
  }

  async confirmar(asistencia: AsistenciaConfirmada): Promise<void> {
    await this.db.transaction(async (tx) => {
      const resultado = await tx.update(asistenciasEsperadas).set({
        estado: "confirmada", entradaReal: asistencia.entradaReal, salidaReal: asistencia.salidaReal,
        minutosTrabajados: asistencia.minutosTrabajados,
        instantaneaDeTurno: asistencia.instantaneaDeTurno, confirmadoPorId: asistencia.confirmadoPorId,
        confirmadoEn: asistencia.confirmadoEn,
      }).where(and(eq(asistenciasEsperadas.idHuellero, asistencia.idHuellero), eq(asistenciasEsperadas.fecha, asistencia.fecha), eq(asistenciasEsperadas.estado, "pendiente"))).returning({ id: asistenciasEsperadas.id });
      if (!resultado.length) throw new Error("La asistencia no está pendiente de revisión.");
      if (asistencia.tardanza) await tx.insert(tardanzas).values({ asistenciaId: resultado[0].id, ...asistencia.tardanza });
    });
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

  async registrarEstadoManual(estadoManual: EstadoManual): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [asistencia] = await tx.update(asistenciasEsperadas).set({ estado: "manual" })
        .where(and(eq(asistenciasEsperadas.idHuellero, estadoManual.idHuellero), eq(asistenciasEsperadas.fecha, estadoManual.fecha), eq(asistenciasEsperadas.estado, "pendiente")))
        .returning({ id: asistenciasEsperadas.id });
      if (!asistencia) throw new Error("La asistencia debe estar pendiente de revisión para registrar un estado manual.");
      await tx.insert(estadosManuales).values({
        asistenciaId: asistencia.id, tipo: estadoManual.tipo, comentario: estadoManual.comentario,
        responsableId: estadoManual.responsableId, registradoEn: estadoManual.registradoEn,
      });
    });
  }

  async listarEstadosManuales(): Promise<Array<{
    idHuellero: string; fecha: string; tipo: string; comentario: string; responsableId: string;
  }>> {
    return this.db.select({
      idHuellero: asistenciasEsperadas.idHuellero, fecha: asistenciasEsperadas.fecha,
      tipo: estadosManuales.tipo, comentario: estadosManuales.comentario, responsableId: estadosManuales.responsableId,
    }).from(estadosManuales).innerJoin(asistenciasEsperadas, eq(estadosManuales.asistenciaId, asistenciasEsperadas.id));
  }

  async listarMarcasCrudasPorAsistencia(): Promise<Array<{ idHuellero: string; fecha: string; instante: string }>> {
    return this.db.select({
      idHuellero: marcasCrudas.idHuellero, fecha: marcasCrudas.fecha, instante: marcasCrudas.instante,
    }).from(marcasCrudas);
  }

  async buscarPoliticaVigente(sede: string, fecha: string) {
    return this.repositorioDeTardanzas.buscarPoliticaVigente(sede, fecha);
  }

  async contarTardanzas(idHuellero: string, inicio: string, fin: string): Promise<number> {
    return this.repositorioDeTardanzas.contarTardanzas(idHuellero, inicio, fin);
  }
}
