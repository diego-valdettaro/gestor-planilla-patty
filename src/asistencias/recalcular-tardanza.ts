import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { asistenciasEsperadas, periodosPlanilla, tardanzas } from "@/db/schema";
import { buscarPoliticaVigente } from "@/tardanzas/repositorio-postgres";
import { calcularMinutosPenalizados, minutosDeTardanzaFueraDeTolerancia } from "@/tardanzas/politica-de-penalizacion";

import type { InstantaneaDeTurno } from "./confirmar-y-ajustar-asistencia";

type Transaccion = Parameters<NodePgDatabase<typeof schema>["transaction"]>[0] extends (tx: infer T) => unknown ? T : never;

/**
 * Vuelve a evaluar la tardanza de una jornada con su entrada real vigente, tras un ajuste:
 * la crea, la actualiza o la elimina según supere o no la tolerancia, y renumera las horas
 * penalizadas de la persona en el período abierto que contiene la jornada. Fuera de un período
 * abierto solo se actualiza la tardanza de la jornada: un período cerrado conserva sus cifras.
 */
export async function recalcularTardanzaDeAsistencia(
  tx: Transaccion,
  asistencia: { id: string; dni: string; fecha: string; entradaReal: string; instantaneaDeTurno: InstantaneaDeTurno | null },
): Promise<void> {
  const turno = asistencia.instantaneaDeTurno;
  if (!turno?.sede || !turno.entradaProgramada) throw new Error(`La asistencia de ${asistencia.fecha} no conserva la entrada programada ni la sede aplicadas.`);
  const politica = await buscarPoliticaVigente(tx, turno.sede, asistencia.fecha);
  if (!politica) throw new Error(`No existe una política de tardanzas vigente para ${turno.sede}.`);

  const minutosDeTardanza = minutosDeTardanzaFueraDeTolerancia(politica, turno.entradaProgramada, asistencia.entradaReal);
  if (minutosDeTardanza === undefined) {
    await tx.delete(tardanzas).where(eq(tardanzas.asistenciaId, asistencia.id));
  } else {
    await tx.insert(tardanzas)
      .values({ asistenciaId: asistencia.id, minutosDeTardanza, minutosPenalizados: 0, politicaVersion: politica.version })
      .onConflictDoUpdate({ target: tardanzas.asistenciaId, set: { minutosDeTardanza, politicaVersion: politica.version } });
  }

  const [periodo] = await tx.select({ inicio: periodosPlanilla.inicio, fin: periodosPlanilla.fin }).from(periodosPlanilla).where(and(
    eq(periodosPlanilla.estado, "abierto"), lte(periodosPlanilla.inicio, asistencia.fecha), gte(periodosPlanilla.fin, asistencia.fecha),
  ));
  if (!periodo) return;
  // Serializa los recálculos de una misma persona y período: cada uno debe ver las tardanzas que otro acaba de cambiar.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${asistencia.dni}), hashtext(${periodo.inicio}))`);
  await recalcularPenalizaciones(tx, { dni: asistencia.dni, ...periodo });
}

export async function recalcularPenalizaciones(
  tx: Transaccion,
  alcance: { dni: string; inicio: string; fin: string },
): Promise<void> {
  const filas = await tx.select({
    tardanzaId: tardanzas.id,
    fecha: asistenciasEsperadas.fecha,
    instantanea: asistenciasEsperadas.instantaneaDeTurno,
  }).from(tardanzas).innerJoin(asistenciasEsperadas, eq(tardanzas.asistenciaId, asistenciasEsperadas.id)).where(and(
    eq(asistenciasEsperadas.dni, alcance.dni),
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

