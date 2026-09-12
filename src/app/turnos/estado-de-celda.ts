import { jornadasPlanificadasSonIguales, type DatosDeJornadaPlanificada } from "@/turnos/jornada-planificada";

export type EstadoDeHorario = "borrador-editable" | "publicado" | "cambios-sin-publicar" | "liquidado";

export const NOMBRE_DEL_ESTADO_DE_HORARIO: Record<EstadoDeHorario, string> = {
  "borrador-editable": "Borrador editable",
  publicado: "Publicado",
  "cambios-sin-publicar": "Cambios sin publicar",
  liquidado: "Liquidado",
};

export const ESTADOS_DE_HORARIO: EstadoDeHorario[] = ["borrador-editable", "publicado", "cambios-sin-publicar", "liquidado"];

// Misma comparación que la grilla ya usaba en el cliente para "Cambios sin publicar".
export function difiereDelPublicado(celda: DatosDeJornadaPlanificada, publicado: DatosDeJornadaPlanificada): boolean {
  return !jornadasPlanificadasSonIguales(celda, publicado);
}

// Estado de una celda-día de la grilla de Horarios, derivado de datos que ya existen:
// la celda del borrador, el turno publicado para (colaborador, fecha) y si la semana
// de ese colaborador ya quedó liquidada (registro en `horarios semanales procesados`).
export function estadoDeCelda(
  celdaEnBorrador: DatosDeJornadaPlanificada | undefined,
  turnoPublicado: DatosDeJornadaPlanificada | undefined,
  semanaLiquidada: boolean,
): EstadoDeHorario {
  if (semanaLiquidada) return "liquidado";
  if (!turnoPublicado) return "borrador-editable";
  if (celdaEnBorrador && difiereDelPublicado(celdaEnBorrador, turnoPublicado)) return "cambios-sin-publicar";
  return "publicado";
}

// Estado de la semana completa de un colaborador, para el texto bajo su nombre y el
// resumen de la barra superior. Mismo vocabulario de cuatro nombres que las celdas.
export function estadoDeSemana(opciones: {
  semanaPublicada: boolean;
  semanaLiquidada: boolean;
  hayCambiosSinPublicar: boolean;
}): EstadoDeHorario {
  if (opciones.semanaLiquidada) return "liquidado";
  if (!opciones.semanaPublicada) return "borrador-editable";
  return opciones.hayCambiosSinPublicar ? "cambios-sin-publicar" : "publicado";
}
