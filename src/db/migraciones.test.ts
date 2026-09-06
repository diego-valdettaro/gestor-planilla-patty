import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

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
