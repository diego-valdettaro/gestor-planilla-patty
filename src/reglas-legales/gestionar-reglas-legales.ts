import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeGestionarPagos } from "@/autenticacion/permisos";
import { validarFechaDeRelacion } from "@/relaciones-laborales/gestionar-relaciones-laborales";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";

import { REGLAS_LEGALES, buscarDefinicion, type CodigoDeReglaLegal, type DefinicionDeReglaLegal } from "./catalogo";
import { interpretarValorLegal } from "./valores";
import { armarHistorial, reglaVigenteEn, type EntradaDeHistorial, type ReglaLegal } from "./vigencia";

export type { EntradaDeHistorial, ReglaLegal } from "./vigencia";

/** Versión finalizada de un mes de pago que aplicó una regla (`mes` es AAAA-MM). */
export interface VersionFinalizada {
  mes: string;
  numero: number;
}

export interface NuevaReglaLegal {
  codigo: CodigoDeReglaLegal;
  valor: number;
  vigenteDesde: string;
  fuenteOficial: string;
  responsableId: string;
}

/** Operaciones sobre las reglas de un código; dentro de `ejecutarSobreCodigo` corren en una transacción con el código bloqueado. */
export interface AlmacenDeReglasLegales {
  /** Todas las reglas del código, también las reemplazadas. */
  listar(codigo: CodigoDeReglaLegal): Promise<ReglaLegal[]>;
  buscar(id: string): Promise<ReglaLegal | undefined>;
  /** undefined si el código ya tiene una regla activa con esa vigencia. */
  insertar(regla: NuevaReglaLegal): Promise<ReglaLegal | undefined>;
  /** false si ya estaba reemplazada. */
  reemplazar(id: string, motivo: string, reemplazadaEn: Date): Promise<boolean>;
}

export interface RepositorioDeReglasLegales extends AlmacenDeReglasLegales {
  listarTodas(): Promise<ReglaLegal[]>;
  /**
   * Versiones finalizadas de Pagos que aplicaron esta regla. Pagos todavía no finaliza versiones: el ticket de
   * finalización debe implementar esta consulta, que hoy no devuelve nada.
   */
  versionesFinalizadasQueUsan(reglaId: string): Promise<VersionFinalizada[]>;
  /** Serializa las operaciones de un mismo código para que dos activaciones simultáneas no se pisen. */
  ejecutarSobreCodigo<T>(codigo: CodigoDeReglaLegal, operacion: (almacen: AlmacenDeReglasLegales) => Promise<T>): Promise<T>;
}

/** Una regla vigente en la fecha, o su falta dicha de forma explícita: Pagos bloquea con ella, no la trata como cero. */
export type ConsultaDeReglaVigente =
  | { estado: "vigente"; regla: ReglaLegal }
  | { estado: "faltante"; codigo: CodigoDeReglaLegal; fecha: string };

export interface FilaDeReglaLegal {
  definicion: DefinicionDeReglaLegal;
  /** Versión que rige hoy; undefined si todavía no hay ninguna (Pendiente). */
  vigente: ReglaLegal | undefined;
  /** Primera versión programada para después de hoy, si la hay. */
  proxima: ReglaLegal | undefined;
}

export interface HistorialDeReglaLegal {
  definicion: DefinicionDeReglaLegal;
  historial: EntradaDeHistorial[];
  vigente: ReglaLegal | undefined;
  /** Reglas activas que una versión finalizada ya usa: solo se corrigen con un ajuste de preliquidación. */
  usadasPorVersiones: Record<string, VersionFinalizada[]>;
}

const MAXIMO_DE_CARACTERES_DEL_MOTIVO = 250;
const MAXIMO_DE_CARACTERES_DE_LA_FUENTE = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirPermiso(actor: Actor): void {
  exigir(puedeGestionarPagos(actor), "No tiene permiso para consultar ni editar Pagos.");
}

function exigirDefinicion(codigo: string): DefinicionDeReglaLegal {
  const definicion = buscarDefinicion(codigo);
  if (!definicion) throw new Error("Elija el valor legal de la lista.");
  return definicion;
}

function exigirFuente(texto: string): string {
  const fuente = texto.trim();
  if (!fuente) throw new Error("Indique la fuente oficial: la norma o el enlace del que sale el valor.");
  if (fuente.length > MAXIMO_DE_CARACTERES_DE_LA_FUENTE) throw new Error(`La fuente oficial no puede superar ${MAXIMO_DE_CARACTERES_DE_LA_FUENTE} caracteres.`);
  return fuente;
}

/** «Lo usa la versión 2 de 09/2026; corríjalo con un ajuste de preliquidación.» */
export function textoDeUsoEnVersiones(versiones: VersionFinalizada[]): string {
  const detalle = versiones.map(({ numero, mes }) => `la versión ${numero} de ${mes.slice(5, 7)}/${mes.slice(0, 4)}`).join(" y ");
  return `Lo usa ${detalle}; corríjalo con un ajuste de preliquidación.`;
}

/**
 * Activa un valor legal desde `vigenteDesde` con su fuente oficial; el actor queda como responsable. No modifica ninguna
 * versión existente: la anterior deja de regir el día previo y su historia queda intacta. La vigencia puede ser anterior
 * a la última para cargar historia, pero no repetir la de una versión activa (para esa fecha se usa «Corregir»).
 * `valor` es el texto del formulario.
 */
export async function activarReglaLegal(
  repositorio: RepositorioDeReglasLegales,
  actor: Actor,
  solicitud: { codigo: string; valor: string; vigenteDesde: string; fuenteOficial: string },
): Promise<ReglaLegal> {
  exigirPermiso(actor);
  const definicion = exigirDefinicion(solicitud.codigo);
  validarFechaDeRelacion(solicitud.vigenteDesde, "inicio de la vigencia");
  const valor = interpretarValorLegal(definicion.unidad, solicitud.valor);
  const fuenteOficial = exigirFuente(solicitud.fuenteOficial);
  const rechazoPorVigencia = new Error(`${definicion.nombre} ya tiene un valor desde el ${formatearFechaDeRelacion(solicitud.vigenteDesde)}. Para cambiar ese valor use «Corregir»; un valor nuevo debe empezar en otra fecha.`);

  return repositorio.ejecutarSobreCodigo(definicion.codigo, async (almacen) => {
    const registrada = await almacen.insertar({ codigo: definicion.codigo, valor, vigenteDesde: solicitud.vigenteDesde, fuenteOficial, responsableId: actor.id });
    if (!registrada) throw rechazoPorVigencia;
    return registrada;
  });
}

/**
 * Corrige un valor ya activado: la versión anterior queda «Reemplazada» con su motivo y otra ocupa la misma vigencia.
 * Si no se indica otra fuente oficial se conserva la anterior. Solo si ninguna versión finalizada la usó; si la usó, se
 * corrige con un ajuste de preliquidación.
 */
export async function corregirReglaLegal(
  repositorio: RepositorioDeReglasLegales,
  actor: Actor,
  solicitud: { reglaId: string; valor: string; fuenteOficial?: string; motivo: string },
): Promise<ReglaLegal> {
  exigirPermiso(actor);
  const motivo = solicitud.motivo.trim();
  if (!motivo) throw new Error("Escriba el motivo de la corrección.");
  if (motivo.length > MAXIMO_DE_CARACTERES_DEL_MOTIVO) throw new Error(`El motivo no puede superar ${MAXIMO_DE_CARACTERES_DEL_MOTIVO} caracteres.`);
  const anterior = UUID.test(solicitud.reglaId) ? await repositorio.buscar(solicitud.reglaId) : undefined;
  if (!anterior) throw new Error("No existe ese valor.");
  const definicion = exigirDefinicion(anterior.codigo);
  const valor = interpretarValorLegal(definicion.unidad, solicitud.valor);
  const fuenteOficial = solicitud.fuenteOficial?.trim() ? exigirFuente(solicitud.fuenteOficial) : anterior.fuenteOficial;
  if (valor === anterior.valor && fuenteOficial === anterior.fuenteOficial) throw new Error("El valor y la fuente son iguales a los registrados: no hay nada que corregir.");

  return repositorio.ejecutarSobreCodigo(anterior.codigo, async (almacen) => {
    const vigente = await almacen.buscar(anterior.id);
    if (!vigente || vigente.reemplazadaEn !== null) throw new Error("Ese valor ya fue reemplazado. Recargue la página para ver el valor vigente.");
    const versiones = await repositorio.versionesFinalizadasQueUsan(vigente.id);
    if (versiones.length) throw new Error(textoDeUsoEnVersiones(versiones));
    if (!(await almacen.reemplazar(vigente.id, motivo, new Date()))) throw new Error("Ese valor ya fue reemplazado. Recargue la página para ver el valor vigente.");
    const nueva = await almacen.insertar({ codigo: vigente.codigo, valor, vigenteDesde: vigente.vigenteDesde, fuenteOficial, responsableId: actor.id });
    if (!nueva) throw new Error("No se pudo registrar el valor corregido.");
    return nueva;
  });
}

function agruparPorCodigo(reglas: ReglaLegal[]): Map<string, ReglaLegal[]> {
  const porCodigo = new Map<string, ReglaLegal[]>();
  for (const regla of reglas) porCodigo.set(regla.codigo, [...(porCodigo.get(regla.codigo) ?? []), regla]);
  return porCodigo;
}

/** Una fila por valor legal del catálogo, con la versión que rige en `hoy` o su falta («Pendiente»). */
export async function listarReglasLegales(
  repositorio: RepositorioDeReglasLegales,
  actor: Actor,
  consulta: { hoy: string },
): Promise<FilaDeReglaLegal[]> {
  exigirPermiso(actor);
  validarFechaDeRelacion(consulta.hoy, "hoy");
  const porCodigo = agruparPorCodigo(await repositorio.listarTodas());
  return REGLAS_LEGALES.map((definicion): FilaDeReglaLegal => {
    const reglas = porCodigo.get(definicion.codigo) ?? [];
    const proxima = reglas.filter((regla) => regla.reemplazadaEn === null && regla.vigenteDesde > consulta.hoy).sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))[0];
    return { definicion, vigente: reglaVigenteEn(reglas, consulta.hoy), proxima };
  });
}

/** Historial de un valor legal; undefined si el código no existe en el catálogo. */
export async function consultarHistorialDeRegla(
  repositorio: RepositorioDeReglasLegales,
  actor: Actor,
  codigo: string,
  hoy: string,
): Promise<HistorialDeReglaLegal | undefined> {
  exigirPermiso(actor);
  validarFechaDeRelacion(hoy, "hoy");
  const definicion = buscarDefinicion(codigo);
  if (!definicion) return undefined;
  const reglas = await repositorio.listar(definicion.codigo);
  const usadasPorVersiones: Record<string, VersionFinalizada[]> = {};
  for (const { id } of reglas.filter((regla) => regla.reemplazadaEn === null)) {
    const versiones = await repositorio.versionesFinalizadasQueUsan(id);
    if (versiones.length) usadasPorVersiones[id] = versiones;
  }
  return { definicion, historial: armarHistorial(reglas, hoy), vigente: reglaVigenteEn(reglas, hoy), usadasPorVersiones };
}

/** La versión vigente de un valor legal en `fecha`, o su falta explícita si no hay ninguna (nunca cero). */
export async function consultarReglaVigente(
  repositorio: RepositorioDeReglasLegales,
  actor: Actor,
  codigo: string,
  fecha: string,
): Promise<ConsultaDeReglaVigente> {
  exigirPermiso(actor);
  validarFechaDeRelacion(fecha, "la consulta");
  const definicion = exigirDefinicion(codigo);
  const regla = reglaVigenteEn(await repositorio.listar(definicion.codigo), fecha);
  return regla ? { estado: "vigente", regla } : { estado: "faltante", codigo: definicion.codigo, fecha };
}
