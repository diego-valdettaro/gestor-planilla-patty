import { randomBytes } from "node:crypto";

import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import {
  comprobarDocker,
  ejecutarDockerReal,
  eliminarPostgresDeRevision,
  entornoDeRevision,
  IMAGEN_POSTGRES,
  levantarPostgresDeRevision,
  nombreDeContenedor,
  type EjecutarDocker,
  type ResultadoDocker,
} from "./postgres-de-revision";

const ok = (stdout = ""): ResultadoDocker => ({ status: 0, stdout, stderr: "" });
const falla = (stderr = "error"): ResultadoDocker => ({ status: 1, stdout: "", stderr });

// Docker simulado: registra cada invocación y responde según el subcomando.
function dockerSimulado(opciones: { corriendo?: boolean; listoEnIntento?: number; puerto?: string } = {}) {
  const llamadas: string[][] = [];
  let corriendo = opciones.corriendo ?? false;
  let intentosDeEspera = 0;
  const docker: EjecutarDocker = (args) => {
    llamadas.push(args);
    switch (args[0]) {
      case "info":
        return ok();
      case "inspect":
        return corriendo ? ok("true\n") : falla("No such object");
      case "rm":
        corriendo = false;
        return ok();
      case "run":
        corriendo = true;
        return ok("id\n");
      case "exec":
        intentosDeEspera += 1;
        return intentosDeEspera >= (opciones.listoEnIntento ?? 1) ? ok() : falla("no listo");
      case "port":
        return ok(opciones.puerto ?? "127.0.0.1:49153\n[::]:49153\n");
      default:
        return falla("subcomando inesperado");
    }
  };
  return { docker, llamadas, subcomandos: () => llamadas.map((l) => l[0]) };
}

const sinEspera = async () => {};
const BASE = "planilla_rev_146";

describe("PostgreSQL desechable para revisar una rama (Docker simulado)", () => {
  it("nombra el contenedor a partir de la base y rechaza nombres peligrosos", () => {
    expect(nombreDeContenedor("planilla_rev_146")).toBe("postgres-planilla_rev_146");
    expect(() => nombreDeContenedor("x; DROP DATABASE")).toThrow(/nombre de base/i);
    expect(() => nombreDeContenedor("Planilla")).toThrow(/nombre de base/i);
  });

  it("arranca: comprueba Docker, crea el contenedor, espera y devuelve la URL del puerto publicado", async () => {
    const { docker, llamadas, subcomandos } = dockerSimulado({ listoEnIntento: 3 });

    const resultado = await levantarPostgresDeRevision({ docker, nombreBase: BASE, reutilizar: false, dormir: sinEspera });

    expect(resultado).toEqual({ creado: true, url: "postgres://postgres:postgres@127.0.0.1:49153/planilla_rev_146" });
    expect(subcomandos()).toEqual(["info", "inspect", "run", "exec", "exec", "exec", "port"]);
    const run = llamadas.find((l) => l[0] === "run")!;
    expect(run).toEqual(expect.arrayContaining([
      "--rm", "--detach",
      "--name", "postgres-planilla_rev_146",
      "--label", "planilla-revision=planilla_rev_146",
      "-e", "POSTGRES_DB=planilla_rev_146",
      "-p", "127.0.0.1::5432",
      IMAGEN_POSTGRES,
    ]));
    expect(llamadas.find((l) => l[0] === "exec")).toEqual([
      "exec", "postgres-planilla_rev_146", "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "planilla_rev_146",
    ]);
  });

  it("con --reutilizar y el contenedor corriendo no lo recrea", async () => {
    const { docker, subcomandos } = dockerSimulado({ corriendo: true, puerto: "127.0.0.1:50000\n" });

    const resultado = await levantarPostgresDeRevision({ docker, nombreBase: BASE, reutilizar: true, dormir: sinEspera });

    expect(resultado).toEqual({ creado: false, url: "postgres://postgres:postgres@127.0.0.1:50000/planilla_rev_146" });
    expect(subcomandos()).not.toContain("run");
    expect(subcomandos()).not.toContain("rm");
  });

  it("con --reutilizar pero sin contenedor, crea uno nuevo", async () => {
    const { docker, subcomandos } = dockerSimulado({ corriendo: false });

    const resultado = await levantarPostgresDeRevision({ docker, nombreBase: BASE, reutilizar: true, dormir: sinEspera });

    expect(resultado.creado).toBe(true);
    expect(subcomandos()).toContain("run");
  });

  it("sin --reutilizar elimina el contenedor existente y lo crea de nuevo", async () => {
    const { docker, subcomandos } = dockerSimulado({ corriendo: true });

    const resultado = await levantarPostgresDeRevision({ docker, nombreBase: BASE, reutilizar: false, dormir: sinEspera });

    expect(resultado.creado).toBe(true);
    const comandos = subcomandos();
    expect(comandos.indexOf("rm")).toBeGreaterThan(-1);
    expect(comandos.indexOf("rm")).toBeLessThan(comandos.indexOf("run"));
  });

  it("si PostgreSQL no queda listo, elimina el contenedor y falla", async () => {
    const { docker, subcomandos } = dockerSimulado({ listoEnIntento: Infinity });

    await expect(levantarPostgresDeRevision({ docker, nombreBase: BASE, reutilizar: false, dormir: sinEspera }))
      .rejects.toThrow(/no quedó listo/i);

    expect(subcomandos().at(-1)).toBe("rm");
    expect(subcomandos().filter((s) => s === "exec")).toHaveLength(30);
  });

  it("tras crear el contenedor ejecuta la preparación con la URL; con --reutilizar no", async () => {
    const preparadas: string[] = [];
    const alCrear = async (url: string) => {
      preparadas.push(url);
    };

    await levantarPostgresDeRevision({ docker: dockerSimulado().docker, nombreBase: BASE, reutilizar: false, dormir: sinEspera, alCrear });
    await levantarPostgresDeRevision({ docker: dockerSimulado({ corriendo: true }).docker, nombreBase: BASE, reutilizar: true, dormir: sinEspera, alCrear });

    expect(preparadas).toEqual([`postgres://postgres:postgres@127.0.0.1:49153/${BASE}`]);
  });

  it("si la preparación falla elimina el contenedor, para que --reutilizar no sirva una base sin sembrar", async () => {
    const { docker, subcomandos } = dockerSimulado();
    const alCrear = async () => {
      throw new Error("falló el seed");
    };

    await expect(levantarPostgresDeRevision({ docker, nombreBase: BASE, reutilizar: false, dormir: sinEspera, alCrear }))
      .rejects.toThrow("falló el seed");

    expect(subcomandos().at(-1)).toBe("rm");
  });

  it("si docker run falla, informa el motivo", async () => {
    const docker: EjecutarDocker = (args) => (args[0] === "run" ? falla("pull access denied") : args[0] === "inspect" ? falla() : ok());

    await expect(levantarPostgresDeRevision({ docker, nombreBase: BASE, reutilizar: false, dormir: sinEspera }))
      .rejects.toThrow(/pull access denied/);
  });

  it("la limpieza elimina el contenedor, y es idempotente si no existe", () => {
    const presente = dockerSimulado({ corriendo: true });
    expect(eliminarPostgresDeRevision(presente.docker, "planilla_rev_146")).toBe(true);
    expect(presente.llamadas.find((l) => l[0] === "rm")).toEqual(["rm", "--force", "--volumes", "postgres-planilla_rev_146"]);

    const ausente = dockerSimulado({ corriendo: false });
    expect(eliminarPostgresDeRevision(ausente.docker, "planilla_rev_146")).toBe(false);
    expect(ausente.subcomandos()).not.toContain("rm");
  });

  it("sin Docker instalado, el error explica cómo instalarlo", () => {
    const docker: EjecutarDocker = () => ({ status: null, stdout: "", stderr: "", error: Object.assign(new Error("spawn docker ENOENT"), { code: "ENOENT" }) });

    expect(() => comprobarDocker(docker)).toThrow(/Docker no está instalado.*docs\.docker\.com\/engine\/install/s);
  });

  it("con Docker instalado pero apagado, el error explica cómo iniciarlo", () => {
    const docker: EjecutarDocker = () => falla("Cannot connect to the Docker daemon");

    expect(() => comprobarDocker(docker)).toThrow(/Docker no responde.*systemctl start docker.*Docker Desktop/s);
  });

  it("no toca nada si Docker no está disponible", async () => {
    const llamadas: string[][] = [];
    const docker: EjecutarDocker = (args) => {
      llamadas.push(args);
      return falla("Cannot connect to the Docker daemon");
    };

    await expect(levantarPostgresDeRevision({ docker, nombreBase: BASE, reutilizar: false, dormir: sinEspera }))
      .rejects.toThrow(/Docker no responde/);
    expect(llamadas).toEqual([["info"]]);
  });

  it("el entorno de los procesos hijos pisa cualquier DATABASE_URL externo", () => {
    const url = "postgres://postgres:postgres@127.0.0.1:49153/planilla_rev_146";

    const externo: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: "/bin", DATABASE_URL: "postgres://externo/produccion", TEST_DATABASE_URL: "postgres://externo/otra" };

    const entorno = entornoDeRevision(externo, url);

    expect(entorno).toMatchObject({ PATH: "/bin", DATABASE_URL: url, TEST_DATABASE_URL: url });
  });
});

// Prueba real con Docker. Mismo criterio que las integraciones PostgreSQL: `pnpm validate`
// define CI y exige Docker; fuera de CI se omite si Docker no está disponible.
const dockerDisponible = (() => {
  try {
    comprobarDocker(ejecutarDockerReal);
    return true;
  } catch (error) {
    if (process.env.CI) throw error;
    return false;
  }
})();

describe.skipIf(!dockerDisponible)("PostgreSQL desechable para revisar una rama (Docker real)", () => {
  const nombreBase = `planilla_rev_test_${randomBytes(4).toString("hex")}`;
  const contenedoresConEtiqueta = () =>
    ejecutarDockerReal(["ps", "--all", "--quiet", "--filter", `label=planilla-revision=${nombreBase}`]).stdout.trim();

  afterAll(() => {
    eliminarPostgresDeRevision(ejecutarDockerReal, nombreBase);
  });

  it("levanta, reutiliza y elimina el contenedor sin dejar huérfanos", async () => {
    const primero = await levantarPostgresDeRevision({ docker: ejecutarDockerReal, nombreBase, reutilizar: false });
    expect(primero.creado).toBe(true);

    const cliente = new Client({ connectionString: primero.url });
    await cliente.connect();
    try {
      await cliente.query("CREATE TABLE marca (id integer)");
      expect((await cliente.query("SELECT current_database() AS base")).rows[0].base).toBe(nombreBase);
    } finally {
      await cliente.end();
    }

    const segundo = await levantarPostgresDeRevision({ docker: ejecutarDockerReal, nombreBase, reutilizar: true });
    expect(segundo).toEqual({ creado: false, url: primero.url });
    const conservada = new Client({ connectionString: segundo.url });
    await conservada.connect();
    try {
      expect((await conservada.query("SELECT to_regclass('marca') AS tabla")).rows[0].tabla).toBe("marca");
    } finally {
      await conservada.end();
    }
    expect(contenedoresConEtiqueta().split("\n")).toHaveLength(1);

    expect(eliminarPostgresDeRevision(ejecutarDockerReal, nombreBase)).toBe(true);
    expect(contenedoresConEtiqueta()).toBe("");
    expect(eliminarPostgresDeRevision(ejecutarDockerReal, nombreBase)).toBe(false);
  }, 120_000);
});
