import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { RepositorioPostgresDeTurnos } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("RepositorioPostgresDeTurnos", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeTurnos(db);
  const idHuellero = `TEST-${randomUUID()}`;
  const fecha = "2030-09-02";
  const fechaParaAtomicidad = "2030-09-03";
  const semanaDePlan = "2030-09-02";
  const fechasDeCorreccion = Array.from({ length: 7 }, (_, indice) => new Date(Date.UTC(2030, 8, 10 + indice)).toISOString().slice(0, 10));
  const semanaProcesada = "2030-09-17";
  const fechasProcesadas = Array.from({ length: 7 }, (_, indice) => new Date(Date.UTC(2030, 8, 17 + indice)).toISOString().slice(0, 10));
  const cuentaId = randomUUID();

  beforeAll(async () => {
    await db.insert(schema.colaboradores).values({
      idHuellero,
      nombre: "Ana Rojas",
      sede: "Lima",      activo: true,
    });
    await db.insert(schema.periodosPlanilla).values({
      inicio: "2030-08-26",
      fin: "2030-09-25",
      estado: "abierto",
    });
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `turnos-${cuentaId}`, hashContrasena: "prueba", rol: "operaciones" });
  });

  afterAll(async () => {
    await db.delete(schema.horariosSemanalesProcesados).where(and(eq(schema.horariosSemanalesProcesados.idHuellero, idHuellero), eq(schema.horariosSemanalesProcesados.semana, semanaProcesada)));
    const turnos = await db
      .select({ id: schema.turnosPublicados.id })
      .from(schema.turnosPublicados)
      .where(and(eq(schema.turnosPublicados.idHuellero, idHuellero), inArray(schema.turnosPublicados.fecha, [fecha, fechaParaAtomicidad, ...fechasDeCorreccion, ...fechasProcesadas])));

    const asistencias = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.idHuellero, idHuellero), inArray(schema.asistenciasEsperadas.fecha, [fecha, fechaParaAtomicidad, ...fechasDeCorreccion, ...fechasProcesadas])));
    if (asistencias.length) {
      await db.delete(schema.tardanzas).where(inArray(schema.tardanzas.asistenciaId, asistencias.map(({ id }) => id)));
      await db.delete(schema.horasExtra).where(inArray(schema.horasExtra.asistenciaId, asistencias.map(({ id }) => id)));
    }

    await db
      .delete(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.idHuellero, idHuellero), inArray(schema.asistenciasEsperadas.fecha, [fecha, fechaParaAtomicidad, ...fechasDeCorreccion, ...fechasProcesadas])));
    if (turnos.length) {
      await db
        .delete(schema.historialDeTurnosPublicados)
        .where(inArray(schema.historialDeTurnosPublicados.turnoPublicadoId, turnos.map(({ id }) => id)));
    }
    await db
      .delete(schema.turnosPublicados)
      .where(and(eq(schema.turnosPublicados.idHuellero, idHuellero), inArray(schema.turnosPublicados.fecha, [fecha, fechaParaAtomicidad, ...fechasDeCorreccion, ...fechasProcesadas])));
    await db
      .delete(schema.periodosPlanilla)
      .where(and(eq(schema.periodosPlanilla.inicio, "2030-08-26"), eq(schema.periodosPlanilla.fin, "2030-09-25")));
    const planes = await db.select({ id: schema.planesSemanalesEnBorrador.id }).from(schema.planesSemanalesEnBorrador)
      .where(and(eq(schema.planesSemanalesEnBorrador.semana, semanaDePlan), eq(schema.planesSemanalesEnBorrador.equipo, "tiendas")));
    if (planes.length) await db.delete(schema.celdasDePlanesSemanalesEnBorrador).where(inArray(schema.celdasDePlanesSemanalesEnBorrador.planId, planes.map(({ id }) => id)));
    await db.delete(schema.planesSemanalesEnBorrador).where(and(eq(schema.planesSemanalesEnBorrador.semana, semanaDePlan), eq(schema.planesSemanalesEnBorrador.equipo, "tiendas")));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.idHuellero, idHuellero));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await pool.end();
  });

  it("guarda el turno, su historial y la asistencia esperada", async () => {
    await repositorio.publicar({
      idHuellero,
      fecha,
      sede: "Lima",
      entradaProgramada: "09:00",
      salidaProgramada: "18:00",
      descanso: false,
    });

    await expect(repositorio.buscarPublicado(idHuellero, fecha)).resolves.toMatchObject({
      idHuellero,
      fecha,
      sede: "Lima",
    });
    await expect(
      db
        .select({ id: schema.historialDeTurnosPublicados.id })
        .from(schema.historialDeTurnosPublicados)
        .innerJoin(
          schema.turnosPublicados,
          eq(schema.historialDeTurnosPublicados.turnoPublicadoId, schema.turnosPublicados.id),
        )
        .where(and(eq(schema.turnosPublicados.idHuellero, idHuellero), eq(schema.turnosPublicados.fecha, fecha))),
    ).resolves.toHaveLength(1);
    await expect(
      db
        .select({ estado: schema.asistenciasEsperadas.estado })
        .from(schema.asistenciasEsperadas)
        .where(and(eq(schema.asistenciasEsperadas.idHuellero, idHuellero), eq(schema.asistenciasEsperadas.fecha, fecha))),
    ).resolves.toEqual([{ estado: "pendiente" }]);
  });

  it("revierte toda la publicación en lote cuando un horario semanal está duplicado", async () => {
    const turno = { idHuellero, fecha: fechaParaAtomicidad, sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false };

    await expect(repositorio.publicarEnLote([turno, turno])).rejects.toThrow();
    await expect(repositorio.buscarPublicado(idHuellero, fechaParaAtomicidad)).resolves.toBeUndefined();
  });

  it("crea y lee un plan semanal en borrador", async () => {
    await expect(repositorio.obtenerOCrear(semanaDePlan, "tiendas")).resolves.toMatchObject({ semana: semanaDePlan, equipo: "tiendas", celdas: [] });
  });

  it("republica los siete días, conserva la auditoría y reinicia cálculos pendientes", async () => {
    const actor = { id: cuentaId, rol: "operaciones" as const };
    const originales = fechasDeCorreccion.map((fechaDeCorreccion) => ({ idHuellero, fecha: fechaDeCorreccion, sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false }));
    await repositorio.publicarEnLote(originales, actor);
    const [asistencia] = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.idHuellero, idHuellero), eq(schema.asistenciasEsperadas.fecha, fechasDeCorreccion[0])));
    await db.update(schema.asistenciasEsperadas).set({ entradaPropuesta: "09:05", salidaPropuesta: "18:10" }).where(eq(schema.asistenciasEsperadas.id, asistencia.id));
    await db.insert(schema.tardanzas).values({ asistenciaId: asistencia.id, minutosDeTardanza: 5, minutosPenalizados: 0, politicaVersion: 1 });
    await db.insert(schema.horasExtra).values({ asistenciaId: asistencia.id, minutosAl25: 10, minutosAl35: 0, estado: "pendiente" });

    await repositorio.reemplazarSemanaPublicada(originales.map((turno, indice) => indice === 0 ? { ...turno, entradaProgramada: "10:00", salidaProgramada: "19:00" } : turno), actor, "Corrige entrada pactada");

    await expect(db.select({ estado: schema.asistenciasEsperadas.estado, entrada: schema.asistenciasEsperadas.entradaPropuesta, salida: schema.asistenciasEsperadas.salidaPropuesta }).from(schema.asistenciasEsperadas)
      .where(eq(schema.asistenciasEsperadas.id, asistencia.id))).resolves.toEqual([{ estado: "pendiente", entrada: null, salida: null }]);
    await expect(db.select().from(schema.tardanzas).where(eq(schema.tardanzas.asistenciaId, asistencia.id))).resolves.toEqual([]);
    await expect(db.select().from(schema.horasExtra).where(eq(schema.horasExtra.asistenciaId, asistencia.id))).resolves.toEqual([]);
    await expect(db.select({ horario: schema.historialDeTurnosPublicados.horario, responsableId: schema.historialDeTurnosPublicados.responsableId, motivo: schema.historialDeTurnosPublicados.motivo }).from(schema.historialDeTurnosPublicados)
      .innerJoin(schema.turnosPublicados, eq(schema.historialDeTurnosPublicados.turnoPublicadoId, schema.turnosPublicados.id))
      .where(and(eq(schema.turnosPublicados.idHuellero, idHuellero), eq(schema.turnosPublicados.fecha, fechasDeCorreccion[0])))).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ responsableId: cuentaId, motivo: "Corrige entrada pactada", horario: expect.objectContaining({ entradaProgramada: "10:00" }) }),
    ]));
  });

  it("persiste el procesamiento semanal con responsable y bloquea la edición posterior", async () => {
    await repositorio.publicarEnLote(fechasProcesadas.map((fechaDeProcesamiento) => ({
      idHuellero, fecha: fechaDeProcesamiento, sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
    })));
    await db.update(schema.asistenciasEsperadas).set({ estado: "manual" }).where(and(
      eq(schema.asistenciasEsperadas.idHuellero, idHuellero), inArray(schema.asistenciasEsperadas.fecha, fechasProcesadas),
    ));

    await expect(repositorio.asistenciasLaboralesEstanProcesadas(idHuellero, semanaProcesada)).resolves.toBe(true);
    await repositorio.registrarProcesamiento({ idHuellero, semana: semanaProcesada, equipo: "tiendas", responsableId: cuentaId });

    await expect(repositorio.horarioSemanalEstaProcesado(idHuellero, semanaProcesada)).resolves.toBe(true);
    await db.update(schema.colaboradores).set({ activo: false }).where(eq(schema.colaboradores.idHuellero, idHuellero));
    await expect(repositorio.listarColaboradoresProcesadosPorSemanaYEquipo(semanaProcesada, "tiendas"))
      .resolves.toEqual(expect.arrayContaining([expect.objectContaining({ idHuellero })]));
    await expect(repositorio.reemplazarSemanaPublicada(
      fechasProcesadas.map((fechaDeProcesamiento) => ({ idHuellero, fecha: fechaDeProcesamiento, sede: "Lima", entradaProgramada: "10:00", salidaProgramada: "19:00", descanso: false })),
      { id: cuentaId, rol: "operaciones" }, "Cambio posterior",
    )).rejects.toThrow("No se puede corregir un horario semanal que ya fue procesado.");
  });
});
