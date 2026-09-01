import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { RepositorioPostgresDeColaboradores } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("RepositorioPostgresDeColaboradores", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeColaboradores(db);
  const idHuellero = `TEST-${randomUUID()}`;

  beforeAll(async () => {
    await repositorio.guardar({
      idHuellero,
      nombre: "Ana Rojas",
      sede: "Lima",
      centroDeCosto: "Operaciones",
      activo: true,
    });
  });

  afterAll(async () => {
    await db
      .delete(schema.colaboradores)
      .where(eq(schema.colaboradores.idHuellero, idHuellero));
    await pool.end();
  });

  it("persiste y recupera un colaborador", async () => {
    await expect(repositorio.buscarPorIdHuellero(idHuellero)).resolves.toMatchObject({
      idHuellero,
      nombre: "Ana Rojas",
      sede: "Lima",
      centroDeCosto: "Operaciones",
      activo: true,
    });
  });

  it("deja que PostgreSQL rechace el ID de huellero duplicado", async () => {
    await expect(
      repositorio.guardar({
        idHuellero,
        nombre: "Brenda Soto",
        sede: "Lima",
        centroDeCosto: "Operaciones",
        activo: true,
      }),
    ).rejects.toThrow();
  });
});
