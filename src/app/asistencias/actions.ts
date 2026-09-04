"use server";

import { revalidatePath } from "next/cache";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDeAsistencias } from "@/asistencias/casos-de-uso-servidor";
import { repositorioDeAsistencias } from "@/asistencias/servicio";
import { crearCasosDeUsoDeTurnos } from "@/turnos/casos-de-uso-servidor";
import { repositorioDeTurnos } from "@/turnos/servicio";
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

export async function confirmarAsistencia(formData: FormData): Promise<void> {
  const casosDeUso = crearCasosDeUsoDeAsistencias(repositorioDeAsistencias, { obtenerActorActual });
  await casosDeUso.confirmar({
    idHuellero: obtenerTexto(formData, "idHuellero"),
    fecha: obtenerTexto(formData, "fecha"),
    entradaReal: obtenerTexto(formData, "entradaReal"),
    salidaReal: obtenerTexto(formData, "salidaReal"),
  });
  revalidatePath("/asistencias");
}

export async function ajustarAsistencia(formData: FormData): Promise<void> {
  const casosDeUso = crearCasosDeUsoDeAsistencias(repositorioDeAsistencias, { obtenerActorActual });
  await casosDeUso.ajustar({
    idHuellero: obtenerTexto(formData, "idHuellero"),
    fecha: obtenerTexto(formData, "fecha"),
    entradaReal: obtenerTexto(formData, "entradaReal"),
    salidaReal: obtenerTexto(formData, "salidaReal"),
    motivo: obtenerTexto(formData, "motivo"),
  });
  revalidatePath("/asistencias");
}

export async function aprobarHoraExtra(formData: FormData): Promise<void> {
  const casosDeUso = crearCasosDeUsoDeAsistencias(repositorioDeAsistencias, { obtenerActorActual });
  await casosDeUso.aprobarHoraExtra({
    idHuellero: obtenerTexto(formData, "idHuellero"),
    fecha: obtenerTexto(formData, "fecha"),
  });
  revalidatePath("/asistencias");
}

export async function rechazarHoraExtra(formData: FormData): Promise<void> {
  const casosDeUso = crearCasosDeUsoDeAsistencias(repositorioDeAsistencias, { obtenerActorActual });
  await casosDeUso.rechazarHoraExtra({
    idHuellero: obtenerTexto(formData, "idHuellero"),
    fecha: obtenerTexto(formData, "fecha"),
  });
  revalidatePath("/asistencias");
}

export async function registrarEstadoManual(formData: FormData): Promise<void> {
  const casosDeUso = crearCasosDeUsoDeAsistencias(repositorioDeAsistencias, { obtenerActorActual });
  const tipo = obtenerTexto(formData, "tipo");
  if (!esTipoDeEstadoManual(tipo)) throw new Error("El tipo de estado manual no es válido.");
  await casosDeUso.registrarEstadoManual({
    idHuellero: obtenerTexto(formData, "idHuellero"),
    fecha: obtenerTexto(formData, "fecha"),
    tipo,
    comentario: obtenerTexto(formData, "comentario"),
  });
  revalidatePath("/asistencias");
}

export async function procesarHorarioSemanal(formData: FormData): Promise<void> {
  const semana = obtenerTexto(formData, "semana");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana)) throw new Error("La semana no es válida.");
  const casosDeUso = crearCasosDeUsoDeTurnos(repositorioDeTurnos, { obtenerActorActual });
  await casosDeUso.procesar(obtenerTexto(formData, "idHuellero"), semana);
  revalidatePath("/asistencias");
  revalidatePath("/turnos");
}


function obtenerTexto(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre);
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`El campo ${nombre} es obligatorio.`);
  return valor.trim();
}

function esTipoDeEstadoManual(valor: string): valor is "falta" | "descanso" | "feriado" | "vacaciones" | "permiso" | "suspension" {
  return ["falta", "descanso", "feriado", "vacaciones", "permiso", "suspension"].includes(valor);
}
