// Descansos vacacionales para Pagos. Los días salen de las jornadas «vacaciones» que el gerente aprobó en Asistencia;
// aquí solo se agrupan, se reparten por mes calendario y se asocian a los abonos anticipados que Finanzas registra.
// Un descanso vacacional es una racha de días consecutivos de la misma persona (docs/diseno-software-pagos.md).

import { desplazarFecha } from "@/turnos/semana";

export interface DescansoVacacional {
  inicio: string;
  fin: string;
  /** Todas las fechas del descanso, ordenadas y sin repetir. */
  fechas: string[];
}

export function diasDelMes(mes: string): number {
  const [anio, numero] = mes.split("-").map(Number);
  return new Date(Date.UTC(anio, numero, 0)).getUTCDate();
}

/**
 * Fechas que pueden tocar un descanso del mes de pago: desde el primer día del mes anterior hasta el último del siguiente.
 * Un descanso (hasta ~30 días) que toca el mes cabe en esa ventana completo, lo que permite repartir el abono entre sus meses.
 */
export function ventanaDeVacaciones(mesDePago: string): { inicio: string; fin: string } {
  const [anio, mes] = mesDePago.split("-").map(Number);
  return {
    inicio: new Date(Date.UTC(anio, mes - 2, 1)).toISOString().slice(0, 10),
    fin: new Date(Date.UTC(anio, mes + 1, 0)).toISOString().slice(0, 10),
  };
}

export function descansosDe(fechas: string[]): DescansoVacacional[] {
  const ordenadas = [...new Set(fechas)].sort();
  const descansos: DescansoVacacional[] = [];
  for (const fecha of ordenadas) {
    const actual = descansos.at(-1);
    if (actual && desplazarFecha(actual.fin, 1) === fecha) {
      actual.fechas.push(fecha);
      actual.fin = fecha;
    } else {
      descansos.push({ inicio: fecha, fin: fecha, fechas: [fecha] });
    }
  }
  return descansos;
}

export function mesesDelDescanso(descanso: DescansoVacacional): string[] {
  return [...new Set(descanso.fechas.map((fecha) => fecha.slice(0, 7)))];
}

export function fechasEnMes(descanso: DescansoVacacional, mes: string): string[] {
  return descanso.fechas.filter((fecha) => fecha.startsWith(mes));
}

/**
 * Días del descanso dentro de un mes valorados con la convención de 30: el día 31 no suma y, en febrero, un descanso que llega
 * al último día completa los 30 (igual que el sueldo básico, para que la reclasificación no cambie el total del mes).
 */
export function diasConvencionalesDelMes(fechasDelMes: string[], mes: string): number {
  const largo = diasDelMes(mes);
  const hasta30 = fechasDelMes.filter((fecha) => Number(fecha.slice(-2)) <= 30).length;
  const llegaAlUltimoDia = fechasDelMes.some((fecha) => Number(fecha.slice(-2)) === largo);
  return hasta30 + (llegaAlUltimoDia && largo < 30 ? 30 - largo : 0);
}

/** El descanso más cercano que empieza en o después de la fecha del abono; el abono es anticipado, nunca posterior. */
export function asociarAbono(descansos: DescansoVacacional[], fechaDelAbono: string): DescansoVacacional | undefined {
  return descansos.filter((descanso) => descanso.inicio >= fechaDelAbono).sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
}

/** Reparte el abono por días calendario de cada mes del descanso; los céntimos sobrantes van al último mes y la suma es el abono. */
export function repartirAbono(descanso: DescansoVacacional, centimos: number): Array<{ mes: string; centimos: number }> {
  const meses = mesesDelDescanso(descanso);
  const total = descanso.fechas.length;
  let asignado = 0;
  return meses.map((mes, posicion) => {
    const parte = posicion === meses.length - 1 ? centimos - asignado : Math.floor(centimos * fechasEnMes(descanso, mes).length / total);
    asignado += parte;
    return { mes, centimos: parte };
  });
}
