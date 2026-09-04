import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Pool, type PoolClient } from "pg";

const directorioDeMigraciones = path.resolve(import.meta.dirname, "../drizzle");
const tablaDeMigraciones = "migraciones_planilla";
const ultimaMigracionPreviaAlHistorial = "0012_eliminar_minutos_de_almuerzo.sql";

interface Migracion { archivo: string; contenido: string; checksum: string; }
interface MigracionAplicada { archivo: string; checksum: string; }

export async function leerMigraciones(directorio = directorioDeMigraciones): Promise<Migracion[]> {
  const archivos = (await readdir(directorio)).filter((archivo) => /^\d{4}_.+\.sql$/.test(archivo)).sort();
  return Promise.all(archivos.map(async (archivo) => {
    const contenido = await readFile(path.join(directorio, archivo), "utf8");
    return { archivo, contenido, checksum: createHash("sha256").update(contenido).digest("hex") };
  }));
}

async function crearTablaDeMigraciones(client: PoolClient): Promise<void> {
  await client.query(`CREATE TABLE IF NOT EXISTS ${tablaDeMigraciones} (archivo text PRIMARY KEY, checksum text NOT NULL, aplicada_en timestamp with time zone NOT NULL DEFAULT now())`);
}

async function migracionesAplicadas(client: PoolClient): Promise<MigracionAplicada[]> {
  return (await client.query<MigracionAplicada>(`SELECT archivo, checksum FROM ${tablaDeMigraciones} ORDER BY archivo`)).rows;
}

function validarHistorial(migraciones: Migracion[], aplicadas: MigracionAplicada[]): void {
  const porArchivo = new Map(migraciones.map((migracion) => [migracion.archivo, migracion]));
  for (const aplicada of aplicadas) {
    const migracion = porArchivo.get(aplicada.archivo);
    if (!migracion) throw new Error(`La base registra una migración que ya no existe: ${aplicada.archivo}.`);
    if (migracion.checksum !== aplicada.checksum) throw new Error(`Cambió el contenido de una migración ya aplicada: ${aplicada.archivo}. Cree otra migración en lugar de editarla.`);
  }
}

export async function verificarMigraciones(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url });
  try {
    const migraciones = await leerMigraciones();
    const client = await pool.connect();
    try {
      const { rows: [tabla] } = await client.query<{ existe: boolean }>(`SELECT to_regclass('public.${tablaDeMigraciones}') IS NOT NULL AS existe`);
      if (!tabla.existe) throw new Error("La base no tiene historial de migraciones. Si es la instalación existente en 0012, ejecute pnpm db:baseline; si es una base nueva, ejecute pnpm db:migrate.");
      const aplicadas = await migracionesAplicadas(client);
      validarHistorial(migraciones, aplicadas);
      const pendientes = migraciones.filter((migracion) => !aplicadas.some((aplicada) => aplicada.archivo === migracion.archivo));
      if (pendientes.length) throw new Error(`La base no está al día. Faltan: ${pendientes.map((migracion) => migracion.archivo).join(", ")}. Ejecute pnpm db:migrate antes de arrancar la app.`);
    } finally { client.release(); }
  } finally { await pool.end(); }
}

export async function aplicarMigraciones(url: string): Promise<string[]> {
  const pool = new Pool({ connectionString: url });
  try {
    const migraciones = await leerMigraciones();
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(745039001)");
      await crearTablaDeMigraciones(client);
      const aplicadas = await migracionesAplicadas(client);
      validarHistorial(migraciones, aplicadas);
      const archivosAplicados = new Set(aplicadas.map((migracion) => migracion.archivo));
      const pendientes = migraciones.filter((migracion) => !archivosAplicados.has(migracion.archivo));
      for (const migracion of pendientes) {
        await client.query("BEGIN");
        try {
          await client.query(migracion.contenido);
          await client.query(`INSERT INTO ${tablaDeMigraciones} (archivo, checksum) VALUES ($1, $2)`, [migracion.archivo, migracion.checksum]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw new Error(`No se pudo aplicar ${migracion.archivo}.`, { cause: error });
        }
      }
      return pendientes.map((migracion) => migracion.archivo);
    } finally {
      await client.query("SELECT pg_advisory_unlock(745039001)").catch(() => undefined);
      client.release();
    }
  } finally { await pool.end(); }
}

async function verificarEsquemaParaBaseline(client: PoolClient): Promise<void> {
  const { rows: [estado] } = await client.query<{ tiene_celdas: boolean; tiene_columna_de_modelo: boolean }>(`
    SELECT to_regclass('public.celdas_planes_semanales_en_borrador') IS NOT NULL AS tiene_celdas,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'celdas_planes_semanales_en_borrador' AND column_name = 'modelo_horario_id') AS tiene_columna_de_modelo
  `);
  if (!estado.tiene_celdas || estado.tiene_columna_de_modelo) throw new Error(`El baseline solo es seguro para una base en ${ultimaMigracionPreviaAlHistorial}. Verifique la versión real de la base antes de continuar.`);
}

export async function crearBaseline(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url });
  try {
    const migraciones = await leerMigraciones();
    const hasta = migraciones.findIndex((migracion) => migracion.archivo === ultimaMigracionPreviaAlHistorial);
    if (hasta < 0) throw new Error(`No existe ${ultimaMigracionPreviaAlHistorial}.`);
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(745039001)");
      await crearTablaDeMigraciones(client);
      if ((await migracionesAplicadas(client)).length) throw new Error("La base ya tiene historial de migraciones. No ejecute db:baseline otra vez.");
      await verificarEsquemaParaBaseline(client);
      await client.query("BEGIN");
      try {
        for (const migracion of migraciones.slice(0, hasta + 1)) await client.query(`INSERT INTO ${tablaDeMigraciones} (archivo, checksum) VALUES ($1, $2)`, [migracion.archivo, migracion.checksum]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    } finally {
      await client.query("SELECT pg_advisory_unlock(745039001)").catch(() => undefined);
      client.release();
    }
  } finally { await pool.end(); }
}

function urlDesdeArgumentos(): string {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const indice = process.argv.indexOf("--url");
  const url = indice >= 0 ? process.argv[indice + 1] : process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL o el argumento --url.");
  return url;
}

async function main(): Promise<void> {
  const comando = process.argv[2];
  const url = urlDesdeArgumentos();
  if (comando === "migrate") { const aplicadas = await aplicarMigraciones(url); console.log(aplicadas.length ? `Migraciones aplicadas: ${aplicadas.join(", ")}` : "La base ya está al día."); return; }
  if (comando === "check") { await verificarMigraciones(url); console.log("La base está al día."); return; }
  if (comando === "baseline") { await crearBaseline(url); console.log(`Baseline creado hasta ${ultimaMigracionPreviaAlHistorial}. Ejecute pnpm db:migrate.`); return; }
  throw new Error("Use migrate, check o baseline.");
}

const ejecutadoDirectamente = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (ejecutadoDirectamente) main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
