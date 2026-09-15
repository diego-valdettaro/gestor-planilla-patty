import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { EvidenciaDeCeldaAsistencia } from "@/app/asistencias/estado-de-celda";
import * as schema from "@/db/schema";
import { ajustesDeAsistencia, asistenciasEsperadas, estadosManuales, horasExtra, marcasCrudas, periodosPlanilla, tardanzas, turnosPublicados } from "@/db/schema";
import { buscarPoliticaVigente, RepositorioPostgresDeTardanzas } from "@/tardanzas/repositorio-postgres";
import { calcularMinutosDeTardanza, calcularMinutosPenalizados } from "@/tardanzas/politica-de-penalizacion";

import type {
  AsistenciaConfirmada,
  RepositorioDeAsistencias,
  AjusteDeAsistencia,
  EstadoManual,
  InstantaneaDeTurno,
  TurnoParaConfirmar,
} from "./confirmar-y-ajustar-asistencia";
import { calcularMinutosTrabajados } from "./confirmar-y-ajustar-asistencia";
import { calcularHoraExtra, type EstadoDeHoraExtra, type HoraExtraCalculada } from "./calcular-hora-extra";
import type {
  EvaluacionDeColaborador,
  RepositorioDeConfirmacionPorRango,
  SolicitudDeConfirmacionPorRango,
  SolicitudDeEvaluacionPorRango,
} from "./confirmar-colaboradores-por-rango";

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

export class RepositorioPostgresDeAsistencias implements RepositorioDeAsistencias, RepositorioDeConfirmacionPorRango {
  private readonly repositorioDeTardanzas: RepositorioPostgresDeTardanzas;

  constructor(private readonly db: NodePgDatabase<typeof schema>) {
    this.repositorioDeTardanzas = new RepositorioPostgresDeTardanzas(db);
  }

  async evaluarColaboradoresPorRango(solicitud: SolicitudDeEvaluacionPorRango): Promise<EvaluacionDeColaborador[]> {
    const idsHuellero = solicitud.colaboradores.map(({ idHuellero }) => idHuellero);
    if (!idsHuellero.length) return [];
    const filas = await consultaJornadasDelRango(this.db, idsHuellero, solicitud.inicio, solicitud.fin);
    return evaluarJornadasDelRango(solicitud, filas);
  }

  async confirmarColaboradoresPorRango(solicitud: SolicitudDeConfirmacionPorRango, responsableId: string): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const periodos = await tx.select().from(periodosPlanilla).where(and(
          lte(periodosPlanilla.inicio, solicitud.fin),
          gte(periodosPlanilla.fin, solicitud.inicio),
        )).for("update");
        const filas = await consultaJornadasDelRango(tx, solicitud.idsHuellero, solicitud.inicio, solicitud.fin)
          .for("update", { of: asistenciasEsperadas });
        const evaluacion = evaluarJornadasDelRango({
          inicio: solicitud.inicio,
          fin: solicitud.fin,
          colaboradores: solicitud.idsHuellero.map((idHuellero) => ({ idHuellero, nombre: idHuellero })),
        }, filas);
        const noSeleccionable = evaluacion.find(({ seleccionable }) => !seleccionable);
        if (noSeleccionable) {
          const bloqueo = noSeleccionable.bloqueos[0];
          throw new Error(bloqueo
            ? `${noSeleccionable.idHuellero}, ${bloqueo.fecha}: ${bloqueo.causa}`
            : `${noSeleccionable.idHuellero} ya no tiene asistencias por registrar en el rango.`);
        }

        const jornadasPendientes = filas.filter(({ estado }) => estado === "pendiente").sort((a, b) => a.fecha.localeCompare(b.fecha));
        for (const fila of jornadasPendientes) {
          if (fila.motivoNoAsistencia || fila.descanso) {
            const [actualizada] = await tx.update(asistenciasEsperadas).set({ estado: "manual" }).where(and(
              eq(asistenciasEsperadas.idHuellero, fila.idHuellero),
              eq(asistenciasEsperadas.fecha, fila.fecha),
              eq(asistenciasEsperadas.estado, "pendiente"),
            )).returning({ id: asistenciasEsperadas.id });
            if (!actualizada) throw new Error("Una jornada cambió mientras se confirmaba la selección.");
            await tx.insert(estadosManuales).values({
              asistenciaId: actualizada.id,
              tipo: fila.motivoNoAsistencia ?? "descanso",
              comentario: "Motivo planificado confirmado por rango.",
              responsableId,
            });
            continue;
          }
          if (!fila.sede || !fila.entradaProgramada || !fila.salidaProgramada || !fila.entradaPropuesta || !fila.salidaPropuesta) {
            throw new Error("Una jornada cambió mientras se confirmaba la selección.");
          }
          const [actualizada] = await tx.update(asistenciasEsperadas).set({
            estado: "confirmada",
            entradaReal: fila.entradaPropuesta,
            salidaReal: fila.salidaPropuesta,
            minutosTrabajados: calcularMinutosTrabajados(fila.entradaPropuesta, fila.salidaPropuesta),
            instantaneaDeTurno: {
              sede: fila.sede,
              entradaProgramada: fila.entradaProgramada,
              salidaProgramada: fila.salidaProgramada,
              descanso: false,
            },
            confirmadoPorId: responsableId,
            confirmadoEn: new Date(),
          }).where(and(
            eq(asistenciasEsperadas.idHuellero, fila.idHuellero),
            eq(asistenciasEsperadas.fecha, fila.fecha),
            eq(asistenciasEsperadas.estado, "pendiente"),
          )).returning({ id: asistenciasEsperadas.id });
          if (!actualizada) throw new Error("Una jornada cambió mientras se confirmaba la selección.");
          const politica = await buscarPoliticaVigente(tx, fila.sede, fila.fecha);
          if (!politica) throw new Error(`No existe una política de tardanzas vigente para ${fila.sede}.`);
          const minutosDeTardanza = calcularMinutosDeTardanza(fila.entradaProgramada, fila.entradaPropuesta);
          if (minutosDeTardanza > politica.toleranciaEnMinutos) {
            await tx.insert(tardanzas).values({
              asistenciaId: actualizada.id,
              minutosDeTardanza,
              minutosPenalizados: 0,
              politicaVersion: politica.version,
            });
          }
          const horaExtra = calcularHoraExtra(fila.salidaProgramada, fila.salidaPropuesta);
          if (horaExtra) await tx.insert(horasExtra).values({ asistenciaId: actualizada.id, ...horaExtra });
        }

        const recalculos = new Map<string, { idHuellero: string; inicio: string; fin: string }>();
        for (const fila of jornadasPendientes) {
          const periodo = periodos.find(({ inicio, fin }) => inicio <= fila.fecha && fin >= fila.fecha);
          if (!periodo) throw new Error(`La jornada de ${fila.fecha} ya no pertenece a un período abierto.`);
          recalculos.set(`${fila.idHuellero}:${periodo.inicio}:${periodo.fin}`, { idHuellero: fila.idHuellero, inicio: periodo.inicio, fin: periodo.fin });
        }
        for (const recalculo of recalculos.values()) await recalcularPenalizaciones(tx, recalculo);
      }, { isolationLevel: "serializable" });
    } catch (causa) {
      if (codigoPostgres(causa) === "40001") throw new Error("La selección cambió mientras se confirmaba. Revise el rango e intente otra vez.");
      throw causa;
    }
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

interface FilaParaConfirmarPorRango {
  idHuellero: string;
  fecha: string;
  estado: "pendiente" | "confirmada" | "manual";
  entradaPropuesta: string | null;
  salidaPropuesta: string | null;
  sede: string | null;
  entradaProgramada: string | null;
  salidaProgramada: string | null;
  descanso: boolean;
  motivoNoAsistencia: "descanso" | "feriado" | "vacaciones" | "permiso" | "suspension" | null;
  enPeriodoCerrado: boolean;
  enPeriodoAbierto: boolean;
}

type FuenteDeConsultaDeAsistencias = Pick<NodePgDatabase<typeof schema>, "select">;

function consultaJornadasDelRango(
  db: FuenteDeConsultaDeAsistencias,
  idsHuellero: string[],
  inicio: string,
  fin: string,
) {
  return db.select({
    idHuellero: asistenciasEsperadas.idHuellero,
    fecha: asistenciasEsperadas.fecha,
    estado: asistenciasEsperadas.estado,
    entradaPropuesta: asistenciasEsperadas.entradaPropuesta,
    salidaPropuesta: asistenciasEsperadas.salidaPropuesta,
    sede: turnosPublicados.sede,
    entradaProgramada: turnosPublicados.entradaProgramada,
    salidaProgramada: turnosPublicados.salidaProgramada,
    descanso: turnosPublicados.descanso,
    motivoNoAsistencia: turnosPublicados.motivoNoAsistencia,
    enPeriodoCerrado: sql<boolean>`exists (select 1 from ${periodosPlanilla} where ${periodosPlanilla.estado} = 'cerrado' and ${asistenciasEsperadas.fecha} between ${periodosPlanilla.inicio} and ${periodosPlanilla.fin})`,
    enPeriodoAbierto: sql<boolean>`exists (select 1 from ${periodosPlanilla} where ${periodosPlanilla.estado} = 'abierto' and ${asistenciasEsperadas.fecha} between ${periodosPlanilla.inicio} and ${periodosPlanilla.fin})`,
  }).from(asistenciasEsperadas).innerJoin(turnosPublicados, and(
    eq(turnosPublicados.idHuellero, asistenciasEsperadas.idHuellero),
    eq(turnosPublicados.fecha, asistenciasEsperadas.fecha),
  )).where(and(
    inArray(asistenciasEsperadas.idHuellero, idsHuellero),
    gte(asistenciasEsperadas.fecha, inicio),
    lte(asistenciasEsperadas.fecha, fin),
  ));
}

function evaluarJornadasDelRango(
  solicitud: SolicitudDeEvaluacionPorRango,
  filas: FilaParaConfirmarPorRango[],
): EvaluacionDeColaborador[] {
  return solicitud.colaboradores.map((colaborador) => {
    let jornadasPendientes = 0;
    let jornadasRegistradas = 0;
    const bloqueos: Array<{ fecha: string; causa: string }> = [];
    const jornadas = filas.filter(({ idHuellero }) => idHuellero === colaborador.idHuellero).sort((a, b) => a.fecha.localeCompare(b.fecha));
    for (const fila of jornadas) {
      if (fila.estado !== "pendiente") {
        jornadasRegistradas += 1;
        continue;
      }
      jornadasPendientes += 1;
      if (fila.enPeriodoCerrado) {
        bloqueos.push({ fecha: fila.fecha, causa: "La jornada pertenece a un período cerrado." });
        continue;
      }
      if (!fila.enPeriodoAbierto) {
        bloqueos.push({ fecha: fila.fecha, causa: "No hay un período de planilla abierto para la jornada." });
        continue;
      }
      if (fila.motivoNoAsistencia || fila.descanso) continue;
      if (!fila.sede || !fila.entradaProgramada || !fila.salidaProgramada) {
        bloqueos.push({ fecha: fila.fecha, causa: "La jornada laboral publicada está incompleta." });
      } else if (!fila.entradaPropuesta && !fila.salidaPropuesta) {
        bloqueos.push({ fecha: fila.fecha, causa: "Faltan las marcas de entrada y salida." });
      } else if (!fila.entradaPropuesta) {
        bloqueos.push({ fecha: fila.fecha, causa: "Falta la marca de entrada." });
      } else if (!fila.salidaPropuesta) {
        bloqueos.push({ fecha: fila.fecha, causa: "Falta la marca de salida." });
      } else if (!marcasConsistentes(fila.entradaPropuesta, fila.salidaPropuesta)) {
        bloqueos.push({ fecha: fila.fecha, causa: "La salida debe ser posterior a la entrada." });
      }
    }
    return {
      ...colaborador,
      seleccionable: bloqueos.length === 0 && jornadasPendientes > 0,
      jornadasPendientes,
      jornadasRegistradas,
      bloqueos,
    };
  });
}

function marcasConsistentes(entrada: string, salida: string): boolean {
  const inicio = new Date(entrada).getTime();
  const fin = new Date(salida).getTime();
  return Number.isFinite(inicio) && Number.isFinite(fin) && fin > inicio;
}

type TransaccionDeAsistencias = Parameters<NodePgDatabase<typeof schema>["transaction"]>[0] extends (tx: infer T) => unknown ? T : never;

async function recalcularPenalizaciones(
  tx: TransaccionDeAsistencias,
  alcance: { idHuellero: string; inicio: string; fin: string },
): Promise<void> {
  const filas = await tx.select({
    tardanzaId: tardanzas.id,
    fecha: asistenciasEsperadas.fecha,
    instantanea: asistenciasEsperadas.instantaneaDeTurno,
  }).from(tardanzas).innerJoin(asistenciasEsperadas, eq(tardanzas.asistenciaId, asistenciasEsperadas.id)).where(and(
    eq(asistenciasEsperadas.idHuellero, alcance.idHuellero),
    gte(asistenciasEsperadas.fecha, alcance.inicio),
    lte(asistenciasEsperadas.fecha, alcance.fin),
  )).orderBy(asc(asistenciasEsperadas.fecha));
  for (const [indice, fila] of filas.entries()) {
    if (!fila.instantanea?.sede) throw new Error(`La tardanza de ${fila.fecha} no conserva la sede aplicada.`);
    const politica = await buscarPoliticaVigente(tx, fila.instantanea.sede, fila.fecha);
    if (!politica) throw new Error(`No existe una política de tardanzas vigente para ${fila.instantanea.sede}.`);
    await tx.update(tardanzas).set({
      minutosPenalizados: calcularMinutosPenalizados(indice + 1, politica),
      politicaVersion: politica.version,
    }).where(eq(tardanzas.id, fila.tardanzaId));
  }
}

function codigoPostgres(causa: unknown): string | undefined {
  if (!causa || typeof causa !== "object") return undefined;
  const error = causa as { code?: string; cause?: unknown };
  return error.code ?? codigoPostgres(error.cause);
}
