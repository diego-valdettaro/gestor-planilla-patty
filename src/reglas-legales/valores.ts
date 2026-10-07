import { formatearSoles } from "@/condiciones-laborales/valores";

import type { UnidadDeRegla } from "./catalogo";

// Un porcentaje se guarda en centésimas de punto (9,00 % = 900) y un importe en céntimos: siempre enteros.
const MAXIMO_DE_CENTIMOS = 2_147_483_647;
const NUMERO_DECIMAL = /^(\d+)(?:[.,](\d{1,2}))?$/;

function centesimas(texto: string): number {
  const coincide = NUMERO_DECIMAL.exec(texto);
  return coincide ? Number(coincide[1]) * 100 + Number((coincide[2] ?? "").padEnd(2, "0")) : NaN;
}

/** Escribe `9`, `7,25` o `1.5 %` como centésimas de punto: 900, 725, 150. Acepta de 0 a 100 con hasta dos decimales. */
function interpretarPorcentaje(texto: string): number {
  const puntos = centesimas(texto.replace(/%/g, "").trim());
  if (!Number.isSafeInteger(puntos) || puntos < 0 || puntos > 10_000) {
    throw new Error("El valor debe ser un porcentaje entre 0 y 100, con hasta dos decimales (por ejemplo 9 o 7,25).");
  }
  return puntos;
}

/** Escribe `1130` o `S/ 1130,50` como céntimos; nunca acepta cero ni negativos. */
function interpretarImporte(texto: string): number {
  const centimos = centesimas(texto.replace(/^S\/\.?/i, "").trim());
  if (!Number.isSafeInteger(centimos) || centimos <= 0 || centimos > MAXIMO_DE_CENTIMOS) {
    throw new Error("El valor debe ser un importe en soles mayor que cero, con hasta dos decimales (por ejemplo 1130 o 1130,50).");
  }
  return centimos;
}

/** Convierte el texto de un formulario en el valor entero de su unidad; el mensaje de error es para Finanzas. */
export function interpretarValorLegal(unidad: UnidadDeRegla, texto: string): number {
  return unidad === "porcentaje" ? interpretarPorcentaje(texto) : interpretarImporte(texto);
}

/** `9,00 %`, con coma decimal (contrato visual). */
export function formatearPorcentaje(centesimasDePunto: number): string {
  return `${Math.floor(centesimasDePunto / 100)},${String(centesimasDePunto % 100).padStart(2, "0")} %`;
}

export function formatearValorLegal(unidad: UnidadDeRegla, valor: number): string {
  return unidad === "porcentaje" ? formatearPorcentaje(valor) : formatearSoles(valor);
}
