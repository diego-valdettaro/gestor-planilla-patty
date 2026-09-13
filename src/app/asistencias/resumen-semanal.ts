import { estadoDeCeldaAsistencia, etiquetaDeCeldaAsistencia, type EstadoDeCeldaAsistencia, type EvidenciaDeCeldaAsistencia } from "./estado-de-celda";

export interface AsistenciaSemanal extends EvidenciaDeCeldaAsistencia {
  idHuellero: string;
  fecha: string;
  entrada: string | null;
  salida: string | null;
  sedeProgramada: string | null;
}

export interface JornadaSemanal {
  fecha: string;
  estado: EstadoDeCeldaAsistencia;
  sede?: string;
  entrada?: string;
  salida?: string;
  motivo?: string;
  causa?: string;
  bloqueada: boolean;
}

export function resumirAsistenciasSemanales(
  colaboradores: Array<{ idHuellero: string; nombre: string }>,
  dias: string[],
  asistencias: AsistenciaSemanal[],
): Array<{ idHuellero: string; nombre: string; jornadas: JornadaSemanal[] }> {
  const porClave = new Map(asistencias.map((asistencia) => [`${asistencia.idHuellero}:${asistencia.fecha}`, asistencia]));
  return [...colaboradores].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((colaborador) => ({
    ...colaborador,
    jornadas: dias.map((fecha) => resumirJornada(fecha, porClave.get(`${colaborador.idHuellero}:${fecha}`))),
  }));
}

function resumirJornada(fecha: string, asistencia: AsistenciaSemanal | undefined): JornadaSemanal {
  const estado = estadoDeCeldaAsistencia(asistencia);
  if (!asistencia) return { fecha, estado, causa: "Sin horario publicado", bloqueada: false };
  if (asistencia.estadoManual) return { fecha, estado, motivo: etiquetaDeCeldaAsistencia(estado, asistencia.estadoManual), bloqueada: estado === "liquidado" };
  return {
    fecha, estado, sede: asistencia.sedeProgramada ?? undefined, entrada: hora(asistencia.entrada), salida: hora(asistencia.salida),
    causa: estado === "pendiente-de-revision" ? "Marcas incompletas" : estado === "esperada" ? "Faltan marcas" : estado === "liquidado" ? "Período cerrado" : undefined,
    bloqueada: estado === "liquidado",
  };
}

function hora(valor: string | null): string | undefined {
  return valor ? /T(\d{2}:\d{2})/.exec(valor)?.[1] : undefined;
}
