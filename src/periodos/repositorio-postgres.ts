import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import {
  aprobacionesDeAsistencia,
  asistenciasEsperadas,
  auditoriaPeriodosPlanilla,
  colaboradores,
  cuentasLocales,
  estadosManuales,
  gerentesDeGrupo,
  grupos,
  horasExtra,
  periodosPlanilla,
  relacionesLaborales,
  revisionesDePeriodosPlanilla,
  tardanzas,
  turnosPublicados,
} from "@/db/schema";

import { vigenciasConfirmadas, type RelacionLaboral } from "@/relaciones-laborales/vigencia";

import { construirHechosDiarios } from "./hechos-de-asistencia-postgres";
import type { LectorDeHechosDeAsistencia, RevisionDeAsistenciaParaPagos } from "./hechos-para-pagos";
import { calcularBloqueosDeAprobacion, type BloqueoDeAprobacion, type JornadaParaAprobar } from "./aprobacion-de-asistencia";
import {
  AprobacionBloqueadaError,
  crearResumenVacio,
  PeriodosSolapadosError,
  type AprobacionDeGrupo,
  type BloqueoDePeriodo,
  type DecisionDeHoraExtra,
  type DetalleDeJornada,
  type EstadoDeHoraExtra,
  type FiltrosDeResumen,
  type FilaDeResumen,
  type MotivoDeNoAsistencia,
  type PeriodoPlanilla,
  type RepositorioDePeriodos,
  type ResumenDePeriodo,
  type RevisionDePeriodo,
} from "./periodo-planilla";

export class RepositorioPostgresDePeriodos implements RepositorioDePeriodos, LectorDeHechosDeAsistencia {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async listar(): Promise<PeriodoPlanilla[]> {
    return this.db.select().from(periodosPlanilla);
  }

  async buscar(id: string): Promise<PeriodoPlanilla | undefined> {
    const [periodo] = await this.db.select().from(periodosPlanilla).where(eq(periodosPlanilla.id, id));
    return periodo;
  }

  async listarResumen(filtros: FiltrosDeResumen): Promise<ResumenDePeriodo> {
    const periodo = await this.buscar(filtros.periodoId);
    if (!periodo) throw new Error("No existe el período de planilla.");
    if (periodo.estado === "cerrado") {
      const [revision] = await this.db.select().from(revisionesDePeriodosPlanilla)
        .where(eq(revisionesDePeriodosPlanilla.periodoId, periodo.id))
        .orderBy(desc(revisionesDePeriodosPlanilla.numero))
        .limit(1);
      if (revision) return filtrarResumen(revision.resumen, filtros);
    }
    return construirResumen(this.db, periodo, filtros);
  }

  async listarRevisiones(periodoId: string): Promise<RevisionDePeriodo[]> {
    return this.db.select({
      id: revisionesDePeriodosPlanilla.id,
      periodoId: revisionesDePeriodosPlanilla.periodoId,
      numero: revisionesDePeriodosPlanilla.numero,
      resumen: revisionesDePeriodosPlanilla.resumen,
      responsableId: revisionesDePeriodosPlanilla.responsableId,
      cerradaEn: revisionesDePeriodosPlanilla.cerradaEn,
    }).from(revisionesDePeriodosPlanilla)
      .where(eq(revisionesDePeriodosPlanilla.periodoId, periodoId))
      .orderBy(asc(revisionesDePeriodosPlanilla.numero));
  }

  /** Hechos congelados de la última revisión de un período cerrado, o en vivo y provisionales si sigue abierto. */
  async leerHechosDelPeriodo(periodoId: string): Promise<RevisionDeAsistenciaParaPagos> {
    const periodo = await this.buscar(periodoId);
    if (!periodo) throw new Error("No existe el período de planilla.");
    if (periodo.estado === "abierto") {
      return {
        periodoId,
        revisionId: null,
        numero: null,
        inicio: periodo.inicio,
        fin: periodo.fin,
        provisional: true,
        hechos: await construirHechosDiarios(this.db, periodo),
      };
    }
    const [revision] = await this.db.select({
      id: revisionesDePeriodosPlanilla.id,
      numero: revisionesDePeriodosPlanilla.numero,
      hechos: revisionesDePeriodosPlanilla.hechos,
    }).from(revisionesDePeriodosPlanilla)
      .where(eq(revisionesDePeriodosPlanilla.periodoId, periodoId))
      .orderBy(desc(revisionesDePeriodosPlanilla.numero))
      .limit(1);
    if (!revision) throw new Error("El período cerrado no tiene una revisión.");
    if (!revision.hechos) throw new Error(`La revisión ${revision.numero} del período ${periodo.inicio} al ${periodo.fin} no tiene hechos congelados: reábralo y ciérrelo de nuevo.`);
    return { periodoId, revisionId: revision.id, numero: revision.numero, inicio: periodo.inicio, fin: periodo.fin, provisional: false, hechos: revision.hechos };
  }

  async listarAprobaciones(periodoId: string): Promise<AprobacionDeGrupo[]> {
    const periodo = await this.buscar(periodoId);
    if (!periodo) throw new Error("No existe el período de planilla.");
    const gruposQueGestionan = await this.db.select({ nombre: grupos.nombre }).from(grupos)
      .where(eq(grupos.gestionaAsistencia, true)).orderBy(asc(grupos.nombre));
    const gerentes = new Map((await this.db.select({ grupo: gerentesDeGrupo.grupo, nombreUsuario: cuentasLocales.nombreUsuario })
      .from(gerentesDeGrupo).innerJoin(cuentasLocales, eq(cuentasLocales.id, gerentesDeGrupo.cuentaId)))
      .map(({ grupo, nombreUsuario }) => [grupo, nombreUsuario]));
    const registradas = await this.db.select({
      grupo: aprobacionesDeAsistencia.grupo,
      aprobadaPor: cuentasLocales.nombreUsuario,
      aprobadaEn: aprobacionesDeAsistencia.aprobadaEn,
      invalidadaEn: aprobacionesDeAsistencia.invalidadaEn,
      motivoDeInvalidacion: aprobacionesDeAsistencia.motivoDeInvalidacion,
    }).from(aprobacionesDeAsistencia)
      .innerJoin(cuentasLocales, eq(cuentasLocales.id, aprobacionesDeAsistencia.aprobadaPorId))
      .where(eq(aprobacionesDeAsistencia.periodoId, periodoId))
      .orderBy(desc(aprobacionesDeAsistencia.aprobadaEn));
    const resultado: AprobacionDeGrupo[] = [];
    for (const { nombre } of gruposQueGestionan) {
      const delGrupo = registradas.filter(({ grupo }) => grupo === nombre);
      const vigente = delGrupo.find(({ invalidadaEn }) => invalidadaEn === null);
      const ultima = vigente ?? delGrupo[0];
      const estado = vigente ? "aprobada" : ultima ? "invalidada" : "pendiente";
      resultado.push({
        grupo: nombre,
        gerente: gerentes.get(nombre) ?? null,
        estado,
        aprobadaPor: vigente?.aprobadaPor ?? null,
        aprobadaEn: vigente?.aprobadaEn ?? null,
        invalidadaEn: estado === "invalidada" ? ultima.invalidadaEn : null,
        motivoDeInvalidacion: estado === "invalidada" ? ultima.motivoDeInvalidacion : null,
        bloqueos: vigente ? [] : await bloqueosDeAprobacion(this.db, periodo, nombre),
      });
    }
    return resultado;
  }

  async aprobarAsistencia(periodoId: string, grupo: string, responsableId: string, aprobadaEn: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Mismo bloqueo del período que toma toda corrección de asistencia: aprobar y corregir se serializan.
      const [periodo] = await tx.select().from(periodosPlanilla).where(eq(periodosPlanilla.id, periodoId)).for("update");
      if (!periodo || periodo.estado !== "abierto") throw new Error("El período no existe o no está abierto.");
      const [grupoDelPeriodo] = await tx.select({ gestionaAsistencia: grupos.gestionaAsistencia }).from(grupos).where(eq(grupos.nombre, grupo));
      if (!grupoDelPeriodo) throw new Error("No existe el grupo.");
      if (!grupoDelPeriodo.gestionaAsistencia) throw new Error("El grupo no gestiona asistencia: no requiere aprobación.");
      const [vigente] = await tx.select({ id: aprobacionesDeAsistencia.id }).from(aprobacionesDeAsistencia).where(and(
        eq(aprobacionesDeAsistencia.periodoId, periodoId), eq(aprobacionesDeAsistencia.grupo, grupo), isNull(aprobacionesDeAsistencia.invalidadaEn),
      ));
      if (vigente) throw new Error("La asistencia del grupo ya está aprobada para este período.");
      const bloqueos = await bloqueosDeAprobacion(tx, periodo, grupo);
      if (bloqueos.length) throw new AprobacionBloqueadaError(bloqueos);
      await tx.insert(aprobacionesDeAsistencia).values({ periodoId, grupo, aprobadaPorId: responsableId, aprobadaEn });
    });
  }

  async crear(inicio: string, fin: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const solapados = await tx.select({ id: periodosPlanilla.id }).from(periodosPlanilla)
        .where(and(lte(periodosPlanilla.inicio, fin), gte(periodosPlanilla.fin, inicio)));
      if (solapados.length) throw new PeriodosSolapadosError();
      await tx.insert(periodosPlanilla).values({ inicio, fin, estado: "abierto" });
    });
  }

  async decidirHorasExtra(
    periodoId: string,
    horasExtraIds: string[],
    decision: DecisionDeHoraExtra,
    responsableId: string,
    registradaEn: Date,
  ): Promise<void> {
    const ids = [...new Set(horasExtraIds)];
    if (!ids.length) throw new Error("Debe seleccionar al menos una hora extra.");
    await this.db.transaction(async (tx) => {
      const [periodo] = await tx.select().from(periodosPlanilla)
        .where(eq(periodosPlanilla.id, periodoId))
        .for("update");
      if (!periodo || periodo.estado !== "abierto") throw new Error("El período no existe o no está abierto.");
      const actualizadas = await tx.update(horasExtra)
        .set({
          estado: decision.estado,
          causaDeDescarte: decision.estado === "descartada" ? decision.causa : null,
          motivoDeDescarte: decision.estado === "descartada" ? decision.motivo : null,
          decididaPorId: responsableId,
          decididaEn: registradaEn,
        })
        .from(asistenciasEsperadas)
        .where(and(
          eq(horasExtra.asistenciaId, asistenciasEsperadas.id),
          inArray(horasExtra.id, ids),
          eq(horasExtra.estado, "pendiente"),
          gte(asistenciasEsperadas.fecha, periodo.inicio),
          lte(asistenciasEsperadas.fecha, periodo.fin),
        ))
        .returning({ id: horasExtra.id });
      if (actualizadas.length !== ids.length) {
        throw new Error("Todas las horas extra seleccionadas deben estar pendientes y pertenecer al período abierto.");
      }
    });
  }

  async cerrar(id: string, responsableId: string, registradoEn: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [periodo] = await tx.select().from(periodosPlanilla)
        .where(eq(periodosPlanilla.id, id))
        .for("update");
      if (!periodo || periodo.estado !== "abierto") throw new Error("El período no existe o ya está cerrado.");

      // El cierre exige la aprobación vigente de todos los grupos que gestionan asistencia (ADR 0012); Finanzas no aprueba por ellos.
      const sinAprobar = await gruposSinAprobacionVigente(tx, id);
      if (sinAprobar.length) {
        throw new Error(`No se puede cerrar el período: falta la aprobación ${sinAprobar.length === 1 ? "del grupo" : "de los grupos"} ${sinAprobar.join(", ")}. Pida al gerente de área ${sinAprobar.length === 1 ? "del grupo" : "de cada grupo"} que apruebe; Finanzas no aprueba en su nombre.`);
      }

      const pendientes = await tx.select({ id: asistenciasEsperadas.id }).from(asistenciasEsperadas)
        .where(and(
          gte(asistenciasEsperadas.fecha, periodo.inicio),
          lte(asistenciasEsperadas.fecha, periodo.fin),
          eq(asistenciasEsperadas.estado, "pendiente"),
        ));
      if (pendientes.length) throw new Error("No se puede cerrar el período: existen asistencias pendientes de revisión.");

      const extrasPendientes = await tx.select({ id: horasExtra.id }).from(horasExtra)
        .innerJoin(asistenciasEsperadas, eq(horasExtra.asistenciaId, asistenciasEsperadas.id))
        .where(and(
          gte(asistenciasEsperadas.fecha, periodo.inicio),
          lte(asistenciasEsperadas.fecha, periodo.fin),
          eq(horasExtra.estado, "pendiente"),
        ));
      if (extrasPendientes.length) throw new Error("No se puede cerrar el período: existen horas extra pendientes de decisión.");

      const resumen = await construirResumen(tx, periodo, { periodoId: id });
      const [anterior] = await tx.select({ numero: revisionesDePeriodosPlanilla.numero })
        .from(revisionesDePeriodosPlanilla)
        .where(eq(revisionesDePeriodosPlanilla.periodoId, id))
        .orderBy(desc(revisionesDePeriodosPlanilla.numero))
        .limit(1);
      await tx.insert(revisionesDePeriodosPlanilla).values({
        periodoId: id,
        numero: (anterior?.numero ?? 0) + 1,
        resumen,
        hechos: await construirHechosDiarios(tx, periodo),
        responsableId,
        cerradaEn: registradoEn,
      });
      await tx.update(periodosPlanilla)
        .set({ estado: "cerrado", cerradoPorId: responsableId, cerradoEn: registradoEn })
        .where(eq(periodosPlanilla.id, id));
      await tx.insert(auditoriaPeriodosPlanilla).values({
        periodoId: id,
        accion: "cierre",
        responsableId,
        registradoEn,
      });
    });
  }

  async reabrir(id: string, responsableId: string, motivo: string, registradoEn: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      const actualizado = await tx.update(periodosPlanilla)
        .set({ estado: "abierto", cerradoPorId: null, cerradoEn: null })
        .where(and(eq(periodosPlanilla.id, id), eq(periodosPlanilla.estado, "cerrado")))
        .returning({ id: periodosPlanilla.id });
      if (!actualizado.length) throw new Error("El período no existe o ya está abierto.");
      await tx.insert(auditoriaPeriodosPlanilla).values({
        periodoId: id,
        accion: "reapertura",
        responsableId,
        motivo,
        registradoEn,
      });
    });
  }
}

type ConexionDeConsulta = Pick<NodePgDatabase<typeof schema>, "select">;

async function gruposSinAprobacionVigente(conexion: ConexionDeConsulta, periodoId: string): Promise<string[]> {
  const requeridos = await conexion.select({ nombre: grupos.nombre }).from(grupos).where(eq(grupos.gestionaAsistencia, true)).orderBy(asc(grupos.nombre));
  const aprobados = new Set((await conexion.select({ grupo: aprobacionesDeAsistencia.grupo }).from(aprobacionesDeAsistencia)
    .where(and(eq(aprobacionesDeAsistencia.periodoId, periodoId), isNull(aprobacionesDeAsistencia.invalidadaEn)))).map(({ grupo }) => grupo));
  return requeridos.map(({ nombre }) => nombre).filter((nombre) => !aprobados.has(nombre));
}

/** Personas del grupo con relación laboral confirmada en el período que no tienen horario o tienen asistencia pendiente. */
async function bloqueosDeAprobacion(
  conexion: ConexionDeConsulta,
  periodo: PeriodoPlanilla,
  grupo: string,
): Promise<BloqueoDeAprobacion[]> {
  const integrantes = await conexion.select({ dni: colaboradores.dni, nombre: colaboradores.nombre }).from(colaboradores).where(eq(colaboradores.grupo, grupo));
  if (!integrantes.length) return [];
  const dnis = integrantes.map(({ dni }) => dni);
  const relaciones = await conexion.select({
    id: relacionesLaborales.id,
    dni: relacionesLaborales.dni,
    ingreso: relacionesLaborales.ingreso,
    cese: relacionesLaborales.cese,
    ingresoConfirmadoEn: relacionesLaborales.ingresoConfirmadoEn,
    ceseConfirmadoEn: relacionesLaborales.ceseConfirmadoEn,
  }).from(relacionesLaborales).where(inArray(relacionesLaborales.dni, dnis));
  const personas = integrantes.map(({ dni, nombre }) => ({
    dni,
    nombre,
    vigencias: vigenciasConfirmadas(relaciones.filter((relacion) => relacion.dni === dni).map((relacion): RelacionLaboral => ({
      id: relacion.id,
      dni: relacion.dni,
      ingreso: relacion.ingreso,
      cese: relacion.cese,
      ingresoConfirmado: relacion.ingresoConfirmadoEn !== null,
      ceseConfirmado: relacion.ceseConfirmadoEn !== null,
    }))),
  }));
  const publicadas = await conexion.select({
    dni: turnosPublicados.dni,
    fecha: turnosPublicados.fecha,
    descanso: turnosPublicados.descanso,
    motivoNoAsistencia: turnosPublicados.motivoNoAsistencia,
    estado: asistenciasEsperadas.estado,
  }).from(turnosPublicados).leftJoin(asistenciasEsperadas, and(
    eq(asistenciasEsperadas.dni, turnosPublicados.dni), eq(asistenciasEsperadas.fecha, turnosPublicados.fecha),
  )).where(and(inArray(turnosPublicados.dni, dnis), gte(turnosPublicados.fecha, periodo.inicio), lte(turnosPublicados.fecha, periodo.fin)));
  const jornadas: JornadaParaAprobar[] = publicadas.map((jornada) => ({
    dni: jornada.dni,
    fecha: jornada.fecha,
    // Una jornada laboral sin fila de asistencia tampoco está resuelta; los días de descanso o de motivo no la necesitan.
    situacion: jornada.estado === "pendiente" || (jornada.estado === null && !jornada.descanso && !jornada.motivoNoAsistencia) ? "pendiente" : "resuelta",
  }));
  return calcularBloqueosDeAprobacion(periodo, personas, jornadas);
}

async function construirResumen(
  conexion: ConexionDeConsulta,
  periodo: PeriodoPlanilla,
  filtros: FiltrosDeResumen,
): Promise<ResumenDePeriodo> {
  const jornadas = await conexion.select({
    dni: asistenciasEsperadas.dni,
    nombre: colaboradores.nombre,
    grupoActual: colaboradores.grupo,
    fecha: asistenciasEsperadas.fecha,
    grupo: turnosPublicados.grupo,
    sedeProgramada: turnosPublicados.sede,
    instantaneaDeTurno: asistenciasEsperadas.instantaneaDeTurno,
    estado: asistenciasEsperadas.estado,
    entradaReal: asistenciasEsperadas.entradaReal,
    salidaReal: asistenciasEsperadas.salidaReal,
    minutosTrabajados: asistenciasEsperadas.minutosTrabajados,
    motivoReal: estadosManuales.tipo,
    tardanza: tardanzas.minutosDeTardanza,
    penalizados: tardanzas.minutosPenalizados,
    politicaVersion: tardanzas.politicaVersion,
    horaExtraId: horasExtra.id,
    al25: horasExtra.minutosAl25,
    al35: horasExtra.minutosAl35,
    estadoExtra: horasExtra.estado,
  })
    .from(asistenciasEsperadas)
    .innerJoin(colaboradores, eq(asistenciasEsperadas.dni, colaboradores.dni))
    .innerJoin(turnosPublicados, and(
      eq(turnosPublicados.dni, asistenciasEsperadas.dni),
      eq(turnosPublicados.fecha, asistenciasEsperadas.fecha),
    ))
    .leftJoin(estadosManuales, eq(estadosManuales.asistenciaId, asistenciasEsperadas.id))
    .leftJoin(tardanzas, eq(tardanzas.asistenciaId, asistenciasEsperadas.id))
    .leftJoin(horasExtra, eq(horasExtra.asistenciaId, asistenciasEsperadas.id))
    .where(and(gte(asistenciasEsperadas.fecha, periodo.inicio), lte(asistenciasEsperadas.fecha, periodo.fin)));

  const agrupadas = new Map<string, FilaDeResumen>();
  const bloqueos: BloqueoDePeriodo[] = [];
  for (const jornada of jornadas) {
    const clave = `${jornada.grupo}:${jornada.dni}`;
    const fila = agrupadas.get(clave) ?? crearFilaVacia(jornada.dni, jornada.nombre, jornada.grupo);
    const resultado = jornada.estado === "pendiente" ? "pendiente" : jornada.estado === "manual" ? jornada.motivoReal : "trabajada";
    if (!resultado) throw new Error(`La jornada manual de ${jornada.dni} del ${jornada.fecha} no tiene motivo real.`);
    const detalle: DetalleDeJornada = {
      fecha: jornada.fecha,
      sede: jornada.estado === "confirmada"
        ? jornada.instantaneaDeTurno?.sede ?? jornada.sedeProgramada
        : jornada.estado === "manual" ? null : jornada.sedeProgramada,
      resultado,
      entradaReal: jornada.entradaReal,
      salidaReal: jornada.salidaReal,
      minutosTrabajados: jornada.minutosTrabajados ?? 0,
      tardanzaEnMinutos: jornada.tardanza ?? 0,
      minutosPenalizados: jornada.penalizados ?? 0,
      politicaDeTardanzaVersion: jornada.politicaVersion,
      ...(jornada.estadoExtra && jornada.horaExtraId ? {
        horaExtra: {
          id: jornada.horaExtraId,
          estado: jornada.estadoExtra,
          minutosAl25: jornada.al25 ?? 0,
          minutosAl35: jornada.al35 ?? 0,
        },
      } : {}),
    };
    fila.jornadas.push(detalle);
    if (resultado === "trabajada") fila.jornadasTrabajadas += 1;
    if (esMotivoDeNoAsistencia(resultado)) fila.noAsistencias[resultado] += 1;
    fila.minutosTrabajados += detalle.minutosTrabajados;
    fila.cantidadTardanzas += jornada.tardanza === null ? 0 : 1;
    fila.minutosPenalizados += detalle.minutosPenalizados;
    if (detalle.horaExtra) sumarHoraExtra(fila, detalle.horaExtra.estado, detalle.horaExtra.minutosAl25, detalle.horaExtra.minutosAl35);
    if (resultado === "pendiente") bloqueos.push({ tipo: "asistencia", dni: jornada.dni, nombre: jornada.nombre, grupo: jornada.grupoActual, fecha: jornada.fecha });
    if (jornada.estadoExtra === "pendiente") bloqueos.push({ tipo: "hora-extra", dni: jornada.dni, nombre: jornada.nombre, grupo: jornada.grupoActual, fecha: jornada.fecha });
    agrupadas.set(clave, fila);
  }

  const todasLasFilas = [...agrupadas.values()];
  for (const fila of todasLasFilas) fila.jornadas.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const totales = todasLasFilas.reduce((acumulado, fila) => sumarFila(acumulado, fila), crearResumenVacio().totales);
  const filas = todasLasFilas.filter((fila) => cumpleFiltros(fila, filtros))
    .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nombre.localeCompare(b.nombre));
  return { filas, totales, bloqueos };
}

function filtrarResumen(resumen: ResumenDePeriodo, filtros: FiltrosDeResumen): ResumenDePeriodo {
  return {
    ...resumen,
    filas: resumen.filas.filter((fila) => cumpleFiltros(fila, filtros)),
  };
}

function cumpleFiltros(fila: FilaDeResumen, filtros: FiltrosDeResumen): boolean {
  return (!filtros.dni || fila.dni === filtros.dni)
    && (!filtros.sede || fila.jornadas.some(({ sede }) => sede === filtros.sede));
}

const MOTIVOS_DE_NO_ASISTENCIA: MotivoDeNoAsistencia[] = ["falta", "descanso", "feriado", "vacaciones", "permiso", "suspension"];
const ESTADOS_DE_HORA_EXTRA: EstadoDeHoraExtra[] = ["pendiente", "aprobada", "descartada"];

function crearFilaVacia(dni: string, nombre: string, grupo: string): FilaDeResumen {
  return { dni, nombre, grupo, ...crearResumenVacio().totales, jornadas: [] };
}

function esMotivoDeNoAsistencia(resultado: DetalleDeJornada["resultado"]): resultado is MotivoDeNoAsistencia {
  return MOTIVOS_DE_NO_ASISTENCIA.includes(resultado as MotivoDeNoAsistencia);
}

function sumarHoraExtra(fila: Pick<FilaDeResumen, "horasExtra">, estado: EstadoDeHoraExtra, minutosAl25: number, minutosAl35: number) {
  fila.horasExtra[estado].minutosAl25 += minutosAl25;
  fila.horasExtra[estado].minutosAl35 += minutosAl35;
}

function sumarFila(totales: ResumenDePeriodo["totales"], fila: FilaDeResumen): ResumenDePeriodo["totales"] {
  totales.jornadasTrabajadas += fila.jornadasTrabajadas;
  totales.minutosTrabajados += fila.minutosTrabajados;
  totales.cantidadTardanzas += fila.cantidadTardanzas;
  totales.minutosPenalizados += fila.minutosPenalizados;
  for (const motivo of MOTIVOS_DE_NO_ASISTENCIA) totales.noAsistencias[motivo] += fila.noAsistencias[motivo];
  for (const estado of ESTADOS_DE_HORA_EXTRA) {
    sumarHoraExtra(totales, estado, fila.horasExtra[estado].minutosAl25, fila.horasExtra[estado].minutosAl35);
  }
  return totales;
}
