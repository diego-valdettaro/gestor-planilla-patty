import type { TipoDeEstadoManual } from "@/asistencias/confirmar-y-ajustar-asistencia";

export type EstadoDeCeldaAsistencia =
  | "sin-planificacion"
  | "esperada"
  | "pendiente-de-revision"
  | "registrada"
  | "liquidado";

export const NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA: Record<EstadoDeCeldaAsistencia, string> = {
  "sin-planificacion": "Sin planificación",
  esperada: "Esperada",
  "pendiente-de-revision": "Pendiente de revisión",
  registrada: "Registrada",
  liquidado: "Liquidado",
};

export const ESTADOS_DE_CELDA_ASISTENCIA: EstadoDeCeldaAsistencia[] = [
  "sin-planificacion",
  "esperada",
  "pendiente-de-revision",
  "registrada",
  "liquidado",
];

const NOMBRE_DE_DESIGNACION_MANUAL: Record<TipoDeEstadoManual, string> = {
  falta: "Falta",
  descanso: "Descanso",
  feriado: "Feriado",
  vacaciones: "Vacaciones",
  permiso: "Permiso",
  suspension: "Suspensión",
};

// Evidencia por (colaborador, día) que el resumen mensual expone cuando hay un
// horario publicado para ese día. Es la forma de una fila del resumen sin los
// campos de presentación (fecha, entrada/salida reales). Un día sin fila es
// "sin planificación".
export interface EvidenciaDeCeldaAsistencia {
  // `asistencias_esperadas.estado`; el enum no cambia con esta issue.
  estado: "pendiente" | "confirmada" | "manual";
  // Tipo del estado manual cuando lo hay (falta, descanso, feriado, …); si no, null.
  estadoManual: TipoDeEstadoManual | null;
  // Propuesta de entrada/salida derivada de las marcas al importar.
  entradaPropuesta: string | null;
  salidaPropuesta: string | null;
  // Existen marcas crudas del huellero para ese (colaborador, fecha).
  hayMarcasCrudas: boolean;
  // La fecha cae en un período de planilla cerrado.
  enPeriodoCerrado: boolean;
}

function propuestaCompleta(dia: EvidenciaDeCeldaAsistencia): boolean {
  return Boolean(dia.entradaPropuesta && dia.salidaPropuesta);
}

// Deriva, para un día del calendario de asistencias, exactamente uno de los cinco
// estados de celda. `undefined` = no hay horario publicado para ese día.
export function estadoDeCeldaAsistencia(dia: EvidenciaDeCeldaAsistencia | undefined): EstadoDeCeldaAsistencia {
  if (!dia) return "sin-planificacion";
  if (dia.enPeriodoCerrado) return "liquidado";
  if (dia.estado === "confirmada" || dia.estado === "manual") return "registrada";
  // estado === "pendiente": Esperada salvo que haya marcas del huellero que todavía
  // no permiten proponer una entrada/salida completas.
  if (dia.hayMarcasCrudas && !propuestaCompleta(dia)) return "pendiente-de-revision";
  return "esperada";
}

// Un día es editable desde el calendario cuando su asistencia sigue en revisión
// (pendiente) o ya está confirmada y admite ajuste. Una designación manual, un
// día sin horario y un día liquidado abren un diálogo de solo lectura.
export function celdaDeAsistenciaEsEditable(dia: EvidenciaDeCeldaAsistencia | undefined): boolean {
  if (!dia || dia.enPeriodoCerrado) return false;
  return dia.estado === "pendiente" || dia.estado === "confirmada";
}

// Etiqueta de la celda: el tipo de la designación manual cuando aplica ("Feriado",
// "Falta", …); en cualquier otro caso, el nombre del estado.
export function etiquetaDeCeldaAsistencia(
  estado: EstadoDeCeldaAsistencia,
  estadoManual: TipoDeEstadoManual | null,
): string {
  if (estado === "registrada" && estadoManual) return NOMBRE_DE_DESIGNACION_MANUAL[estadoManual];
  return NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA[estado];
}
