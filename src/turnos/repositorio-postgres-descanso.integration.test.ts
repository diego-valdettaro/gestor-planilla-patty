import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { RepositorioPostgresDeTurnos } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("RepositorioPostgresDeTurnos al publicar un descanso", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeTurnos(db);
  const idHuellero = `TEST-DESCANSO-${randomUUID()}`;
  const fecha = "2031-09-04";

  beforeAll(async () => {
    await db.insert(schema.colaboradores).values({ idHuellero, nombre: "Ana Rojas", sede: "Lima", centroDeCosto: "Operaciones", activo: true });
    await db.insert(schema.periodosPlanilla).values({ inicio: "2031-08-26", fin: "2031-09-25", estado: "abierto" });
  });

  afterAll(async () => {
    const [turno] = await db.select({ id: schema.turnosPublicados.id }).from(schema.turnosPublicados)
      .where(and(eq(schema.turnosPublicados.idHuellero, idHuellero), eq(schema.turnosPublicados.fecha, fecha)));
    await db.delete(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.idHuellero, idHuellero), eq(schema.asistenciasEsperadas.fecha, fecha)));
    if (turno) await db.delete(schema.historialDeTurnosPublicados).where(eq(schema.historialDeTurnosPublicados.turnoPublicadoId, turno.id));
    await db.delete(schema.turnosPublicados).where(and(eq(schema.turnosPublicados.idHuellero, idHuellero), eq(schema.turnosPublicados.fecha, fecha)));
    await db.delete(schema.periodosPlanilla).where(and(eq(schema.periodosPlanilla.inicio, "2031-08-26"), eq(schema.periodosPlanilla.fin, "2031-09-25")));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.idHuellero, idHuellero));
    await pool.end();
  });

  it("no crea una asistencia esperada", async () => {
    await repositorio.publicar({ idHuellero, fecha, sede: "Lima", entradaProgramada: null, salidaProgramada: null, descanso: true });

    await expect(db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.idHuellero, idHuellero), eq(schema.asistenciasEsperadas.fecha, fecha)))).resolves.toEqual([]);
  });
});
