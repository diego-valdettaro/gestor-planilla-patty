import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeOperarAsistenciaDelGrupo, puedeRevisarAsistencias } from "@/autenticacion/permisos";

import { diasDeLaSemana, inicioDeSemana } from "./semana";
import type { Grupo } from "./configurar-equipos-operativos";

export interface ProcesamientoDeHorarioSemanal {
  dni: string;
  semana: string;
  equipo: Grupo;
  responsableId: string;
}

export interface RepositorioParaProcesarHorarioSemanal {
  listarSemanaPublicada(dni: string, semana: string): Promise<Array<{ fecha: string; descanso: boolean }>>;
  asistenciasLaboralesEstanProcesadas(dni: string, semana: string): Promise<boolean>;
  obtenerEquipoOperativo(dni: string): Promise<Grupo | undefined>;
  registrarProcesamiento(procesamiento: ProcesamientoDeHorarioSemanal): Promise<void>;
}

const MENSAJE_SIN_PERMISO = "No tiene permiso para procesar horarios semanales.";

export async function procesarHorarioSemanal(
  repositorio: RepositorioParaProcesarHorarioSemanal,
  actor: Actor,
  dni: string,
  semana: string,
): Promise<void> {
  exigir(puedeRevisarAsistencias(actor), MENSAJE_SIN_PERMISO);
  // Procesar la semana confirma las jornadas de la persona: solo quien opera su grupo, no Finanzas en nombre del gerente.
  const equipo = await repositorio.obtenerEquipoOperativo(dni);
  if (equipo === undefined || !puedeOperarAsistenciaDelGrupo(actor, equipo)) throw new Error(MENSAJE_SIN_PERMISO);
  if (inicioDeSemana(semana) !== semana) throw new Error("La semana a procesar debe comenzar un lunes.");

  const horarios = await repositorio.listarSemanaPublicada(dni, semana);
  const fechasPublicadas = new Set(horarios.map(({ fecha }) => fecha));
  if (!diasDeLaSemana(semana).every((fecha) => fechasPublicadas.has(fecha))) {
    throw new Error("El horario semanal debe tener los siete días publicados para procesarlo.");
  }
  if (!await repositorio.asistenciasLaboralesEstanProcesadas(dni, semana)) {
    throw new Error("Todas las asistencias laborales de la semana deben estar confirmadas o tener un estado manual.");
  }
  await repositorio.registrarProcesamiento({ dni, semana, equipo, responsableId: actor.id });
}
