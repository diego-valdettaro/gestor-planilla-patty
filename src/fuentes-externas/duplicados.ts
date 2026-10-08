// Un importe externo es duplicado de otro cuando coinciden la persona, el concepto, la fecha del hecho, el mes de devengue,
// el mes de aplicación y el monto. La carga manual lo rechaza; la importación de un archivo fuente reutiliza esta regla para
// señalar las filas «Duplicadas» de su vista previa. La base lo garantiza con un índice único parcial.

export interface ClaveDeImporte {
  dni: string;
  concepto: string;
  fechaDelHecho: string;
  mesDeDevengue: string;
  mesDeAplicacion: string;
  /** Céntimos. */
  monto: number;
}

export function claveDeImporte({ dni, concepto, fechaDelHecho, mesDeDevengue, mesDeAplicacion, monto }: ClaveDeImporte): string {
  return [dni, concepto, fechaDelHecho, mesDeDevengue, mesDeAplicacion, monto].join("|");
}

/**
 * Posiciones de `candidatas` que repiten un importe ya cargado (`existentes`) o una candidata anterior de la misma lista.
 * La primera aparición de una fila nueva no cuenta como duplicada.
 */
export function posicionesDuplicadas(candidatas: ClaveDeImporte[], existentes: ClaveDeImporte[] = []): number[] {
  const vistas = new Set(existentes.map(claveDeImporte));
  const posiciones: number[] = [];
  candidatas.forEach((candidata, posicion) => {
    const clave = claveDeImporte(candidata);
    if (vistas.has(clave)) posiciones.push(posicion);
    vistas.add(clave);
  });
  return posiciones;
}
