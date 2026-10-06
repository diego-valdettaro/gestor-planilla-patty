import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeGestionarCalendarioLaboral } from "@/autenticacion/permisos";
import { formatearFechaDeRelacion } from "@/relaciones-laborales/vigencia";
import { validarFechaDeRelacion } from "@/relaciones-laborales/gestionar-relaciones-laborales";
import { desplazarFecha } from "@/turnos/semana";

import {
  claseDeFeriado,
  clasificarDia,
  esDescansoSemanal,
  origenDeSustitutorio,
  type AsistenciaDelDia,
  type DescansoSemanalAsignado,
  type DiaDeDescansoOFeriado,
  type EstadoDeSustitutorio,
  type Feriado,
  type OrigenDeSustitutorio,
} from "./reglas";

export interface DescansoSustitutorio {
  id: string;
  dni: string;
  origenFecha: string;
  origenTipo: OrigenDeSustitutorio;
  fechaPrevista: string;
  estado: EstadoDeSustitutorio;
  verificadoPorId: string | null;
  verificadoEn: Date | null;
}

export interface RepositorioDeDescansosYFeriados {
  existeColaborador(dni: string): Promise<boolean>;
  listarDescansosSemanales(dni: string): Promise<DescansoSemanalAsignado[]>;
  /** undefined si la persona ya tiene una asignación con esa vigencia. */
  insertarDescansoSemanal(asignacion: DescansoSemanalAsignado & { responsableId: string }): Promise<DescansoSemanalAsignado | undefined>;
  buscarFeriado(fecha: string): Promise<Feriado | undefined>;
  listarFeriados(desde: string, hasta: string): Promise<Feriado[]>;
  /** undefined si ya hay un feriado en esa fecha. */
  insertarFeriado(feriado: Feriado & { responsableId: string }): Promise<Feriado | undefined>;
  renombrarFeriado(fecha: string, nombre: string): Promise<boolean>;
  quitarFeriado(fecha: string): Promise<boolean>;
  existeSustitutorioDeFeriado(fecha: string): Promise<boolean>;
  buscarSustitutorio(id: string): Promise<DescansoSustitutorio | undefined>;
  /** Sustitutorios de una persona cuyo día de origen cae en el rango. */
  listarSustitutorios(dni: string, desde: string, hasta: string): Promise<DescansoSustitutorio[]>;
  /** undefined si el día de origen ya tiene un sustitutorio. */
  insertarSustitutorio(sustitutorio: Pick<DescansoSustitutorio, "dni" | "origenFecha" | "origenTipo" | "fechaPrevista"> & { responsableId: string }): Promise<DescansoSustitutorio | undefined>;
  /** false si el sustitutorio ya no estaba «previsto». */
  verificarSustitutorio(id: string, estado: "otorgado" | "no_otorgado", responsableId: string, verificadoEn: Date): Promise<boolean>;
  asistenciasDelRango(dni: string, desde: string, hasta: string): Promise<Array<AsistenciaDelDia & { fecha: string }>>;
}

const MAXIMO_DE_DIAS_CONSULTADOS = 366;
const MAXIMO_DE_CARACTERES_DEL_NOMBRE = 100;

function exigirPermiso(actor: Actor): void {
  exigir(puedeGestionarCalendarioLaboral(actor), "No tiene permiso para gestionar feriados, descansos semanales ni descansos sustitutorios.");
}

function fecha(valor: string): string {
  return formatearFechaDeRelacion(valor);
}

async function exigirColaborador(repositorio: RepositorioDeDescansosYFeriados, dni: string): Promise<void> {
  if (!(await repositorio.existeColaborador(dni))) throw new Error("No existe una persona con ese DNI.");
}

function validarNombreDeFeriado(nombre: string): string {
  const limpio = nombre.trim();
  if (!limpio) throw new Error("Escriba el nombre del feriado.");
  if (limpio.length > MAXIMO_DE_CARACTERES_DEL_NOMBRE) throw new Error(`El nombre del feriado no puede superar ${MAXIMO_DE_CARACTERES_DEL_NOMBRE} caracteres.`);
  return limpio;
}

/** Asigna el descanso semanal de una persona desde una fecha; una asignación nueva no reescribe las anteriores. */
export async function asignarDescansoSemanal(
  repositorio: RepositorioDeDescansosYFeriados,
  actor: Actor,
  solicitud: { dni: string; diaDeLaSemana: number; vigenteDesde: string },
): Promise<DescansoSemanalAsignado> {
  exigirPermiso(actor);
  validarFechaDeRelacion(solicitud.vigenteDesde, "inicio de la vigencia");
  if (!Number.isInteger(solicitud.diaDeLaSemana) || solicitud.diaDeLaSemana < 1 || solicitud.diaDeLaSemana > 7) {
    throw new Error("El día de descanso semanal debe ir de lunes (1) a domingo (7).");
  }
  await exigirColaborador(repositorio, solicitud.dni);
  const asignada = await repositorio.insertarDescansoSemanal({ ...solicitud, responsableId: actor.id });
  if (!asignada) throw new Error(`La persona ya tiene un descanso semanal asignado desde el ${fecha(solicitud.vigenteDesde)}. Use otra fecha de vigencia.`);
  return asignada;
}

export async function listarDescansosSemanales(repositorio: RepositorioDeDescansosYFeriados, actor: Actor, dni: string): Promise<DescansoSemanalAsignado[]> {
  exigirPermiso(actor);
  return (await repositorio.listarDescansosSemanales(dni)).sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
}

/** Registra un feriado del calendario; el 1 de mayo queda con su clase propia. */
export async function registrarFeriado(repositorio: RepositorioDeDescansosYFeriados, actor: Actor, solicitud: { fecha: string; nombre: string }): Promise<Feriado> {
  exigirPermiso(actor);
  validarFechaDeRelacion(solicitud.fecha, "feriado");
  const nombre = validarNombreDeFeriado(solicitud.nombre);
  const registrado = await repositorio.insertarFeriado({ fecha: solicitud.fecha, nombre, clase: claseDeFeriado(solicitud.fecha), responsableId: actor.id });
  if (!registrado) throw new Error(`El ${fecha(solicitud.fecha)} ya está en el calendario de feriados.`);
  return registrado;
}

export async function corregirNombreDeFeriado(repositorio: RepositorioDeDescansosYFeriados, actor: Actor, fechaDelFeriado: string, nombre: string): Promise<void> {
  exigirPermiso(actor);
  if (!(await repositorio.renombrarFeriado(fechaDelFeriado, validarNombreDeFeriado(nombre)))) {
    throw new Error(`El ${fecha(fechaDelFeriado)} no está en el calendario de feriados.`);
  }
}

/** Quita un feriado del calendario salvo que ya tenga descansos sustitutorios registrados. */
export async function quitarFeriado(repositorio: RepositorioDeDescansosYFeriados, actor: Actor, fechaDelFeriado: string): Promise<void> {
  exigirPermiso(actor);
  validarFechaDeRelacion(fechaDelFeriado, "feriado");
  if (await repositorio.existeSustitutorioDeFeriado(fechaDelFeriado)) {
    throw new Error(`El ${fecha(fechaDelFeriado)} tiene descansos sustitutorios registrados: no se puede quitar del calendario.`);
  }
  if (!(await repositorio.quitarFeriado(fechaDelFeriado))) throw new Error(`El ${fecha(fechaDelFeriado)} no está en el calendario de feriados.`);
}

export async function listarFeriados(repositorio: RepositorioDeDescansosYFeriados, actor: Actor, desde: string, hasta: string): Promise<Feriado[]> {
  exigirPermiso(actor);
  validarFechaDeRelacion(desde, "inicio de la consulta");
  validarFechaDeRelacion(hasta, "fin de la consulta");
  if (hasta < desde) throw new Error("El fin de la consulta no puede ser anterior a su inicio.");
  return repositorio.listarFeriados(desde, hasta);
}

/** Prevé el día futuro que sustituirá un descanso semanal o feriado trabajado; queda «previsto» hasta verificarlo. */
export async function registrarDescansoSustitutorio(
  repositorio: RepositorioDeDescansosYFeriados,
  actor: Actor,
  solicitud: { dni: string; origenFecha: string; fechaPrevista: string },
): Promise<DescansoSustitutorio> {
  exigirPermiso(actor);
  validarFechaDeRelacion(solicitud.origenFecha, "día que se sustituye");
  validarFechaDeRelacion(solicitud.fechaPrevista, "descanso sustitutorio");
  if (solicitud.origenFecha === solicitud.fechaPrevista) throw new Error("El descanso sustitutorio debe ser otro día distinto del descanso o feriado que sustituye.");
  await exigirColaborador(repositorio, solicitud.dni);
  const asignaciones = await repositorio.listarDescansosSemanales(solicitud.dni);

  const origenTipo = origenDeSustitutorio({ fecha: solicitud.origenFecha, asignaciones, feriado: (await repositorio.buscarFeriado(solicitud.origenFecha)) ?? null });
  if (!origenTipo) {
    throw new Error(`El ${fecha(solicitud.origenFecha)} no es feriado ni el descanso semanal asignado de la persona: no hay nada que sustituir.`);
  }
  if ((await repositorio.buscarFeriado(solicitud.fechaPrevista)) || esDescansoSemanal(asignaciones, solicitud.fechaPrevista)) {
    throw new Error(`El ${fecha(solicitud.fechaPrevista)} ya es feriado o descanso semanal de la persona: elija un día laborable para el sustitutorio.`);
  }
  const registrado = await repositorio.insertarSustitutorio({ ...solicitud, origenTipo, responsableId: actor.id });
  if (!registrado) throw new Error(`El ${fecha(solicitud.origenFecha)} ya tiene un descanso sustitutorio registrado.`);
  return registrado;
}

/** Verificación posterior: marca una sola vez si el descanso previsto se otorgó o no, nunca antes de su fecha. `hoy` es AAAA-MM-DD. */
export async function verificarDescansoSustitutorio(
  repositorio: RepositorioDeDescansosYFeriados,
  actor: Actor,
  id: string,
  resultado: "otorgado" | "no_otorgado",
  hoy: string,
): Promise<void> {
  exigirPermiso(actor);
  validarFechaDeRelacion(hoy, "hoy");
  const sustitutorio = await repositorio.buscarSustitutorio(id);
  if (!sustitutorio) throw new Error("No existe ese descanso sustitutorio.");
  if (sustitutorio.estado !== "previsto") throw new Error("Ese descanso sustitutorio ya fue verificado.");
  if (hoy < sustitutorio.fechaPrevista) {
    throw new Error(`El descanso sustitutorio está previsto para el ${fecha(sustitutorio.fechaPrevista)}: solo puede verificarse ese día o después.`);
  }
  if (!(await repositorio.verificarSustitutorio(id, resultado, actor.id, new Date()))) throw new Error("Ese descanso sustitutorio ya fue verificado.");
}

/**
 * Días del rango que son feriado o el descanso semanal asignado de la persona, con lo que pasó en cada uno:
 * jornada trabajada, estado manual o sin resolver, y su descanso sustitutorio. No calcula importes.
 */
export async function consultarDiasDeDescansoOFeriado(
  repositorio: RepositorioDeDescansosYFeriados,
  actor: Actor,
  consulta: { dni: string; desde: string; hasta: string },
): Promise<DiaDeDescansoOFeriado[]> {
  exigirPermiso(actor);
  validarFechaDeRelacion(consulta.desde, "inicio de la consulta");
  validarFechaDeRelacion(consulta.hasta, "fin de la consulta");
  if (consulta.hasta < consulta.desde) throw new Error("El fin de la consulta no puede ser anterior a su inicio.");
  const dias: string[] = [];
  for (let dia = consulta.desde; dia <= consulta.hasta; dia = desplazarFecha(dia, 1)) {
    if (dias.length === MAXIMO_DE_DIAS_CONSULTADOS) throw new Error(`La consulta no puede abarcar más de ${MAXIMO_DE_DIAS_CONSULTADOS} días.`);
    dias.push(dia);
  }

  const [asignaciones, feriados, asistencias, sustitutorios] = await Promise.all([
    repositorio.listarDescansosSemanales(consulta.dni),
    repositorio.listarFeriados(consulta.desde, consulta.hasta),
    repositorio.asistenciasDelRango(consulta.dni, consulta.desde, consulta.hasta),
    repositorio.listarSustitutorios(consulta.dni, consulta.desde, consulta.hasta),
  ]);
  const feriadoPorFecha = new Map(feriados.map((feriado) => [feriado.fecha, feriado]));
  const asistenciaPorFecha = new Map(asistencias.map((asistencia) => [asistencia.fecha, asistencia]));
  const sustitutorioPorOrigen = new Map(sustitutorios.map((sustitutorio) => [sustitutorio.origenFecha, sustitutorio]));

  return dias.flatMap((dia) => {
    const sustitutorio = sustitutorioPorOrigen.get(dia);
    const clasificado = clasificarDia({
      fecha: dia,
      asignaciones,
      feriado: feriadoPorFecha.get(dia) ?? null,
      asistencia: asistenciaPorFecha.get(dia) ?? null,
      sustitutorio: sustitutorio ? { id: sustitutorio.id, estado: sustitutorio.estado, fechaPrevista: sustitutorio.fechaPrevista } : null,
    });
    return clasificado ? [clasificado] : [];
  });
}
