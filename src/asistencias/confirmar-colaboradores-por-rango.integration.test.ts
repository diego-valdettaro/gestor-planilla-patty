import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import * as schema from "@/db/schema";

import { RepositorioPostgresDeAsistencias } from "./repositorio-postgres";
import { confirmarColaboradoresPorRango } from "./confirmar-colaboradores-por-rango";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integracion PostgreSQL.");

describe.skipIf(!databaseUrl)("confirmar colaboradores por rango en PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeAsistencias(db);
  const sufijo = randomUUID();
  const idHuellero = `RANGO-${sufijo}`;
  const cuentaId = randomUUID();
  const grupo = `Grupo ${sufijo}`;
  const sede = `Sede ${sufijo}`;
  const fechas = ["2031-03-24", "2031-03-25"];

  beforeAll(async () => {
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.sedes).values({ nombre: sede, grupo, activa: true });
    await db.insert(schema.colaboradores).values({ idHuellero, nombre: "Nora Rango", sede, grupo, activo: true });
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `rango-${sufijo}`, hashContrasena: "prueba", rol: "administracion" });
    await db.insert(schema.periodosPlanilla).values({ inicio: "2031-02-26", fin: "2031-03-25", estado: "abierto" });
    await db.insert(schema.politicasDePenalizacionPorTardanzas).values({ sede, toleranciaEnMinutos: 10, tardanzasAcumuladas: 2, horasPenalizadas: 1, version: 1, vigenteDesde: "2031-01-01", configuradaPorId: cuentaId });
    await db.insert(schema.turnosPublicados).values([
      { idHuellero, fecha: fechas[0], grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null },
      { idHuellero, fecha: fechas[1], grupo, sede: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "feriado" },
    ]);
    await db.insert(schema.asistenciasEsperadas).values([
      { idHuellero, fecha: fechas[0], estado: "pendiente", entradaPropuesta: `${fechas[0]}T09:15`, salidaPropuesta: `${fechas[0]}T18:30` },
      { idHuellero, fecha: fechas[1], estado: "pendiente" },
    ]);
  });

  afterAll(async () => {
    const asistencias = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.idHuellero, idHuellero), inArray(schema.asistenciasEsperadas.fecha, fechas)));
    if (asistencias.length) {
      await db.delete(schema.horasExtra).where(inArray(schema.horasExtra.asistenciaId, asistencias.map(({ id }) => id)));
      await db.delete(schema.tardanzas).where(inArray(schema.tardanzas.asistenciaId, asistencias.map(({ id }) => id)));
      await db.delete(schema.estadosManuales).where(inArray(schema.estadosManuales.asistenciaId, asistencias.map(({ id }) => id)));
    }
    await db.delete(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.idHuellero, idHuellero));
    await db.delete(schema.turnosPublicados).where(eq(schema.turnosPublicados.idHuellero, idHuellero));
    await db.delete(schema.politicasDePenalizacionPorTardanzas).where(eq(schema.politicasDePenalizacionPorTardanzas.sede, sede));
    await db.delete(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.inicio, "2031-02-26"));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.idHuellero, idHuellero));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await pool.end();
  });

  it("confirma trabajo y un motivo planificado como una sola seleccion", async () => {
    await confirmarColaboradoresPorRango(repositorio, { id: cuentaId, rol: "administracion" }, { inicio: fechas[0], fin: fechas[1], idsHuellero: [idHuellero] });

    const asistencias = await db.select().from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.idHuellero, idHuellero)).orderBy(schema.asistenciasEsperadas.fecha);
    expect(asistencias).toEqual(expect.arrayContaining([
      expect.objectContaining({ fecha: fechas[0], estado: "confirmada", confirmadoPorId: cuentaId, instantaneaDeTurno: expect.objectContaining({ sede, entradaProgramada: "09:00" }) }),
      expect.objectContaining({ fecha: fechas[1], estado: "manual" }),
    ]));
    const extras = await db.select().from(schema.horasExtra);
    expect(extras).toContainEqual(expect.objectContaining({ estado: "pendiente", minutosAl25: 30 }));
  });
});
