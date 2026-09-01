import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { RepositorioPostgresDeTurnos } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("RepositorioPostgresDeTurnos", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeTurnos(db);
  const idHuellero = `TEST-${randomUUID()}`;
  const fecha = "2030-09-02";

  beforeAll(async () => {
    await db.insert(schema.colaboradores).values({
      idHuellero,
      nombre: "Ana Rojas",
      sede: "Lima",
      centroDeCosto: "Operaciones",
      activo: true,
    });
    await db.insert(schema.periodosPlanilla).values({
      inicio: "2030-08-26",
      fin: "2030-09-25",
      estado: "abierto",
    });
  });

  afterAll(async () => {
    const turnos = await db
      .select({ id: schema.turnosPublicados.id })
      .from(schema.turnosPublicados)
      .where(and(eq(schema.turnosPublicados.idHuellero, idHuellero), eq(schema.turnosPublicados.fecha, fecha)));

    await db
      .delete(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.idHuellero, idHuellero), eq(schema.asistenciasEsperadas.fecha, fecha)));
    if (turnos.length) {
      await db
        .delete(schema.historialDeTurnosPublicados)
        .where(inArray(schema.historialDeTurnosPublicados.turnoPublicadoId, turnos.map(({ id }) => id)));
    }
    await db
      .delete(schema.turnosPublicados)
      .where(and(eq(schema.turnosPublicados.idHuellero, idHuellero), eq(schema.turnosPublicados.fecha, fecha)));
    await db
      .delete(schema.periodosPlanilla)
      .where(and(eq(schema.periodosPlanilla.inicio, "2030-08-26"), eq(schema.periodosPlanilla.fin, "2030-09-25")));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.idHuellero, idHuellero));
    await pool.end();
  });

  it("guarda el turno, su historial y la asistencia esperada", async () => {
    await repositorio.publicar({
      idHuellero,
      fecha,
      sede: "Lima",
      entradaProgramada: "09:00",
      salidaProgramada: "18:00",
      minutosDeAlmuerzo: 60,
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
});
