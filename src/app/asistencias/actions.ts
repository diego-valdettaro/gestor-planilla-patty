"use server";

import { revalidatePath } from "next/cache";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { conservarArchivoFuente } from "@/importaciones/almacenamiento-local";
import { crearCasosDeUsoDeImportaciones } from "@/importaciones/casos-de-uso-servidor";
import { parsearArchivoHuellero } from "@/importaciones/parsear-archivo-huellero";
import { repositorioDeImportaciones } from "@/importaciones/servicio";

export async function importarAsistencia(formData: FormData): Promise<void> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) throw new Error("Debe seleccionar un archivo fuente.");
  const sede = obtenerTexto(formData, "sede");
  const semana = obtenerTexto(formData, "semana");
  const marcasCrudas = await parsearArchivoHuellero(archivo);
  const archivoFuente = await conservarArchivoFuente(archivo);
  const casosDeUso = crearCasosDeUsoDeImportaciones(repositorioDeImportaciones, { obtenerActorActual });
  await casosDeUso.importar({ sede, semana, archivo: archivoFuente, marcasCrudas });
  revalidatePath("/asistencias");
}

function obtenerTexto(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre);
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`El campo ${nombre} es obligatorio.`);
  return valor.trim();
}
