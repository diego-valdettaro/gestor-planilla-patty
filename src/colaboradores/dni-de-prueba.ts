import { randomInt } from "node:crypto";

/** DNI sintético de 8 dígitos para pruebas de integración que comparten base. */
export function dniDePrueba(): string {
  return String(randomInt(10_000_000, 99_000_000));
}
