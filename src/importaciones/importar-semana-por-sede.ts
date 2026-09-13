import { nombreDelMotivoPlanificado, type MotivoPlanificadoDeNoAsistencia } from "@/asistencias/estado-manual";
import type { Actor } from "@/colaboradores/registrar-colaborador";

import type { ErrorDeImportacion, FilaDeAsistenciaImportada } from "./parsear-archivo-huellero";

export interface MarcaCruda {
  idHuellero: string;
  sede: string;
  fecha: string;
  instante: string;
}

export interface ArchivoFuente {
  nombre: string;
  ubicacion: string;
  hashSha256: string;
}

export interface AsistenciaPendiente {
  idHuellero: string;
  fecha: string;
  estado: "pendiente";
  entradaPropuesta: string;
  salidaPropuesta: string;
}

export interface ImportacionDeAsistencias {
  archivo: ArchivoFuente;
  usuarioId: string;
  importadaEn: Date;
  marcasCrudas: MarcaCruda[];
  propuestas: AsistenciaPendiente[];
}

export interface SolicitudDePrevalidacion {
  filas: FilaDeAsistenciaImportada[];
  erroresDelArchivo: ErrorDeImportacion[];
}

export interface SolicitudDeImportacion extends SolicitudDePrevalidacion {
  archivo: ArchivoFuente;
}

export interface RepositorioDeImportaciones {
  buscarColaborador(idHuellero: string): Promise<{ idHuellero: string } | undefined>;
  buscarSede(nombre: string): Promise<string | undefined>;
  buscarTurnoPublicado(idHuellero: string, fecha: string): Promise<{
    idHuellero: string;
    fecha: string;
    sede: string | null;
    descanso: boolean;
    motivoNoAsistencia: MotivoPlanificadoDeNoAsistencia | null;
  } | undefined>;
  perteneceAPeriodoAbierto(fecha: string): Promise<boolean>;
  guardar(importacion: ImportacionDeAsistencias): Promise<void>;
}

export class ErroresDeImportacion extends Error {
  constructor(readonly errores: ErrorDeImportacion[]) {
    super("La importación tiene errores.");
  }
}

export async function prevalidarImportacion(
  repositorio: RepositorioDeImportaciones,
  actor: Actor,
  solicitud: SolicitudDePrevalidacion,
): Promise<ErrorDeImportacion[]> {
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") throw new Error("No tiene permiso para importar asistencias.");

  const errores = [...solicitud.erroresDelArchivo];
  for (const fila of solicitud.filas) {
    if (!salidaPosteriorAEntrada(fila.entrada, fila.salida)) {
      errores.push(errorDe(fila, "La salida debe ser posterior a la entrada."));
    }

    const colaborador = await repositorio.buscarColaborador(fila.idHuellero);
    if (!colaborador) errores.push(errorDe(fila, "ID de huellero desconocido."));

    const sede = await repositorio.buscarSede(fila.sede);
    if (!sede) errores.push(errorDe(fila, "Sede desconocida."));

    if (!(await repositorio.perteneceAPeriodoAbierto(fila.fecha))) {
      errores.push(errorDe(fila, "El período de planilla está cerrado. Pida a Finanzas que lo reabra."));
    }

    if (!colaborador) continue;
    const turno = await repositorio.buscarTurnoPublicado(fila.idHuellero, fila.fecha);
    if (!turno) {
      errores.push(errorDe(fila, "No tiene horario publicado."));
      continue;
    }
    if (turno.descanso || turno.motivoNoAsistencia) {
      errores.push(errorDe(fila, `El horario publicado tiene ${nombreDelMotivoPlanificado(turno.motivoNoAsistencia ?? "descanso")} planificado.`));
      continue;
    }
    if (!sede || !turno.sede || !mismaSede(sede, turno.sede)) {
      errores.push(errorDe(fila, "La sede no coincide con la del horario publicado."));
    }
  }
  return errores;
}

export async function importarAsistencias(
  repositorio: RepositorioDeImportaciones,
  actor: Actor,
  solicitud: SolicitudDeImportacion,
): Promise<{ jornadas: number }> {
  const errores = await prevalidarImportacion(repositorio, actor, solicitud);
  if (errores.length) throw new ErroresDeImportacion(errores);

  await repositorio.guardar({
    archivo: solicitud.archivo,
    usuarioId: actor.id,
    importadaEn: new Date(),
    marcasCrudas: solicitud.filas.flatMap((fila) => [
      { idHuellero: fila.idHuellero, sede: fila.sede, fecha: fila.fecha, instante: instanteDe(fila.fecha, fila.entrada) },
      { idHuellero: fila.idHuellero, sede: fila.sede, fecha: fila.fecha, instante: instanteDe(fila.fecha, fila.salida) },
    ]),
    propuestas: solicitud.filas.map((fila) => ({
      idHuellero: fila.idHuellero,
      fecha: fila.fecha,
      estado: "pendiente",
      entradaPropuesta: instanteDe(fila.fecha, fila.entrada),
      salidaPropuesta: instanteDe(fila.fecha, fila.salida),
    })),
  });
  return { jornadas: solicitud.filas.length };
}

function errorDe(fila: FilaDeAsistenciaImportada, motivo: string): ErrorDeImportacion {
  return { fila: fila.fila, idHuellero: fila.idHuellero, fecha: fila.fecha, motivo };
}

function instanteDe(fecha: string, hora: string): string {
  return `${fecha}T${hora}:00`;
}

function salidaPosteriorAEntrada(entrada: string, salida: string): boolean {
  return salida.localeCompare(entrada) > 0;
}

function mismaSede(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), undefined, { sensitivity: "accent" }) === 0;
}
