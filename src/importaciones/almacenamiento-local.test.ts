import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("almacenamiento local de archivos fuente", () => {
  let directorio: string | undefined;

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    if (directorio) await rm(directorio, { recursive: true, force: true });
  });

  async function cargar() {
    directorio = await mkdtemp(join(tmpdir(), "almacenamiento-"));
    vi.stubEnv("ALMACENAMIENTO_IMPORTACIONES", directorio);
    return import("./almacenamiento-local");
  }

  it("conserva el contenido con su hash SHA-256 y un nombre seguro, y lo puede descartar", async () => {
    const { conservarContenido, descartarArchivoFuente } = await cargar();
    const contenido = Buffer.from("contenido sintético");

    const archivo = await conservarContenido("../Comisión octubre.xlsx", contenido);

    expect(archivo.nombre).toBe("../Comisión octubre.xlsx");
    expect(archivo.hashSha256).toBe(createHash("sha256").update(contenido).digest("hex"));
    expect(archivo.ubicacion.startsWith(directorio!)).toBe(true);
    expect(archivo.ubicacion).toMatch(/-Comisi_n_octubre\.xlsx$/);
    expect((await readFile(archivo.ubicacion)).equals(contenido)).toBe(true);

    await descartarArchivoFuente(archivo);
    await expect(stat(archivo.ubicacion)).rejects.toThrow();
  });
});
