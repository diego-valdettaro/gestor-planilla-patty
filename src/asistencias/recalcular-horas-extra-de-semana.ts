import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import { asistenciasEsperadas, horasExtra, periodosPlanilla } from "@/db/schema";

import { calcularHorasExtraDeSemana, lunesDeLaSemana, type HoraExtraCalculada } from "./calcular-hora-extra";

type Transaccion = Parameters<NodePgDatabase<typeof schema>["transaction"]>[0] extends (tx: infer T) => unknown ? T : never;

/**
 * Recalcula las horas extra de la semana lunes–domingo que contiene `fecha`. Las jornadas de
 * períodos cerrados cuentan para el límite semanal, pero conservan su hora extra tal como quedó.
 * Una hora extra cuyos minutos no cambian conserva su decisión, salvo la de `fechaAjustada`,
 * que vuelve a decidirse aunque no cambie.
 */
export async function recalcularHorasExtraDeSemana(
  tx: Transaccion,
  idHuellero: string,
  fecha: string,
  fechaAjustada?: string,
): Promise<void> {
  const lunes = lunesDeLaSemana(fecha);
  const domingo = sumarDias(lunes, 6);
  // Serializa los recálculos de una misma persona y semana: cada uno debe ver las jornadas que otro acaba de confirmar.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${idHuellero}), hashtext(${lunes}))`);
  const jornadas = await tx.select({
    id: asistenciasEsperadas.id,
    fecha: asistenciasEsperadas.fecha,
    entradaReal: asistenciasEsperadas.entradaReal,
    salidaReal: asistenciasEsperadas.salidaReal,
    instantaneaDeTurno: asistenciasEsperadas.instantaneaDeTurno,
  }).from(asistenciasEsperadas).where(and(
    eq(asistenciasEsperadas.idHuellero, idHuellero),
    eq(asistenciasEsperadas.estado, "confirmada"),
    gte(asistenciasEsperadas.fecha, lunes),
    lte(asistenciasEsperadas.fecha, domingo),
  )).for("update");

  const medibles = jornadas.flatMap((jornada) => {
    const turno = jornada.instantaneaDeTurno;
    if (!jornada.entradaReal || !jornada.salidaReal || !turno || turno.descanso || !turno.entradaProgramada || !turno.salidaProgramada) return [];
    return [{
      id: jornada.id, fecha: jornada.fecha, entradaReal: jornada.entradaReal, salidaReal: jornada.salidaReal,
      entradaProgramada: turno.entradaProgramada, salidaProgramada: turno.salidaProgramada,
    }];
  });
  if (!medibles.length) return;

  const calculadas = calcularHorasExtraDeSemana(medibles);
  const periodosCerrados = await tx.select({ inicio: periodosPlanilla.inicio, fin: periodosPlanilla.fin })
    .from(periodosPlanilla).where(and(
      eq(periodosPlanilla.estado, "cerrado"), lte(periodosPlanilla.inicio, domingo), gte(periodosPlanilla.fin, lunes),
    ));
  const existentes = await tx.select().from(horasExtra).innerJoin(asistenciasEsperadas, eq(horasExtra.asistenciaId, asistenciasEsperadas.id))
    .where(and(eq(asistenciasEsperadas.idHuellero, idHuellero), gte(asistenciasEsperadas.fecha, lunes), lte(asistenciasEsperadas.fecha, domingo)));
  const existentePorAsistencia = new Map(existentes.map((fila) => [fila.horas_extra.asistenciaId, fila.horas_extra]));

  for (const jornada of medibles) {
    if (periodosCerrados.some(({ inicio, fin }) => inicio <= jornada.fecha && fin >= jornada.fecha)) continue;
    const calculada = calculadas.get(jornada.fecha);
    const existente = existentePorAsistencia.get(jornada.id);
    if (!calculada) {
      if (existente) await tx.delete(horasExtra).where(eq(horasExtra.asistenciaId, jornada.id));
    } else if (!existente) {
      await tx.insert(horasExtra).values({ asistenciaId: jornada.id, ...calculada });
    } else if (jornada.fecha === fechaAjustada || cambio(existente, calculada)) {
      await tx.update(horasExtra)
        .set({ ...calculada, decididaPorId: null, decididaEn: null })
        .where(eq(horasExtra.asistenciaId, jornada.id));
    }
  }
}

function cambio(existente: { minutosAl25: number; minutosAl35: number; trabajoNocturno: boolean }, calculada: HoraExtraCalculada): boolean {
  return existente.minutosAl25 !== calculada.minutosAl25
    || existente.minutosAl35 !== calculada.minutosAl35
    || existente.trabajoNocturno !== calculada.trabajoNocturno;
}

function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}
