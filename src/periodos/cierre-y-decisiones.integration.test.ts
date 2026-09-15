import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { RepositorioPostgresDePeriodos } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("decisiones y revisiones de períodos en PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDePeriodos(db);
  const sufijo = randomUUID().slice(0, 8);
  const grupo = `Grupo 75 ${sufijo}`;
  const idHuellero = `L75-${sufijo}`;
  const finanzasId = randomUUID();
  const administracionId = randomUUID();
  const instantePrimerCierre = new Date("2071-02-05T10:00:00Z");
  const instanteSegundoCierre = new Date("2071-02-06T10:00:00Z");
  let periodoDecisionesId = "";
  let periodoCierreId = "";
  let extraUnoId = "";
  let extraDosId = "";
  let asistenciaTrabajadaId = "";
  let asistenciaPendienteId = "";

  beforeAll(async () => {
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.cuentasLocales).values([
      { id: finanzasId, nombreUsuario: `finanzas-75-${sufijo}`, hashContrasena: "prueba", rol: "finanzas" },
      { id: administracionId, nombreUsuario: `admin-75-${sufijo}`, hashContrasena: "prueba", rol: "administracion" },
    ]);
    await db.insert(schema.colaboradores).values({ idHuellero, nombre: "Ana Revisión", sede: "Centro", grupo });
    const periodos = await db.insert(schema.periodosPlanilla).values([
      { inicio: "2071-01-01", fin: "2071-01-10", estado: "abierto" },
      { inicio: "2071-02-01", fin: "2071-02-03", estado: "abierto" },
    ]).returning({ id: schema.periodosPlanilla.id, inicio: schema.periodosPlanilla.inicio });
    periodoDecisionesId = periodos.find(({ inicio }) => inicio === "2071-01-01")!.id;
    periodoCierreId = periodos.find(({ inicio }) => inicio === "2071-02-01")!.id;

    const fechas = ["2071-01-01", "2071-01-02", "2071-02-01", "2071-02-02", "2071-02-03"];
    await db.insert(schema.turnosPublicados).values(fechas.map((fecha) => ({
      idHuellero, fecha, grupo, sede: "Centro", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false,
    })));
    const asistencias = await db.insert(schema.asistenciasEsperadas).values([
      ...["2071-01-01", "2071-01-02"].map((fecha) => ({
        idHuellero, fecha, estado: "confirmada" as const, entradaReal: `${fecha}T09:00:00Z`, salidaReal: `${fecha}T18:00:00Z`, minutosTrabajados: 540,
        instantaneaDeTurno: { sede: "Centro", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false },
      })),
      { idHuellero, fecha: "2071-02-01", estado: "confirmada", entradaReal: "2071-02-01T09:15:00Z", salidaReal: "2071-02-01T18:00:00Z", minutosTrabajados: 525, instantaneaDeTurno: { sede: "Centro", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false } },
      { idHuellero, fecha: "2071-02-02", estado: "manual" },
      { idHuellero, fecha: "2071-02-03", estado: "pendiente" },
    ]).returning({ id: schema.asistenciasEsperadas.id, fecha: schema.asistenciasEsperadas.fecha });
    const porFecha = new Map(asistencias.map(({ id, fecha }) => [fecha, id]));
    asistenciaTrabajadaId = porFecha.get("2071-02-01")!;
    asistenciaPendienteId = porFecha.get("2071-02-03")!;
    const extras = await db.insert(schema.horasExtra).values([
      { asistenciaId: porFecha.get("2071-01-01")!, minutosAl25: 60, minutosAl35: 0 },
      { asistenciaId: porFecha.get("2071-01-02")!, minutosAl25: 0, minutosAl35: 60 },
      { asistenciaId: asistenciaTrabajadaId, minutosAl25: 60, minutosAl35: 0, estado: "aprobada", decididaPorId: finanzasId, decididaEn: instantePrimerCierre },
    ]).returning({ id: schema.horasExtra.id, asistenciaId: schema.horasExtra.asistenciaId });
    extraUnoId = extras.find(({ asistenciaId }) => asistenciaId === porFecha.get("2071-01-01"))!.id;
    extraDosId = extras.find(({ asistenciaId }) => asistenciaId === porFecha.get("2071-01-02"))!.id;
    await db.insert(schema.tardanzas).values({ asistenciaId: asistenciaTrabajadaId, minutosDeTardanza: 15, minutosPenalizados: 60, politicaVersion: 3 });
    await db.insert(schema.estadosManuales).values({ asistenciaId: porFecha.get("2071-02-02")!, tipo: "falta", comentario: "Ausencia confirmada", responsableId: administracionId });
  });

  afterAll(async () => {
    const asistencias = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.idHuellero, idHuellero));
    const ids = asistencias.map(({ id }) => id);
    await db.delete(schema.revisionesDePeriodosPlanilla).where(inArray(schema.revisionesDePeriodosPlanilla.periodoId, [periodoDecisionesId, periodoCierreId]));
    await db.delete(schema.auditoriaPeriodosPlanilla).where(inArray(schema.auditoriaPeriodosPlanilla.periodoId, [periodoDecisionesId, periodoCierreId]));
    if (ids.length) {
      await db.delete(schema.horasExtra).where(inArray(schema.horasExtra.asistenciaId, ids));
      await db.delete(schema.tardanzas).where(inArray(schema.tardanzas.asistenciaId, ids));
      await db.delete(schema.estadosManuales).where(inArray(schema.estadosManuales.asistenciaId, ids));
    }
    await db.delete(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.idHuellero, idHuellero));
    await db.delete(schema.turnosPublicados).where(eq(schema.turnosPublicados.idHuellero, idHuellero));
    await db.delete(schema.periodosPlanilla).where(inArray(schema.periodosPlanilla.id, [periodoDecisionesId, periodoCierreId]));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.idHuellero, idHuellero));
    await db.delete(schema.cuentasLocales).where(inArray(schema.cuentasLocales.id, [finanzasId, administracionId]));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await pool.end();
  });

  it("decide varias horas extra de forma atómica dentro del período abierto", async () => {
    await expect(repositorio.decidirHorasExtra(periodoDecisionesId, [extraUnoId, randomUUID()], "aprobada", finanzasId, instantePrimerCierre)).rejects.toThrow("pendientes");
    const despuesDelFallo = await db.select({ estado: schema.horasExtra.estado }).from(schema.horasExtra).where(inArray(schema.horasExtra.id, [extraUnoId, extraDosId]));
    expect(despuesDelFallo.map(({ estado }) => estado)).toEqual(["pendiente", "pendiente"]);

    await repositorio.decidirHorasExtra(periodoDecisionesId, [extraUnoId, extraDosId], "rechazada", finanzasId, instantePrimerCierre);

    const decididas = await db.select().from(schema.horasExtra).where(inArray(schema.horasExtra.id, [extraUnoId, extraDosId]));
    expect(decididas).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: extraUnoId, estado: "rechazada", decididaPorId: finanzasId, decididaEn: instantePrimerCierre }),
      expect.objectContaining({ id: extraDosId, estado: "rechazada", decididaPorId: finanzasId, decididaEn: instantePrimerCierre }),
    ]));
  });

  it("bloquea pendientes, congela una revisión completa y conserva cierres anteriores al reabrir", async () => {
    await expect(repositorio.cerrar(periodoCierreId, finanzasId, instantePrimerCierre)).rejects.toThrow("asistencias pendientes");
    await db.update(schema.asistenciasEsperadas).set({ estado: "confirmada", entradaReal: "2071-02-03T09:00:00Z", salidaReal: "2071-02-03T18:00:00Z", minutosTrabajados: 540, instantaneaDeTurno: { sede: "Centro", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false } }).where(eq(schema.asistenciasEsperadas.id, asistenciaPendienteId));
    const [extraPendiente] = await db.insert(schema.horasExtra).values({ asistenciaId: asistenciaPendienteId, minutosAl25: 60, minutosAl35: 0 }).returning({ id: schema.horasExtra.id });

    await expect(repositorio.cerrar(periodoCierreId, finanzasId, instantePrimerCierre)).rejects.toThrow("horas extra pendientes");
    await repositorio.decidirHorasExtra(periodoCierreId, [extraPendiente.id], "aprobada", finanzasId, instantePrimerCierre);
    await repositorio.cerrar(periodoCierreId, finanzasId, instantePrimerCierre);

    const [primera] = await repositorio.listarRevisiones(periodoCierreId);
    expect(primera).toMatchObject({ numero: 1, responsableId: finanzasId, cerradaEn: instantePrimerCierre });
    expect(primera.resumen.bloqueos).toEqual([]);
    expect(primera.resumen.filas[0].jornadas).toEqual(expect.arrayContaining([
      expect.objectContaining({ fecha: "2071-02-01", resultado: "trabajada", politicaDeTardanzaVersion: 3 }),
      expect.objectContaining({ fecha: "2071-02-02", resultado: "falta" }),
      expect.objectContaining({ fecha: "2071-02-03", horaExtra: expect.objectContaining({ estado: "aprobada" }) }),
    ]));
    expect(primera.resumen.totales).toMatchObject({ jornadasTrabajadas: 2, minutosTrabajados: 1_065, minutosPenalizados: 60 });

    await repositorio.reabrir(periodoCierreId, finanzasId, "Corregir jornada", new Date("2071-02-05T12:00:00Z"));
    await db.update(schema.asistenciasEsperadas).set({ minutosTrabajados: 480 }).where(eq(schema.asistenciasEsperadas.id, asistenciaTrabajadaId));
    await db.update(schema.tardanzas).set({ politicaVersion: 4 }).where(eq(schema.tardanzas.asistenciaId, asistenciaTrabajadaId));
    await repositorio.cerrar(periodoCierreId, finanzasId, instanteSegundoCierre);

    const revisiones = await repositorio.listarRevisiones(periodoCierreId);
    expect(revisiones).toHaveLength(2);
    expect(revisiones[0].resumen.totales.minutosTrabajados).toBe(1_065);
    expect(revisiones[0].resumen.filas[0].jornadas[0].politicaDeTardanzaVersion).toBe(3);
    expect(revisiones[1]).toMatchObject({ numero: 2, responsableId: finanzasId, cerradaEn: instanteSegundoCierre });
    expect(revisiones[1].resumen.totales.minutosTrabajados).toBe(1_020);
    expect(revisiones[1].resumen.filas[0].jornadas[0].politicaDeTardanzaVersion).toBe(4);
    const reaperturas = await db.select().from(schema.auditoriaPeriodosPlanilla).where(eq(schema.auditoriaPeriodosPlanilla.periodoId, periodoCierreId));
    expect(reaperturas).toEqual(expect.arrayContaining([expect.objectContaining({ accion: "reapertura", motivo: "Corregir jornada" })]));
  });
});
