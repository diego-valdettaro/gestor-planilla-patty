import { estadoDeCeldaAsistencia, type EstadoDeCeldaAsistencia } from "./estado-de-celda";
import type { FilaDeResumenMensual } from "@/asistencias/repositorio-postgres";

export interface ResumenMensual {
  porEstado: Record<EstadoDeCeldaAsistencia, number>;
  minutosTrabajados: number;
  minutosDeTardanza: number;
  minutosAl25: number;
  minutosAl35: number;
}

export function resumirMes(dias: string[], asistencias: FilaDeResumenMensual[]): ResumenMensual {
  const porFecha = new Map(asistencias.map((asistencia) => [asistencia.fecha, asistencia]));
  const porEstado = {
    "sin-planificacion": 0,
    esperada: 0,
    "pendiente-de-revision": 0,
    registrada: 0,
    liquidado: 0,
  } satisfies Record<EstadoDeCeldaAsistencia, number>;
  let minutosTrabajados = 0;
  let minutosDeTardanza = 0;
  let minutosAl25 = 0;
  let minutosAl35 = 0;
  for (const fecha of dias) {
    const asistencia = porFecha.get(fecha);
    porEstado[estadoDeCeldaAsistencia(asistencia)] += 1;
    minutosTrabajados += asistencia?.minutosTrabajados ?? 0;
    minutosDeTardanza += asistencia?.minutosDeTardanza ?? 0;
    minutosAl25 += asistencia?.minutosAl25 ?? 0;
    minutosAl35 += asistencia?.minutosAl35 ?? 0;
  }
  return { porEstado, minutosTrabajados, minutosDeTardanza, minutosAl25, minutosAl35 };
}
