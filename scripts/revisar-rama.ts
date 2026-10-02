import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { resumenDeRevision, type IssueDeGitHub } from "../src/qa/checklist-qa";
import {
  comprobarDocker,
  ejecutarDockerReal,
  eliminarPostgresDeRevision,
  entornoDeRevision,
  levantarPostgresDeRevision,
} from "../src/qa/postgres-de-revision";

// `pnpm revisar` / `pnpm revisar:limpiar`: levanta (o baja) un entorno de revisión aislado
// para la rama del worktree actual, con un PostgreSQL desechable en Docker.
// Ver docs/agents/agent-workflow.md.

interface Opciones {
  limpiar: boolean;
  reutilizar: boolean;
  numero: number;
  nombreBase: string;
  puerto: number;
}

function traerIssue(numero: number): IssueDeGitHub | undefined {
  const salida = spawnSync("gh", ["issue", "view", String(numero), "--repo", "diego-valdettaro/gestor-planilla-patty", "--json", "title,body,url"], {
    encoding: "utf8",
    timeout: 8000,
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
  });
  if (salida.error || salida.status !== 0) return undefined;
  try {
    const issue: unknown = JSON.parse(salida.stdout);
    if (!issue || typeof issue !== "object") return undefined;
    const datos = issue as Partial<IssueDeGitHub>;
    if (typeof datos.title !== "string" || typeof datos.body !== "string" || typeof datos.url !== "string") return undefined;
    return { title: datos.title, body: datos.body, url: datos.url };
  } catch {
    return undefined;
  }
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
// No lee ni copia ningún `.env` principal, así no se esparcen secretos.
function escribirEnvDelWorktree(worktree: string, url: string): void {
  const contenido = [
    "# Generado por `pnpm revisar`. Solo apunta a la base de revisión desechable.",
    `DATABASE_URL=${url}`,
    `TEST_DATABASE_URL=${url}`,
    "",
  ].join("\n");
  writeFileSync(path.join(worktree, ".env"), contenido, "utf8");
}

async function main(): Promise<void> {
  const opciones = leerOpciones();
  const worktree = git(["rev-parse", "--show-toplevel"]);
  const envWorktree = path.join(worktree, ".env");

  if (opciones.limpiar) {
    matarPuerto(opciones.puerto);
    if (existsSync(envWorktree)) rmSync(envWorktree);
    // Si Docker no está disponible, lo local ya quedó limpio y este error lo dice.
    comprobarDocker(ejecutarDockerReal);
    const existia = eliminarPostgresDeRevision(ejecutarDockerReal, opciones.nombreBase);
    console.log(`Listo. Servidor del puerto ${opciones.puerto} y .env del worktree eliminados; ${existia ? `contenedor de "${opciones.nombreBase}" eliminado` : "no había contenedor de PostgreSQL"}.`);
    console.log(`Si ya no necesitás el worktree: git worktree remove "${worktree}"`);
    return;
  }

  comprobarDocker(ejecutarDockerReal);
  matarPuerto(opciones.puerto);
  console.log("Levantando PostgreSQL desechable en Docker (la primera vez descarga la imagen)…");
  const { url: revUrl, creado } = await levantarPostgresDeRevision({
    docker: ejecutarDockerReal,
    nombreBase: opciones.nombreBase,
    reutilizar: opciones.reutilizar,
  });
  console.log(creado ? `Base "${opciones.nombreBase}" creada.` : `Reutilizando la base "${opciones.nombreBase}" existente.`);

  escribirEnvDelWorktree(worktree, revUrl);
  const envHijo = entornoDeRevision(process.env, revUrl);

  if (!existsSync(path.join(worktree, "node_modules"))) {
    await pnpm(["install", "--frozen-lockfile"], envHijo);
  }

  if (creado) {
    await pnpm(["exec", "tsx", "scripts/migrar-base.ts", "migrate", "--url", revUrl], envHijo);
    await pnpm(["exec", "tsx", "scripts/sembrar-base.ts", "--url", revUrl], envHijo);
    const escenario = path.join("scripts", "escenarios", `issue-${opciones.numero}.ts`);
    if (existsSync(path.join(worktree, escenario))) {
      console.log(`Ejecutando ${escenario}…`);
      await pnpm(["exec", "tsx", escenario, "--url", revUrl], envHijo);
    }
  }

  console.log("");
  const issue = traerIssue(opciones.numero);
  for (const linea of resumenDeRevision({
    numero: opciones.numero,
    rama: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    nombreBase: opciones.nombreBase,
    puerto: opciones.puerto,
    issue,
  })) console.log(linea);
  console.log("");

  await pnpm(["exec", "next", "dev", "-p", String(opciones.puerto)], envHijo);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
