import { fechaDeHoyEnLima } from "@/condiciones-laborales/vigencia";
import { mesDeLaFecha, validarMes } from "@/fuentes-externas/valores";

/** El mes de pago que pide la URL (AAAA-MM), o el mes actual de Lima con el error si el pedido no es válido. */
export function mesDePagoDeLaConsulta(pedido: string | undefined): { mes: string; error?: string } {
  const mesActual = mesDeLaFecha(fechaDeHoyEnLima());
  if (!pedido) return { mes: mesActual };
  try {
    validarMes(pedido, "mes de pago");
    return { mes: pedido };
  } catch (causa) {
    return { mes: mesActual, error: causa instanceof Error ? causa.message : "El mes de pago no es válido." };
  }
}
