import type { Vigencia } from "@/relaciones-laborales/vigencia";
import { seSuperponeConElRango } from "@/relaciones-laborales/vigencia";

export type CausaDeBloqueoDeAprobacion = "sin_horario" | "asistencia_pendiente";

/** Persona de un grupo con sus relaciones laborales confirmadas (la población sale de ahí, no de las filas de asistencia). */
export interface PersonaParaAprobar {
  dni: string;
  nombre: string;
  vigencias: Vigencia[];
}

/** Día con horario publicado: `pendiente` si la asistencia aún no se confirmó ni tiene estado manual. */
export interface JornadaParaAprobar {
  dni: string;
  fecha: string;
  situacion: "resuelta" | "pendiente";
}

export interface BloqueoDeAprobacion {
  dni: string;
  nombre: string;
  causa: CausaDeBloqueoDeAprobacion;
  fechas: string[];
}

export const TEXTO_DE_CAUSA_DE_BLOQUEO: Record<CausaDeBloqueoDeAprobacion, string> = {
  sin_horario: "Sin horario publicado",
  asistencia_pendiente: "Asistencia pendiente de revisión",
};

function fechaIsoAUtc(iso: string): number {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

function diasDelRango(desde: string, hasta: string): string[] {
  const fechas: string[] = [];
  for (let instante = fechaIsoAUtc(desde); instante <= fechaIsoAUtc(hasta); instante += 86_400_000) {
    fechas.push(new Date(instante).toISOString().slice(0, 10));
  }
  return fechas;
}

/** Días del período que caen dentro de alguna relación laboral confirmada de la persona. */
function diasExigidos(periodo: { inicio: string; fin: string }, vigencias: Vigencia[]): string[] {
  const fechas = new Set<string>();
  for (const vigencia of vigencias) {
    if (!seSuperponeConElRango(vigencia, periodo.inicio, periodo.fin)) continue;
    const desde = vigencia.ingreso > periodo.inicio ? vigencia.ingreso : periodo.inicio;
    const hasta = vigencia.cese !== null && vigencia.cese < periodo.fin ? vigencia.cese : periodo.fin;
    for (const fecha of diasDelRango(desde, hasta)) fechas.add(fecha);
  }
  return [...fechas].sort();
}

/**
 * Personas que impiden aprobar: una por persona y causa. Para cada día de la relación laboral dentro del período
 * se exige un horario publicado y, si es jornada laboral, una situación resuelta (confirmada o con estado manual).
 */
export function calcularBloqueosDeAprobacion(
  periodo: { inicio: string; fin: string },
  personas: PersonaParaAprobar[],
  jornadas: JornadaParaAprobar[],
): BloqueoDeAprobacion[] {
  const jornadasPorPersona = new Map<string, Map<string, JornadaParaAprobar>>();
  for (const jornada of jornadas) {
    const porFecha = jornadasPorPersona.get(jornada.dni) ?? new Map();
    porFecha.set(jornada.fecha, jornada);
    jornadasPorPersona.set(jornada.dni, porFecha);
  }
  const bloqueos: BloqueoDeAprobacion[] = [];
  for (const persona of [...personas].sort((a, b) => a.nombre.localeCompare(b.nombre) || a.dni.localeCompare(b.dni))) {
    const publicadas = jornadasPorPersona.get(persona.dni) ?? new Map<string, JornadaParaAprobar>();
    const exigidos = diasExigidos(periodo, persona.vigencias);
    const sinHorario = exigidos.filter((fecha) => !publicadas.has(fecha));
    const pendientes = exigidos.filter((fecha) => publicadas.get(fecha)?.situacion === "pendiente");
    if (sinHorario.length) bloqueos.push({ dni: persona.dni, nombre: persona.nombre, causa: "sin_horario", fechas: sinHorario });
    if (pendientes.length) bloqueos.push({ dni: persona.dni, nombre: persona.nombre, causa: "asistencia_pendiente", fechas: pendientes });
  }
  return bloqueos;
}
