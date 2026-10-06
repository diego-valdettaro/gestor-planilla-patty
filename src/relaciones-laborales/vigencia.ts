// Reglas puras de vigencia de una relación laboral (ADR 0012). Solo cuenta lo que Recursos Humanos
// confirmó: un ingreso sin confirmar no abre la relación y un cese sin confirmar no la cierra.

export interface RelacionLaboral {
  id: string;
  dni: string;
  ingreso: string;
  cese: string | null;
  ingresoConfirmado: boolean;
  ceseConfirmado: boolean;
}

/** Intervalo confirmado de una relación laboral; `cese: null` = sin cese confirmado (vigente). Fechas inclusivas. */
export interface Vigencia {
  ingreso: string;
  cese: string | null;
}

/** Estado planificado de una jornada fuera de la relación laboral (decisión de Diego en #109). */
export const MOTIVO_SIN_RELACION_LABORAL = "sin_relacion_laboral";

export function vigenciasConfirmadas(relaciones: RelacionLaboral[]): Vigencia[] {
  return relaciones
    .filter((relacion) => relacion.ingresoConfirmado)
    .map((relacion) => ({ ingreso: relacion.ingreso, cese: relacion.ceseConfirmado ? relacion.cese : null }))
    .sort((a, b) => a.ingreso.localeCompare(b.ingreso));
}

export function estaVigenteEn(vigencias: Vigencia[], fecha: string): boolean {
  return vigencias.some((vigencia) => vigencia.ingreso <= fecha && (vigencia.cese === null || fecha <= vigencia.cese));
}

export function seSuperponeConElRango(vigencia: Vigencia, desde: string, hasta: string): boolean {
  return vigencia.ingreso <= hasta && (vigencia.cese === null || vigencia.cese >= desde);
}

export function formatearFechaDeRelacion(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

/**
 * Un día dentro de la relación laboral confirmada no puede marcarse «Sin relación laboral» y un día
 * fuera solo admite ese estado. `motivo` es el estado planificado del día (null = jornada laboral).
 */
export function verificarJornadaContraLaVigencia(vigencias: Vigencia[], fecha: string, motivo: string | null): void {
  const dentro = estaVigenteEn(vigencias, fecha);
  if (dentro && motivo === MOTIVO_SIN_RELACION_LABORAL) {
    throw new Error(`El ${formatearFechaDeRelacion(fecha)} está dentro de una relación laboral confirmada: no puede marcarse «Sin relación laboral».`);
  }
  if (!dentro && motivo !== MOTIVO_SIN_RELACION_LABORAL) {
    throw new Error(`El ${formatearFechaDeRelacion(fecha)} está fuera de la relación laboral confirmada por Recursos Humanos: solo puede registrarse «Sin relación laboral».`);
  }
}

/** Una semana sin ningún día dentro de una relación laboral confirmada no se publica. */
export function verificarQueLaSemanaTengaRelacion(vigencias: Vigencia[], fechasDeLaSemana: string[]): void {
  if (fechasDeLaSemana.some((fecha) => estaVigenteEn(vigencias, fecha))) return;
  throw new Error("No hay una relación laboral confirmada por Recursos Humanos en esta semana. Pida a Recursos Humanos que registre y confirme el ingreso (o el reingreso) antes de publicar el horario.");
}
