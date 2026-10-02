import { spawnSync } from "node:child_process";

// PostgreSQL desechable en Docker para `pnpm revisar` (ver docs/agents/agent-workflow.md).
// Docker es la única fuente de base de datos de la revisión: no se lee ningún `.env` ni
// `DATABASE_URL` externo.

export const IMAGEN_POSTGRES = "postgres:16-alpine";

const ETIQUETA = "planilla-revision";
const USUARIO = "postgres";
const CLAVE = "postgres";
const INTENTOS_DE_ESPERA = 30;

export interface ResultadoDocker {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type EjecutarDocker = (args: string[]) => ResultadoDocker;

export const ejecutarDockerReal: EjecutarDocker = (args) => {
  const salida = spawnSync("docker", args, { encoding: "utf8" });
  return { status: salida.status, stdout: salida.stdout ?? "", stderr: salida.stderr ?? "", error: salida.error };
};

export function nombreDeContenedor(nombreBase: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(nombreBase)) {
    throw new Error(`El nombre de base "${nombreBase}" no es válido: use minúsculas, dígitos y guiones bajos, empezando por una letra.`);
  }
  return `postgres-${nombreBase}`;
}

export function comprobarDocker(docker: EjecutarDocker): void {
  const resultado = docker(["info"]);
  if (resultado.error && (resultado.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new Error(
      "Docker no está instalado. `pnpm revisar` necesita Docker para crear su PostgreSQL desechable. " +
        "Instálelo desde https://docs.docker.com/engine/install/ y vuelva a ejecutar el comando.",
    );
  }
  if (resultado.status !== 0) {
    const detalle = resultado.stderr.trim();
    throw new Error(
      "Docker no responde. `pnpm revisar` necesita que Docker esté iniciado: " +
        "en Linux ejecute `sudo systemctl start docker`; en Windows o macOS abra Docker Desktop. " +
        "Compruebe que `docker info` funciona y vuelva a ejecutar el comando." +
        (detalle ? `\nDetalle: ${detalle}` : ""),
    );
  }
}

function contenedorCorriendo(docker: EjecutarDocker, nombre: string): boolean {
  const resultado = docker(["inspect", "--format", "{{.State.Running}}", nombre]);
  return resultado.status === 0 && resultado.stdout.trim() === "true";
}

function puertoPublicado(docker: EjecutarDocker, nombre: string): number {
  const resultado = docker(["port", nombre, "5432/tcp"]);
  const puerto = resultado.status === 0 ? /:(\d+)\s*$/m.exec(resultado.stdout)?.[1] : undefined;
  if (!puerto) throw new Error(`No pude averiguar el puerto de PostgreSQL del contenedor ${nombre}: ${resultado.stderr.trim()}`);
  return Number(puerto);
}

function urlDeRevision(puerto: number, nombreBase: string): string {
  return `postgres://${USUARIO}:${CLAVE}@127.0.0.1:${puerto}/${nombreBase}`;
}

export function eliminarPostgresDeRevision(docker: EjecutarDocker, nombreBase: string): boolean {
  const nombre = nombreDeContenedor(nombreBase);
  if (docker(["inspect", nombre]).status !== 0) return false;
  const resultado = docker(["rm", "--force", "--volumes", nombre]);
  if (resultado.status !== 0) throw new Error(`No pude eliminar el contenedor ${nombre}: ${resultado.stderr.trim()}`);
  return true;
}

export async function levantarPostgresDeRevision(opciones: {
  docker: EjecutarDocker;
  nombreBase: string;
  reutilizar: boolean;
  dormir?: (milisegundos: number) => Promise<void>;
}): Promise<{ url: string; creado: boolean }> {
  const { docker, nombreBase, reutilizar } = opciones;
  const dormir = opciones.dormir ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const nombre = nombreDeContenedor(nombreBase);
  comprobarDocker(docker);

  if (reutilizar && contenedorCorriendo(docker, nombre)) {
    return { url: urlDeRevision(puertoPublicado(docker, nombre), nombreBase), creado: false };
  }

  eliminarPostgresDeRevision(docker, nombreBase);
  const ejecucion = docker([
    "run", "--rm", "--detach", "--name", nombre,
    "--label", `${ETIQUETA}=${nombreBase}`,
    "-e", `POSTGRES_PASSWORD=${CLAVE}`,
    "-e", `POSTGRES_DB=${nombreBase}`,
    "-p", "127.0.0.1::5432",
    IMAGEN_POSTGRES,
  ]);
  if (ejecucion.status !== 0) {
    throw new Error(`No pude crear el contenedor de PostgreSQL ${nombre}: ${ejecucion.stderr.trim()}`);
  }

  // `-h 127.0.0.1` evita el falso positivo del servidor temporal de inicialización,
  // que solo escucha por socket Unix.
  for (let intento = 1; intento <= INTENTOS_DE_ESPERA; intento += 1) {
    const listo = docker(["exec", nombre, "pg_isready", "-h", "127.0.0.1", "-U", USUARIO, "-d", nombreBase]);
    if (listo.status === 0) return { url: urlDeRevision(puertoPublicado(docker, nombre), nombreBase), creado: true };
    if (intento < INTENTOS_DE_ESPERA) await dormir(1000);
  }

  eliminarPostgresDeRevision(docker, nombreBase);
  throw new Error(`PostgreSQL del contenedor ${nombre} no quedó listo en ${INTENTOS_DE_ESPERA} segundos.`);
}

// Entorno de los procesos hijos: la base de revisión gana sobre cualquier DATABASE_URL
// exportado en la terminal (o que traiga direnv, etc.).
export function entornoDeRevision(base: NodeJS.ProcessEnv, url: string): NodeJS.ProcessEnv {
  return { ...base, DATABASE_URL: url, TEST_DATABASE_URL: url };
}
