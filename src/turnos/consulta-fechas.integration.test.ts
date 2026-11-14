import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { RepositorioPostgresDeTurnos } from "./repositorio-postgres";

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL");

describe.skipIf(!url)("consulta de estado de fechas", () => {
  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool, schema });
  const repo = new RepositorioPostgresDeTurnos(db);
  let periodos: string[] = [];
  beforeAll(async () => {
    periodos = (await db.insert(schema.periodosPlanilla).values([
      { inicio: "2030-08-30", fin: "2030-09-02", estado: "cerrado" },
      { inicio: "2030-09-04", fin: "2030-09-06", estado: "abierto" },
      { inicio: "2030-09-08", fin: "2030-09-10", estado: "cerrado" },
    ]).returning({ id: schema.periodosPlanilla.id })).map(({ id }) => id);
  });
  afterAll(async () => {
    try { if (periodos.length) await db.delete(schema.periodosPlanilla).where(inArray(schema.periodosPlanilla.id, periodos)); }
    finally { await pool.end(); }
  });
  it("clasifica cada fecha del rango con períodos cerrados, abiertos y huecos", async () => {
    await expect(repo.consultarEstadoDeFechas("2030-09-01", "2030-09-08")).resolves.toEqual({
      cerradas: ["2030-09-01", "2030-09-02", "2030-09-08"],
      sinPeriodo: ["2030-09-03", "2030-09-07"],
    });
  });
});
