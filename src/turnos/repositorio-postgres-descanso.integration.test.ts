import { dniDePrueba } from "../colaboradores/dni-de-prueba";
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { eliminarRelacionesDePrueba, registrarRelacionConfirmadaDePrueba } from "@/relaciones-laborales/relacion-de-prueba";

import { RepositorioPostgresDeTurnos } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("RepositorioPostgresDeTurnos al publicar un descanso", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeTurnos(db);
  const dni = dniDePrueba();
  const fecha = "2031-09-04";

  beforeAll(async () => {
    await db.insert(schema.colaboradores).values({ dni, nombre: "Ana Rojas", sede: "Lima", grupo: "Tiendas", activo: true });
    await registrarRelacionConfirmadaDePrueba(db, dni);
    await db.insert(schema.periodosPlanilla).values({ inicio: "2031-08-26", fin: "2031-09-25", estado: "abierto" });
  });

  afterAll(async () => {
    const [turno] = await db.select({ id: schema.turnosPublicados.id }).from(schema.turnosPublicados)
      .where(and(eq(schema.turnosPublicados.dni, dni), eq(schema.turnosPublicados.fecha, fecha)));
    await db.delete(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, fecha)));
    if (turno) await db.delete(schema.historialDeTurnosPublicados).where(eq(schema.historialDeTurnosPublicados.turnoPublicadoId, turno.id));
    await db.delete(schema.turnosPublicados).where(and(eq(schema.turnosPublicados.dni, dni), eq(schema.turnosPublicados.fecha, fecha)));
    await db.delete(schema.periodosPlanilla).where(and(eq(schema.periodosPlanilla.inicio, "2031-08-26"), eq(schema.periodosPlanilla.fin, "2031-09-25")));
    await eliminarRelacionesDePrueba(db, [dni]);
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await pool.end();
  });

  it("no crea una asistencia esperada", async () => {
    await repositorio.publicar({ dni, fecha, sede: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "descanso" });

    await expect(db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, fecha)))).resolves.toEqual([]);
  });
});
