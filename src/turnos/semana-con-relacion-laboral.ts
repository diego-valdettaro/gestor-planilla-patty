import { estaVigenteEn, MOTIVO_SIN_RELACION_LABORAL, type Vigencia } from "@/relaciones-laborales/vigencia";

import type { DatosDeJornadaPlanificada } from "./jornada-planificada";

type CeldaConFecha = DatosDeJornadaPlanificada & { dni: string; fecha: string };

export function esDiaSinRelacionLaboral(celda: DatosDeJornadaPlanificada): boolean {
  return celda.motivoNoAsistencia === MOTIVO_SIN_RELACION_LABORAL;
}

/** Estado fijo de un día fuera de la relación laboral confirmada: sin sede, modelo ni horas, como un descanso. */
export function celdaSinRelacionLaboral(dni: string, fecha: string): CeldaConFecha {
  return {
    dni, fecha, sede: null, modeloHorarioId: null, entradaProgramada: null, salidaProgramada: null,
    descanso: true, motivoNoAsistencia: MOTIVO_SIN_RELACION_LABORAL,
  };
}

/**
 * Ajusta las celdas de una persona en una semana a su relación laboral confirmada. Un día fuera de la
 * relación recibe «Sin relación laboral» aunque falte su celda; si trae otro estado se conserva para que
 * la validación lo rechace con su causa. Un «Sin relación laboral» guardado en un día que ahora está
 * dentro (Recursos Humanos confirmó después) queda sin definir.
 */
export function ajustarSemanaALaRelacionLaboral<T extends CeldaConFecha>(
  vigencias: Vigencia[],
  dni: string,
  fechasDeLaSemana: string[],
  celdas: T[],
): Array<T | CeldaConFecha> {
  const porFecha = new Map(celdas.map((celda) => [celda.fecha, celda]));
  const resultado: Array<T | CeldaConFecha> = [];
  for (const fecha of fechasDeLaSemana) {
    const celda = porFecha.get(fecha);
    if (estaVigenteEn(vigencias, fecha)) {
      if (celda && !esDiaSinRelacionLaboral(celda)) resultado.push(celda);
    } else {
      resultado.push(celda && !esDiaSinRelacionLaboral(celda) ? celda : celdaSinRelacionLaboral(dni, fecha));
    }
  }
  return resultado;
}
