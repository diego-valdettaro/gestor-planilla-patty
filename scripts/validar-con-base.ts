import { ejecutarPruebasEnNavegador } from "./probar-en-navegador";
import { ejecutarPnpm } from "./ejecutar-proceso";
import { conPostgresTemporal } from "./postgres-temporal";

async function main(): Promise<void> {
  await conPostgresTemporal(async ({ entorno, url }) => {
    await ejecutarPnpm(["db:migrate", "--", "--url", url], entorno);
    await ejecutarPnpm(["db:check", "--", "--url", url], entorno);
    await ejecutarPnpm(["test"], entorno);
    await ejecutarPnpm(["typecheck"], entorno);
    await ejecutarPnpm(["build"], entorno);
    await ejecutarPnpm(["exec", "tsx", "scripts/sembrar-base.ts", "--url", url], entorno);
    await ejecutarPruebasEnNavegador(entorno);
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
