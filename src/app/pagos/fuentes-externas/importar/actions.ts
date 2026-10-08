"use server";

import { revalidatePath } from "next/cache";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { fechaDeHoyEnLima } from "@/condiciones-laborales/vigencia";
import { crearCasosDeUsoDeFuentesExternas } from "@/fuentes-externas/casos-de-uso-servidor";
import { exigirTipo } from "@/fuentes-externas/gestionar-fuentes-externas";
import { ErroresDeImportacionDeFuente, type ResumenDeValidacion } from "@/fuentes-externas/importar-fuente";
import type { ErrorDeFilaDeFuente } from "@/fuentes-externas/parsear-archivo-de-fuente";
import { repositorioDeFuentesExternas } from "@/fuentes-externas/servicio";
import { hashAbreviado } from "@/fuentes-externas/valores";
import { conservarContenido, descartarArchivoFuente } from "@/importaciones/almacenamiento-local";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";

/** Lo que la pantalla muestra de un archivo validado, ya en texto (nada de fechas ni objetos del dominio). */
export interface VistaDeArchivoDeFuente {
  tipoDeFuente: string;
  tipoNombre: string;
  mes: string;
  nombre: string;
  hashAbreviado: string;
  resumen: ResumenDeValidacion;
  errores: ErrorDeFilaDeFuente[];
  /** El archivo anterior del mismo tipo y mes que este reemplazaría, si lo hay. */
  reemplaza?: { archivoNombre: string; importadoPor: string; importadaEn: string };
  /** La fuente está confirmada: importar la devuelve a «Pendiente». */
  fuenteConfirmada: boolean;
}

export interface ResultadoDeImportacionVisible {
  nombre: string;
  hashAbreviado: string;
  responsable: string;
  fecha: string;
  filas: number;
  total: number;
  tipoNombre: string;
  mes: string;
  volvioAPendiente: boolean;
  reemplazo?: string;
}

export interface EstadoDeImportacionDeFuente {
  /** El archivo entero se rechaza (no es un XLSX normalizado, ya se importó…) o falló la acción: sin vista previa. */
  error?: string;
  vista?: VistaDeArchivoDeFuente;
  resultado?: ResultadoDeImportacionVisible;
}

// El límite por defecto del cuerpo de una acción de servidor en Next.js es 1 MB; un archivo mayor ni llega aquí.
const MAXIMO_DE_BYTES_DEL_ARCHIVO = 1024 * 1024;

function casosDeUso() {
  return crearCasosDeUsoDeFuentesExternas(repositorioDeFuentesExternas, { obtenerActorActual });
}

function texto(formData: FormData, campo: string, etiqueta: string): string {
  const valor = formData.get(campo);
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`Falta ${etiqueta}.`);
  return valor.trim();
}

/** «Validar archivo» no guarda nada; «Importar» valida de nuevo, conserva el archivo y crea los importes (todo o nada). */
export async function procesarArchivoDeFuente(_estadoAnterior: EstadoDeImportacionDeFuente, formData: FormData): Promise<EstadoDeImportacionDeFuente> {
  try {
    const tipoDeFuente = texto(formData, "tipoDeFuente", "el tipo de fuente");
    const mes = texto(formData, "mes", "el mes de pago");
    const tipo = exigirTipo(tipoDeFuente);
    const archivo = formData.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) throw new Error("Seleccione el archivo XLSX normalizado.");
    if (archivo.size > MAXIMO_DE_BYTES_DEL_ARCHIVO) throw new Error("El archivo supera 1 MB. Divida el listado en varios archivos por tipo de fuente.");
    const solicitud = { tipoDeFuente, mes, nombre: archivo.name, contenido: new Uint8Array(await archivo.arrayBuffer()) };

    const casos = casosDeUso();
    const fuenteConfirmada = (await casos.fuente(tipoDeFuente, mes))?.estado !== "pendiente";
    const vistaDe = (previa: { resumen: ResumenDeValidacion; errores: ErrorDeFilaDeFuente[]; hashSha256: string; reemplaza?: { archivoNombre: string; usuario: string; importadaEn: Date } }): VistaDeArchivoDeFuente => ({
      tipoDeFuente, tipoNombre: tipo.nombre, mes, nombre: archivo.name, hashAbreviado: hashAbreviado(previa.hashSha256), resumen: previa.resumen, errores: previa.errores, fuenteConfirmada,
      reemplaza: previa.reemplaza && { archivoNombre: previa.reemplaza.archivoNombre, importadoPor: previa.reemplaza.usuario, importadaEn: formatearFechaDeRelacion(fechaDeHoyEnLima(previa.reemplaza.importadaEn)) },
    });

    if (formData.get("accion") !== "importar") {
      const previa = await casos.previsualizarImportacion(solicitud);
      return previa.errorDelArchivo ? { error: previa.errorDelArchivo } : { vista: vistaDe(previa) };
    }

    try {
      const resultado = await casos.importar(solicitud, { conservar: conservarContenido, descartar: descartarArchivoFuente });
      revalidatePath("/pagos/fuentes-externas");
      revalidatePath("/pagos/fuentes-externas/[tipo]", "page");
      return {
        resultado: {
          nombre: resultado.importacion.archivoNombre, hashAbreviado: hashAbreviado(resultado.importacion.archivoHashSha256), responsable: resultado.importacion.usuario,
          fecha: formatearFechaDeRelacion(fechaDeHoyEnLima(resultado.importacion.importadaEn)), filas: resultado.filas, total: resultado.total, tipoNombre: tipo.nombre, mes,
          volvioAPendiente: resultado.volvioAPendiente, reemplazo: resultado.reemplazo?.archivoNombre,
        },
      };
    } catch (causa) {
      if (!(causa instanceof ErroresDeImportacionDeFuente)) throw causa;
      // Otra persona cambió la fuente entre la vista previa y el guardado: se vuelve a mostrar con los errores de ahora.
      const previa = await casos.previsualizarImportacion(solicitud);
      return previa.errorDelArchivo ? { error: previa.errorDelArchivo } : { vista: vistaDe(previa) };
    }
  } catch (causa) {
    return { error: causa instanceof Error ? causa.message : "No se pudo procesar el archivo." };
  }
}
