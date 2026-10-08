// Importación de un archivo fuente de preliquidación (issue #119, ADR 0009 y 0005): un XLSX normalizado aporta los importes
// externos de un tipo de fuente para el mes de pago. Es todo o nada: con un solo error no se importa ninguna fila, no se conserva
// el archivo ni queda registro. Importar otro archivo del mismo tipo y mes reemplaza al anterior y devuelve la fuente a «Pendiente».
import { createHash } from "node:crypto";

import type { Actor } from "@/autenticacion/permisos";
import { buscarConcepto, CONCEPTOS, type ConceptoDePreliquidacion } from "@/conceptos-de-preliquidacion/catalogo";
import { fechaDeHoyEnLima } from "@/condiciones-laborales/vigencia";
import type { ArchivoFuente } from "@/importaciones/importar-semana-por-sede";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";

import { claveDeImporte, posicionesDuplicadas } from "./duplicados";
import {
  exigirMesAbierto,
  exigirPermiso,
  exigirTipo,
  type AlmacenDeFuentesExternas,
  type ConteosDeValidacion,
  type ImportacionDeFuente,
  type RepositorioDeFuentesExternas,
} from "./gestionar-fuentes-externas";
import { parsearArchivoDeFuente, type ErrorDeFilaDeFuente, type FilaDeArchivoDeFuente } from "./parsear-archivo-de-fuente";
import type { TipoDeFuente } from "./tipos-de-fuente";
import { formatearMes, hashAbreviado, procedenciaDeArchivo, validarMes } from "./valores";

export interface ResumenDeValidacion extends ConteosDeValidacion {
  /** Céntimos; suma solo de las filas válidas. */
  total: number;
}

export interface SolicitudDeImportacionDeFuente {
  tipoDeFuente: string;
  /** Mes de pago (AAAA-MM): es el mes de aplicación de todos los importes del archivo. */
  mes: string;
  nombre: string;
  contenido: Uint8Array;
}

/** Dónde se conserva el archivo original (ADR 0005); en producción, almacenamiento de archivos fuera del directorio público. */
export interface AlmacenamientoDeArchivos {
  conservar(nombre: string, contenido: Uint8Array): Promise<ArchivoFuente>;
  descartar(archivo: ArchivoFuente): Promise<void>;
}

export interface VistaPreviaDeImportacionDeFuente {
  /** El archivo entero se rechaza: no se puede leer o ya se importó. Sin vista previa por fila. */
  errorDelArchivo?: string;
  errores: ErrorDeFilaDeFuente[];
  resumen: ResumenDeValidacion;
  hashSha256: string;
  /** La importación vigente que este archivo reemplazaría. */
  reemplaza?: ImportacionDeFuente & { importesVigentes: number };
}

export class ErroresDeImportacionDeFuente extends Error {
  constructor(readonly errores: ErrorDeFilaDeFuente[], readonly resumen: ResumenDeValidacion) {
    super("El archivo tiene errores: no se importó ninguna fila.");
  }
}

export interface ResultadoDeImportacionDeFuente {
  importacion: ImportacionDeFuente;
  filas: number;
  /** Céntimos. */
  total: number;
  /** La fuente estaba confirmada y la importación la devolvió a «Pendiente» (D5). */
  volvioAPendiente: boolean;
  /** La importación de archivo anterior que este archivo reemplazó, con cuántos importes anuló. */
  reemplazo: { id: string; archivoNombre: string; importesAnulados: number } | undefined;
}

interface FilaValida extends FilaDeArchivoDeFuente {
  conceptoCodigo: string;
}

interface Evaluacion extends VistaPreviaDeImportacionDeFuente {
  filasValidas: FilaValida[];
}

const MAXIMO_DE_CARACTERES_DEL_NOMBRE_EN_EL_MOTIVO = 150;

function hashDe(contenido: Uint8Array): string {
  return createHash("sha256").update(contenido).digest("hex");
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buscarConceptoEscrito(texto: string): ConceptoDePreliquidacion | undefined {
  const buscado = normalizar(texto);
  return CONCEPTOS.find((concepto) => normalizar(concepto.codigo) === buscado || normalizar(concepto.nombre) === buscado);
}

function listaDeConceptos(tipo: TipoDeFuente): string {
  return tipo.conceptos.flatMap((codigo) => buscarConcepto(codigo) ?? []).map((concepto) => `${concepto.nombre} (${concepto.codigo})`).join(", ");
}

/** Por qué un concepto escrito en el archivo no se puede importar en este tipo de fuente; undefined si se puede. */
function motivoDeConceptoNoImportable(escrito: string, concepto: ConceptoDePreliquidacion | undefined, tipo: TipoDeFuente): string | undefined {
  if (!concepto) return `Concepto desconocido: «${escrito}». Conceptos de ${tipo.nombre}: ${listaDeConceptos(tipo)}.`;
  if (concepto.origen === "calculado") {
    return `${concepto.nombre} es una línea calculada: no se importa. Se corrige en su fuente (la asistencia o las reglas) o con un ajuste de preliquidación.`;
  }
  if (concepto.origen === "ajuste" || !tipo.conceptos.includes(concepto.codigo)) {
    return `${concepto.nombre} no se importa en ${tipo.nombre}. Conceptos de este tipo de fuente: ${listaDeConceptos(tipo)}.`;
  }
  return undefined;
}

async function evaluar(
  almacen: AlmacenDeFuentesExternas,
  personasConocidas: Set<string>,
  tipo: TipoDeFuente,
  solicitud: SolicitudDeImportacionDeFuente,
): Promise<Evaluacion> {
  const hashSha256 = hashDe(solicitud.contenido);
  const parseado = parsearArchivoDeFuente(solicitud.nombre, solicitud.contenido);
  const vacio: ResumenDeValidacion = { filasValidas: 0, filasConError: 0, duplicadas: 0, personasDesconocidas: 0, total: 0 };
  if (parseado.errorDelArchivo) return { errorDelArchivo: parseado.errorDelArchivo, errores: [], resumen: vacio, hashSha256, filasValidas: [] };

  const vigente = await almacen.buscarImportacionVigente(tipo.codigo, solicitud.mes);
  if (vigente && vigente.archivoHashSha256 === hashSha256 && vigente.importesVigentes > 0) {
    const cuando = formatearFechaDeRelacion(fechaDeHoyEnLima(vigente.importadaEn));
    return {
      errorDelArchivo: `Este archivo ya se importó en ${tipo.nombre} de ${formatearMes(solicitud.mes)}: ${vigente.archivoNombre}, por ${vigente.usuario} el ${cuando}. Importar dos veces el mismo archivo no cambia nada.`,
      errores: [], resumen: vacio, hashSha256, filasValidas: [],
    };
  }

  const errores: ErrorDeFilaDeFuente[] = [...parseado.errores];
  const personasDesconocidas = new Set<string>();
  const candidatas: FilaValida[] = [];
  for (const fila of parseado.filas) {
    const escrito = buscarConceptoEscrito(fila.concepto);
    const motivoDeConcepto = motivoDeConceptoNoImportable(fila.concepto, escrito, tipo);
    if (motivoDeConcepto) errores.push({ fila: fila.fila, dni: fila.dni, motivo: motivoDeConcepto });
    const existe = personasConocidas.has(fila.dni);
    if (!existe) {
      personasDesconocidas.add(fila.dni);
      errores.push({ fila: fila.fila, dni: fila.dni, motivo: "DNI desconocido: no existe una persona con ese DNI." });
    }
    if (!motivoDeConcepto && existe && escrito) candidatas.push({ ...fila, conceptoCodigo: escrito.codigo });
  }

  // Los importes de la importación que este archivo reemplazaría dejan de contar: el archivo nuevo puede repetirlos.
  const existentes = (await almacen.listarImportes(tipo.codigo, solicitud.mes)).filter((importe) => importe.importacionId === null || importe.importacionId !== vigente?.id);
  const clavesExistentes = new Set(existentes.map(claveDeImporte));
  const aImporte = (fila: FilaValida) => ({ dni: fila.dni, concepto: fila.conceptoCodigo, fechaDelHecho: fila.fechaDelHecho, mesDeDevengue: fila.mesDeDevengue, mesDeAplicacion: solicitud.mes, monto: fila.monto });
  const duplicadas = posicionesDuplicadas(candidatas.map(aImporte), existentes);
  const primeraFilaPorClave = new Map<string, number>();
  candidatas.forEach((fila, posicion) => {
    const clave = claveDeImporte(aImporte(fila));
    if (!duplicadas.includes(posicion)) primeraFilaPorClave.set(clave, fila.fila);
  });
  for (const posicion of duplicadas) {
    const fila = candidatas[posicion];
    const clave = claveDeImporte(aImporte(fila));
    const primera = clavesExistentes.has(clave) ? undefined : primeraFilaPorClave.get(clave);
    errores.push({
      fila: fila.fila, dni: fila.dni,
      motivo: primera ? `Duplicada: repite la fila ${primera} del archivo.` : "Duplicada: ya existe ese importe cargado en esta fuente para el mes de pago.",
    });
  }

  errores.sort((a, b) => a.fila - b.fila);
  const filasConError = new Set(errores.map((error) => error.fila));
  const filasTotales = parseado.filas.length + new Set(parseado.errores.map((error) => error.fila)).size;
  const validas = candidatas.filter((fila) => !filasConError.has(fila.fila));
  return {
    errores, hashSha256, filasValidas: validas, reemplaza: vigente,
    resumen: {
      filasValidas: filasTotales - filasConError.size, filasConError: filasConError.size, duplicadas: duplicadas.length, personasDesconocidas: personasDesconocidas.size,
      total: validas.reduce((suma, fila) => suma + fila.monto, 0),
    },
  };
}

/** Los DNI del archivo que corresponden a una persona registrada. */
async function resolverPersonas(repositorio: RepositorioDeFuentesExternas, contenido: Uint8Array, nombre: string): Promise<Set<string>> {
  const dnis = [...new Set(parsearArchivoDeFuente(nombre, contenido).filas.map((fila) => fila.dni))];
  const registradas = await Promise.all(dnis.map(async (dni) => ((await repositorio.buscarPersona(dni)) ? dni : undefined)));
  return new Set(registradas.filter((dni): dni is string => dni !== undefined));
}

/** Valida el archivo sin guardar nada: lo que vería Finanzas antes de importar (conteos, errores por fila, qué reemplazaría). */
export async function previsualizarImportacionDeFuente(
  repositorio: RepositorioDeFuentesExternas,
  actor: Actor,
  solicitud: SolicitudDeImportacionDeFuente,
): Promise<VistaPreviaDeImportacionDeFuente> {
  exigirPermiso(actor);
  const tipo = exigirTipo(solicitud.tipoDeFuente);
  if (tipo.flujoPropio) throw new Error(`${tipo.nombre} se registra en su formulario propio.`);
  validarMes(solicitud.mes, "mes de pago");
  await exigirMesAbierto(repositorio, solicitud.mes);
  const { filasValidas: _filasValidas, ...vista } = await evaluar(repositorio, await resolverPersonas(repositorio, solicitud.contenido, solicitud.nombre), tipo, solicitud);
  return vista;
}

/**
 * Importa el archivo: crea los importes externos con su procedencia, conserva el archivo con su hash y responsable, y deja la
 * fuente en «Pendiente». Valida de nuevo dentro de la transacción de la fuente: la vista previa no es de fiar.
 */
export async function importarFuente(
  repositorio: RepositorioDeFuentesExternas,
  actor: Actor,
  solicitud: SolicitudDeImportacionDeFuente,
  almacenamiento: AlmacenamientoDeArchivos,
): Promise<ResultadoDeImportacionDeFuente> {
  exigirPermiso(actor);
  const tipo = exigirTipo(solicitud.tipoDeFuente);
  if (tipo.flujoPropio) throw new Error(`${tipo.nombre} se registra en su formulario propio.`);
  validarMes(solicitud.mes, "mes de pago");
  const personas = await resolverPersonas(repositorio, solicitud.contenido, solicitud.nombre);

  let archivo: ArchivoFuente | undefined;
  try {
    return await repositorio.ejecutarSobreFuente(tipo.codigo, solicitud.mes, async (almacen) => {
      await exigirMesAbierto(almacen, solicitud.mes);
      const evaluacion = await evaluar(almacen, personas, tipo, solicitud);
      if (evaluacion.errorDelArchivo) throw new Error(evaluacion.errorDelArchivo);
      if (evaluacion.errores.length) throw new ErroresDeImportacionDeFuente(evaluacion.errores, evaluacion.resumen);

      archivo = await almacenamiento.conservar(solicitud.nombre, solicitud.contenido);
      const ahora = new Date();
      let reemplazo: ResultadoDeImportacionDeFuente["reemplazo"];
      if (evaluacion.reemplaza) {
        const motivo = `Reemplazado por el archivo ${solicitud.nombre.slice(0, MAXIMO_DE_CARACTERES_DEL_NOMBRE_EN_EL_MOTIVO)} (${hashAbreviado(archivo.hashSha256)})`;
        reemplazo = { id: evaluacion.reemplaza.id, archivoNombre: evaluacion.reemplaza.archivoNombre, importesAnulados: await almacen.reemplazarImportacion(evaluacion.reemplaza.id, motivo, ahora) };
      }
      const { total, ...conteos } = evaluacion.resumen;
      const importacion = await almacen.insertarImportacion({
        tipoDeFuente: tipo.codigo, mesDeAplicacion: solicitud.mes, archivoNombre: archivo.nombre, archivoUbicacion: archivo.ubicacion,
        archivoHashSha256: archivo.hashSha256, usuarioId: actor.id, importadaEn: ahora, filas: evaluacion.filasValidas.length, total, validacion: conteos,
      });
      for (const fila of evaluacion.filasValidas) {
        const importe = await almacen.insertarImporte({
          tipoDeFuente: tipo.codigo, dni: fila.dni, concepto: fila.conceptoCodigo, fechaDelHecho: fila.fechaDelHecho,
          mesDeDevengue: fila.mesDeDevengue, mesDeAplicacion: solicitud.mes, monto: fila.monto,
          procedencia: procedenciaDeArchivo(archivo.nombre), responsableId: actor.id, importacionId: importacion.id,
        });
        // Otra carga idéntica ganó la carrera entre la validación y el guardado: se deshace todo.
        if (!importe) throw new Error(`Ya existe el importe de la fila ${fila.fila} (DNI ${fila.dni}). No se importó ninguna fila; vuelva a validar el archivo.`);
      }
      return { importacion, filas: evaluacion.filasValidas.length, total, volvioAPendiente: await almacen.quitarConfirmacion(tipo.codigo, solicitud.mes), reemplazo };
    });
  } catch (causa) {
    if (archivo) await almacenamiento.descartar(archivo).catch(() => undefined);
    throw causa;
  }
}
