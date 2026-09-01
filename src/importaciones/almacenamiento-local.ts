import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { ArchivoFuente } from "./importar-semana-por-sede";

const directorioRaiz = process.env.ALMACENAMIENTO_IMPORTACIONES
  ?? join(process.cwd(), "data", "importaciones");

export async function conservarArchivoFuente(archivo: File): Promise<ArchivoFuente> {
  if (!archivo.name) {
    throw new Error("Debe seleccionar un archivo fuente.");
  }
  const contenido = Buffer.from(await archivo.arrayBuffer());
  const nombreSeguro = basename(archivo.name).replace(/[^a-zA-Z0-9._-]/g, "_");
  const nombreAlmacenado = `${randomUUID()}-${nombreSeguro}`;
  await mkdir(directorioRaiz, { recursive: true });
  await writeFile(join(directorioRaiz, nombreAlmacenado), contenido, { flag: "wx" });

  return {
    nombre: archivo.name,
    ubicacion: join(directorioRaiz, nombreAlmacenado),
    hashSha256: createHash("sha256").update(contenido).digest("hex"),
  };
}
