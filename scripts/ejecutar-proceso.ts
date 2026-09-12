import { spawn } from "node:child_process";

interface Ejecucion {
  comando: string;
  argumentos: string[];
  entorno?: NodeJS.ProcessEnv;
  permitirFallo?: boolean;
  silenciosa?: boolean;
}

export function ejecutarPnpm(argumentos: string[], entorno: NodeJS.ProcessEnv): Promise<void> {
  return ejecutar({
    comando: process.platform === "win32" ? "corepack.cmd" : "corepack",
    argumentos: ["pnpm", ...argumentos],
    entorno,
  });
}

export function ejecutar({
  comando,
  argumentos,
  entorno,
  permitirFallo = false,
  silenciosa = false,
}: Ejecucion): Promise<void> {
  let ejecutable = comando;
  let argumentosDelProceso = argumentos;

  if (process.platform === "win32" && ejecutable.endsWith(".cmd")) {
    ejecutable = process.env.ComSpec ?? "cmd.exe";
    argumentosDelProceso = ["/d", "/c", comando, ...argumentos];
  }

  return new Promise((resolve, reject) => {
    const proceso = spawn(ejecutable, argumentosDelProceso, {
      stdio: silenciosa ? "ignore" : "inherit",
      env: entorno,
    });
    proceso.on("error", reject);
    proceso.on("exit", (codigo) => {
      if (codigo === 0 || permitirFallo) resolve();
      else reject(new Error(`Falló ${comando} ${argumentos.join(" ")} con código ${codigo ?? "desconocido"}.`));
    });
  });
}
