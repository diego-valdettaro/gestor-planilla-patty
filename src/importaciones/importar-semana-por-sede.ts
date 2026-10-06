import { nombreDelMotivoPlanificado, type MotivoPlanificadoDeNoAsistencia, type TipoDeEstadoManual } from "@/asistencias/estado-manual";
import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeImportarMarcas, puedeImportarMarcasDelGrupo } from "@/autenticacion/permisos";

import type { ErrorDeImportacion, FilaDeAsistenciaImportada } from "./parsear-archivo-huellero";

export interface MarcaCruda {
  dni: string;
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
  dni: string;
  fecha: string;
  estado: "pendiente";
  entradaPropuesta: string;
  salidaPropuesta: string;
}

export interface ReemplazoDeAsistencia {
  dni: string;
  fecha: string;
  asistenciaId: string;
  estadoAnterior: "confirmada" | "manual";
  valorAnterior: { entradaReal?: string; salidaReal?: string; tipo?: TipoDeEstadoManual; comentario?: string };
  entradaPropuesta: string;
  salidaPropuesta: string;
}

export interface ImportacionDeAsistencias {
  archivo: ArchivoFuente;
  usuarioId: string;
  importadaEn: Date;
  marcasCrudas: MarcaCruda[];
  propuestas: AsistenciaPendiente[];
  reemplazos: ReemplazoDeAsistencia[];
}

export interface SolicitudDePrevalidacion {
  filas: FilaDeAsistenciaImportada[];
  erroresDelArchivo: ErrorDeImportacion[];
}

export interface SolicitudDeImportacion extends SolicitudDePrevalidacion {
  archivo: ArchivoFuente;
}

export interface SolicitudDeAplicacion extends SolicitudDeImportacion {
  confirmarReemplazoDeConfirmadas: boolean;
}

export type CategoriaDeFila = "nuevo" | "igual" | "pendiente" | "confirmado";

export interface ConteosDeVistaPrevia {
  nuevo: number;
  igual: number;
  pendiente: number;
  confirmado: number;
}

export interface FilaClasificada {
  fila: number;
  dni: string;
  fecha: string;
  categoria: CategoriaDeFila;
}

export interface VistaPreviaDeImportacion {
  conteos: ConteosDeVistaPrevia;
  filas: FilaClasificada[];
}

export interface ResultadoDePrevisualizacion {
  errores: ErrorDeImportacion[];
  vistaPrevia?: VistaPreviaDeImportacion;
}

export type ResultadoDeAplicacion =
  | { requiereConfirmacion: true; conteos: ConteosDeVistaPrevia }
  | { requiereConfirmacion: false; jornadas: number };

export interface AsistenciaExistente {
  dni: string;
  fecha: string;
  asistenciaId: string;
  estado: "pendiente" | "confirmada" | "manual";
  entradaPropuesta: string | null;
  salidaPropuesta: string | null;
  entradaReal: string | null;
  salidaReal: string | null;
  estadoManual?: { tipo: TipoDeEstadoManual; comentario: string };
}

export interface RepositorioDeImportaciones {
  buscarColaborador(dni: string): Promise<{ dni: string; grupo: string } | undefined>;
  buscarSede(nombre: string): Promise<string | undefined>;
  buscarTurnoPublicado(dni: string, fecha: string): Promise<{
    dni: string;
    fecha: string;
    sede: string | null;
    descanso: boolean;
    motivoNoAsistencia: MotivoPlanificadoDeNoAsistencia | null;
  } | undefined>;
  perteneceAPeriodoAbierto(fecha: string): Promise<boolean>;
  buscarAsistenciasExistentes(identidades: Array<{ dni: string; fecha: string }>): Promise<AsistenciaExistente[]>;
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
  exigir(puedeImportarMarcas(actor), "No tiene permiso para importar asistencias.");

  const errores = [...solicitud.erroresDelArchivo];
  for (const fila of solicitud.filas) {
    if (!salidaPosteriorAEntrada(fila.entrada, fila.salida)) {
      errores.push(errorDe(fila, "La salida debe ser posterior a la entrada."));
    }

    const colaborador = await repositorio.buscarColaborador(fila.dni);
    if (!colaborador) errores.push(errorDe(fila, "DNI desconocido."));
    else if (!puedeImportarMarcasDelGrupo(actor, colaborador.grupo)) errores.push(errorDe(fila, "El colaborador no pertenece a un grupo que usted gestiona."));

    const sede = await repositorio.buscarSede(fila.sede);
    if (!sede) errores.push(errorDe(fila, "Sede desconocida."));

    if (!(await repositorio.perteneceAPeriodoAbierto(fila.fecha))) {
      errores.push(errorDe(fila, "El período de planilla está cerrado. Pida a Finanzas que lo reabra."));
    }

    if (!colaborador) continue;
    const turno = await repositorio.buscarTurnoPublicado(fila.dni, fila.fecha);
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

export async function previsualizarImportacion(
  repositorio: RepositorioDeImportaciones,
  actor: Actor,
  solicitud: SolicitudDePrevalidacion,
): Promise<ResultadoDePrevisualizacion> {
  const errores = await prevalidarImportacion(repositorio, actor, solicitud);
  if (errores.length) return { errores };

  const { clasificadas, conteos } = await clasificarFilas(repositorio, solicitud.filas);
  return {
    errores: [],
    vistaPrevia: {
      conteos,
      filas: clasificadas.map(({ fila, categoria }) => ({ fila: fila.fila, dni: fila.dni, fecha: fila.fecha, categoria })),
    },
  };
}

export async function aplicarImportacion(
  repositorio: RepositorioDeImportaciones,
  actor: Actor,
  solicitud: SolicitudDeAplicacion,
): Promise<ResultadoDeAplicacion> {
  const errores = await prevalidarImportacion(repositorio, actor, solicitud);
  if (errores.length) throw new ErroresDeImportacion(errores);

  const { clasificadas, conteos } = await clasificarFilas(repositorio, solicitud.filas);
  if (conteos.confirmado > 0 && !solicitud.confirmarReemplazoDeConfirmadas) {
    return { requiereConfirmacion: true, conteos };
  }

  const propuestas: AsistenciaPendiente[] = [];
  const reemplazos: ReemplazoDeAsistencia[] = [];
  for (const { fila, existente, categoria } of clasificadas) {
    if (categoria === "igual") continue;
    const entradaPropuesta = instanteDe(fila.fecha, fila.entrada);
    const salidaPropuesta = instanteDe(fila.fecha, fila.salida);
    if (categoria === "confirmado" && existente) {
      reemplazos.push({
        dni: fila.dni,
        fecha: fila.fecha,
        asistenciaId: existente.asistenciaId,
        estadoAnterior: existente.estado === "confirmada" ? "confirmada" : "manual",
        valorAnterior: valorAnteriorDe(existente),
        entradaPropuesta,
        salidaPropuesta,
      });
    } else {
      propuestas.push({ dni: fila.dni, fecha: fila.fecha, estado: "pendiente", entradaPropuesta, salidaPropuesta });
    }
  }

  await repositorio.guardar({
    archivo: solicitud.archivo,
    usuarioId: actor.id,
    importadaEn: new Date(),
    marcasCrudas: solicitud.filas.flatMap((fila) => [
      { dni: fila.dni, sede: fila.sede, fecha: fila.fecha, instante: instanteDe(fila.fecha, fila.entrada) },
      { dni: fila.dni, sede: fila.sede, fecha: fila.fecha, instante: instanteDe(fila.fecha, fila.salida) },
    ]),
    propuestas,
    reemplazos,
  });
  return { requiereConfirmacion: false, jornadas: propuestas.length + reemplazos.length };
}

async function clasificarFilas(
  repositorio: RepositorioDeImportaciones,
  filas: FilaDeAsistenciaImportada[],
): Promise<{
  clasificadas: Array<{ fila: FilaDeAsistenciaImportada; existente?: AsistenciaExistente; categoria: CategoriaDeFila }>;
  conteos: ConteosDeVistaPrevia;
}> {
  const existentes = await repositorio.buscarAsistenciasExistentes(filas.map((fila) => ({ dni: fila.dni, fecha: fila.fecha })));
  const existentesPorClave = new Map(existentes.map((existente) => [claveDeJornada(existente.dni, existente.fecha), existente]));
  const clasificadas = filas.map((fila) => {
    const existente = existentesPorClave.get(claveDeJornada(fila.dni, fila.fecha));
    return { fila, existente, categoria: clasificarFila(fila, existente) };
  });
  const conteos: ConteosDeVistaPrevia = { nuevo: 0, igual: 0, pendiente: 0, confirmado: 0 };
  for (const { categoria } of clasificadas) conteos[categoria] += 1;
  return { clasificadas, conteos };
}

function valorAnteriorDe(existente: AsistenciaExistente): ReemplazoDeAsistencia["valorAnterior"] {
  return existente.estado === "confirmada"
    ? { entradaReal: existente.entradaReal ?? undefined, salidaReal: existente.salidaReal ?? undefined }
    : { tipo: existente.estadoManual?.tipo, comentario: existente.estadoManual?.comentario };
}

function clasificarFila(fila: FilaDeAsistenciaImportada, existente: AsistenciaExistente | undefined): CategoriaDeFila {
  if (!existente) return "nuevo";
  const entradaNueva = instanteDe(fila.fecha, fila.entrada);
  const salidaNueva = instanteDe(fila.fecha, fila.salida);
  if (existente.estado === "pendiente") {
    return existente.entradaPropuesta === entradaNueva && existente.salidaPropuesta === salidaNueva ? "igual" : "pendiente";
  }
  if (existente.estado === "confirmada") {
    return existente.entradaReal === entradaNueva && existente.salidaReal === salidaNueva ? "igual" : "confirmado";
  }
  return "confirmado";
}

function claveDeJornada(dni: string, fecha: string): string {
  return `${dni} ${fecha}`;
}

function errorDe(fila: FilaDeAsistenciaImportada, motivo: string): ErrorDeImportacion {
  return { fila: fila.fila, dni: fila.dni, fecha: fila.fecha, motivo };
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
