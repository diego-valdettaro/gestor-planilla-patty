import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

interface Ejecucion {
  comando: string;
  argumentos: string[];
  entorno?: NodeJS.ProcessEnv;
  permitirFallo?: boolean;
}

function ejecutarPnpm(argumentos: string[], entorno: NodeJS.ProcessEnv): Promise<void> {
  return ejecutar({ comando: process.platform === "win32" ? "corepack.cmd" : "corepack", argumentos: ["pnpm", ...argumentos], entorno });
}

function ejecutar({ comando, argumentos, entorno, permitirFallo = false }: Ejecucion): Promise<void> {
  let ejecutable = process.platform === "win32" && comando === "pnpm" ? "pnpm.cmd" : comando;
  let argumentosDelProceso = argumentos;
  if (process.platform === "win32" && ejecutable.endsWith(".cmd")) {
    ejecutable = process.env.ComSpec ?? "cmd.exe";
    argumentosDelProceso = ["/d", "/c", comando, ...argumentos];
  }
  return new Promise((resolve, reject) => {
    const proceso = spawn(ejecutable, argumentosDelProceso, { stdio: "inherit", env: entorno });
    proceso.on("error", reject);
    proceso.on("exit", (codigo) => {
      if (codigo === 0 || permitirFallo) resolve();
      else reject(new Error(`Falló ${comando} ${argumentos.join(" ")} con código ${codigo ?? "desconocido"}.`));
    });
  });
}

async function puertoDisponible(): Promise<number> {
  const servidor = createServer();
  return new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", () => {
      const direccion = servidor.address();
      if (!direccion || typeof direccion === "string") return reject(new Error("No se pudo reservar un puerto para PostgreSQL temporal."));
      servidor.close((error) => error ? reject(error) : resolve(direccion.port));
    });
  });
}

async function esperarPostgres(nombre: string): Promise<void> {
  for (let intento = 0; intento < 30; intento += 1) {
    try {
      await ejecutar({ comando: "docker", argumentos: ["exec", nombre, "pg_isready", "-U", "postgres", "-d", "planilla_test"] });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("PostgreSQL temporal no quedó listo en 30 segundos.");
}

async function main(): Promise<void> {
  const nombre = `planilla-validacion-${randomUUID()}`;
  const puerto = await puertoDisponible();
  const url = `postgres://postgres:postgres@127.0.0.1:${puerto}/planilla_test`;
  const entorno = { ...process.env, DATABASE_URL: url, TEST_DATABASE_URL: url, CI: "true", NEXT_TELEMETRY_DISABLED: "1" };

  try {
    await ejecutar({ comando: "docker", argumentos: ["run", "--rm", "--detach", "--name", nombre, "-e", "POSTGRES_PASSWORD=postgres", "-e", "POSTGRES_DB=planilla_test", "-p", `127.0.0.1:${puerto}:5432`, "postgres:16-alpine"] });
    await esperarPostgres(nombre);
    await ejecutarPnpm(["db:migrate", "--", "--url", url], entorno);
    await ejecutarPnpm(["db:check", "--", "--url", url], entorno);
    await ejecutarPnpm(["test"], entorno);
    await ejecutarPnpm(["typecheck"], entorno);
    await ejecutarPnpm(["build"], entorno);
  } finally {
    await ejecutar({ comando: "docker", argumentos: ["stop", nombre], permitirFallo: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
