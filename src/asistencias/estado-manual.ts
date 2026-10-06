export const TIPOS_DE_ESTADO_MANUAL = ["falta", "descanso", "feriado", "vacaciones", "permiso", "suspension"] as const;
export type TipoDeEstadoManual = (typeof TIPOS_DE_ESTADO_MANUAL)[number];
// Motivos que el gerente planifica en un horario semanal: los estados manuales sin «falta», más el
// día fuera de la relación laboral confirmada, que nunca genera una asistencia por registrar.
export type MotivoPlanificadoDeNoAsistencia = Exclude<TipoDeEstadoManual, "falta"> | "sin_relacion_laboral";

export const TIPOS_DE_ESTADO_MANUAL_REGISTRABLE = ["falta", "feriado", "vacaciones", "permiso", "suspension"] as const;
export type TipoDeEstadoManualRegistrable = (typeof TIPOS_DE_ESTADO_MANUAL_REGISTRABLE)[number];

export function esTipoDeEstadoManualRegistrable(valor: string): valor is TipoDeEstadoManualRegistrable {
  return TIPOS_DE_ESTADO_MANUAL_REGISTRABLE.some((tipo) => tipo === valor);
}

export function nombreDelMotivoPlanificado(motivo: MotivoPlanificadoDeNoAsistencia): string {
  if (motivo === "sin_relacion_laboral") return "Sin relación laboral";
  return motivo[0].toUpperCase() + motivo.slice(1);
}
