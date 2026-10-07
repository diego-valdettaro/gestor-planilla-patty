import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeAprobarAsistenciaDelGrupo, puedeGestionarPeriodos } from "@/autenticacion/permisos";
import { validarDescarteDeHoraExtra, type DecisionDeHoraExtra } from "@/asistencias/descarte-de-hora-extra";
import type { BloqueoDeAprobacion } from "./aprobacion-de-asistencia";

export type EstadoDePeriodo = "abierto" | "cerrado";
export type AccionDePeriodo = "cierre" | "reapertura";

export interface PeriodoPlanilla {
  id: string;
  inicio: string;
  fin: string;
  estado: EstadoDePeriodo;
  cerradoPorId?: string | null;
  cerradoEn?: Date | null;
}

export type MotivoDeNoAsistencia = "falta" | "descanso" | "feriado" | "vacaciones" | "permiso" | "suspension";
export type EstadoDeHoraExtra = "pendiente" | "aprobada" | "descartada";
export type TipoDeBloqueoDePeriodo = "asistencia" | "hora-extra";

export interface FiltrosDeResumen { periodoId: string; sede?: string; dni?: string; }
export interface TotalesDeHorasExtra { minutosAl25: number; minutosAl35: number; }
export type ConteosDeNoAsistencia = Record<MotivoDeNoAsistencia, number>;
export interface DetalleDeJornada {
  fecha: string;
  sede: string | null;
  resultado: "pendiente" | "trabajada" | MotivoDeNoAsistencia;
  entradaReal: string | null;
  salidaReal: string | null;
  minutosTrabajados: number;
  tardanzaEnMinutos: number;
  minutosPenalizados: number;
  politicaDeTardanzaVersion: number | null;
  horaExtra?: { id: string; estado: EstadoDeHoraExtra; minutosAl25: number; minutosAl35: number };
}
export interface BloqueoDePeriodo {
  tipo: TipoDeBloqueoDePeriodo;
  dni: string;
  nombre: string;
  grupo: string;
  fecha: string;
}
export interface FilaDeResumen {
  dni: string;
  nombre: string;
  grupo: string;
  jornadasTrabajadas: number;
  minutosTrabajados: number;
  noAsistencias: ConteosDeNoAsistencia;
  cantidadTardanzas: number;
  minutosPenalizados: number;
  horasExtra: Record<EstadoDeHoraExtra, TotalesDeHorasExtra>;
  jornadas: DetalleDeJornada[];
}
export interface ResumenDePeriodo {
  filas: FilaDeResumen[];
  totales: Omit<FilaDeResumen, "dni" | "nombre" | "grupo" | "jornadas">;
  bloqueos: BloqueoDePeriodo[];
}

export interface RevisionDePeriodo {
  id: string;
  periodoId: string;
  numero: number;
  resumen: ResumenDePeriodo;
  responsableId: string;
  cerradaEn: Date;
}

export type { DecisionDeHoraExtra };
export interface SolicitudDeDecisionDeHorasExtra {
  periodoId: string;
  horasExtraIds: string[];
  decision: "aprobada" | "descartada";
  /** Evidencia y motivo: obligatorios cuando la decisión es descartar. */
  causa?: string;
  motivo?: string;
}

export function crearResumenVacio(): ResumenDePeriodo {
  return {
    filas: [],
    bloqueos: [],
    totales: {
      jornadasTrabajadas: 0,
      minutosTrabajados: 0,
      noAsistencias: { falta: 0, descanso: 0, feriado: 0, vacaciones: 0, permiso: 0, suspension: 0 },
      cantidadTardanzas: 0,
      minutosPenalizados: 0,
      horasExtra: {
        pendiente: { minutosAl25: 0, minutosAl35: 0 },
        aprobada: { minutosAl25: 0, minutosAl35: 0 },
        descartada: { minutosAl25: 0, minutosAl35: 0 },
      },
    },
  };
}

export type EstadoDeAprobacion = "aprobada" | "pendiente" | "invalidada";

/** Estado de la aprobación de asistencia de un grupo que gestiona asistencia en un período, con quién la bloquea. */
export interface AprobacionDeGrupo {
  grupo: string;
  /** Nombre de usuario del gerente de área asignado; null si el grupo no tiene gerente. */
  gerente: string | null;
  estado: EstadoDeAprobacion;
  aprobadaPor: string | null;
  aprobadaEn: Date | null;
  invalidadaEn: Date | null;
  motivoDeInvalidacion: string | null;
  /** Personas que impiden aprobar; vacío cuando ya está aprobada. */
  bloqueos: BloqueoDeAprobacion[];
}

export interface SolicitudDeAprobacionDeAsistencia { periodoId: string; grupo: string; }

export interface NuevoPeriodo { inicio: string; fin: string; confirmarHueco?: boolean; }

export interface RepositorioDePeriodos {
  listar(): Promise<PeriodoPlanilla[]>;
  buscar(id: string): Promise<PeriodoPlanilla | undefined>;
  listarResumen(filtros: FiltrosDeResumen): Promise<ResumenDePeriodo>;
  listarRevisiones(periodoId: string): Promise<RevisionDePeriodo[]>;
  listarAprobaciones(periodoId: string): Promise<AprobacionDeGrupo[]>;
  aprobarAsistencia(periodoId: string, grupo: string, responsableId: string, aprobadaEn: Date): Promise<void>;
  crear(inicio: string, fin: string): Promise<void>;
  decidirHorasExtra(periodoId: string, horasExtraIds: string[], decision: DecisionDeHoraExtra, responsableId: string, registradaEn: Date): Promise<void>;
  cerrar(id: string, responsableId: string, registradoEn: Date): Promise<void>;
  reabrir(id: string, responsableId: string, motivo: string, registradoEn: Date): Promise<void>;
}

export class PeriodosSolapadosError extends Error {
  constructor() {
    super("El período se superpone con uno existente.");
  }
}

/** La aprobación no se registra mientras alguien del grupo tenga el período sin horario o sin situación resuelta. */
export class AprobacionBloqueadaError extends Error {
  constructor(public readonly bloqueos: BloqueoDeAprobacion[]) {
    const personas = new Set(bloqueos.map(({ dni }) => dni)).size;
    super(`No se puede aprobar: ${personas} ${personas === 1 ? "persona tiene" : "personas tienen"} el período sin horario o con la asistencia sin resolver. Revise la lista de personas que bloquean.`);
  }
}

export class HuecoEntrePeriodosError extends Error {
  constructor(public readonly diasDeHueco: number) {
    super(`Hay un hueco de ${diasDeHueco} día(s) sin período de planilla. Confirme para continuar.`);
  }
}

export function autorizarGestionDePeriodos(actor: Actor): void {
  exigir(puedeGestionarPeriodos(actor), "No tiene permiso para gestionar períodos de planilla.");
}

export function autorizarCierreDePeriodos(actor: Actor): void {
  exigir(puedeGestionarPeriodos(actor), "Solo Finanzas y el Administrador del sistema pueden cerrar o reabrir períodos de planilla.");
}

/** Quien opera el grupo aprueba su asistencia; Finanzas cierra pero no aprueba en nombre del gerente (ADR 0012). */
export function autorizarAprobacionDeAsistencia(actor: Actor, grupo: string): void {
  exigir(actor.rol !== "finanzas", "Finanzas no aprueba la asistencia en nombre del gerente de área: pida al gerente del grupo que apruebe.");
  exigir(puedeAprobarAsistenciaDelGrupo(actor, grupo), "No tiene permiso para aprobar la asistencia de este grupo.");
}

export async function aprobarAsistenciaDelGrupo(
  repositorio: RepositorioDePeriodos,
  actor: Actor,
  solicitud: SolicitudDeAprobacionDeAsistencia,
  ahora = new Date(),
): Promise<void> {
  autorizarAprobacionDeAsistencia(actor, solicitud.grupo);
  await repositorio.aprobarAsistencia(solicitud.periodoId, solicitud.grupo, actor.id, ahora);
}

/** Aprobaciones que el actor puede ver en /periodos: todas para Finanzas y el Administrador; un gerente, solo las de sus grupos. */
export function aprobacionesVisiblesPara(actor: Actor, aprobaciones: AprobacionDeGrupo[]): AprobacionDeGrupo[] {
  if (puedeGestionarPeriodos(actor)) return aprobaciones;
  return aprobaciones.filter(({ grupo }) => puedeAprobarAsistenciaDelGrupo(actor, grupo));
}

export async function decidirHorasExtra(
  repositorio: RepositorioDePeriodos,
  actor: Actor,
  solicitud: SolicitudDeDecisionDeHorasExtra,
  ahora = new Date(),
): Promise<void> {
  autorizarCierreDePeriodos(actor);
  const ids = [...new Set(solicitud.horasExtraIds)];
  if (!ids.length) throw new Error("Debe seleccionar al menos una hora extra.");
  const decision: DecisionDeHoraExtra = solicitud.decision === "descartada"
    ? { estado: "descartada", ...validarDescarteDeHoraExtra(solicitud) }
    : { estado: "aprobada" };
  await repositorio.decidirHorasExtra(solicitud.periodoId, ids, decision, actor.id, ahora);
}

export async function cerrarPeriodo(repositorio: RepositorioDePeriodos, actor: Actor, id: string, ahora = new Date()): Promise<void> {
  autorizarCierreDePeriodos(actor);
  await repositorio.cerrar(id, actor.id, ahora);
}

export async function reabrirPeriodo(repositorio: RepositorioDePeriodos, actor: Actor, id: string, motivo: string, ahora = new Date()): Promise<void> {
  autorizarCierreDePeriodos(actor);
  const texto = motivo.trim();
  if (!texto) throw new Error("La reapertura del período requiere un motivo.");
  await repositorio.reabrir(id, actor.id, texto, ahora);
}

/** Convierte una fecha ISO (YYYY-MM-DD) a un timestamp UTC de medianoche, para aritmética de fechas sin husos horarios. */
function fechaIsoAUtc(iso: string): number {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

/** Formatea un timestamp UTC de medianoche como fecha ISO (YYYY-MM-DD). */
function utcAFechaIso(timestampUtc: number): string {
  return new Date(timestampUtc).toISOString().slice(0, 10);
}

function sumarDiasIso(iso: string, dias: number): string {
  return utcAFechaIso(fechaIsoAUtc(iso) + dias * 86_400_000);
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((fechaIsoAUtc(hasta) - fechaIsoAUtc(desde)) / 86_400_000);
}

/** Suma un mes a una fecha ISO (YYYY-MM-DD) y resta un día: para el inicio habitual (día 26) da el fin habitual (día 25 del mes siguiente). */
function calcularFinSugerido(inicioIso: string): string {
  const [anio, mes, dia] = inicioIso.split("-").map(Number);
  return utcAFechaIso(Date.UTC(anio, mes, dia) - 86_400_000);
}

export function calcularSugerenciaDePeriodo(periodos: PeriodoPlanilla[], hoy: Date): { inicio: string; fin: string } {
  let inicio: string;
  if (periodos.length === 0) {
    // Si "hoy" ya pasó el día 26, el 26 de este mes ya venció: se sugiere el del mes siguiente.
    const anio = hoy.getFullYear();
    const mes = hoy.getMonth() + (hoy.getDate() > 26 ? 1 : 0);
    inicio = utcAFechaIso(Date.UTC(anio, mes, 26));
  } else {
    const ultimoFin = periodos.reduce((max, item) => (item.fin > max ? item.fin : max), periodos[0].fin);
    inicio = sumarDiasIso(ultimoFin, 1);
  }
  return { inicio, fin: calcularFinSugerido(inicio) };
}

function calcularDiasDeHueco(periodos: PeriodoPlanilla[], inicio: string, fin: string): number {
  if (periodos.length === 0) return 0;
  const anteriores = periodos.filter((item) => item.fin < inicio);
  const siguientes = periodos.filter((item) => item.inicio > fin);
  let hueco = 0;
  if (anteriores.length) {
    const masCercano = anteriores.reduce((max, item) => (item.fin > max.fin ? item : max), anteriores[0]);
    hueco = Math.max(hueco, diasEntre(masCercano.fin, inicio) - 1);
  }
  if (siguientes.length) {
    const masCercano = siguientes.reduce((min, item) => (item.inicio < min.inicio ? item : min), siguientes[0]);
    hueco = Math.max(hueco, diasEntre(fin, masCercano.inicio) - 1);
  }
  return hueco;
}

function seSolapan(periodos: PeriodoPlanilla[], inicio: string, fin: string): boolean {
  return periodos.some((item) => item.inicio <= fin && item.fin >= inicio);
}

export async function crearPeriodo(repositorio: RepositorioDePeriodos, actor: Actor, datos: NuevoPeriodo): Promise<void> {
  autorizarGestionDePeriodos(actor);
  if (!datos.inicio || !datos.fin) throw new Error("El período requiere fecha de inicio y de fin.");
  if (datos.fin < datos.inicio) throw new Error("La fecha de fin debe ser posterior a la de inicio.");
  const periodos = await repositorio.listar();
  // El solapamiento es una regla dura: se valida antes que el hueco para no pedir
  // confirmar un hueco irrelevante cuando el período ya va a ser rechazado.
  if (seSolapan(periodos, datos.inicio, datos.fin)) throw new PeriodosSolapadosError();
  const diasDeHueco = calcularDiasDeHueco(periodos, datos.inicio, datos.fin);
  if (diasDeHueco > 0 && !datos.confirmarHueco) throw new HuecoEntrePeriodosError(diasDeHueco);
  await repositorio.crear(datos.inicio, datos.fin);
}
