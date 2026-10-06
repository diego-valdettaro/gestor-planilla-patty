// Elegibilidad y selección para la publicación parcial de una planificación semanal.
// Una fila es elegible para el checkbox de publicación solo cuando está completa,
// no publicada y no liquidada (ver `resumenSemanalDe` en el componente para el estado
// por colaborador y `resumirPlanSemanal` para la completitud de la fila). Una semana sin ningún día dentro
// de una relación laboral confirmada nunca es elegible (ADR 0012).
export function esElegibleParaPublicar(opciones: {
  filaCompleta: boolean;
  semanaPublicada: boolean;
  semanaLiquidada: boolean;
  semanaSinRelacionLaboral?: boolean;
}): boolean {
  return opciones.filaCompleta && !opciones.semanaPublicada && !opciones.semanaLiquidada && !opciones.semanaSinRelacionLaboral;
}

// Selección efectiva a partir de las filas elegibles y las decisiones manuales del
// usuario durante la sesión. Sin decisión manual, una fila elegible se autoselecciona;
// una decisión manual (marcar o desmarcar) queda fija para la sesión y no se revierte
// aunque la fila deje de ser elegible y vuelva a serlo con nuevas ediciones.
export function seleccionEfectiva(elegibles: string[], overrides: ReadonlyMap<string, boolean>): Set<string> {
  return new Set(elegibles.filter((dni) => overrides.get(dni) ?? true));
}
