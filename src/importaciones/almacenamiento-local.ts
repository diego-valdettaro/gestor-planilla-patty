import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { ArchivoFuente } from "./importar-semana-por-sede";

const directorioRaiz = process.env.ALMACENAMIENTO_IMPORTACIONES
  ?? join(process.cwd(), "data", "importaciones");

export async function conservarArchivoFuente(archivo: File): Promise<ArchivoFuente> {
  if (!archivo.name) {
    throw new Error("Debe seleccionar un archivo fuente.");
  }
  return conservarContenido(archivo.name, Buffer.from(await archivo.arrayBuffer()));
}

/** Guarda el contenido fuera del directorio público con su hash SHA-256 (ADR 0005). El nombre original queda en el registro. */
export async function conservarContenido(nombre: string, contenido: Uint8Array): Promise<ArchivoFuente> {
  const nombreSeguro = basename(nombre).replace(/[^a-zA-Z0-9._-]/g, "_");
  const nombreAlmacenado = `${randomUUID()}-${nombreSeguro}`;
  await mkdir(directorioRaiz, { recursive: true });
  await writeFile(join(directorioRaiz, nombreAlmacenado), contenido, { flag: "wx" });

  return {
    nombre,
    ubicacion: join(directorioRaiz, nombreAlmacenado),
    hashSha256: createHash("sha256").update(contenido).digest("hex"),
  };
}

export async function descartarArchivoFuente(archivo: ArchivoFuente): Promise<void> {
  await rm(archivo.ubicacion, { force: true });
}
