import path from "node:path";
import { pathToFileURL } from "node:url";

import { ejecutarPnpm } from "./ejecutar-proceso";
import { conPostgresTemporal } from "./postgres-temporal";
import { puertoDisponible } from "./puerto-disponible";

export async function ejecutarPruebasEnNavegador(entorno: NodeJS.ProcessEnv): Promise<void> {
  const puerto = await puertoDisponible();
  const entornoDePlaywright = {
    ...entorno,
    PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${puerto}`,
  };

  await ejecutarPnpm(["exec", "playwright", "test"], entornoDePlaywright);
}

async function main(): Promise<void> {
  await conPostgresTemporal(async ({ entorno, url }) => {
    await ejecutarPnpm(["db:migrate", "--", "--url", url], entorno);
    await ejecutarPnpm(["db:check", "--", "--url", url], entorno);
    await ejecutarPnpm(["exec", "tsx", "scripts/sembrar-base.ts", "--url", url], entorno);
    await ejecutarPruebasEnNavegador(entorno);
  });
}

const ejecutadoDirectamente = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (ejecutadoDirectamente) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
