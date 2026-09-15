import type { EvaluacionDeColaborador } from "@/asistencias/confirmar-colaboradores-por-rango";

export interface OpcionDelDialogo extends EvaluacionDeColaborador {
  detalles: string[];
}

export function crearModeloDelDialogo(evaluaciones: EvaluacionDeColaborador[]): {
  opciones: OpcionDelDialogo[];
  seleccionados: string[];
} {
  return {
    opciones: evaluaciones.map((evaluacion) => ({ ...evaluacion, detalles: describirEvaluacion(evaluacion) })),
    seleccionados: evaluaciones.filter(({ seleccionable }) => seleccionable).map(({ idHuellero }) => idHuellero),
  };
}

function describirEvaluacion(evaluacion: EvaluacionDeColaborador): string[] {
  if (evaluacion.bloqueos.length) return evaluacion.bloqueos.map(({ fecha, causa }) => `${fechaCorta(fecha)}: ${causa}`);
  if (!evaluacion.jornadasPendientes) return ["No hay asistencias por registrar en el rango."];
  const pendientes = `${evaluacion.jornadasPendientes} ${evaluacion.jornadasPendientes === 1 ? "asistencia por registrar" : "asistencias por registrar"}`;
  if (!evaluacion.jornadasRegistradas) return [pendientes];
  const registradas = `${evaluacion.jornadasRegistradas} ${evaluacion.jornadasRegistradas === 1 ? "ya registrada" : "ya registradas"}`;
  return [`${pendientes} · ${registradas}`];
}

function fechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${dia} ${meses[mes - 1]} ${anio}`;
}
