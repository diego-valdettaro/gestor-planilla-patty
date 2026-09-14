import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { EvidenciaDeCeldaAsistencia } from "@/app/asistencias/estado-de-celda";
import * as schema from "@/db/schema";
import { ajustesDeAsistencia, asistenciasEsperadas, estadosManuales, horasExtra, marcasCrudas, periodosPlanilla, politicasDePenalizacionPorTardanzas, tardanzas, turnosPublicados } from "@/db/schema";
import { calcularTardanza } from "@/tardanzas/politica-de-penalizacion";
import { RepositorioPostgresDeTardanzas } from "@/tardanzas/repositorio-postgres";

import type {
  AsistenciaConfirmada,
  RepositorioDeAsistencias,
  AjusteDeAsistencia,
  EstadoManual,
  InstantaneaDeTurno,
  TurnoParaConfirmar,
} from "./confirmar-y-ajustar-asistencia";
import { calcularMinutosTrabajados } from "./confirmar-y-ajustar-asistencia";
import type { EstadoDeHoraExtra, HoraExtraCalculada } from "./calcular-hora-extra";
import { calcularHoraExtra } from "./calcular-hora-extra";
import type { SolicitudDeConfirmacionPorRango } from "./confirmar-colaboradores-por-rango";

// Una fila del resumen mensual de asistencias, por (colaborador, día) con horario
// publicado: la evidencia que deriva el estado de la celda más los campos de
// presentación del calendario de `/asistencias`.
export interface FilaDeResumenMensual extends EvidenciaDeCeldaAsistencia {
  fecha: string;
  entrada: string | null;
  salida: string | null;
  sedeProgramada: string | null;
}

export interface FilaDeResumenSemanal extends FilaDeResumenMensual {
  idHuellero: string;
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
      descanso: turnosPublicados.descanso, motivoNoAsistencia: turnosPublicados.motivoNoAsistencia,
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

  async confirmarColaboradoresPorRango(solicitud: SolicitudDeConfirmacionPorRango, responsableId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const filas = await tx.select({
        idHuellero: asistenciasEsperadas.idHuellero, fecha: asistenciasEsperadas.fecha, estado: asistenciasEsperadas.estado,
        entradaPropuesta: asistenciasEsperadas.entradaPropuesta, salidaPropuesta: asistenciasEsperadas.salidaPropuesta,
        sede: turnosPublicados.sede, entradaProgramada: turnosPublicados.entradaProgramada, salidaProgramada: turnosPublicados.salidaProgramada,
        descanso: turnosPublicados.descanso, motivoNoAsistencia: turnosPublicados.motivoNoAsistencia,
        enPeriodoCerrado: sql<boolean>`exists (select 1 from ${periodosPlanilla} where ${periodosPlanilla.estado} = 'cerrado' and ${asistenciasEsperadas.fecha} between ${periodosPlanilla.inicio} and ${periodosPlanilla.fin})`,
      }).from(asistenciasEsperadas).innerJoin(turnosPublicados, and(eq(turnosPublicados.idHuellero, asistenciasEsperadas.idHuellero), eq(turnosPublicados.fecha, asistenciasEsperadas.fecha)))
        .where(and(inArray(asistenciasEsperadas.idHuellero, solicitud.idsHuellero), gte(asistenciasEsperadas.fecha, solicitud.inicio), lte(asistenciasEsperadas.fecha, solicitud.fin)))
        .orderBy(asc(asistenciasEsperadas.idHuellero), asc(asistenciasEsperadas.fecha));
      const porClave = new Map(filas.map((fila) => [`${fila.idHuellero}:${fila.fecha}`, fila]));
      for (const idHuellero of solicitud.idsHuellero) for (const fecha of fechasDelRango(solicitud.inicio, solicitud.fin)) {
        const fila = porClave.get(`${idHuellero}:${fecha}`);
        if (!fila) throw new Error(`El colaborador ${idHuellero} no tiene una jornada publicada para ${fecha}.`);
        if (fila.enPeriodoCerrado) throw new Error(`La jornada de ${idHuellero} del ${fecha} pertenece a un periodo cerrado.`);
        if (fila.estado !== "pendiente") throw new Error(`La jornada de ${idHuellero} del ${fecha} ya esta registrada.`);
        if (fila.motivoNoAsistencia || fila.descanso) {
          const [actualizada] = await tx.update(asistenciasEsperadas).set({ estado: "manual" })
            .where(and(eq(asistenciasEsperadas.idHuellero, idHuellero), eq(asistenciasEsperadas.fecha, fecha), eq(asistenciasEsperadas.estado, "pendiente"))).returning({ id: asistenciasEsperadas.id });
          if (!actualizada) throw new Error("Una jornada cambio mientras se confirmaba la seleccion.");
          await tx.insert(estadosManuales).values({ asistenciaId: actualizada.id, tipo: fila.motivoNoAsistencia ?? "descanso", comentario: "Motivo planificado confirmado por rango.", responsableId });
          continue;
        }
        if (!fila.sede || !fila.entradaProgramada || !fila.salidaProgramada || !fila.entradaPropuesta || !fila.salidaPropuesta) {
          throw new Error(`La jornada de ${idHuellero} del ${fecha} no tiene marcas completas para confirmar.`);
        }
        const tardanza = await calcularTardanzaEnTransaccion(tx, idHuellero, fecha, fila.sede, fila.entradaProgramada, fila.entradaPropuesta);
        const [actualizada] = await tx.update(asistenciasEsperadas).set({
          estado: "confirmada", entradaReal: fila.entradaPropuesta, salidaReal: fila.salidaPropuesta,
          minutosTrabajados: calcularMinutosTrabajados(fila.entradaPropuesta, fila.salidaPropuesta),
          instantaneaDeTurno: { sede: fila.sede, entradaProgramada: fila.entradaProgramada, salidaProgramada: fila.salidaProgramada, descanso: false },
          confirmadoPorId: responsableId, confirmadoEn: new Date(),
        }).where(and(eq(asistenciasEsperadas.idHuellero, idHuellero), eq(asistenciasEsperadas.fecha, fecha), eq(asistenciasEsperadas.estado, "pendiente"))).returning({ id: asistenciasEsperadas.id });
        if (!actualizada) throw new Error("Una jornada cambio mientras se confirmaba la seleccion.");
        if (tardanza) await tx.insert(tardanzas).values({ asistenciaId: actualizada.id, ...tardanza });
        const horaExtra = calcularHoraExtra(fila.salidaProgramada, fila.salidaPropuesta);
        if (horaExtra) await tx.insert(horasExtra).values({ asistenciaId: actualizada.id, ...horaExtra });
      }
      for (const idHuellero of solicitud.idsHuellero) {
        for (const fecha of fechasDelRango(solicitud.inicio, solicitud.fin)) {
          const periodo = limitesDelPeriodo(fecha);
          await recalcularPenalizacionesEnTransaccion(tx, idHuellero, periodo.inicio, periodo.fin);
        }
      }
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
      sedeProgramada: turnosPublicados.sede,
      motivoPlanificado: turnosPublicados.motivoNoAsistencia,
      estadoManual: estadosManuales.tipo,
      entradaPropuesta: asistenciasEsperadas.entradaPropuesta,
      salidaPropuesta: asistenciasEsperadas.salidaPropuesta,
      hayMarcasCrudas: sql<boolean>`exists (select 1 from ${marcasCrudas} where ${marcasCrudas.idHuellero} = ${asistenciasEsperadas.idHuellero} and ${marcasCrudas.fecha} = ${asistenciasEsperadas.fecha})`,
      enPeriodoCerrado: sql<boolean>`exists (select 1 from ${periodosPlanilla} where ${periodosPlanilla.estado} = 'cerrado' and ${asistenciasEsperadas.fecha} between ${periodosPlanilla.inicio} and ${periodosPlanilla.fin})`,
    }).from(asistenciasEsperadas).leftJoin(turnosPublicados, and(
      eq(turnosPublicados.idHuellero, asistenciasEsperadas.idHuellero), eq(turnosPublicados.fecha, asistenciasEsperadas.fecha),
    )).leftJoin(estadosManuales, eq(estadosManuales.asistenciaId, asistenciasEsperadas.id))
      .where(and(eq(asistenciasEsperadas.idHuellero, idHuellero), gte(asistenciasEsperadas.fecha, inicio), lte(asistenciasEsperadas.fecha, fin)))
      .then((filas) => filas as FilaDeResumenMensual[]);
  }

  async listarResumenSemanal(idsHuellero: string[], inicio: string, fin: string): Promise<FilaDeResumenSemanal[]> {
    if (!idsHuellero.length) return [];
    return this.db.select({
      idHuellero: asistenciasEsperadas.idHuellero,
      fecha: asistenciasEsperadas.fecha,
      estado: asistenciasEsperadas.estado,
      entrada: asistenciasEsperadas.entradaReal,
      salida: asistenciasEsperadas.salidaReal,
      sedeProgramada: turnosPublicados.sede,
      motivoPlanificado: turnosPublicados.motivoNoAsistencia,
      estadoManual: estadosManuales.tipo,
      entradaPropuesta: asistenciasEsperadas.entradaPropuesta,
      salidaPropuesta: asistenciasEsperadas.salidaPropuesta,
      hayMarcasCrudas: sql<boolean>`exists (select 1 from ${marcasCrudas} where ${marcasCrudas.idHuellero} = ${asistenciasEsperadas.idHuellero} and ${marcasCrudas.fecha} = ${asistenciasEsperadas.fecha})`,
      enPeriodoCerrado: sql<boolean>`exists (select 1 from ${periodosPlanilla} where ${periodosPlanilla.estado} = 'cerrado' and ${asistenciasEsperadas.fecha} between ${periodosPlanilla.inicio} and ${periodosPlanilla.fin})`,
    }).from(asistenciasEsperadas).leftJoin(turnosPublicados, and(
      eq(turnosPublicados.idHuellero, asistenciasEsperadas.idHuellero), eq(turnosPublicados.fecha, asistenciasEsperadas.fecha),
    )).leftJoin(estadosManuales, eq(estadosManuales.asistenciaId, asistenciasEsperadas.id))
      .where(and(inArray(asistenciasEsperadas.idHuellero, idsHuellero), gte(asistenciasEsperadas.fecha, inicio), lte(asistenciasEsperadas.fecha, fin)))
      .then((filas) => filas as FilaDeResumenSemanal[]);
  }

  async buscarPoliticaVigente(sede: string, fecha: string) {
    return this.repositorioDeTardanzas.buscarPoliticaVigente(sede, fecha);
  }

  async contarTardanzas(idHuellero: string, inicio: string, fin: string): Promise<number> {
    return this.repositorioDeTardanzas.contarTardanzas(idHuellero, inicio, fin);
  }
}

function fechasDelRango(inicio: string, fin: string): string[] {
  const fechas: string[] = [];
  const cursor = new Date(`${inicio}T00:00:00Z`);
  const limite = new Date(`${fin}T00:00:00Z`);
  while (cursor <= limite) {
    fechas.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return fechas;
}

function limitesDelPeriodo(fecha: string): { inicio: string; fin: string } {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const inicio = dia >= 26 ? new Date(Date.UTC(anio, mes - 1, 26)) : new Date(Date.UTC(anio, mes - 2, 26));
  const fin = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 25));
  return { inicio: inicio.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) };
}

async function recalcularPenalizacionesEnTransaccion(
  tx: Parameters<NodePgDatabase<typeof schema>["transaction"]>[0] extends (tx: infer T) => unknown ? T : never,
  idHuellero: string,
  inicio: string,
  fin: string,
): Promise<void> {
  const filas = await tx.select({
    tardanzaId: tardanzas.id, fecha: asistenciasEsperadas.fecha, instantanea: asistenciasEsperadas.instantaneaDeTurno,
  }).from(tardanzas).innerJoin(asistenciasEsperadas, eq(tardanzas.asistenciaId, asistenciasEsperadas.id))
    .where(and(eq(asistenciasEsperadas.idHuellero, idHuellero), gte(asistenciasEsperadas.fecha, inicio), lte(asistenciasEsperadas.fecha, fin)))
    .orderBy(asc(asistenciasEsperadas.fecha));
  for (const [indice, fila] of filas.entries()) {
    if (!fila.instantanea?.sede) continue;
    const [politica] = await tx.select().from(politicasDePenalizacionPorTardanzas)
      .where(and(eq(politicasDePenalizacionPorTardanzas.sede, fila.instantanea.sede), lte(politicasDePenalizacionPorTardanzas.vigenteDesde, fila.fecha)))
      .orderBy(desc(politicasDePenalizacionPorTardanzas.vigenteDesde)).limit(1);
    if (!politica) throw new Error("No existe una politica de tardanzas vigente para la sede.");
    await tx.update(tardanzas).set({
      minutosPenalizados: (indice + 1) % politica.tardanzasAcumuladas === 0 ? politica.horasPenalizadas * 60 : 0,
      politicaVersion: politica.version,
    }).where(eq(tardanzas.id, fila.tardanzaId));
  }
}

function minutosEntreInstantes(entrada: string, salida: string): number {
  const minutos = (new Date(salida).getTime() - new Date(entrada).getTime()) / 60_000;
  if (!Number.isInteger(minutos) || minutos < 0) throw new Error("La salida propuesta debe ser posterior a la entrada propuesta.");
  return minutos;
}

async function calcularTardanzaEnTransaccion(
  tx: Parameters<NodePgDatabase<typeof schema>["transaction"]>[0] extends (tx: infer T) => unknown ? T : never,
  idHuellero: string,
  fecha: string,
  sede: string,
  entradaProgramada: string,
  entradaReal: string,
): Promise<{ minutosDeTardanza: number; minutosPenalizados: number; politicaVersion: number } | undefined> {
  return calcularTardanza({
    async buscarPoliticaVigente(sedeConsultada, fechaConsultada) {
      const [politica] = await tx.select().from(politicasDePenalizacionPorTardanzas)
        .where(and(eq(politicasDePenalizacionPorTardanzas.sede, sedeConsultada), lte(politicasDePenalizacionPorTardanzas.vigenteDesde, fechaConsultada)))
        .orderBy(desc(politicasDePenalizacionPorTardanzas.vigenteDesde)).limit(1);
      return politica;
    },
    async contarTardanzas(idConsultado, inicio, fin) {
      const [conteo] = await tx.select({ cantidad: sql<number>`count(*)::int` }).from(tardanzas)
        .innerJoin(asistenciasEsperadas, eq(tardanzas.asistenciaId, asistenciasEsperadas.id))
        .where(and(eq(asistenciasEsperadas.idHuellero, idConsultado), gte(asistenciasEsperadas.fecha, inicio), lte(asistenciasEsperadas.fecha, fin), lte(asistenciasEsperadas.fecha, fecha)));
      return conteo.cantidad;
    },
  }, { idHuellero, sede, fecha, entradaProgramada, entradaReal });
}
