import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import * as schema from "@/db/schema";
import { publicarPlanSemanal } from "@/turnos/publicar-plan-semanal";
import { RepositorioPostgresDeTurnos } from "@/turnos/repositorio-postgres";
import { diasDeLaSemana, inicioDeSemana } from "@/turnos/semana";

import {
  confirmarCese,
  confirmarIngreso,
  consultarPersonasConRelacionVigente,
  registrarCese,
  registrarIngreso,
} from "./gestionar-relaciones-laborales";
import { RepositorioPostgresDeRelacionesLaborales } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("relaciones laborales (integración PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const relaciones = new RepositorioPostgresDeRelacionesLaborales(db);
  const turnos = new RepositorioPostgresDeTurnos(db);
  const grupo = `Grupo relaciones ${randomUUID()}`;
  const sede = `Sede relaciones ${randomUUID()}`;
  const ana = dniDePrueba();
  const beto = dniDePrueba();
  const carla = dniDePrueba();
  const dniDeTodos = [ana, beto, carla];
  const semana = inicioDeSemana("2033-03-02");
  const dias = diasDeLaSemana(semana);
  const cuentaRrhh = randomUUID();
  const cuentaGerente = randomUUID();
  const recursosHumanos: Actor = { id: cuentaRrhh, rol: "recursos_humanos" };
  const gerente: Actor = { id: cuentaGerente, rol: "gerente_de_area", grupos: [{ nombre: grupo, gestionaAsistencia: true }] };

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values([
      { id: cuentaRrhh, nombreUsuario: `rrhh-${cuentaRrhh}`, hashContrasena: "prueba", rol: "recursos_humanos" },
      { id: cuentaGerente, nombreUsuario: `gerente-${cuentaGerente}`, hashContrasena: "prueba", rol: "gerente_de_area" },
    ]);
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.sedes).values({ nombre: sede, grupo, activa: true });
    await db.insert(schema.colaboradores).values(dniDeTodos.map((dni, indice) => ({ dni, nombre: `Persona ${indice}`, sede, grupo, activo: true })));
    await db.insert(schema.periodosPlanilla).values({ inicio: dias[0], fin: dias[6], estado: "abierto" });
  });

  afterAll(async () => {
    const planes = await db.select({ id: schema.planesSemanalesEnBorrador.id }).from(schema.planesSemanalesEnBorrador)
      .where(and(eq(schema.planesSemanalesEnBorrador.semana, semana), eq(schema.planesSemanalesEnBorrador.equipo, grupo)));
    if (planes.length) await db.delete(schema.celdasDePlanesSemanalesEnBorrador).where(inArray(schema.celdasDePlanesSemanalesEnBorrador.planId, planes.map(({ id }) => id)));
    await db.delete(schema.planesSemanalesEnBorrador).where(and(eq(schema.planesSemanalesEnBorrador.semana, semana), eq(schema.planesSemanalesEnBorrador.equipo, grupo)));
    const publicados = await db.select({ id: schema.turnosPublicados.id }).from(schema.turnosPublicados).where(inArray(schema.turnosPublicados.dni, dniDeTodos));
    if (publicados.length) await db.delete(schema.historialDeTurnosPublicados).where(inArray(schema.historialDeTurnosPublicados.turnoPublicadoId, publicados.map(({ id }) => id)));
    await db.delete(schema.turnosPublicados).where(inArray(schema.turnosPublicados.dni, dniDeTodos));
    await db.delete(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.dni, dniDeTodos));
    await db.delete(schema.relacionesLaborales).where(inArray(schema.relacionesLaborales.dni, dniDeTodos));
    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.dni, dniDeTodos));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.inicio, dias[0]));
    await db.delete(schema.cuentasLocales).where(inArray(schema.cuentasLocales.id, [cuentaRrhh, cuentaGerente]));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await pool.end();
  });

  it("registra, confirma el cese y admite un reingreso con el mismo DNI sin duplicar a la persona", async () => {
    const primera = await registrarIngreso(relaciones, recursosHumanos, { dni: ana, ingreso: "2033-01-03" });
    await confirmarIngreso(relaciones, recursosHumanos, primera.id);
    await registrarCese(relaciones, recursosHumanos, primera.id, "2033-02-11");
    await confirmarCese(relaciones, recursosHumanos, primera.id);
    const segunda = await registrarIngreso(relaciones, recursosHumanos, { dni: ana, ingreso: "2033-03-02" });
    await confirmarIngreso(relaciones, recursosHumanos, segunda.id);

    const filas = await db.select().from(schema.relacionesLaborales).where(eq(schema.relacionesLaborales.dni, ana)).orderBy(schema.relacionesLaborales.ingreso);
    expect(filas.map(({ ingreso, cese }) => ({ ingreso, cese }))).toEqual([{ ingreso: "2033-01-03", cese: "2033-02-11" }, { ingreso: "2033-03-02", cese: null }]);
    expect(filas[0]).toMatchObject({ registradaPorId: cuentaRrhh, ingresoConfirmadoPorId: cuentaRrhh, ceseConfirmadoPorId: cuentaRrhh });
    expect(filas[0].ingresoConfirmadoEn).toBeInstanceOf(Date);
    const personas = await db.select({ dni: schema.colaboradores.dni }).from(schema.colaboradores).where(eq(schema.colaboradores.dni, ana));
    expect(personas).toHaveLength(1);
  });

  it("dos registros simultáneos del mismo DNI no dejan dos relaciones abiertas", async () => {
    const resultados = await Promise.allSettled([
      registrarIngreso(relaciones, recursosHumanos, { dni: beto, ingreso: "2033-04-04" }),
      registrarIngreso(relaciones, recursosHumanos, { dni: beto, ingreso: "2033-04-05" }),
      registrarIngreso(relaciones, recursosHumanos, { dni: beto, ingreso: "2033-04-06" }),
    ]);

    expect(resultados.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    for (const rechazado of resultados.filter((resultado) => resultado.status === "rejected")) {
      expect(String((rechazado as PromiseRejectedResult).reason)).toContain("sin cese");
    }
    const filas = await db.select({ id: schema.relacionesLaborales.id }).from(schema.relacionesLaborales).where(eq(schema.relacionesLaborales.dni, beto));
    expect(filas).toHaveLength(1);
    await db.delete(schema.relacionesLaborales).where(eq(schema.relacionesLaborales.dni, beto));
  });

  it("la base rechaza por sí sola fechas incoherentes, una segunda relación abierta y confirmaciones incompletas", async () => {
    const insertar = (valores: Partial<typeof schema.relacionesLaborales.$inferInsert>) => db.insert(schema.relacionesLaborales).values({ dni: carla, ingreso: "2033-05-02", registradaPorId: cuentaRrhh, ...valores });

    await expect(insertar({ cese: "2033-05-01" })).rejects.toThrow();
    await expect(insertar({ cese: "2033-06-01", ceseConfirmadoPorId: cuentaRrhh, ceseConfirmadoEn: new Date() })).rejects.toThrow();
    await expect(insertar({ ingresoConfirmadoPorId: cuentaRrhh })).rejects.toThrow();
    await insertar({});
    await expect(insertar({ ingreso: "2033-07-01" })).rejects.toThrow();
    await db.delete(schema.relacionesLaborales).where(eq(schema.relacionesLaborales.dni, carla));
  });

  it("consulta quién tiene una relación vigente en una fecha o rango sin leer asistencias", async () => {
    const hay = async (desde: string, hasta?: string) => (await consultarPersonasConRelacionVigente(relaciones, recursosHumanos, desde, hasta)).filter(({ dni }) => dniDeTodos.includes(dni));

    expect((await hay("2033-02-20")).map(({ dni }) => dni)).toEqual([]);
    expect((await hay("2033-02-01")).map(({ dni }) => dni)).toEqual([ana]);
    expect((await hay("2033-02-10", "2033-03-10")).flatMap(({ relaciones }) => relaciones.map(({ ingreso }) => ingreso))).toEqual(["2033-01-03", "2033-03-02"]);
    expect((await hay("2033-03-02")).map(({ dni }) => dni)).toEqual([ana]);
  });

  describe("publicación de horarios", () => {
    const jornada = (dni: string, fecha: string) => ({
      dni, fecha, sede, modeloHorarioId: null, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null,
    });

    it("rechaza publicar para una persona sin relación laboral confirmada", async () => {
      await expect(turnos.publicarEnLote([jornada(carla, dias[2])], gerente)).rejects.toThrow("No hay una relación laboral confirmada por Recursos Humanos en esta semana");

      const relacion = await registrarIngreso(relaciones, recursosHumanos, { dni: carla, ingreso: dias[0] });
      await expect(turnos.publicarEnLote([jornada(carla, dias[2])], gerente)).rejects.toThrow("No hay una relación laboral confirmada");

      await confirmarIngreso(relaciones, recursosHumanos, relacion.id);
      await turnos.publicarEnLote([jornada(carla, dias[2])], gerente);
      await expect(turnos.buscarPublicado(carla, dias[2])).resolves.toMatchObject({ dni: carla });
    });

    it("no publica antes del ingreso confirmado ni después del cese confirmado, solo «Sin relación laboral»", async () => {
      // Carla ingresó el lunes; se confirma su cese el jueves.
      const [relacion] = await db.select({ id: schema.relacionesLaborales.id }).from(schema.relacionesLaborales).where(eq(schema.relacionesLaborales.dni, carla));
      await registrarCese(relaciones, recursosHumanos, relacion.id, dias[3]);
      await confirmarCese(relaciones, recursosHumanos, relacion.id);

      await expect(turnos.publicarEnLote([jornada(carla, dias[4])], gerente)).rejects.toThrow("fuera de la relación laboral confirmada");
      const sinRelacion = { ...jornada(carla, dias[4]), sede: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "sin_relacion_laboral" as const };
      await turnos.publicarEnLote([sinRelacion], gerente);

      const [fila] = await db.select().from(schema.turnosPublicados).where(and(eq(schema.turnosPublicados.dni, carla), eq(schema.turnosPublicados.fecha, dias[4])));
      expect(fila).toMatchObject({ motivoNoAsistencia: "sin_relacion_laboral", descanso: true, sede: null });
      const asistencias = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.dni, carla), eq(schema.asistenciasEsperadas.fecha, dias[4])));
      expect(asistencias).toEqual([]);
      await expect(turnos.publicarEnLote([{ ...sinRelacion, fecha: dias[1] }], gerente)).rejects.toThrow("dentro de una relación laboral confirmada");
    });

    it("publica la semana de quien ingresa a mitad de semana y marca los días previos «Sin relación laboral»", async () => {
      const relacion = await registrarIngreso(relaciones, recursosHumanos, { dni: beto, ingreso: dias[2] });
      const plan = await turnos.obtenerOCrear(semana, grupo);
      await turnos.guardarCeldas(dias.slice(2).map((fecha) => ({ ...jornada(beto, fecha), planId: plan.id })));

      const sinConfirmar = await publicarPlanSemanal(turnos, gerente, plan.id, [beto]);
      expect(sinConfirmar.publicados).toBe(0);
      expect(sinConfirmar.errores[0].mensaje).toContain("relación laboral confirmada");

      await confirmarIngreso(relaciones, recursosHumanos, relacion.id);
      const resultado = await publicarPlanSemanal(turnos, gerente, plan.id, [beto]);

      expect(resultado).toEqual({ publicados: 1, errores: [] });
      const filas = await db.select().from(schema.turnosPublicados).where(eq(schema.turnosPublicados.dni, beto)).orderBy(schema.turnosPublicados.fecha);
      expect(filas.map(({ fecha, motivoNoAsistencia }) => [fecha, motivoNoAsistencia])).toEqual(dias.map((fecha, indice) => [fecha, indice < 2 ? "sin_relacion_laboral" : null]));
      const asistencias = await db.select({ fecha: schema.asistenciasEsperadas.fecha }).from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, beto));
      expect(asistencias.map(({ fecha }) => fecha).sort()).toEqual(dias.slice(2));
    });
  });
});
