import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { RepositorioPostgresDeAsistencias } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("confirmación por rango en PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeAsistencias(db);
  const sufijo = randomUUID();
  const grupo = `Grupo rango ${sufijo}`;
  const sede = `Sede rango ${sufijo}`;
  const cuentaId = randomUUID();
  const ana = `RANGO-A-${sufijo}`;
  const bruno = `RANGO-B-${sufijo}`;
  const carla = `RANGO-C-${sufijo}`;
  const diego = `RANGO-D-${sufijo}`;
  const fechas = ["2036-03-22", "2036-03-23", "2036-03-24"];
  const fechaConcurrente = "2036-04-02";
  const fechaCerrada = "2036-02-20";
  const fechaSinPeriodo = "2036-05-02";

  beforeAll(async () => {
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.sedes).values({ nombre: sede, grupo, activa: true });
    await db.insert(schema.colaboradores).values([
      { idHuellero: ana, nombre: "Ana Rango", sede, grupo, activo: true },
      { idHuellero: bruno, nombre: "Bruno Rango", sede, grupo, activo: true },
      { idHuellero: carla, nombre: "Carla Rango", sede, grupo, activo: true },
      { idHuellero: diego, nombre: "Diego Rango", sede, grupo, activo: true },
    ]);
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `rango-${sufijo}`, hashContrasena: "prueba", rol: "administracion" });
    await db.insert(schema.periodosPlanilla).values([
      { inicio: "2036-02-01", fin: "2036-02-28", estado: "cerrado", cerradoPorId: cuentaId, cerradoEn: new Date() },
      { inicio: "2036-03-01", fin: "2036-03-24", estado: "abierto" },
      { inicio: "2036-03-25", fin: "2036-04-30", estado: "abierto" },
    ]);
    await db.insert(schema.turnosPublicados).values([
      { idHuellero: ana, fecha: fechas[0], grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false },
      { idHuellero: ana, fecha: fechas[1], grupo, sede: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "vacaciones" },
      { idHuellero: ana, fecha: fechas[2], grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false },
      { idHuellero: bruno, fecha: fechas[0], grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false },
      { idHuellero: bruno, fecha: fechas[1], grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false },
      { idHuellero: bruno, fecha: fechas[2], grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false },
      { idHuellero: carla, fecha: fechaConcurrente, grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false },
      { idHuellero: diego, fecha: fechaConcurrente, grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false },
      { idHuellero: bruno, fecha: fechaCerrada, grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false },
      { idHuellero: bruno, fecha: fechaSinPeriodo, grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false },
    ]);
    await db.insert(schema.asistenciasEsperadas).values([
      { idHuellero: ana, fecha: fechas[0], estado: "pendiente", entradaPropuesta: `${fechas[0]}T09:15`, salidaPropuesta: `${fechas[0]}T18:30` },
      { idHuellero: ana, fecha: fechas[1], estado: "pendiente" },
      {
        idHuellero: ana,
        fecha: fechas[2],
        estado: "confirmada",
        entradaReal: `${fechas[2]}T09:15`,
        salidaReal: `${fechas[2]}T18:00`,
        minutosTrabajados: 525,
        instantaneaDeTurno: { sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false },
        confirmadoPorId: cuentaId,
        confirmadoEn: new Date(),
      },
      { idHuellero: bruno, fecha: fechas[0], estado: "pendiente", entradaPropuesta: `${fechas[0]}T09:00`, salidaPropuesta: null },
      { idHuellero: bruno, fecha: fechas[1], estado: "pendiente", entradaPropuesta: `${fechas[1]}T09:00`, salidaPropuesta: `${fechas[1]}T18:00` },
      { idHuellero: bruno, fecha: fechas[2], estado: "pendiente", entradaPropuesta: `${fechas[2]}T09:00`, salidaPropuesta: `${fechas[2]}T18:00` },
      { idHuellero: carla, fecha: fechaConcurrente, estado: "pendiente", entradaPropuesta: `${fechaConcurrente}T09:00`, salidaPropuesta: `${fechaConcurrente}T18:00` },
      { idHuellero: diego, fecha: fechaConcurrente, estado: "pendiente", entradaPropuesta: `${fechaConcurrente}T09:00`, salidaPropuesta: null },
      { idHuellero: bruno, fecha: fechaCerrada, estado: "pendiente", entradaPropuesta: `${fechaCerrada}T09:00`, salidaPropuesta: `${fechaCerrada}T18:00` },
      { idHuellero: bruno, fecha: fechaSinPeriodo, estado: "pendiente", entradaPropuesta: `${fechaSinPeriodo}T09:00`, salidaPropuesta: `${fechaSinPeriodo}T18:00` },
    ]);
    await db.insert(schema.politicasDePenalizacionPorTardanzas).values({
      sede,
      toleranciaEnMinutos: 10,
      tardanzasAcumuladas: 2,
      horasPenalizadas: 1,
      version: 1,
      vigenteDesde: "2036-03-01",
      configuradaPorId: cuentaId,
    });
    const [registrada] = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas).where(and(
      eq(schema.asistenciasEsperadas.idHuellero, ana),
      eq(schema.asistenciasEsperadas.fecha, fechas[2]),
    ));
    await db.insert(schema.tardanzas).values({ asistenciaId: registrada.id, minutosDeTardanza: 15, minutosPenalizados: 0, politicaVersion: 1 });
  });

  afterAll(async () => {
    const ids = [ana, bruno, carla, diego];
    const asistencias = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.idHuellero, ids));
    if (asistencias.length) {
      const asistenciaIds = asistencias.map(({ id }) => id);
      await db.delete(schema.horasExtra).where(inArray(schema.horasExtra.asistenciaId, asistenciaIds));
      await db.delete(schema.tardanzas).where(inArray(schema.tardanzas.asistenciaId, asistenciaIds));
      await db.delete(schema.estadosManuales).where(inArray(schema.estadosManuales.asistenciaId, asistenciaIds));
    }
    await db.delete(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.idHuellero, ids));
    await db.delete(schema.turnosPublicados).where(inArray(schema.turnosPublicados.idHuellero, ids));
    await db.delete(schema.politicasDePenalizacionPorTardanzas).where(eq(schema.politicasDePenalizacionPorTardanzas.sede, sede));
    await db.delete(schema.periodosPlanilla).where(and(eq(schema.periodosPlanilla.inicio, "2036-03-01"), eq(schema.periodosPlanilla.fin, "2036-03-24")));
    await db.delete(schema.periodosPlanilla).where(and(eq(schema.periodosPlanilla.inicio, "2036-03-25"), eq(schema.periodosPlanilla.fin, "2036-04-30")));
    await db.delete(schema.periodosPlanilla).where(and(eq(schema.periodosPlanilla.inicio, "2036-02-01"), eq(schema.periodosPlanilla.fin, "2036-02-28")));
    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.idHuellero, ids));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await pool.end();
  });

  it("considera elegible un rango con pendientes y registradas, y explica los bloqueos", async () => {
    const resultado = await repositorio.evaluarColaboradoresPorRango({
      inicio: "2036-03-20",
      fin: "2036-03-28",
      colaboradores: [{ idHuellero: ana, nombre: "Ana Rango" }, { idHuellero: bruno, nombre: "Bruno Rango" }],
    });

    expect(resultado).toEqual([
      { idHuellero: ana, nombre: "Ana Rango", seleccionable: true, jornadasPendientes: 2, jornadasRegistradas: 1, bloqueos: [] },
      {
        idHuellero: bruno,
        nombre: "Bruno Rango",
        seleccionable: false,
        jornadasPendientes: 3,
        jornadasRegistradas: 0,
        bloqueos: [{ fecha: fechas[0], causa: "Falta la marca de salida." }],
      },
    ]);
  });

  it("confirma pendientes y motivos planificados, conserva registradas y recalcula cronológicamente", async () => {
    await repositorio.confirmarColaboradoresPorRango({ inicio: fechas[0], fin: fechas[2], idsHuellero: [ana] }, cuentaId);

    const asistencias = await db.select().from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.idHuellero, ana)).orderBy(schema.asistenciasEsperadas.fecha);
    expect(asistencias).toEqual([
      expect.objectContaining({
        fecha: fechas[0],
        estado: "confirmada",
        entradaReal: `${fechas[0]}T09:15`,
        salidaReal: `${fechas[0]}T18:30`,
        minutosTrabajados: 555,
        confirmadoPorId: cuentaId,
        instantaneaDeTurno: { sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false },
      }),
      expect.objectContaining({ fecha: fechas[1], estado: "manual" }),
      expect.objectContaining({ fecha: fechas[2], estado: "confirmada", confirmadoPorId: cuentaId }),
    ]);
    const manuales = await db.select().from(schema.estadosManuales).innerJoin(schema.asistenciasEsperadas, eq(schema.estadosManuales.asistenciaId, schema.asistenciasEsperadas.id));
    expect(manuales).toEqual(expect.arrayContaining([
      expect.objectContaining({ estados_manuales: expect.objectContaining({ tipo: "vacaciones", responsableId: cuentaId }) }),
    ]));
    const extras = await db.select().from(schema.horasExtra).innerJoin(schema.asistenciasEsperadas, eq(schema.horasExtra.asistenciaId, schema.asistenciasEsperadas.id));
    expect(extras).toEqual(expect.arrayContaining([
      expect.objectContaining({ horas_extra: expect.objectContaining({ estado: "pendiente", minutosAl25: 30, minutosAl35: 0 }) }),
    ]));
    const penalizaciones = await db.select({ fecha: schema.asistenciasEsperadas.fecha, minutos: schema.tardanzas.minutosPenalizados })
      .from(schema.tardanzas).innerJoin(schema.asistenciasEsperadas, eq(schema.tardanzas.asistenciaId, schema.asistenciasEsperadas.id))
      .where(eq(schema.asistenciasEsperadas.idHuellero, ana)).orderBy(schema.asistenciasEsperadas.fecha);
    expect(penalizaciones).toEqual([{ fecha: fechas[0], minutos: 0 }, { fecha: fechas[2], minutos: 60 }]);
  });

  it("rechaza toda la selección si una jornada está incompleta", async () => {
    await expect(repositorio.confirmarColaboradoresPorRango({
      inicio: fechaConcurrente,
      fin: fechaConcurrente,
      idsHuellero: [carla, diego],
    }, cuentaId)).rejects.toThrow("Falta la marca de salida");

    const [carlaPendiente] = await db.select({ estado: schema.asistenciasEsperadas.estado }).from(schema.asistenciasEsperadas).where(and(
      eq(schema.asistenciasEsperadas.idHuellero, carla),
      eq(schema.asistenciasEsperadas.fecha, fechaConcurrente),
    ));
    expect(carlaPendiente.estado).toBe("pendiente");
  });

  it("explica que un período cerrado bloquea la selección", async () => {
    const [resultado] = await repositorio.evaluarColaboradoresPorRango({
      inicio: fechaCerrada,
      fin: fechaCerrada,
      colaboradores: [{ idHuellero: bruno, nombre: "Bruno Rango" }],
    });

    expect(resultado).toMatchObject({
      seleccionable: false,
      bloqueos: [{ fecha: fechaCerrada, causa: "La jornada pertenece a un período cerrado." }],
    });
  });

  it("trata una jornada ya registrada como no-op aunque su período esté cerrado", async () => {
    await db.update(schema.asistenciasEsperadas).set({ estado: "confirmada" }).where(and(
      eq(schema.asistenciasEsperadas.idHuellero, bruno),
      eq(schema.asistenciasEsperadas.fecha, fechaCerrada),
    ));
    const [resultado] = await repositorio.evaluarColaboradoresPorRango({
      inicio: fechaCerrada,
      fin: fechaCerrada,
      colaboradores: [{ idHuellero: bruno, nombre: "Bruno Rango" }],
    });

    expect(resultado).toMatchObject({ seleccionable: false, jornadasPendientes: 0, jornadasRegistradas: 1, bloqueos: [] });
  });

  it("bloquea una jornada pendiente sin período de planilla configurado", async () => {
    const [resultado] = await repositorio.evaluarColaboradoresPorRango({
      inicio: fechaSinPeriodo,
      fin: fechaSinPeriodo,
      colaboradores: [{ idHuellero: bruno, nombre: "Bruno Rango" }],
    });

    expect(resultado.bloqueos).toEqual([{ fecha: fechaSinPeriodo, causa: "No hay un período de planilla abierto para la jornada." }]);
  });

  it("ante dos confirmaciones concurrentes aplica un solo lote completo", async () => {
    await db.update(schema.asistenciasEsperadas).set({ salidaPropuesta: `${fechaConcurrente}T18:00` }).where(and(
      eq(schema.asistenciasEsperadas.idHuellero, diego),
      eq(schema.asistenciasEsperadas.fecha, fechaConcurrente),
    ));
    const solicitud = { inicio: fechaConcurrente, fin: fechaConcurrente, idsHuellero: [carla, diego] };

    const resultados = await Promise.allSettled([
      repositorio.confirmarColaboradoresPorRango(solicitud, cuentaId),
      repositorio.confirmarColaboradoresPorRango(solicitud, cuentaId),
    ]);

    expect(resultados.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(resultados.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const filas = await db.select({ idHuellero: schema.asistenciasEsperadas.idHuellero, estado: schema.asistenciasEsperadas.estado })
      .from(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.idHuellero, [carla, diego]));
    expect(filas).toEqual(expect.arrayContaining([
      { idHuellero: carla, estado: "confirmada" },
      { idHuellero: diego, estado: "confirmada" },
    ]));
  });
});
