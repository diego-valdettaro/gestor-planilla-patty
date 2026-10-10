// Contrato lógico de Asistencia hacia Pagos (docs/diseno-software-pagos.md, ADR 0007 y 0010). Asistencia entrega,
// por revisión de período, los hechos diarios resueltos de cada persona; Pagos los valora. Son casos de uso
// internos del monolito, sin actor: Pagos aplica la autorización de Finanzas. El contrato no lleva importes ni
// copia la aprobación de los gerentes o el cierre en cada jornada: son condiciones de aptitud de la revisión.
import type { CausaDeDescarte } from "@/asistencias/descarte-de-hora-extra";
import type { ClaseDeFeriado, EstadoDeSustitutorio } from "@/descansos-y-feriados/reglas";

import type { EstadoDeHoraExtra, MotivoDeNoAsistencia, PeriodoPlanilla } from "./periodo-planilla";

export type ResultadoDeJornada = "trabajada" | "pendiente" | MotivoDeNoAsistencia | "sin_relacion_laboral";

/** Horario programado que rigió la jornada; sin horas en un día de descanso o de no asistencia planificada. */
export interface HorarioAplicado {
  entradaProgramada: string | null;
  salidaProgramada: string | null;
}

/** Tardanza real y la penalización disciplinaria que la política vigente le aplicó. */
export interface TardanzaDeJornada {
  minutos: number;
  minutosPenalizados: number;
  politicaVersion: number;
}

/** Sobretiempo de la jornada con la decisión de Finanzas; los motivos detallados permanecen en Asistencia. */
export interface HoraExtraDeJornada {
  estado: EstadoDeHoraExtra;
  minutosAl25: number;
  minutosAl35: number;
  trabajoNocturno: boolean;
  causaDeDescarte: CausaDeDescarte | null;
}

/** La fecha es feriado o el descanso semanal asignado a la persona; Pagos decide qué valorar según el resultado. */
export interface DiaEspecialDeJornada {
  descansoSemanal: boolean;
  feriado: ClaseDeFeriado | null;
  sustitutorio: { estado: EstadoDeSustitutorio; fechaPrevista: string } | null;
}

/** Dónde consultar la evidencia (marcas, ajustes, estados manuales) y su auditoría en Asistencia. */
export interface ReferenciaDeEvidencia {
  /** Ausente en los días de descanso o de no asistencia planificada, que no generan asistencia por registrar. */
  asistenciaId: string | null;
  turnoPublicadoId: string;
}

export interface HechoDiarioDeAsistencia {
  dni: string;
  fecha: string;
  grupo: string;
  /** Sede donde se trabajó la jornada; null cuando no hubo trabajo (sin relación con la sede de adscripción contable). */
  sede: string | null;
  horarioAplicado: HorarioAplicado;
  resultado: ResultadoDeJornada;
  minutosTrabajados: number;
  tardanza: TardanzaDeJornada | null;
  horaExtra: HoraExtraDeJornada | null;
  diaEspecial: DiaEspecialDeJornada | null;
  evidencia: ReferenciaDeEvidencia;
}

/** Hechos de un período de planilla: congelados si está cerrado; en vivo y provisionales si sigue abierto. */
export interface RevisionDeAsistenciaParaPagos {
  periodoId: string;
  revisionId: string | null;
  numero: number | null;
  inicio: string;
  fin: string;
  provisional: boolean;
  hechos: HechoDiarioDeAsistencia[];
}

export interface Corte { inicio: string; fin: string; }

export interface PeriodoParaCobertura { id: string; inicio: string; fin: string; estado: PeriodoPlanilla["estado"]; }

export type ProblemaDeCobertura =
  | { tipo: "hueco"; desde: string; hasta: string; mensaje: string }
  | { tipo: "solapamiento"; periodoIds: [string, string]; desde: string; hasta: string; mensaje: string }
  | { tipo: "cruza_corte"; periodoId: string; inicio: string; fin: string; mensaje: string }
  | { tipo: "periodo_abierto"; periodoId: string; inicio: string; fin: string; mensaje: string }
  | { tipo: "revision_no_disponible"; periodoId: string; inicio: string; fin: string; mensaje: string };

/** Un período cerrado sin hechos congelados no puede alimentar Pagos, pero sí debe aparecer como bloqueo del borrador. */
export class RevisionDeAsistenciaNoDisponibleError extends Error {}

export interface VerificacionDeCobertura {
  problemas: ProblemaDeCobertura[];
  /** Los períodos cubren el corte sin huecos, solapamientos ni cruces; ignora si siguen abiertos. */
  cubreExactamente: boolean;
}

const DIA_EN_MS = 86_400_000;

function aInstante(iso: string): number {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

function aIso(instante: number): string {
  return new Date(instante).toISOString().slice(0, 10);
}

function sumarDias(iso: string, dias: number): string {
  return aIso(aInstante(iso) + dias * DIA_EN_MS);
}

function enFormatoLegible(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}

function rango(inicio: string, fin: string): string {
  return `del ${enFormatoLegible(inicio)} al ${enFormatoLegible(fin)}`;
}

/** Corte de incidencias de un mes de pago («YYYY-MM»): del día 26 del mes anterior al día 25 del mes. */
export function corteDeIncidencias(mesDePago: string): Corte {
  const coincidencia = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mesDePago);
  if (!coincidencia) throw new Error(`El mes de pago «${mesDePago}» no tiene el formato AAAA-MM.`);
  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  const anterior = new Date(Date.UTC(anio, mes - 2, 26));
  return { inicio: aIso(anterior.getTime()), fin: `${coincidencia[1]}-${coincidencia[2]}-25` };
}

function seSuperponeConElCorte(corte: Corte, periodo: { inicio: string; fin: string }): boolean {
  return periodo.inicio <= corte.fin && periodo.fin >= corte.inicio;
}

/**
 * Comprueba que los períodos cubran exactamente el corte: sin huecos, sin solapamientos y sin períodos que salgan
 * de él (que atraviesen el día 25). Un período abierto no rompe la cobertura pero impide finalizar.
 */
export function verificarCoberturaDelCorte(corte: Corte, periodos: PeriodoParaCobertura[]): VerificacionDeCobertura {
  const relevantes = periodos.filter((periodo) => seSuperponeConElCorte(corte, periodo))
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id.localeCompare(b.id));
  const problemas: ProblemaDeCobertura[] = [];

  for (const periodo of relevantes) {
    if (periodo.inicio >= corte.inicio && periodo.fin <= corte.fin) continue;
    problemas.push({
      tipo: "cruza_corte",
      periodoId: periodo.id,
      inicio: periodo.inicio,
      fin: periodo.fin,
      mensaje: `El período ${rango(periodo.inicio, periodo.fin)} cruza el día 25: sale del corte ${rango(corte.inicio, corte.fin)}.`,
    });
  }

  for (let i = 0; i < relevantes.length; i += 1) {
    for (let j = i + 1; j < relevantes.length; j += 1) {
      const [primero, segundo] = [relevantes[i], relevantes[j]];
      if (segundo.inicio > primero.fin) continue;
      const desde = segundo.inicio > corte.inicio ? segundo.inicio : corte.inicio;
      const hasta = [primero.fin, segundo.fin, corte.fin].reduce((menor, fecha) => (fecha < menor ? fecha : menor));
      if (desde > hasta) continue;
      problemas.push({
        tipo: "solapamiento",
        periodoIds: [primero.id, segundo.id],
        desde,
        hasta,
        mensaje: `Los períodos ${rango(primero.inicio, primero.fin)} y ${rango(segundo.inicio, segundo.fin)} se solapan.`,
      });
    }
  }

  let siguienteSinCubrir = corte.inicio;
  for (const periodo of relevantes) {
    const desde = periodo.inicio > corte.inicio ? periodo.inicio : corte.inicio;
    const hasta = periodo.fin < corte.fin ? periodo.fin : corte.fin;
    if (desde > siguienteSinCubrir) problemas.push(hueco(siguienteSinCubrir, sumarDias(desde, -1)));
    if (sumarDias(hasta, 1) > siguienteSinCubrir) siguienteSinCubrir = sumarDias(hasta, 1);
  }
  if (siguienteSinCubrir <= corte.fin) problemas.push(hueco(siguienteSinCubrir, corte.fin));

  const cubreExactamente = problemas.length === 0;

  for (const periodo of relevantes) {
    if (periodo.estado === "cerrado") continue;
    problemas.push({
      tipo: "periodo_abierto",
      periodoId: periodo.id,
      inicio: periodo.inicio,
      fin: periodo.fin,
      mensaje: `El período ${rango(periodo.inicio, periodo.fin)} no está cerrado: sus hechos son provisionales.`,
    });
  }
  return { problemas, cubreExactamente };
}

function hueco(desde: string, hasta: string): ProblemaDeCobertura {
  return { tipo: "hueco", desde, hasta, mensaje: `Falta cobertura ${rango(desde, hasta)}: ningún período la incluye.` };
}

/** Lo que Asistencia necesita exponer para entregar hechos: los períodos y los hechos de cada uno. */
export interface LectorDeHechosDeAsistencia {
  listar(): Promise<PeriodoPlanilla[]>;
  leerHechosDelPeriodo(periodoId: string): Promise<RevisionDeAsistenciaParaPagos>;
}

export interface HechosDelCorte {
  corte: Corte;
  problemas: ProblemaDeCobertura[];
  cubreExactamente: boolean;
  /** Cobertura exacta y todas las revisiones cerradas: sin problemas de ningún tipo. */
  finalizable: boolean;
  /** Alguna revisión se calculó en vivo sobre un período abierto. */
  provisional: boolean;
  revisiones: RevisionDeAsistenciaParaPagos[];
  /**
   * Hechos dentro del corte por DNI, ordenados por fecha. Con solapamientos una fecha puede repetirse:
   * el resultado no es finalizable.
   */
  hechosPorDni: Record<string, HechoDiarioDeAsistencia[]>;
}

/** Hechos de todos los períodos que tocan el corte, con el diagnóstico de su cobertura. Sirve al borrador. */
export async function obtenerHechosDelCorte(lector: LectorDeHechosDeAsistencia, corte: Corte): Promise<HechosDelCorte> {
  const periodos = (await lector.listar()).filter((periodo) => seSuperponeConElCorte(corte, periodo));
  const verificacion = verificarCoberturaDelCorte(corte, periodos);
  const lecturas = await Promise.all(periodos.map(async (periodo) => {
    try {
      return { revision: await lector.leerHechosDelPeriodo(periodo.id) };
    } catch (error) {
      if (!(error instanceof RevisionDeAsistenciaNoDisponibleError)) throw error;
      return { problema: {
        tipo: "revision_no_disponible" as const, periodoId: periodo.id, inicio: periodo.inicio, fin: periodo.fin,
        mensaje: `El período ${rango(periodo.inicio, periodo.fin)} está cerrado pero no tiene una revisión de asistencia con hechos congelados. Reábralo y ciérrelo de nuevo en Períodos.`,
      } };
    }
  }));
  const revisiones = lecturas.flatMap((lectura) => "revision" in lectura && lectura.revision ? [lectura.revision] : [])
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.periodoId.localeCompare(b.periodoId));
  const problemas = [...verificacion.problemas, ...lecturas.flatMap((lectura) => "problema" in lectura && lectura.problema ? [lectura.problema] : [])];

  const hechosPorDni: Record<string, HechoDiarioDeAsistencia[]> = {};
  for (const revision of revisiones) {
    for (const hecho of revision.hechos) {
      if (hecho.fecha < corte.inicio || hecho.fecha > corte.fin) continue;
      (hechosPorDni[hecho.dni] ??= []).push(hecho);
    }
  }
  for (const hechos of Object.values(hechosPorDni)) hechos.sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    corte,
    problemas,
    cubreExactamente: verificacion.cubreExactamente,
    finalizable: problemas.length === 0,
    provisional: revisiones.some(({ provisional }) => provisional),
    revisiones,
    hechosPorDni,
  };
}

/**
 * Hechos de jornadas puntuales, también anteriores al corte (p. ej. el día de origen de un descanso sustitutorio que se
 * regulariza después). Lee la revisión del período que contiene cada fecha; si no está disponible, la jornada falta.
 */
export async function obtenerHechosDeJornadas(
  lector: LectorDeHechosDeAsistencia,
  jornadas: Array<{ dni: string; fecha: string }>,
): Promise<Record<string, HechoDiarioDeAsistencia[]>> {
  if (!jornadas.length) return {};
  const periodos = await lector.listar();
  const revisiones = new Map<string, Promise<RevisionDeAsistenciaParaPagos | null>>();
  const leer = (periodoId: string) => {
    if (!revisiones.has(periodoId)) {
      revisiones.set(periodoId, lector.leerHechosDelPeriodo(periodoId).catch((error) => {
        if (error instanceof RevisionDeAsistenciaNoDisponibleError) return null;
        throw error;
      }));
    }
    return revisiones.get(periodoId)!;
  };
  const resultado: Record<string, HechoDiarioDeAsistencia[]> = {};
  for (const { dni, fecha } of jornadas) {
    for (const periodo of periodos.filter(({ inicio, fin }) => inicio <= fecha && fecha <= fin)) {
      const hecho = (await leer(periodo.id))?.hechos.find((candidato) => candidato.dni === dni && candidato.fecha === fecha);
      if (!hecho) continue;
      (resultado[dni] ??= []).push(hecho);
      break;
    }
  }
  return resultado;
}

export class CoberturaDelCorteInvalidaError extends Error {
  constructor(public readonly problemas: ProblemaDeCobertura[]) {
    super(`No se puede finalizar sobre este corte: ${problemas.map(({ mensaje }) => mensaje).join(" ")}`);
  }
}

/** Hechos para finalizar: exige revisiones cerradas que cubran exactamente el corte; si no, explica qué falla. */
export async function hechosParaFinalizar(lector: LectorDeHechosDeAsistencia, corte: Corte): Promise<HechosDelCorte> {
  const hechos = await obtenerHechosDelCorte(lector, corte);
  if (!hechos.finalizable) throw new CoberturaDelCorteInvalidaError(hechos.problemas);
  return hechos;
}
