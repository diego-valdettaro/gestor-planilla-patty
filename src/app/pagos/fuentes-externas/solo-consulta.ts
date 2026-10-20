import { formatearMes } from "@/fuentes-externas/valores";

/** Aviso de las pantallas de fuentes externas (lista, tipo e importación) de un mes con el pago realizado confirmado (diseño §4.2). */
export const MENSAJE_SOLO_CONSULTA = (mes: string) => `El mes de pago ${formatearMes(mes)} tiene el pago realizado confirmado: sus fuentes externas son solo consulta y no admiten cambios.`;
