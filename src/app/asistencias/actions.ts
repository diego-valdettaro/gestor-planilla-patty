"use server";

import { revalidatePath } from "next/cache";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { crearCasosDeUsoDeAsistencias, crearCasosDeUsoDeConfirmacionPorRango } from "@/asistencias/casos-de-uso-servidor";
import type { ColaboradorParaConfirmar, EvaluacionDeColaborador, SolicitudDeConfirmacionPorRango } from "@/asistencias/confirmar-colaboradores-por-rango";
import { esTipoDeEstadoManualRegistrable } from "@/asistencias/estado-manual";
import { repositorioDeAsistencias } from "@/asistencias/servicio";
import { crearCasosDeUsoDeTurnos } from "@/turnos/casos-de-uso-servidor";
import { repositorioDeTurnos } from "@/turnos/servicio";
import { conservarArchivoFuente, descartarArchivoFuente } from "@/importaciones/almacenamiento-local";
import { crearCasosDeUsoDeImportaciones } from "@/importaciones/casos-de-uso-servidor";
import { ErroresDeImportacion, type VistaPreviaDeImportacion } from "@/importaciones/importar-semana-por-sede";
import { parsearArchivoHuellero, type ErrorDeImportacion } from "@/importaciones/parsear-archivo-huellero";
import { repositorioDeImportaciones } from "@/importaciones/servicio";

export interface EstadoDeImportacion {
  error?: string;
  errores?: ErrorDeImportacion[];
  resultado?: { jornadas: number };
  vistaPrevia?: VistaPreviaDeImportacion;
}

export interface EstadoDeRegistroManual {
  error?: string;
  listo?: string;
}

export async function evaluarConfirmacionPorRango(solicitud: {
  inicio: string;
  fin: string;
  colaboradores: ColaboradorParaConfirmar[];
}): Promise<{ evaluacion?: EvaluacionDeColaborador[]; error?: string }> {
  try {
    const casosDeUso = crearCasosDeUsoDeConfirmacionPorRango(repositorioDeAsistencias, { obtenerActorActual });
    return { evaluacion: await casosDeUso.evaluar(solicitud) };
  } catch (causa) {
    return { error: causa instanceof Error ? causa.message : "No se pudo revisar el rango." };
  }
}

export async function confirmarSeleccionPorRango(solicitud: SolicitudDeConfirmacionPorRango): Promise<{ error?: string }> {
  try {
    const casosDeUso = crearCasosDeUsoDeConfirmacionPorRango(repositorioDeAsistencias, { obtenerActorActual });
    await casosDeUso.confirmar(solicitud);
    revalidatePath("/asistencias");
    return {};
  } catch (causa) {
    return { error: causa instanceof Error ? causa.message : "No se pudo confirmar la selección." };
  }
}

export async function importarAsistencia(_estadoAnterior: EstadoDeImportacion, formData: FormData): Promise<EstadoDeImportacion> {
  let archivoFuente: Awaited<ReturnType<typeof conservarArchivoFuente>> | undefined;
  try {
    const archivo = formData.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) throw new Error("Debe seleccionar un archivo fuente.");
    const contenido = await parsearArchivoHuellero(archivo);
    const casosDeUso = crearCasosDeUsoDeImportaciones(repositorioDeImportaciones, { obtenerActorActual });
    const solicitud = { filas: contenido.filas, erroresDelArchivo: contenido.errores };

    const previa = await casosDeUso.previsualizar(solicitud);
    if (!previa.vistaPrevia) return { errores: previa.errores };

    const confirmarReemplazoDeConfirmadas = formData.get("confirmarReemplazoDeConfirmadas") === "true";
    if (previa.vistaPrevia.conteos.confirmado > 0 && !confirmarReemplazoDeConfirmadas) {
      return { vistaPrevia: previa.vistaPrevia };
    }

    archivoFuente = await conservarArchivoFuente(archivo);
    const resultado = await casosDeUso.aplicar({ ...solicitud, archivo: archivoFuente, confirmarReemplazoDeConfirmadas });
    if (resultado.requiereConfirmacion) {
      await descartarArchivoFuente(archivoFuente).catch(() => undefined);
      archivoFuente = undefined;
      return { vistaPrevia: { conteos: resultado.conteos, filas: previa.vistaPrevia.filas } };
    }
    revalidatePath("/asistencias");
    return { resultado: { jornadas: resultado.jornadas }, vistaPrevia: previa.vistaPrevia };
  } catch (causa) {
    if (archivoFuente) await descartarArchivoFuente(archivoFuente).catch(() => undefined);
    if (causa instanceof ErroresDeImportacion) return { errores: causa.errores };
    return { error: causa instanceof Error ? causa.message : "No se pudo importar el archivo." };
  }
}

export async function confirmarAsistencia(formData: FormData): Promise<void> {
  const casosDeUso = crearCasosDeUsoDeAsistencias(repositorioDeAsistencias, { obtenerActorActual });
  await casosDeUso.confirmar({
    idHuellero: obtenerTexto(formData, "idHuellero"),
    fecha: obtenerTexto(formData, "fecha"),
    sede: obtenerTexto(formData, "sede"),
    entradaReal: obtenerTexto(formData, "entradaReal"),
    salidaReal: obtenerTexto(formData, "salidaReal"),
  });
  revalidatePath("/asistencias");
}

export async function registrarAsistenciaManual(
  _estadoAnterior: EstadoDeRegistroManual,
  formData: FormData,
): Promise<EstadoDeRegistroManual> {
  try {
    const fecha = obtenerTexto(formData, "fecha");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("La fecha no es válida.");

    const casosDeUso = crearCasosDeUsoDeAsistencias(repositorioDeAsistencias, { obtenerActorActual });
    const tipoDeAsistencia = obtenerTexto(formData, "tipoDeAsistencia");
    if (esTipoDeEstadoManualRegistrable(tipoDeAsistencia)) {
      await casosDeUso.registrarEstadoManual({
        idHuellero: obtenerTexto(formData, "idHuellero"), fecha, tipo: tipoDeAsistencia, comentario: obtenerTexto(formData, "comentario"),
      });
      revalidatePath("/asistencias");
      return { listo: "El estado manual quedó registrado." };
    }
    if (tipoDeAsistencia !== "trabajo") throw new Error("El tipo de asistencia no es válido.");

    const entrada = obtenerTexto(formData, "entrada");
    const salida = obtenerTexto(formData, "salida");
    if (!/^\d{2}:\d{2}$/.test(entrada) || !/^\d{2}:\d{2}$/.test(salida)) throw new Error("Las horas deben usar el formato HH:MM.");
    const solicitud = { idHuellero: obtenerTexto(formData, "idHuellero"), fecha, entradaReal: `${fecha}T${entrada}`, salidaReal: `${fecha}T${salida}` };
    if (formData.get("estadoActual") === "confirmada") {
      await casosDeUso.ajustar({ ...solicitud, motivo: obtenerTexto(formData, "motivo") });
    } else {
      await casosDeUso.confirmar({ ...solicitud, sede: obtenerTexto(formData, "sede") });
    }
    revalidatePath("/asistencias");
    return { listo: formData.get("estadoActual") === "confirmada" ? "El ajuste quedó guardado." : "La asistencia manual quedó registrada." };
  } catch (causa) {
    return { error: causa instanceof Error ? causa.message : "No se pudo registrar la asistencia manual." };
  }
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
  if (!esTipoDeEstadoManualRegistrable(tipo)) throw new Error("El tipo de estado manual no es válido.");
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
