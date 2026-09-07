export type EstadoDeCelda = "borrador-editable" | "publicado" | "cambios-sin-publicar" | "liquidado";

export const NOMBRE_DEL_ESTADO_DE_CELDA: Record<EstadoDeCelda, string> = {
  "borrador-editable": "Borrador editable",
  publicado: "Publicado",
  "cambios-sin-publicar": "Cambios sin publicar",
  liquidado: "Liquidado",
};

export const ESTADOS_DE_CELDA: EstadoDeCelda[] = ["borrador-editable", "publicado", "cambios-sin-publicar", "liquidado"];

type CeldaComparable = {
  sede: string;
  modeloHorarioId?: string | null;
  entradaProgramada: string | null;
  salidaProgramada: string | null;
  descanso: boolean;
};

/**
 * Diferencia entre la celda del borrador y el turno publicado para (colaborador, fecha).
 * Es la misma comparación que la grilla ya usaba en el cliente para "Cambios sin publicar".
 */
export function difiereDelPublicado(celda: CeldaComparable, publicado: CeldaComparable): boolean {
  return celda.sede !== publicado.sede
    || (celda.modeloHorarioId ?? null) !== (publicado.modeloHorarioId ?? null)
    || celda.entradaProgramada !== publicado.entradaProgramada
    || celda.salidaProgramada !== publicado.salidaProgramada
    || celda.descanso !== publicado.descanso;
}

/**
 * Estado de una celda-día de la grilla de Horarios. Devuelve exactamente uno de los
 * cuatro estados del ciclo de vida a partir de datos que ya existen: la celda del
 * borrador, el turno publicado para (colaborador, fecha) y si la semana de ese
 * colaborador ya quedó liquidada (registro en `horarios semanales procesados`).
 */
export function estadoDeCelda(
  celdaEnBorrador: CeldaComparable | undefined,
  turnoPublicado: CeldaComparable | undefined,
  semanaLiquidada: boolean,
): EstadoDeCelda {
  if (semanaLiquidada) return "liquidado";
  if (!turnoPublicado) return "borrador-editable";
  if (celdaEnBorrador && difiereDelPublicado(celdaEnBorrador, turnoPublicado)) return "cambios-sin-publicar";
  return "publicado";
}

/**
 * Estado de la semana completa de un colaborador, para el texto bajo su nombre y el
 * resumen de la barra superior. Usa el mismo vocabulario de cuatro nombres que las celdas.
 */
export function estadoDeSemana(opciones: {
  semanaPublicada: boolean;
  semanaLiquidada: boolean;
  hayCambiosSinPublicar: boolean;
}): EstadoDeCelda {
  if (opciones.semanaLiquidada) return "liquidado";
  if (!opciones.semanaPublicada) return "borrador-editable";
  return opciones.hayCambiosSinPublicar ? "cambios-sin-publicar" : "publicado";
}
