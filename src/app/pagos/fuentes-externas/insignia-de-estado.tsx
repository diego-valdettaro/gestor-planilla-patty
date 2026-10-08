import { TEXTO_DE_ESTADO, type EstadoDeFuente } from "@/fuentes-externas/gestionar-fuentes-externas";

/** Estado con texto además de color (contrato visual): ámbar para pendiente, verde para confirmada. */
export function InsigniaDeEstado({ estado }: { estado: EstadoDeFuente }) {
  return <span className={estado === "pendiente" ? "insignia advertencia" : "insignia ok"}>{TEXTO_DE_ESTADO[estado]}</span>;
}
