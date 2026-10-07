import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { MotivoPlanificadoDeNoAsistencia, TipoDeEstadoManual } from "@/asistencias/estado-manual";
import * as schema from "@/db/schema";
import {
  asistenciasEsperadas,
  descansosSemanalesAsignados,
  descansosSustitutorios,
  estadosManuales,
  feriados,
  horasExtra,
  tardanzas,
  turnosPublicados,
} from "@/db/schema";
import { esDescansoSemanal, type DescansoSemanalAsignado } from "@/descansos-y-feriados/reglas";

import type { DiaEspecialDeJornada, HechoDiarioDeAsistencia, ResultadoDeJornada } from "./hechos-para-pagos";

type ConexionDeConsulta = Pick<NodePgDatabase<typeof schema>, "select">;

/**
 * Hechos diarios resueltos de cada persona con horario publicado en el rango del período. Parte de los turnos
 * publicados y no de las asistencias: un día de descanso o de no asistencia planificada no genera asistencia por
 * registrar, pero sigue siendo un hecho que Pagos necesita. La aprobación y el cierre no se copian en los hechos.
 */
export async function construirHechosDiarios(
  conexion: ConexionDeConsulta,
  periodo: { inicio: string; fin: string },
): Promise<HechoDiarioDeAsistencia[]> {
  const jornadas = await conexion.select({
    turnoPublicadoId: turnosPublicados.id,
    dni: turnosPublicados.dni,
    fecha: turnosPublicados.fecha,
    grupo: turnosPublicados.grupo,
    sedeProgramada: turnosPublicados.sede,
    entradaProgramada: turnosPublicados.entradaProgramada,
    salidaProgramada: turnosPublicados.salidaProgramada,
    descanso: turnosPublicados.descanso,
    motivoPlanificado: turnosPublicados.motivoNoAsistencia,
    asistenciaId: asistenciasEsperadas.id,
    estado: asistenciasEsperadas.estado,
    minutosTrabajados: asistenciasEsperadas.minutosTrabajados,
    instantaneaDeTurno: asistenciasEsperadas.instantaneaDeTurno,
  }).from(turnosPublicados).leftJoin(asistenciasEsperadas, and(
    eq(asistenciasEsperadas.dni, turnosPublicados.dni), eq(asistenciasEsperadas.fecha, turnosPublicados.fecha),
  )).where(and(gte(turnosPublicados.fecha, periodo.inicio), lte(turnosPublicados.fecha, periodo.fin)))
    .orderBy(asc(turnosPublicados.dni), asc(turnosPublicados.fecha));
  if (!jornadas.length) return [];

  const asistenciaIds = jornadas.flatMap(({ asistenciaId }) => (asistenciaId ? [asistenciaId] : []));
  const dnis = [...new Set(jornadas.map(({ dni }) => dni))];

  const tipoManualPorAsistencia = new Map<string, TipoDeEstadoManual>();
  const tardanzaPorAsistencia = new Map<string, { minutos: number; minutosPenalizados: number; politicaVersion: number }>();
  const horaExtraPorAsistencia = new Map<string, NonNullable<HechoDiarioDeAsistencia["horaExtra"]>>();
  if (asistenciaIds.length) {
    // El último estado manual registrado es el vigente (mismo criterio que Descansos y feriados).
    for (const { asistenciaId, tipo } of await conexion.select({ asistenciaId: estadosManuales.asistenciaId, tipo: estadosManuales.tipo })
      .from(estadosManuales).where(inArray(estadosManuales.asistenciaId, asistenciaIds)).orderBy(desc(estadosManuales.registradoEn))) {
      if (!tipoManualPorAsistencia.has(asistenciaId)) tipoManualPorAsistencia.set(asistenciaId, tipo);
    }
    for (const fila of await conexion.select().from(tardanzas).where(inArray(tardanzas.asistenciaId, asistenciaIds))) {
      tardanzaPorAsistencia.set(fila.asistenciaId, { minutos: fila.minutosDeTardanza, minutosPenalizados: fila.minutosPenalizados, politicaVersion: fila.politicaVersion });
    }
    for (const fila of await conexion.select().from(horasExtra).where(inArray(horasExtra.asistenciaId, asistenciaIds))) {
      horaExtraPorAsistencia.set(fila.asistenciaId, {
        estado: fila.estado,
        minutosAl25: fila.minutosAl25,
        minutosAl35: fila.minutosAl35,
        trabajoNocturno: fila.trabajoNocturno,
        causaDeDescarte: fila.causaDeDescarte,
      });
    }
  }

  const asignacionesPorDni = new Map<string, DescansoSemanalAsignado[]>();
  for (const fila of await conexion.select().from(descansosSemanalesAsignados).where(inArray(descansosSemanalesAsignados.dni, dnis))) {
    const asignaciones = asignacionesPorDni.get(fila.dni) ?? [];
    asignaciones.push({ dni: fila.dni, diaDeLaSemana: fila.diaSemana, vigenteDesde: fila.vigenteDesde });
    asignacionesPorDni.set(fila.dni, asignaciones);
  }
  const claseDeFeriadoPorFecha = new Map((await conexion.select({ fecha: feriados.fecha, clase: feriados.clase }).from(feriados)
    .where(and(gte(feriados.fecha, periodo.inicio), lte(feriados.fecha, periodo.fin)))).map(({ fecha, clase }) => [fecha, clase]));
  const sustitutorioPorDniYFecha = new Map((await conexion.select({
    dni: descansosSustitutorios.dni,
    origenFecha: descansosSustitutorios.origenFecha,
    estado: descansosSustitutorios.estado,
    fechaPrevista: descansosSustitutorios.fechaPrevista,
  }).from(descansosSustitutorios).where(and(
    inArray(descansosSustitutorios.dni, dnis), gte(descansosSustitutorios.origenFecha, periodo.inicio), lte(descansosSustitutorios.origenFecha, periodo.fin),
  ))).map(({ dni, origenFecha, estado, fechaPrevista }) => [`${dni}|${origenFecha}`, { estado, fechaPrevista }]));

  return jornadas.map((jornada): HechoDiarioDeAsistencia => {
    const resultado = resultadoDeLaJornada(jornada, tipoManualPorAsistencia);
    const instantanea = resultado === "trabajada" ? jornada.instantaneaDeTurno : null;
    const descansoSemanal = esDescansoSemanal(asignacionesPorDni.get(jornada.dni) ?? [], jornada.fecha);
    const feriado = claseDeFeriadoPorFecha.get(jornada.fecha) ?? null;
    const diaEspecial: DiaEspecialDeJornada | null = descansoSemanal || feriado
      ? { descansoSemanal, feriado, sustitutorio: sustitutorioPorDniYFecha.get(`${jornada.dni}|${jornada.fecha}`) ?? null }
      : null;
    return {
      dni: jornada.dni,
      fecha: jornada.fecha,
      grupo: jornada.grupo,
      sede: resultado === "trabajada" ? instantanea?.sede ?? jornada.sedeProgramada : resultado === "pendiente" ? jornada.sedeProgramada : null,
      horarioAplicado: {
        entradaProgramada: instantanea ? instantanea.entradaProgramada : jornada.entradaProgramada,
        salidaProgramada: instantanea ? instantanea.salidaProgramada : jornada.salidaProgramada,
      },
      resultado,
      minutosTrabajados: resultado === "trabajada" ? jornada.minutosTrabajados ?? 0 : 0,
      tardanza: jornada.asistenciaId ? tardanzaPorAsistencia.get(jornada.asistenciaId) ?? null : null,
      horaExtra: jornada.asistenciaId ? horaExtraPorAsistencia.get(jornada.asistenciaId) ?? null : null,
      diaEspecial,
      evidencia: { asistenciaId: jornada.asistenciaId, turnoPublicadoId: jornada.turnoPublicadoId },
    };
  });
}

function resultadoDeLaJornada(
  jornada: {
    dni: string;
    fecha: string;
    descanso: boolean;
    motivoPlanificado: MotivoPlanificadoDeNoAsistencia | null;
    asistenciaId: string | null;
    estado: "pendiente" | "confirmada" | "manual" | null;
  },
  tipoManualPorAsistencia: Map<string, TipoDeEstadoManual>,
): ResultadoDeJornada {
  // Con asistencia registrada manda su estado; sin ella, el día de descanso o de motivo planificado ya está resuelto.
  if (jornada.asistenciaId === null) return jornada.motivoPlanificado ?? (jornada.descanso ? "descanso" : "pendiente");
  if (jornada.estado === "confirmada") return "trabajada";
  if (jornada.estado === "manual") {
    const tipo = tipoManualPorAsistencia.get(jornada.asistenciaId);
    if (!tipo) throw new Error(`La jornada manual de ${jornada.dni} del ${jornada.fecha} no tiene motivo real.`);
    return tipo;
  }
  return "pendiente";
}
