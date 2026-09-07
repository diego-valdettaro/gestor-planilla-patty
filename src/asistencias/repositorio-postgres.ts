import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { EvidenciaDeCeldaAsistencia } from "@/app/asistencias/estado-de-celda";
import * as schema from "@/db/schema";
import { ajustesDeAsistencia, asistenciasEsperadas, estadosManuales, horasExtra, marcasCrudas, periodosPlanilla, tardanzas, turnosPublicados } from "@/db/schema";
import { RepositorioPostgresDeTardanzas } from "@/tardanzas/repositorio-postgres";

import type {
  AsistenciaConfirmada,
  RepositorioDeAsistencias,
  AjusteDeAsistencia,
  EstadoManual,
  InstantaneaDeTurno,
  TurnoParaConfirmar,
} from "./confirmar-y-ajustar-asistencia";
import type { EstadoDeHoraExtra, HoraExtraCalculada } from "./calcular-hora-extra";

// Una fila del resumen mensual de asistencias, por (colaborador, día) con horario
// publicado: la evidencia que deriva el estado de la celda más los campos de
// presentación del calendario de `/asistencias`.
export interface FilaDeResumenMensual extends EvidenciaDeCeldaAsistencia {
  fecha: string;
  entrada: string | null;
  salida: string | null;
}

export class RepositorioPostgresDeAsistencias implements RepositorioDeAsistencias {
  private readonly repositorioDeTardanzas: RepositorioPostgresDeTardanzas;

  constructor(private readonly db: NodePgDatabase<typeof schema>) {
    this.repositorioDeTardanzas = new RepositorioPostgresDeTardanzas(db);
  }

  async buscarTurnoPublicado(idHuellero: string, fecha: string): Promise<TurnoParaConfirmar | undefined> {
    const [turno] = await this.db.select({
      idHuellero: turnosPublicados.idHuellero, fecha: turnosPublicados.fecha, sede: turnosPublicados.sede,
      entradaProgramada: turnosPublicados.entradaProgramada, salidaProgramada: turnosPublicados.salidaProgramada,
      descanso: turnosPublicados.descanso,
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
      if (asistencia.horaExtra) await tx.insert(horasExtra).values({ asistenciaId: resultado[0].id, ...asistencia.horaExtra });
    });
  }

  async buscarInstantaneaDeTurno(idHuellero: string, fecha: string): Promise<InstantaneaDeTurno | undefined> {
    const [asistencia] = await this.db.select({ instantaneaDeTurno: asistenciasEsperadas.instantaneaDeTurno })
      .from(asistenciasEsperadas)
      .where(and(eq(asistenciasEsperadas.idHuellero, idHuellero), eq(asistenciasEsperadas.fecha, fecha), eq(asistenciasEsperadas.estado, "confirmada")));
    return asistencia?.instantaneaDeTurno ?? undefined;
  }

  async ajustar(solicitud: AjusteDeAsistencia, responsableId: string, horaExtra: HoraExtraCalculada | undefined): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [asistencia] = await tx.update(asistenciasEsperadas).set({
        entradaReal: solicitud.entradaReal, salidaReal: solicitud.salidaReal, minutosTrabajados: solicitud.minutosTrabajados,
      }).where(and(eq(asistenciasEsperadas.idHuellero, solicitud.idHuellero), eq(asistenciasEsperadas.fecha, solicitud.fecha), eq(asistenciasEsperadas.estado, "confirmada"))).returning({ id: asistenciasEsperadas.id });
      if (!asistencia) throw new Error("La asistencia debe estar confirmada para ajustarla.");
      await tx.insert(ajustesDeAsistencia).values({
        asistenciaId: asistencia.id, entradaReal: solicitud.entradaReal, salidaReal: solicitud.salidaReal,
        motivo: solicitud.motivo, responsableId,
      });
      if (horaExtra) {
        await tx.insert(horasExtra).values({ asistenciaId: asistencia.id, ...horaExtra }).onConflictDoUpdate({
          target: horasExtra.asistenciaId,
          set: { ...horaExtra, decididaPorId: null, decididaEn: null },
        });
      } else {
        await tx.delete(horasExtra).where(eq(horasExtra.asistenciaId, asistencia.id));
      }
    });
  }

  async decidirHoraExtra(idHuellero: string, fecha: string, estado: EstadoDeHoraExtra, responsableId: string): Promise<void> {
    if (estado === "pendiente") throw new Error("La hora extra debe aprobarse o rechazarse.");
    const resultado = await this.db.update(horasExtra).set({ estado, decididaPorId: responsableId, decididaEn: new Date() })
      .from(asistenciasEsperadas)
      .where(and(eq(horasExtra.asistenciaId, asistenciasEsperadas.id), eq(asistenciasEsperadas.idHuellero, idHuellero), eq(asistenciasEsperadas.fecha, fecha), eq(horasExtra.estado, "pendiente")))
      .returning({ id: horasExtra.id });
    if (!resultado.length) throw new Error("La hora extra debe estar pendiente para decidirla.");
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

  async listarHorasExtra(): Promise<Array<{
    idHuellero: string; fecha: string; minutosAl25: number; minutosAl35: number; estado: string;
  }>> {
    return this.db.select({
      idHuellero: asistenciasEsperadas.idHuellero, fecha: asistenciasEsperadas.fecha,
      minutosAl25: horasExtra.minutosAl25, minutosAl35: horasExtra.minutosAl35, estado: horasExtra.estado,
    }).from(horasExtra).innerJoin(asistenciasEsperadas, eq(horasExtra.asistenciaId, asistenciasEsperadas.id));
  }

  async listarMarcasCrudasPorAsistencia(): Promise<Array<{ idHuellero: string; fecha: string; instante: string }>> {
    return this.db.select({
      idHuellero: marcasCrudas.idHuellero, fecha: marcasCrudas.fecha, instante: marcasCrudas.instante,
    }).from(marcasCrudas);
  }

  async listarResumenMensual(idHuellero: string, inicio: string, fin: string): Promise<FilaDeResumenMensual[]> {
    return this.db.select({
      fecha: asistenciasEsperadas.fecha,
      estado: asistenciasEsperadas.estado,
      entrada: asistenciasEsperadas.entradaReal,
      salida: asistenciasEsperadas.salidaReal,
      estadoManual: estadosManuales.tipo,
      entradaPropuesta: asistenciasEsperadas.entradaPropuesta,
      salidaPropuesta: asistenciasEsperadas.salidaPropuesta,
      hayMarcasCrudas: sql<boolean>`exists (select 1 from ${marcasCrudas} where ${marcasCrudas.idHuellero} = ${asistenciasEsperadas.idHuellero} and ${marcasCrudas.fecha} = ${asistenciasEsperadas.fecha})`,
      enPeriodoCerrado: sql<boolean>`exists (select 1 from ${periodosPlanilla} where ${periodosPlanilla.estado} = 'cerrado' and ${asistenciasEsperadas.fecha} between ${periodosPlanilla.inicio} and ${periodosPlanilla.fin})`,
    }).from(asistenciasEsperadas).leftJoin(estadosManuales, eq(estadosManuales.asistenciaId, asistenciasEsperadas.id))
      .where(and(eq(asistenciasEsperadas.idHuellero, idHuellero), gte(asistenciasEsperadas.fecha, inicio), lte(asistenciasEsperadas.fecha, fin)))
      .then((filas) => filas as FilaDeResumenMensual[]);
  }

  async buscarPoliticaVigente(sede: string, fecha: string) {
    return this.repositorioDeTardanzas.buscarPoliticaVigente(sede, fecha);
  }

  async contarTardanzas(idHuellero: string, inicio: string, fin: string): Promise<number> {
    return this.repositorioDeTardanzas.contarTardanzas(idHuellero, inicio, fin);
  }
}
