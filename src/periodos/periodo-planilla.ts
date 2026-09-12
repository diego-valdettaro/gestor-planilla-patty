import type { Actor } from "@/colaboradores/registrar-colaborador";

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

export interface FiltrosDeResumen { periodoId: string; sede?: string; idHuellero?: string; }
export interface FilaDeResumen {
  idHuellero: string; nombre: string; sede: string; minutosTrabajados: number;
  cantidadTardanzas: number; minutosPenalizados: number; minutosAl25: number; minutosAl35: number;
}

export interface NuevoPeriodo { inicio: string; fin: string; confirmarHueco?: boolean; }

export interface RepositorioDePeriodos {
  listar(): Promise<PeriodoPlanilla[]>;
  buscar(id: string): Promise<PeriodoPlanilla | undefined>;
  listarResumen(filtros: FiltrosDeResumen): Promise<FilaDeResumen[]>;
  crear(inicio: string, fin: string): Promise<void>;
  cerrar(id: string, responsableId: string, registradoEn: Date): Promise<void>;
  reabrir(id: string, responsableId: string, motivo: string, registradoEn: Date): Promise<void>;
}

export class PeriodosSolapadosError extends Error {
  constructor() {
    super("El período se superpone con uno existente.");
  }
}

export class HuecoEntrePeriodosError extends Error {
  constructor(public readonly diasDeHueco: number) {
    super(`Hay un hueco de ${diasDeHueco} día(s) sin período de planilla. Confirme para continuar.`);
  }
}

export function autorizarGestionDePeriodos(actor: Actor): void {
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") throw new Error("No tiene permiso para gestionar períodos de planilla.");
}

export function autorizarCierreDePeriodos(actor: Actor): void {
  if (actor.rol !== "finanzas") throw new Error("Solo Finanzas puede cerrar o reabrir períodos de planilla.");
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
