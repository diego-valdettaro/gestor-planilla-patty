import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";

// `pnpm revisar` / `pnpm revisar:limpiar`: levanta (o baja) un entorno de revisión aislado
// para la rama del worktree actual. Ver docs/agents/agent-workflow.md.

interface Opciones {
  limpiar: boolean;
  reutilizar: boolean;
  numero: number;
  nombreBase: string;
  puerto: number;
}

function git(args: string[]): string {
  const salida = spawnSync("git", args, { encoding: "utf8" });
  if (salida.status !== 0) throw new Error(`git ${args.join(" ")} falló: ${salida.stderr.trim()}`);
  return salida.stdout.trim();
}

function leerOpciones(): Opciones {
  const argv = process.argv.slice(2);
  const limpiar = argv.includes("limpiar");
  const reutilizar = argv.includes("--reutilizar");
  const rama = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const explicitoNumero = valorDe(argv, "--numero");
  const detectado = /issue-(\d+)/.exec(rama)?.[1] ?? /(\d+)/.exec(rama)?.[1];
  const numero = Number(explicitoNumero ?? detectado);
  if (!Number.isInteger(numero) || numero <= 0) {
    throw new Error(`No pude deducir el número de issue desde la rama "${rama}". Pasá --numero <n>.`);
  }
  return {
    limpiar,
    reutilizar,
    numero,
    nombreBase: valorDe(argv, "--nombre") ?? `planilla_rev_${numero}`,
    puerto: Number(valorDe(argv, "--puerto") ?? 3000 + (numero % 1000)),
  };
}

function valorDe(argv: string[], bandera: string): string | undefined {
  const indice = argv.indexOf(bandera);
  return indice >= 0 ? argv[indice + 1] : undefined;
}

function urlPrincipal(): URL {
  const commonDir = git(["rev-parse", "--git-common-dir"]);
  const repoPrincipal = path.dirname(path.resolve(commonDir));
  const envPrincipal = path.join(repoPrincipal, ".env");
  if (!existsSync(envPrincipal)) {
    throw new Error(`No encuentro ${envPrincipal}. Configuralo con DATABASE_URL como indica el README.`);
  }
  const contenido = readFileSync(envPrincipal, "utf8");
  const match = /^DATABASE_URL=(.+)$/m.exec(contenido);
  if (!match) throw new Error(`El .env principal (${envPrincipal}) no define DATABASE_URL.`);
  return new URL(match[1].trim());
}

function conUrl(base: URL, nombreBase: string): string {
  const copia = new URL(base.toString());
  copia.pathname = `/${nombreBase}`;
  return copia.toString();
}

async function conCliente<T>(url: string, fn: (cliente: Client) => Promise<T>): Promise<T> {
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

function pnpm(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const win = process.platform === "win32";
  const comando = win ? "corepack.cmd" : "corepack";
  const argumentos = ["pnpm", ...args];
  const ejecutable = win ? (process.env.ComSpec ?? "cmd.exe") : comando;
  const argumentosDelProceso = win ? ["/d", "/c", comando, ...argumentos] : argumentos;
  const proceso = spawn(ejecutable, argumentosDelProceso, { stdio: "inherit", env });
  return new Promise((resolve, reject) => {
    proceso.on("error", reject);
    proceso.on("exit", (codigo) => (codigo === 0 || codigo === null ? resolve() : reject(new Error(`pnpm ${args.join(" ")} terminó con código ${codigo}.`))));
  });
}

function matarPuerto(puerto: number): void {
  if (process.platform !== "win32") {
    spawnSync("bash", ["-c", `fuser -k ${puerto}/tcp`], { stdio: "ignore" });
    return;
  }
  const netstat = spawnSync("netstat", ["-ano"], { encoding: "utf8" }).stdout ?? "";
  const pids = new Set(
    netstat.split(/\r?\n/).filter((linea) => linea.includes(`:${puerto} `) && linea.includes("LISTENING"))
      .map((linea) => linea.trim().split(/\s+/).at(-1))
      .filter((pid): pid is string => Boolean(pid && /^\d+$/.test(pid))),
  );
  for (const pid of pids) spawnSync("taskkill", ["/PID", pid, "/F", "/T"], { stdio: "ignore" });
}

// Escribe un `.env` mínimo en el worktree: solo apunta a la base de revisión.
// No copia el `.env` principal para no esparcir secretos (OPENAI_API_KEY, GITHUB_TOKEN…).
// Si un review puntual necesita esas features, se agregan a mano y se documenta.
function escribirEnvDelWorktree(worktree: string, url: string): void {
  const contenido = [
    "# Generado por `pnpm revisar`. Solo apunta a la base de revisión desechable.",
    `DATABASE_URL=${url}`,
    `TEST_DATABASE_URL=${url}`,
    "",
  ].join("\n");
  writeFileSync(path.join(worktree, ".env"), contenido, "utf8");
}

async function baseExiste(admin: string, nombreBase: string): Promise<boolean> {
  return conCliente(admin, async (cliente) => {
    const { rowCount } = await cliente.query("SELECT 1 FROM pg_database WHERE datname = $1", [nombreBase]);
    return rowCount === 1;
  });
}

async function main(): Promise<void> {
  const opciones = leerOpciones();
  const worktree = git(["rev-parse", "--show-toplevel"]);
  const base = urlPrincipal();
  const admin = conUrl(base, "postgres");
  const revUrl = conUrl(base, opciones.nombreBase);

  if (opciones.nombreBase === "planilla") throw new Error("El entorno de revisión no puede llamarse `planilla`.");

  if (opciones.limpiar) {
    matarPuerto(opciones.puerto);
    await conCliente(admin, async (cliente) => {
      await cliente.query(`DROP DATABASE IF EXISTS "${opciones.nombreBase}" WITH (FORCE)`);
    });
    const envWorktree = path.join(worktree, ".env");
    if (existsSync(envWorktree)) rmSync(envWorktree);
    console.log(`Listo. Base "${opciones.nombreBase}" eliminada y .env del worktree borrado.`);
    console.log(`Si ya no necesitás el worktree: git worktree remove "${worktree}"`);
    return;
  }

  const yaExiste = await baseExiste(admin, opciones.nombreBase);
  const recrear = !(opciones.reutilizar && yaExiste);
  if (recrear) {
    matarPuerto(opciones.puerto);
    await conCliente(admin, async (cliente) => {
      await cliente.query(`DROP DATABASE IF EXISTS "${opciones.nombreBase}" WITH (FORCE)`);
      await cliente.query(`CREATE DATABASE "${opciones.nombreBase}"`);
    });
    console.log(`Base "${opciones.nombreBase}" creada.`);
  } else {
    console.log(`Reutilizando la base "${opciones.nombreBase}" existente.`);
  }

  escribirEnvDelWorktree(worktree, revUrl);

  // Env hermético para los procesos hijos: la base de revisión gana sobre cualquier
  // DATABASE_URL que ya esté exportado en la terminal (o que traiga direnv, etc.).
  const envHijo: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: revUrl, TEST_DATABASE_URL: revUrl };

  if (!existsSync(path.join(worktree, "node_modules"))) {
    await pnpm(["install", "--frozen-lockfile"], envHijo);
  }

  if (recrear) {
    await pnpm(["exec", "tsx", "scripts/migrar-base.ts", "migrate", "--url", revUrl], envHijo);
    await pnpm(["exec", "tsx", "scripts/sembrar-base.ts", "--url", revUrl], envHijo);
    const escenario = path.join("scripts", "escenarios", `issue-${opciones.numero}.ts`);
    if (existsSync(path.join(worktree, escenario))) {
      console.log(`Ejecutando ${escenario}…`);
      await pnpm(["exec", "tsx", escenario, "--url", revUrl], envHijo);
    }
  }

  console.log("");
  console.log("Entorno de revisión listo:");
  console.log(`  Rama:    ${git(["rev-parse", "--abbrev-ref", "HEAD"])}`);
  console.log(`  Base:    ${opciones.nombreBase}`);
  console.log(`  URL:     http://localhost:${opciones.puerto}`);
  console.log("  Cuentas: operaciones/operaciones · admin/admin · finanzas/finanzas");
  console.log("  Ctrl+C corta el servidor. Al terminar la revisión: pnpm revisar:limpiar");
  console.log("");

  await pnpm(["exec", "next", "dev", "-p", String(opciones.puerto)], envHijo);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
