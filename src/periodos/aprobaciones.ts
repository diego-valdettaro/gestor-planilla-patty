import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { aprobacionesDeAsistencia, colaboradores, periodosPlanilla } from "@/db/schema";

export type ConexionDeAprobaciones = Pick<NodePgDatabase<typeof schema>, "select" | "selectDistinct" | "update">;

export interface CambioDeAsistencia {
  /** Personas cuya asistencia, horario o relación laboral cambia; se invalida la aprobación de su grupo. */
  dnis: string[];
  /** Rango de fechas afectado, inclusivo (ISO YYYY-MM-DD). */
  desde: string;
  hasta: string;
  motivo: string;
  /** Solo períodos abiertos: para cambios que no corrigen asistencia de un período cerrado (p. ej. cambiar de grupo). */
  soloAbiertos?: boolean;
}

/** Hasta cuándo llega una relación laboral sin cese. */
export const SIN_FIN = "9999-12-31";
export const SIN_INICIO = "0001-01-01";

/**
 * Invalida la aprobación de asistencia de los grupos de esas personas en los períodos que cruzan el rango (ADR 0012:
 * una corrección exige renovar la aprobación antes de cerrar). Debe llamarse dentro de la MISMA transacción del cambio
 * y antes de tocar filas de asistencia: primero bloquea los períodos FOR UPDATE, igual que `aprobarAsistencia`, y así
 * aprobar y corregir se serializan sin dejar una aprobación vigente obsoleta. La fila no se borra: queda con su motivo.
 */
export async function invalidarAprobacionesDeAsistencia(conexion: ConexionDeAprobaciones, cambio: CambioDeAsistencia, ahora = new Date()): Promise<void> {
  const dnis = [...new Set(cambio.dnis)];
  if (!dnis.length) return;
  const periodos = await conexion.select({ id: periodosPlanilla.id }).from(periodosPlanilla)
    .where(and(
      lte(periodosPlanilla.inicio, cambio.hasta),
      gte(periodosPlanilla.fin, cambio.desde),
      cambio.soloAbiertos ? eq(periodosPlanilla.estado, "abierto") : undefined,
    ))
    .orderBy(asc(periodosPlanilla.id))
    .for("update");
  if (!periodos.length) return;
  const grupos = await conexion.selectDistinct({ grupo: colaboradores.grupo }).from(colaboradores).where(inArray(colaboradores.dni, dnis));
  if (!grupos.length) return;
  await conexion.update(aprobacionesDeAsistencia)
    .set({ invalidadaEn: ahora, motivoDeInvalidacion: cambio.motivo })
    .where(and(
      inArray(aprobacionesDeAsistencia.periodoId, periodos.map(({ id }) => id)),
      inArray(aprobacionesDeAsistencia.grupo, grupos.map(({ grupo }) => grupo)),
      isNull(aprobacionesDeAsistencia.invalidadaEn),
    ));
}

/** Rango mínimo y máximo de un conjunto de fechas ISO. */
export function rangoDeFechas(fechas: string[]): { desde: string; hasta: string } {
  const ordenadas = [...fechas].sort();
  return { desde: ordenadas[0], hasta: ordenadas[ordenadas.length - 1] };
}

/**
 * Toma primero los bloqueos de todos los períodos, en el mismo orden que la invalidación. Quien además bloquea a la
 * persona (Recursos Humanos al confirmar fechas) lo hace antes para respetar el orden período → persona → asistencia.
 */
export async function bloquearPeriodos(conexion: Pick<NodePgDatabase<typeof schema>, "select">): Promise<void> {
  await conexion.select({ id: periodosPlanilla.id }).from(periodosPlanilla).orderBy(asc(periodosPlanilla.id)).for("update");
}
