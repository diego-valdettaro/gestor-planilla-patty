import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeGestionarPagos } from "@/autenticacion/permisos";
import { validarDni } from "@/colaboradores/registrar-colaborador";
import { buscarConcepto } from "@/conceptos-de-preliquidacion/catalogo";
import { validarFechaDeRelacion } from "@/relaciones-laborales/gestionar-relaciones-laborales";

import type { ClaveDeImporte } from "./duplicados";
import { TIPOS_DE_FUENTE, buscarTipoDeFuente, type CodigoDeTipoDeFuente, type TipoDeFuente } from "./tipos-de-fuente";
import { PROCEDENCIA_CARGA_MANUAL, formatearMes, interpretarMonto, validarMes } from "./valores";

export interface ImporteExterno extends ClaveDeImporte {
  id: string;
  nombre: string;
  tipoDeFuente: CodigoDeTipoDeFuente;
  procedencia: string;
  registradoPorId: string;
  registradoPor: string;
  registradoEn: Date;
  /** Un importe anulado queda en el historial con su motivo y ya no cuenta. */
  anuladoEn: Date | null;
  motivoDeAnulacion: string | null;
  /** El archivo fuente de preliquidación del que viene; null en la carga manual. */
  importacionId: string | null;
  estadoDeIncidencia: "sin_sustento" | "en_investigacion" | "descuento_autorizado" | null;
  sustento: string | null;
  autorizadoPor: string | null;
  fechaDeAutorizacion: string | null;
  conceptoAjustado: string | null;
  sentidoAjuste: "suma" | "resta" | null;
  motivoDeAjuste: string | null;
}

/** Conteos de la validación que aprobó un archivo fuente; con todo o nada, un archivo importado no tiene filas con error. */
export interface ConteosDeValidacion {
  filasValidas: number;
  filasConError: number;
  duplicadas: number;
  personasDesconocidas: number;
}

/** Un archivo fuente de preliquidación importado: el XLSX conservado con su hash, responsable, tipo, mes y validación. */
export interface ImportacionDeFuente {
  id: string;
  tipoDeFuente: CodigoDeTipoDeFuente;
  mesDeAplicacion: string;
  archivoNombre: string;
  archivoUbicacion: string;
  archivoHashSha256: string;
  usuarioId: string;
  usuario: string;
  importadaEn: Date;
  filas: number;
  /** Céntimos. */
  total: number;
  validacion: ConteosDeValidacion;
  /** Otro archivo del mismo tipo y mes lo reemplazó; sus importes se anularon. */
  reemplazadaEn: Date | null;
}

export interface NuevaImportacionDeFuente {
  tipoDeFuente: CodigoDeTipoDeFuente;
  mesDeAplicacion: string;
  archivoNombre: string;
  archivoUbicacion: string;
  archivoHashSha256: string;
  usuarioId: string;
  importadaEn: Date;
  filas: number;
  total: number;
  validacion: ConteosDeValidacion;
}

export interface ConfirmacionDeFuente {
  tipoDeFuente: CodigoDeTipoDeFuente;
  mesDeAplicacion: string;
  confirmadaPorId: string;
  confirmadaPor: string;
  confirmadaEn: Date;
}

export interface NuevoImporteExterno extends ClaveDeImporte {
  tipoDeFuente: CodigoDeTipoDeFuente;
  procedencia: string;
  responsableId: string;
  /** El archivo fuente del que viene el importe; ausente en la carga manual. */
  importacionId?: string;
  estadoDeIncidencia?: ImporteExterno["estadoDeIncidencia"];
  conceptoAjustado?: string;
  sentidoAjuste?: ImporteExterno["sentidoAjuste"];
  motivoDeAjuste?: string;
}

/** Operaciones sobre una fuente (tipo y mes de aplicación); dentro de `ejecutarSobreFuente` corren en una transacción con la fuente bloqueada. */
export interface AlmacenDeFuentesExternas {
  /** Importes no anulados de la fuente. */
  listarImportes(tipo: CodigoDeTipoDeFuente, mes: string): Promise<ImporteExterno[]>;
  buscarImporte(id: string): Promise<ImporteExterno | undefined>;
  /** undefined si ya existe un importe no anulado con la misma clave (duplicado). */
  insertarImporte(nuevo: NuevoImporteExterno): Promise<ImporteExterno | undefined>;
  /** false si ya estaba anulado. */
  anularImporte(id: string, motivo: string, anuladoEn: Date): Promise<boolean>;
  cambiarIncidencia(id: string, estado: NonNullable<ImporteExterno["estadoDeIncidencia"]>, sustento?: string, autorizadoPor?: string, fechaDeAutorizacion?: string): Promise<boolean>;
  buscarConfirmacion(tipo: CodigoDeTipoDeFuente, mes: string): Promise<ConfirmacionDeFuente | undefined>;
  /** false si la fuente ya estaba confirmada. */
  confirmar(tipo: CodigoDeTipoDeFuente, mes: string, responsableId: string, confirmadaEn: Date): Promise<boolean>;
  /** false si la fuente estaba pendiente. */
  quitarConfirmacion(tipo: CodigoDeTipoDeFuente, mes: string): Promise<boolean>;
  /** La importación de archivo vigente (no reemplazada) de la fuente, con los importes que conserva sin anular. */
  buscarImportacionVigente(tipo: CodigoDeTipoDeFuente, mes: string): Promise<(ImportacionDeFuente & { importesVigentes: number }) | undefined>;
  insertarImportacion(nueva: NuevaImportacionDeFuente): Promise<ImportacionDeFuente>;
  /** Marca la importación como reemplazada y anula con motivo los importes que aún conserva; devuelve cuántos anuló. */
  reemplazarImportacion(id: string, motivo: string, reemplazadaEn: Date): Promise<number>;
  /** La versión pagada no admite cambios; una versión final aún no pagada permite otra versión sin editar la anterior. */
  mesConPagoConfirmado(mes: string): Promise<boolean>;
  /** «Volver a pendiente» explícito solo se ofrece antes de la primera finalización; cambios de filas sí la invalidan. */
  mesFinalizado(mes: string): Promise<boolean>;
}

export interface RepositorioDeFuentesExternas extends AlmacenDeFuentesExternas {
  buscarPersona(dni: string): Promise<{ nombre: string } | undefined>;
  /** Importes no anulados de todas las fuentes del mes. */
  listarImportesDelMes(mes: string): Promise<ImporteExterno[]>;
  listarConfirmacionesDelMes(mes: string): Promise<ConfirmacionDeFuente[]>;
  /** Serializa las operaciones de una misma fuente para que dos cambios simultáneos no se pisen. */
  ejecutarSobreFuente<T>(tipo: CodigoDeTipoDeFuente, mes: string, operacion: (almacen: AlmacenDeFuentesExternas) => Promise<T>): Promise<T>;
}

export type EstadoDeFuente = "pendiente" | "confirmada_con_importes" | "confirmada_sin_importes";

export const TEXTO_DE_ESTADO: Record<EstadoDeFuente, string> = {
  pendiente: "Pendiente",
  confirmada_con_importes: "Confirmada con importes",
  confirmada_sin_importes: "Confirmada sin importes",
};

export interface FilaDeFuente {
  tipo: TipoDeFuente;
  estado: EstadoDeFuente;
  filas: number;
  /** Céntimos; suma de los importes cargados, sin signo (el signo lo da cada concepto). */
  total: number;
  confirmacion: ConfirmacionDeFuente | undefined;
  /** El importe cargado más reciente: de dónde viene lo último que tiene la fuente. */
  ultimoOrigen: ImporteExterno | undefined;
}

export interface DetalleDeFuente extends FilaDeFuente {
  importes: ImporteExterno[];
}

/** Lo que una fuente aporta a una persona: dato pendiente, o su listado confirmado (vacío = cero confirmado). */
export type ImportesDePersonaEnFuente =
  | { estado: "pendiente" }
  | { estado: "confirmado"; importes: ImporteExterno[]; total: number };

export interface ResultadoDeCambio {
  /** La fuente estaba confirmada y este cambio la devolvió a «Pendiente» (D5). */
  volvioAPendiente: boolean;
}

const MAXIMO_DE_CARACTERES_DEL_MOTIVO = 250;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function exigirPermiso(actor: Actor): void {
  exigir(puedeGestionarPagos(actor), "No tiene permiso para consultar ni editar Pagos.");
}

export function exigirTipo(codigo: string): TipoDeFuente {
  const tipo = buscarTipoDeFuente(codigo);
  if (!tipo) throw new Error("Elija el tipo de fuente de la lista.");
  return tipo;
}

export async function exigirMesAbierto(almacen: AlmacenDeFuentesExternas, mes: string): Promise<void> {
  if (await almacen.mesConPagoConfirmado(mes)) {
    throw new Error(`El mes de pago ${formatearMes(mes)} tiene el pago realizado confirmado: sus fuentes externas no admiten cambios.`);
  }
}

/** Validación compartida por carga manual, incidencias y ajustes antes de entrar en la transacción de la fuente. */
export async function validarDatosDeImporte(repositorio: RepositorioDeFuentesExternas, datos: Pick<ClaveDeImporte, "dni" | "fechaDelHecho" | "mesDeDevengue" | "mesDeAplicacion"> & { monto: string }): Promise<{ monto: number; nombre: string }> {
  validarDni(datos.dni);
  validarFechaDeRelacion(datos.fechaDelHecho, "la fecha del hecho");
  validarMes(datos.mesDeDevengue, "mes de devengue");
  validarMes(datos.mesDeAplicacion, "mes de aplicación");
  const monto = interpretarMonto(datos.monto);
  const persona = await repositorio.buscarPersona(datos.dni);
  if (!persona) throw new Error(`No existe una persona con DNI ${datos.dni}.`);
  return { monto, nombre: persona.nombre };
}

function sumar(importes: ImporteExterno[]): number {
  return importes.reduce((total, importe) => total + importe.monto, 0);
}

function estadoDe(confirmacion: ConfirmacionDeFuente | undefined, filas: number): EstadoDeFuente {
  if (!confirmacion) return "pendiente";
  return filas ? "confirmada_con_importes" : "confirmada_sin_importes";
}

function armarFila(tipo: TipoDeFuente, importes: ImporteExterno[], confirmacion: ConfirmacionDeFuente | undefined): FilaDeFuente {
  const ultimoOrigen = [...importes].sort((a, b) => b.registradoEn.getTime() - a.registradoEn.getTime())[0];
  const sumables = tipo.codigo === "incidencias_de_tienda" ? importes.filter((importe) => importe.estadoDeIncidencia === "descuento_autorizado") : importes;
  return { tipo, estado: estadoDe(confirmacion, importes.length), filas: importes.length, total: sumar(sumables), confirmacion, ultimoOrigen };
}

/** Cambiar las filas de una fuente confirmada la devuelve a «Pendiente»: el listado dejó de ser el que se confirmó. */
async function devolverAPendienteSiEstabaConfirmada(almacen: AlmacenDeFuentesExternas, tipo: CodigoDeTipoDeFuente, mes: string): Promise<ResultadoDeCambio> {
  return { volvioAPendiente: await almacen.quitarConfirmacion(tipo, mes) };
}

/**
 * Carga a mano un importe externo de una fuente. Solo los conceptos de fuente externa de ese tipo se cargan: una línea
 * calculada (hora extra, tardanza…) se corrige en su fuente y un ajuste tiene su propio flujo; Finanzas no edita líneas
 * calculadas. Un importe duplicado se rechaza. `monto` es el texto del formulario; el mes de aplicación es el mes de pago.
 */
export async function registrarImporte(
  repositorio: RepositorioDeFuentesExternas,
  actor: Actor,
  solicitud: { tipoDeFuente: string; dni: string; concepto: string; fechaDelHecho: string; mesDeDevengue: string; mesDeAplicacion: string; monto: string },
): Promise<ResultadoDeCambio & { importe: ImporteExterno }> {
  exigirPermiso(actor);
  const tipo = exigirTipo(solicitud.tipoDeFuente);
  if (tipo.flujoPropio) throw new Error(`${tipo.nombre} se registra en su formulario propio.`);
  const concepto = buscarConcepto(solicitud.concepto);
  if (!concepto) throw new Error("Elija el concepto de la lista.");
  if (concepto.origen === "calculado") {
    throw new Error(`${concepto.nombre} es una línea calculada: no se carga a mano. Se corrige en su fuente (la asistencia o las reglas) o con un ajuste de preliquidación.`);
  }
  if (concepto.origen === "ajuste" || !tipo.conceptos.includes(concepto.codigo)) {
    throw new Error(`${concepto.nombre} no se carga en ${tipo.nombre}. Elija un concepto de este tipo de fuente; las correcciones se registran como ajuste de preliquidación.`);
  }
  const { monto, nombre } = await validarDatosDeImporte(repositorio, solicitud);

  return repositorio.ejecutarSobreFuente(tipo.codigo, solicitud.mesDeAplicacion, async (almacen) => {
    await exigirMesAbierto(almacen, solicitud.mesDeAplicacion);
    const importe = await almacen.insertarImporte({
      tipoDeFuente: tipo.codigo, dni: solicitud.dni, concepto: concepto.codigo, fechaDelHecho: solicitud.fechaDelHecho,
      mesDeDevengue: solicitud.mesDeDevengue, mesDeAplicacion: solicitud.mesDeAplicacion, monto,
      procedencia: PROCEDENCIA_CARGA_MANUAL, responsableId: actor.id,
    });
    if (!importe) throw new Error(`Ya existe ese importe: ${nombre} (${solicitud.dni}) tiene ${concepto.nombre} con la misma fecha del hecho, mes de devengue, mes de aplicación y monto. No se carga dos veces.`);
    return { importe, ...(await devolverAPendienteSiEstabaConfirmada(almacen, tipo.codigo, solicitud.mesDeAplicacion)) };
  });
}

/** Anula un importe con motivo (conserva su historial). Es la forma de corregir una fuente: anular y volver a registrar. */
export async function anularImporte(
  repositorio: RepositorioDeFuentesExternas,
  actor: Actor,
  solicitud: { importeId: string; motivo: string },
): Promise<ResultadoDeCambio> {
  exigirPermiso(actor);
  const motivo = solicitud.motivo.trim();
  if (!motivo) throw new Error("Escriba el motivo de la anulación.");
  if (motivo.length > MAXIMO_DE_CARACTERES_DEL_MOTIVO) throw new Error(`El motivo no puede superar ${MAXIMO_DE_CARACTERES_DEL_MOTIVO} caracteres.`);
  const importe = UUID.test(solicitud.importeId) ? await repositorio.buscarImporte(solicitud.importeId) : undefined;
  if (!importe) throw new Error("No existe ese importe.");

  return repositorio.ejecutarSobreFuente(importe.tipoDeFuente, importe.mesDeAplicacion, async (almacen) => {
    await exigirMesAbierto(almacen, importe.mesDeAplicacion);
    if (!(await almacen.anularImporte(importe.id, motivo, new Date()))) throw new Error("Ese importe ya fue anulado. Recargue la página para ver las filas vigentes.");
    return devolverAPendienteSiEstabaConfirmada(almacen, importe.tipoDeFuente, importe.mesDeAplicacion);
  });
}

/**
 * Confirma el listado del mes de un tipo de fuente como completo para la población aplicable, incluso sin importes.
 * Desde entonces la ausencia de una fila vale cero; antes es dato pendiente.
 */
export async function confirmarFuente(
  repositorio: RepositorioDeFuentesExternas,
  actor: Actor,
  solicitud: { tipoDeFuente: string; mes: string },
): Promise<ConfirmacionDeFuente> {
  exigirPermiso(actor);
  const tipo = exigirTipo(solicitud.tipoDeFuente);
  validarMes(solicitud.mes, "mes de pago");

  return repositorio.ejecutarSobreFuente(tipo.codigo, solicitud.mes, async (almacen) => {
    await exigirMesAbierto(almacen, solicitud.mes);
    if (tipo.codigo === "incidencias_de_tienda" && (await almacen.listarImportes(tipo.codigo, solicitud.mes)).some((importe) => importe.estadoDeIncidencia === "sin_sustento")) {
      throw new Error("Hay incidencias de tienda sin sustento. Autorice el descuento o use «No descontar en este pago» antes de confirmar.");
    }
    if (!(await almacen.confirmar(tipo.codigo, solicitud.mes, actor.id, new Date()))) {
      throw new Error(`${tipo.nombre} de ${formatearMes(solicitud.mes)} ya está confirmada.`);
    }
    const confirmacion = await almacen.buscarConfirmacion(tipo.codigo, solicitud.mes);
    if (!confirmacion) throw new Error("No se pudo confirmar la fuente.");
    return confirmacion;
  });
}

/** Deshace la confirmación (D4), solo antes de finalizar el mes: la fuente vuelve a «Pendiente». */
export async function volverAPendiente(
  repositorio: RepositorioDeFuentesExternas,
  actor: Actor,
  solicitud: { tipoDeFuente: string; mes: string },
): Promise<void> {
  exigirPermiso(actor);
  const tipo = exigirTipo(solicitud.tipoDeFuente);
  validarMes(solicitud.mes, "mes de pago");

  await repositorio.ejecutarSobreFuente(tipo.codigo, solicitud.mes, async (almacen) => {
    await exigirMesAbierto(almacen, solicitud.mes);
    if (await almacen.mesFinalizado(solicitud.mes)) throw new Error("No se puede volver a pendiente un listado de un mes finalizado. Corrija la fuente para crear otra versión.");
    if (!(await almacen.quitarConfirmacion(tipo.codigo, solicitud.mes))) throw new Error(`${tipo.nombre} de ${formatearMes(solicitud.mes)} ya está pendiente.`);
  });
}

/** Una fila por tipo de fuente del catálogo con su estado en el mes de pago. */
export async function consultarEstadoDeFuentes(repositorio: RepositorioDeFuentesExternas, actor: Actor, mes: string): Promise<FilaDeFuente[]> {
  exigirPermiso(actor);
  validarMes(mes, "mes de pago");
  const [importes, confirmaciones] = await Promise.all([repositorio.listarImportesDelMes(mes), repositorio.listarConfirmacionesDelMes(mes)]);
  return TIPOS_DE_FUENTE.map((tipo) => armarFila(tipo, importes.filter((importe) => importe.tipoDeFuente === tipo.codigo), confirmaciones.find((c) => c.tipoDeFuente === tipo.codigo)));
}

/** El estado y las filas no anuladas de una fuente en el mes; undefined si el tipo no existe en el catálogo. */
export async function consultarFuente(repositorio: RepositorioDeFuentesExternas, actor: Actor, tipoDeFuente: string, mes: string): Promise<DetalleDeFuente | undefined> {
  exigirPermiso(actor);
  validarMes(mes, "mes de pago");
  const tipo = buscarTipoDeFuente(tipoDeFuente);
  if (!tipo) return undefined;
  const importes = [...(await repositorio.listarImportes(tipo.codigo, mes))].sort((a, b) => a.dni.localeCompare(b.dni) || a.fechaDelHecho.localeCompare(b.fechaDelHecho));
  return { ...armarFila(tipo, importes, await repositorio.buscarConfirmacion(tipo.codigo, mes)), importes };
}

/**
 * Lo que cada tipo de fuente aporta a una persona en el mes de pago. Es el punto de entrada del cálculo del neto: una fuente
 * pendiente es un dato pendiente (nunca cero); una fuente confirmada sin filas de la persona aporta cero confirmado.
 */
export async function consultarImportesDePersona(
  repositorio: RepositorioDeFuentesExternas,
  actor: Actor,
  dni: string,
  mes: string,
): Promise<Record<CodigoDeTipoDeFuente, ImportesDePersonaEnFuente>> {
  exigirPermiso(actor);
  validarDni(dni);
  validarMes(mes, "mes de pago");
  const [importes, confirmaciones] = await Promise.all([repositorio.listarImportesDelMes(mes), repositorio.listarConfirmacionesDelMes(mes)]);
  const porTipo = {} as Record<CodigoDeTipoDeFuente, ImportesDePersonaEnFuente>;
  for (const tipo of TIPOS_DE_FUENTE) {
    if (!confirmaciones.some((confirmacion) => confirmacion.tipoDeFuente === tipo.codigo)) {
      porTipo[tipo.codigo] = { estado: "pendiente" };
      continue;
    }
    const delTipo = importes.filter((importe) => importe.tipoDeFuente === tipo.codigo && importe.dni === dni && (tipo.codigo !== "incidencias_de_tienda" || importe.estadoDeIncidencia === "descuento_autorizado"));
    porTipo[tipo.codigo] = { estado: "confirmado", importes: delTipo, total: sumar(delTipo) };
  }
  return porTipo;
}
