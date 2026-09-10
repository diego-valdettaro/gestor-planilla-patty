import type { Actor } from "@/colaboradores/registrar-colaborador";

import { diasDeLaSemana, inicioDeSemana } from "./semana";
import type { Grupo } from "./configurar-equipos-operativos";

export interface ProcesamientoDeHorarioSemanal {
  idHuellero: string;
  semana: string;
  equipo: Grupo;
  responsableId: string;
}

export interface RepositorioParaProcesarHorarioSemanal {
  listarSemanaPublicada(idHuellero: string, semana: string): Promise<Array<{ fecha: string; descanso: boolean }>>;
  asistenciasLaboralesEstanProcesadas(idHuellero: string, semana: string): Promise<boolean>;
  obtenerEquipoOperativo(idHuellero: string): Promise<Grupo | undefined>;
  registrarProcesamiento(procesamiento: ProcesamientoDeHorarioSemanal): Promise<void>;
}

export async function procesarHorarioSemanal(
  repositorio: RepositorioParaProcesarHorarioSemanal,
  actor: Actor,
  idHuellero: string,
  semana: string,
): Promise<void> {
  if (actor.rol !== "finanzas") throw new Error("No tiene permiso para procesar horarios semanales.");
  if (inicioDeSemana(semana) !== semana) throw new Error("La semana a procesar debe comenzar un lunes.");

  const horarios = await repositorio.listarSemanaPublicada(idHuellero, semana);
  const fechasPublicadas = new Set(horarios.map(({ fecha }) => fecha));
  if (!diasDeLaSemana(semana).every((fecha) => fechasPublicadas.has(fecha))) {
    throw new Error("El horario semanal debe tener los siete días publicados para procesarlo.");
  }
  if (!await repositorio.asistenciasLaboralesEstanProcesadas(idHuellero, semana)) {
    throw new Error("Todas las asistencias laborales de la semana deben estar confirmadas o tener un estado manual.");
  }
  const equipo = await repositorio.obtenerEquipoOperativo(idHuellero);
  if (!equipo) throw new Error("El colaborador no pertenece a un equipo operativo.");
  await repositorio.registrarProcesamiento({ idHuellero, semana, equipo, responsableId: actor.id });
}
