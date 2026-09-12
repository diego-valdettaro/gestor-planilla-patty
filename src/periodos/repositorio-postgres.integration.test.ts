import { and, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { PeriodosSolapadosError } from "./periodo-planilla";
import { RepositorioPostgresDePeriodos } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("períodos de planilla persistidos", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const periodos = new RepositorioPostgresDePeriodos(db);
  const inicio = "2031-05-26";
  const fin = "2031-06-25";

  afterAll(async () => {
    await db.delete(schema.periodosPlanilla).where(and(gte(schema.periodosPlanilla.inicio, "2031-05-01"), lte(schema.periodosPlanilla.fin, "2031-08-31")));
    await pool.end();
  });

  it("crea un período y lo expone en el listado", async () => {
    await periodos.crear(inicio, fin);

    await expect(periodos.listar()).resolves.toContainEqual(expect.objectContaining({ inicio, fin, estado: "abierto" }));
  });

  it("rechaza un período que se solapa con uno existente", async () => {
    await expect(periodos.crear("2031-06-01", "2031-06-30")).rejects.toThrow(PeriodosSolapadosError);
  });

  it("persiste un período contiguo que no se solapa", async () => {
    const inicioContiguo = "2031-06-26";
    const finContiguo = "2031-07-25";

    await periodos.crear(inicioContiguo, finContiguo);

    await expect(periodos.listar()).resolves.toContainEqual(expect.objectContaining({ inicio: inicioContiguo, fin: finContiguo, estado: "abierto" }));
  });
});
