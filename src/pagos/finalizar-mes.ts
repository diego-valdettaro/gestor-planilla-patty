import { createHash } from "node:crypto";

import { exigir, puedeGestionarPagos, type Actor } from "@/autenticacion/permisos";
import type { CodigoDeTipoDeFuente } from "@/fuentes-externas/tipos-de-fuente";
import type { CodigoDeReglaLegal } from "@/reglas-legales/catalogo";

import type { BasesPorDevengue } from "./aportes-y-bases";
import type { LineaDeBorrador } from "./calcular-borrador";
import type { RepositorioDeConstancias } from "./constancias-de-pago";
import { prepararBorrador, type FuentesDelBorrador } from "./preparar-borrador";

// Finalización del mes completo (#129, ADR 0007 y 0014): evalúa, guarda una versión inmutable del mes entero o no guarda nada, y consulta el historial.

export interface PersonaDeVersion {
  relacionId: string;
  dni: string;
  nombre: string;
  subtotalCentimos: number;
  lineas: LineaDeBorrador[];
  bases: BasesPorDevengue[];
}

/** Regla legal vigente cuando se calculó la versión. */
export interface ReglaUsada {
  codigo: CodigoDeReglaLegal;
  valor: number;
  vigenteDesde: string;
  fuenteOficial: string;
  activadaPorId: string;
  activadaPor: string;
}

/** Revisión de asistencia de la que salen los hechos de la versión. */
export interface RevisionUsada {
  periodoId: string;
  revisionId: string | null;
  numero: number | null;
  inicio: string;
  fin: string;
}

/** Estado de un tipo de fuente externa al calcular la versión. */
export interface FuenteUsada {
  tipoDeFuente: CodigoDeTipoDeFuente;
  nombre: string;
  estado: "Confirmada" | "Pendiente";
  filas: number;
  totalCentimos: number;
}

export interface VersionDePago {
  mesDePago: string;
  numero: number;
  finalizadaPorId: string;
  finalizadaPor: string;
  finalizadaEn: Date;
  reglas: ReglaUsada[];
  revisiones: RevisionUsada[];
  fuentes: FuenteUsada[];
  subtotalCentimos: number;
  personas: PersonaDeVersion[];
}

export type NuevaVersionDePago = Omit<VersionDePago, "numero" | "subtotalCentimos">;

export interface RepositorioDeVersiones {
  /** Guarda la versión completa o nada, con el siguiente número del mes. */
  guardarVersion(nueva: NuevaVersionDePago): Promise<VersionDePago>;
  /** Las versiones del mes, de la más antigua a la más reciente. */
  listarVersiones(mes: string): Promise<VersionDePago[]>;
  buscarVersion(mes: string, numero: number): Promise<VersionDePago | undefined>;
}

export interface DependenciasDeFinalizacion {
  fuentes: FuentesDelBorrador;
  versiones: RepositorioDeVersiones;
  /** Constancias del pago realizado (#130): finalizar consulta si el mes ya se pagó; confirmar el pago las guarda. */
  pago: RepositorioDeConstancias;
  ahora: () => Date;
}

/** Solo Finanzas opera Pagos; el servidor decide aquí, antes de leer importes (ADR 0007, #96 historia 2). Sin sesión tampoco hay permiso. */
export function exigirFinanzas(actor: Actor | undefined): asserts actor is Actor {
  exigir(actor !== undefined && puedeGestionarPagos(actor), MENSAJE_SIN_PERMISO);
}

const MENSAJE_SIN_PERSONAS = "Este mes no incluye personas";
export const MENSAJE_SIN_PERMISO = "No tiene permiso para consultar ni editar Pagos.";
export const MENSAJE_DE_ERROR_AL_GUARDAR = "No se guardó ninguna versión";
export const MENSAJE_DE_PAGO_CONFIRMADO = "Este mes ya tiene su pago realizado confirmado; no admite una nueva versión.";
/** Los únicos errores pensados para mostrarse a Finanzas; cualquier otro es un detalle técnico que la pantalla no debe filtrar. */
export const MENSAJES_PARA_FINANZAS: readonly string[] = [MENSAJE_SIN_PERMISO, MENSAJE_DE_PAGO_CONFIRMADO, MENSAJE_DE_ERROR_AL_GUARDAR];

/** Qué impide finalizar: los bloqueos del mes y los de cada persona bloqueada. */
export interface BloqueosDeFinalizacion {
  /** Igual al «N» del panel «Bloqueos del mes (N)»: bloqueos del mes más personas bloqueadas. */
  total: number;
  delMes: string[];
  porPersona: Array<{ dni: string; nombre: string; bloqueos: string[] }>;
}

/** Lo que Finanzas revisó: la entrada completa del cálculo (como huella) y los subtotales que vio, para explicar qué cambió. */
export interface HuellaDeRevision {
  entrada: string;
  /** Huella de cada tipo de dato de la entrada, para decir qué cambió. */
  datos: Record<string, string>;
  subtotalCentimos: number;
  personas: Array<{ dni: string; nombre: string; subtotalCentimos: number | null }>;
}

export interface ResumenDeCambio {
  /** Tipos de dato de entrada que cambiaron (reglas legales, condiciones laborales, asistencia…), aunque el subtotal no varíe. */
  datosCambiados: string[];
  subtotalAnteriorCentimos: number;
  subtotalActualCentimos: number;
  /** Personas cuyo subtotal difiere entre lo revisado y lo actual; null si no existía en uno de los dos. */
  personas: Array<{ dni: string; nombre: string; anteriorCentimos: number | null; actualCentimos: number | null }>;
}

export type ResultadoDeFinalizacion =
  | { estado: "finalizada"; version: VersionDePago }
  | { estado: "cambio"; resumen: ResumenDeCambio }
  | { estado: "sin_personas"; mensaje: string }
  | { estado: "bloqueado"; bloqueos: BloqueosDeFinalizacion };

export type BorradorPreparado = Awaited<ReturnType<typeof prepararBorrador>>;

/** Lo que impide finalizar el borrador; undefined si el mes se puede finalizar. */
function impedimentoDe(borrador: BorradorPreparado): Extract<ResultadoDeFinalizacion, { estado: "sin_personas" | "bloqueado" }> | undefined {
  if (borrador.personas.length === 0) return { estado: "sin_personas", mensaje: MENSAJE_SIN_PERSONAS };
  const delMes = borrador.bloqueosDelMes;
  const porPersona = borrador.personas.filter(({ bloqueos }) => bloqueos.length > 0).map(({ relacion, bloqueos }) => ({ dni: relacion.dni, nombre: relacion.nombre, bloqueos }));
  if (delMes.length === 0 && porPersona.length === 0) return undefined;
  return { estado: "bloqueado", bloqueos: { total: delMes.length + porPersona.length, delMes, porPersona } };
}

/** Lo que el diálogo de confirmación le dice a Finanzas antes de guardar. */
export interface AlcanceDeFinalizacion {
  personas: number;
  subtotalCentimos: number;
  numeroDeVersion: number;
  periodos: Array<{ inicio: string; fin: string }>;
}

export type ResultadoDeEvaluacion = Exclude<ResultadoDeFinalizacion, { estado: "finalizada" | "cambio" }> & { huella: HuellaDeRevision }
  | { estado: "lista"; alcance: AlcanceDeFinalizacion; huella: HuellaDeRevision };

/** JSON con claves ordenadas y fechas en ISO: la misma entrada da siempre el mismo texto. */
function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  if (valor instanceof Date) return JSON.stringify(valor.toISOString());
  if (valor !== null && typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;
    return `{${Object.keys(objeto).sort().filter((clave) => objeto[clave] !== undefined).map((clave) => `${JSON.stringify(clave)}:${canonico(objeto[clave])}`).join(",")}}`;
  }
  return JSON.stringify(valor) ?? "null";
}

const resumirTexto = (texto: string) => createHash("sha256").update(texto).digest("hex");

/** Las listas leídas de la base pueden llegar en otro orden sin que el dato cambie: se ordenan por su texto canónico antes de resumirlas. */
function enOrdenEstable(valor: unknown): unknown {
  if (!Array.isArray(valor)) return valor;
  return valor.map((elemento) => [canonico(elemento), elemento] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, elemento]) => elemento);
}

/** Cada tipo de dato de la entrada del cálculo y los campos de `EntradaDeBorrador` que lo forman. */
const DATOS_DE_LA_ENTRADA: Record<string, Array<keyof BorradorPreparado["entrada"]>> = {
  "Relaciones laborales": ["relaciones"],
  "Condiciones laborales": ["condiciones"],
  "Reglas legales": ["reglas"],
  "Asistencia": ["corte", "problemasDelCorte", "revisiones", "hechosPorDni", "hechosDeOrigenPorDni", "diasDeVacaciones", "vacacionesProvisionales"],
  "Descansos y feriados": ["sustitutorios"],
  "Clasificaciones de goce": ["clasificacionesDeGoce"],
  "Fuentes externas": ["importes", "abonosVacacionales", "fuentesPendientes", "conciliacionConfirmada"],
};

function huellaDe(borrador: BorradorPreparado): HuellaDeRevision {
  return {
    entrada: resumirTexto(canonico(Object.fromEntries(Object.entries(borrador.entrada).map(([campo, valor]) => [campo, enOrdenEstable(valor)])))),
    datos: Object.fromEntries(Object.entries(DATOS_DE_LA_ENTRADA).map(([dato, campos]) => [dato, resumirTexto(canonico(campos.map((campo) => enOrdenEstable(borrador.entrada[campo]))))])),
    subtotalCentimos: borrador.netoCalculadoCentimos,
    personas: borrador.personas.map(({ relacion, netoCentimos }) => ({ dni: relacion.dni, nombre: relacion.nombre, subtotalCentimos: netoCentimos })),
  };
}

function resumenDelCambio(anterior: HuellaDeRevision, actual: HuellaDeRevision): ResumenDeCambio {
  const conSubtotal = (huella: HuellaDeRevision, dni: string) => huella.personas.find((persona) => persona.dni === dni)?.subtotalCentimos ?? null;
  const personas = [...new Map([...anterior.personas, ...actual.personas].map((persona) => [persona.dni, persona])).values()]
    .map(({ dni, nombre }) => ({ dni, nombre, anteriorCentimos: conSubtotal(anterior, dni), actualCentimos: conSubtotal(actual, dni) }))
    .filter(({ anteriorCentimos, actualCentimos }) => anteriorCentimos !== actualCentimos);
  const datosCambiados = Object.keys(actual.datos).filter((dato) => actual.datos[dato] !== anterior.datos[dato]);
  return { datosCambiados, subtotalAnteriorCentimos: anterior.subtotalCentimos, subtotalActualCentimos: actual.subtotalCentimos, personas };
}

/** Alcance y huella de un borrador ya preparado, sin volver a leer los datos: la pantalla usa el mismo borrador y las mismas versiones que muestra, así la huella que Finanzas confirma es la de lo que vio (ADR 0014). */
export function evaluarBorradorPreparado(borrador: BorradorPreparado, guardadas: ReadonlyArray<{ numero: number }>): ResultadoDeEvaluacion {
  const huella = huellaDe(borrador);
  const impedimento = impedimentoDe(borrador);
  if (impedimento) return { ...impedimento, huella };
  return { estado: "lista", huella, alcance: { personas: borrador.personas.length, subtotalCentimos: borrador.netoCalculadoCentimos,
    numeroDeVersion: Math.max(0, ...guardadas.map(({ numero }) => numero)) + 1, periodos: borrador.revisiones.map(({ inicio, fin }) => ({ inicio, fin })) } };
}

export async function evaluarFinalizacion(dependencias: DependenciasDeFinalizacion, actor: Actor | undefined, solicitud: { mes: string }): Promise<ResultadoDeEvaluacion> {
  exigirFinanzas(actor);
  return evaluarBorradorPreparado(await prepararBorrador(dependencias.fuentes, solicitud.mes), await dependencias.versiones.listarVersiones(solicitud.mes));
}

/** Sin bloqueos toda persona tiene su subtotal; si faltara, guardar un cero escondería un error del cálculo. */
function subtotalDe(nombre: string, netoCentimos: number | null): number {
  if (netoCentimos === null) throw new Error(`Inconsistencia del cálculo: ${nombre} no tiene subtotal ni bloqueos.`);
  return netoCentimos;
}

export async function finalizarMes(dependencias: DependenciasDeFinalizacion, actor: Actor | undefined, solicitud: { mes: string; huella: HuellaDeRevision }): Promise<ResultadoDeFinalizacion> {
  exigirFinanzas(actor);
  if (await dependencias.pago.mesConPagoConfirmado(solicitud.mes)) throw new Error(MENSAJE_DE_PAGO_CONFIRMADO);
  const borrador = await prepararBorrador(dependencias.fuentes, solicitud.mes);
  const impedimento = impedimentoDe(borrador);
  if (impedimento) return impedimento;
  const huella = huellaDe(borrador);
  if (huella.entrada !== solicitud.huella.entrada) return { estado: "cambio", resumen: resumenDelCambio(solicitud.huella, huella) };
  const version = await dependencias.versiones.guardarVersion({
    mesDePago: solicitud.mes, finalizadaPorId: actor.id, finalizadaPor: actor.nombreUsuario ?? actor.id, finalizadaEn: dependencias.ahora(),
    reglas: borrador.entrada.reglas.map(({ codigo, valor, vigenteDesde, fuenteOficial, activadaPorId, activadaPor }) => ({ codigo, valor, vigenteDesde, fuenteOficial, activadaPorId, activadaPor })),
    revisiones: borrador.revisiones.map(({ periodoId, revisionId, numero, inicio, fin }) => ({ periodoId, revisionId, numero, inicio, fin })),
    fuentes: borrador.fuentes.map(({ codigo, nombre, estado, filas }) => ({ tipoDeFuente: codigo, nombre, estado, filas,
      totalCentimos: borrador.entrada.importes.filter(({ tipoDeFuente }) => tipoDeFuente === codigo).reduce((suma, { monto }) => suma + monto, 0) })),
    personas: borrador.personas.map(({ relacion, netoCentimos, lineas, basesPorDevengue }) => ({
      relacionId: relacion.id, dni: relacion.dni, nombre: relacion.nombre, subtotalCentimos: subtotalDe(relacion.nombre, netoCentimos), lineas, bases: basesPorDevengue })),
  }).catch((error: unknown) => { throw new Error(MENSAJE_DE_ERROR_AL_GUARDAR, { cause: error }); });
  return { estado: "finalizada", version };
}

/** Una fila del historial de versiones del mes. */
export interface ResumenDeVersion {
  numero: number;
  finalizadaPorId: string;
  finalizadaPor: string;
  finalizadaEn: Date;
  /** La más reciente rige; las anteriores quedan reemplazadas sin modificarse. */
  estado: "Vigente" | "Reemplazada" | "Pago realizado confirmado";
  /** Solo la versión que Finanzas confirmó como pagada: cuándo se pagó y quién lo confirmó. */
  pago?: { fechaDelPago: string; responsable: string };
  personas: number;
  subtotalCentimos: number;
}

/** El historial del mes, de la versión más reciente a la más antigua. */
export async function listarVersiones(dependencias: DependenciasDeFinalizacion, actor: Actor | undefined, mes: string): Promise<ResumenDeVersion[]> {
  exigirFinanzas(actor);
  const versiones = [...await dependencias.versiones.listarVersiones(mes)].sort((a, b) => b.numero - a.numero);
  const constancia = await dependencias.pago.buscar(mes);
  return versiones.map((version, indice) => {
    const pagada = constancia?.numeroDeVersion === version.numero;
    return { numero: version.numero, finalizadaPorId: version.finalizadaPorId, finalizadaPor: version.finalizadaPor,
      finalizadaEn: version.finalizadaEn, estado: pagada ? "Pago realizado confirmado" : indice === 0 ? "Vigente" : "Reemplazada",
      ...(pagada ? { pago: { fechaDelPago: constancia.fechaDelPago, responsable: constancia.confirmadaPor } } : {}),
      personas: version.personas.length, subtotalCentimos: version.subtotalCentimos };
  });
}

/** Una versión completa del mes, o undefined si no existe en ese mes. */
export async function consultarVersion(dependencias: DependenciasDeFinalizacion, actor: Actor | undefined, mes: string, numero: number): Promise<VersionDePago | undefined> {
  exigirFinanzas(actor);
  return dependencias.versiones.buscarVersion(mes, numero);
}
