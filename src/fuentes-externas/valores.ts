/** Procedencia de un importe: hoy solo la carga manual; la importación de un archivo fuente agrega la suya. */
export const PROCEDENCIA_CARGA_MANUAL = "carga_manual";

export function textoDeProcedencia(procedencia: string): string {
  return procedencia === PROCEDENCIA_CARGA_MANUAL ? "Carga manual" : procedencia;
}

const MAXIMO_DE_CENTIMOS = 2_147_483_647;
const NUMERO_DECIMAL = /^(\d+)(?:[.,](\d{1,2}))?$/;
const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Escribe `250` o `S/ 1250,50` como céntimos; nunca acepta cero ni negativos (el signo lo da el concepto). */
export function interpretarMonto(texto: string): number {
  const coincide = NUMERO_DECIMAL.exec(texto.replace(/^S\/\.?/i, "").trim());
  const centimos = coincide ? Number(coincide[1]) * 100 + Number((coincide[2] ?? "").padEnd(2, "0")) : NaN;
  if (!Number.isSafeInteger(centimos) || centimos <= 0 || centimos > MAXIMO_DE_CENTIMOS) {
    throw new Error("El importe debe ser un monto en soles mayor que cero, con hasta dos decimales (por ejemplo 250 o 250,50).");
  }
  return centimos;
}

export function validarMes(valor: string, etiqueta: string): void {
  if (!MES.test(valor)) throw new Error(`El ${etiqueta} no es válido: use el formato AAAA-MM (por ejemplo 2026-10).`);
}

/** `2026-10` → `10/2026`. */
export function formatearMes(mes: string): string {
  return `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
}

/** El mes AAAA-MM al que pertenece una fecha AAAA-MM-DD. */
export function mesDeLaFecha(fecha: string): string {
  return fecha.slice(0, 7);
}
