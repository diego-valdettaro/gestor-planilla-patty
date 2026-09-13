export const TIPOS_DE_ESTADO_MANUAL = ["falta", "descanso", "feriado", "vacaciones", "permiso", "suspension"] as const;
export type TipoDeEstadoManual = (typeof TIPOS_DE_ESTADO_MANUAL)[number];
export type MotivoPlanificadoDeNoAsistencia = Exclude<TipoDeEstadoManual, "falta">;

export const TIPOS_DE_ESTADO_MANUAL_REGISTRABLE = ["falta", "feriado", "vacaciones", "permiso", "suspension"] as const;
export type TipoDeEstadoManualRegistrable = (typeof TIPOS_DE_ESTADO_MANUAL_REGISTRABLE)[number];

export function esTipoDeEstadoManualRegistrable(valor: string): valor is TipoDeEstadoManualRegistrable {
  return TIPOS_DE_ESTADO_MANUAL_REGISTRABLE.some((tipo) => tipo === valor);
}

export function nombreDelMotivoPlanificado(motivo: MotivoPlanificadoDeNoAsistencia): string {
  return motivo[0].toUpperCase() + motivo.slice(1);
}
