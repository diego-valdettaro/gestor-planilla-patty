import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { RepositorioPostgresDeTurnos } from "./repositorio-postgres";

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL");

describe.skipIf(!url)("consulta mensual de borradores", () => {
  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool, schema });
  const repo = new RepositorioPostgresDeTurnos(db);
  let grupos: string[] = [];
  let personas: string[] = [];
  let planes: string[] = [];
  beforeAll(async () => {
    grupos = (await db.insert(schema.grupos).values([{ nombre: "grupo mensual A" }, { nombre: "grupo mensual B" }]).returning({ nombre: schema.grupos.nombre })).map(({ nombre }) => nombre);
    personas = (await db.insert(schema.colaboradores).values([
      { dni: "11111111", nombre: "Prueba A", grupo: "grupo mensual A" },
      { dni: "22222222", nombre: "Prueba B", grupo: "grupo mensual B" },
    ]).returning({ id: schema.colaboradores.id })).map(({ id }) => id);
    const [a, b] = await db.insert(schema.planesSemanalesEnBorrador).values([
      { semana: "2030-08-26", equipo: "grupo mensual A" },
      { semana: "2030-08-26", equipo: "grupo mensual B" },
    ]).returning();
    planes = [a.id, b.id];
    await db.insert(schema.celdasDePlanesSemanalesEnBorrador).values([
      { planId: a.id, dni: "11111111", grupo: "grupo mensual A", fecha: "2030-09-01", descanso: true, motivoNoAsistencia: "descanso" },
      { planId: a.id, dni: "11111111", grupo: "grupo mensual A", fecha: "2030-09-30", descanso: true, motivoNoAsistencia: "descanso" },
      { planId: a.id, dni: "11111111", grupo: "grupo mensual A", fecha: "2030-10-01", descanso: true, motivoNoAsistencia: "descanso" },
      { planId: b.id, dni: "22222222", grupo: "grupo mensual B", fecha: "2030-09-01", descanso: true, motivoNoAsistencia: "descanso" },
    ]);
  });
  afterAll(async () => {
    try {
      if (planes.length) {
        await db.delete(schema.celdasDePlanesSemanalesEnBorrador).where(inArray(schema.celdasDePlanesSemanalesEnBorrador.planId, planes));
        await db.delete(schema.planesSemanalesEnBorrador).where(inArray(schema.planesSemanalesEnBorrador.id, planes));
      }
      if (personas.length) await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.id, personas));
      if (grupos.length) await db.delete(schema.grupos).where(inArray(schema.grupos.nombre, grupos));
    } finally { await pool.end(); }
  });
  it("incluye extremos, excluye fecha exterior y otro grupo, sin crear planes", async () => {
    const antes = await db.select().from(schema.planesSemanalesEnBorrador);
    const celdas = await repo.listarBorradoresDelEquipoEnRango("grupo mensual A", "2030-09-01", "2030-09-30");
    expect(celdas.map(c => [c.dni, c.fecha]).sort()).toEqual([
      ["11111111", "2030-09-01"], ["11111111", "2030-09-30"],
    ]);
    expect(await db.select().from(schema.planesSemanalesEnBorrador)).toEqual(antes);
  });
});
