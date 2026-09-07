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

const NOMBRE_DE_DESIGNACION_MANUAL: Record<string, string> = {
  falta: "Falta",
  descanso: "Descanso",
  feriado: "Feriado",
  vacaciones: "Vacaciones",
  permiso: "Permiso",
  suspension: "Suspensión",
};

// Lo que el resumen mensual expone por (colaborador, fecha) cuando hay un horario
// publicado para ese día. Un día sin fila es "sin planificación".
export interface DiaDeAsistencia {
  // `asistencias_esperadas.estado`; el enum no cambia con esta issue.
  estado: "pendiente" | "confirmada" | "manual";
  // Tipo del estado manual cuando lo hay (falta, descanso, feriado, …); si no, null.
  designacionManual: string | null;
  // Existen marcas crudas del huellero para ese (colaborador, fecha).
  hayMarcasCrudas: boolean;
  // Las marcas permitieron proponer entrada y salida completas.
  propuestaCompleta: boolean;
  // La fecha cae en un período de planilla cerrado.
  enPeriodoCerrado: boolean;
}

// Deriva, para un día del calendario de asistencias, exactamente uno de los cinco
// estados de celda. `undefined` = no hay horario publicado para ese día.
export function estadoDeCeldaAsistencia(dia: DiaDeAsistencia | undefined): EstadoDeCeldaAsistencia {
  if (!dia) return "sin-planificacion";
  if (dia.enPeriodoCerrado) return "liquidado";
  if (dia.estado === "confirmada" || dia.estado === "manual") return "registrada";
  // estado === "pendiente": Esperada salvo que haya marcas del huellero que todavía
  // no permiten proponer una entrada/salida completas.
  if (dia.hayMarcasCrudas && !dia.propuestaCompleta) return "pendiente-de-revision";
  return "esperada";
}

// Etiqueta de la celda: el tipo de la designación manual cuando aplica ("Feriado",
// "Falta", …); en cualquier otro caso, el nombre del estado.
export function etiquetaDeCeldaAsistencia(
  estado: EstadoDeCeldaAsistencia,
  designacionManual: string | null,
): string {
  if (estado === "registrada" && designacionManual) {
    return NOMBRE_DE_DESIGNACION_MANUAL[designacionManual] ?? designacionManual;
  }
  return NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA[estado];
}
