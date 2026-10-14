import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { aplicarMigraciones } from "../../scripts/migrar-base";
import { clasificarGoce } from "@/clasificaciones-de-goce/gestionar-clasificaciones";
import { RepositorioPostgresDeClasificacionesDeGoce } from "@/clasificaciones-de-goce/repositorio-postgres";
import * as schema from "@/db/schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// La resiembra corre en una base propia, creada y destruida aquí, para no tocar los datos de las demás pruebas de integración.
describe.skipIf(!databaseUrl)("resiembra de los datos de demo", () => {
  const nombre = `planilla_resiembra_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const administrativa = new Pool({ connectionString: databaseUrl });
  const urlDeLaBase = () => { const url = new URL(databaseUrl!); url.pathname = `/${nombre}`; return url.toString(); };
  let pool: Pool;

  function sembrar(): void {
    try {
      execFileSync("pnpm", ["exec", "tsx", "scripts/sembrar-base.ts", "--url", urlDeLaBase()], { stdio: "pipe", encoding: "utf8" });
    } catch (error) {
      const salida = error as { stderr?: string; stdout?: string; message: string };
      throw new Error(`El seed falló: ${salida.stderr || salida.stdout || salida.message}`);
    }
  }

  beforeAll(async () => {
    await administrativa.query(`CREATE DATABASE ${nombre}`);
    await aplicarMigraciones(urlDeLaBase());
    pool = new Pool({ connectionString: urlDeLaBase() });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await administrativa.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
    await administrativa.end();
  });

  it("RS-01 resembrar una base donde Finanzas ya clasificó a una persona de demo no falla y deja solo el estado sembrado", async () => {
    sembrar();
    const db = drizzle({ client: pool, schema });
    const { rows: [finanzas] } = await pool.query<{ id: string }>("SELECT id FROM cuentas_locales WHERE nombre_usuario = 'finanzas'");
    await clasificarGoce(new RepositorioPostgresDeClasificacionesDeGoce(db), { id: finanzas.id, rol: "finanzas" }, { dni: "99900015", fecha: "2026-10-07", conGoce: true });
    expect((await pool.query("SELECT 1 FROM clasificaciones_de_goce WHERE dni = '99900015'")).rowCount).toBe(1);

    sembrar();

    expect((await pool.query("SELECT 1 FROM clasificaciones_de_goce")).rowCount).toBe(0);
    expect((await pool.query("SELECT 1 FROM colaboradores WHERE dni = '99900015'")).rowCount).toBe(1);
  }, 240_000);
});
