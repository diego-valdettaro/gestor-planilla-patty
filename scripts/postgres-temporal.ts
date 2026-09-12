import { randomUUID } from "node:crypto";

import { ejecutar } from "./ejecutar-proceso";
import { puertoDisponible } from "./puerto-disponible";

interface PostgresTemporal {
  entorno: NodeJS.ProcessEnv;
  url: string;
}

async function esperarPostgres(nombre: string): Promise<void> {
  for (let intento = 0; intento < 30; intento += 1) {
    try {
      await ejecutar({
        comando: "docker",
        argumentos: ["exec", nombre, "pg_isready", "-U", "postgres", "-d", "planilla_test"],
        silenciosa: true,
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error("PostgreSQL temporal no quedó listo en 30 segundos.");
}

export async function conPostgresTemporal<T>(
  ejecutarConBase: (postgres: PostgresTemporal) => Promise<T>,
): Promise<T> {
  const nombre = `planilla-pruebas-${randomUUID()}`;
  const puerto = await puertoDisponible();
  const url = `postgres://postgres:postgres@127.0.0.1:${puerto}/planilla_test`;
  const entorno = {
    ...process.env,
    DATABASE_URL: url,
    TEST_DATABASE_URL: url,
    CI: "true",
    NEXT_TELEMETRY_DISABLED: "1",
  };

  try {
    await ejecutar({
      comando: "docker",
      argumentos: [
        "run", "--rm", "--detach", "--name", nombre,
        "-e", "POSTGRES_PASSWORD=postgres",
        "-e", "POSTGRES_DB=planilla_test",
        "-p", `127.0.0.1:${puerto}:5432`,
        "postgres:16-alpine",
      ],
    });
    await esperarPostgres(nombre);
    return await ejecutarConBase({ entorno, url });
  } finally {
    await ejecutar({ comando: "docker", argumentos: ["stop", nombre], permitirFallo: true });
  }
}
