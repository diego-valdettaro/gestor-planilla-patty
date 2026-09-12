import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { leerMigraciones } from "../../scripts/migrar-base";

const directorios: string[] = [];

afterEach(async () => { await Promise.all(directorios.splice(0).map((directorio) => rm(directorio, { recursive: true, force: true }))); });

describe("leerMigraciones", () => {
  it("ordena solo los archivos SQL versionados y calcula su checksum", async () => {
    const directorio = await mkdtemp(path.join(os.tmpdir(), "planilla-migraciones-"));
    directorios.push(directorio);
    await writeFile(path.join(directorio, "0010_segunda.sql"), "SELECT 2;");
    await writeFile(path.join(directorio, "0009_primera.sql"), "SELECT 1;");
    await writeFile(path.join(directorio, "notas.sql"), "SELECT 3;");

    const migraciones = await leerMigraciones(directorio);

    expect(migraciones.map(({ archivo }) => archivo)).toEqual(["0009_primera.sql", "0010_segunda.sql"]);
    expect(migraciones[0].checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(migraciones[0].checksum).not.toBe(migraciones[1].checksum);
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// Reproduce, contra una base descartable propia, el escenario que el criterio de
// aceptación de la issue #61 exige: una migración que aplica sobre datos reales no
// debe dejar un colaborador con `grupo` nulo. Se arma la base hasta la migración
// anterior a mano (no hay caso de uso para "sede sin grupo"), se inserta el dato
// inválido y se comprueba que la migración objetivo rechaza aplicarse.
describe.skipIf(!databaseUrl)("migración 0021_grupo_directo_de_colaborador", () => {
  const nombreDeLaBase = `planilla_migracion_0021_${randomUUID().replace(/-/g, "_")}`;
  const adminPool = new Pool({ connectionString: databaseUrl });
  let urlDeLaBasePrueba: string;

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE "${nombreDeLaBase}"`);
    const url = new URL(databaseUrl!);
    url.pathname = `/${nombreDeLaBase}`;
    urlDeLaBasePrueba = url.toString();
  });

  afterAll(async () => {
    await adminPool.query(`DROP DATABASE IF EXISTS "${nombreDeLaBase}"`);
    await adminPool.end();
  });

  it("falla si un colaborador queda con una sede que no pertenece a un grupo", async () => {
    const migraciones = await leerMigraciones();
    const previas = migraciones.filter((migracion) => migracion.archivo < "0021_grupo_directo_de_colaborador.sql");
    const objetivo = migraciones.find((migracion) => migracion.archivo === "0021_grupo_directo_de_colaborador.sql");
    if (!objetivo) throw new Error("No se encontró la migración 0021_grupo_directo_de_colaborador.sql.");

    const pool = new Pool({ connectionString: urlDeLaBasePrueba });
    try {
      for (const migracion of previas) await pool.query(migracion.contenido);
      await pool.query("INSERT INTO sedes (nombre, activa, grupo) VALUES ('Sede sin grupo', true, NULL)");
      await pool.query("INSERT INTO colaboradores (id_huellero, nombre, sede, activo) VALUES ('HU-SIN-GRUPO', 'Prueba', 'Sede sin grupo', true)");

      await expect(pool.query(objetivo.contenido)).rejects.toThrow(/column "grupo".*(null|contains null)/i);
    } finally {
      await pool.end();
    }
  });
});
