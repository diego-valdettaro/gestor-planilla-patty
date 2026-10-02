import type { Actor } from "@/colaboradores/registrar-colaborador";
import type { Grupo } from "./configurar-equipos-operativos";
import type { DatosDeJornadaPlanificada, RepositorioParaValidarJornadaPlanificada } from "./jornada-planificada";
import { validarJornadaPlanificada } from "./jornada-planificada";

export interface TurnoPublicado extends DatosDeJornadaPlanificada {
  dni: string;
  fecha: string;
  grupo?: Grupo;
}

export interface AsistenciaEsperada {
  dni: string;
  fecha: string;
  estado: "pendiente";
}

export interface RepositorioDeTurnos extends RepositorioParaValidarJornadaPlanificada {
  buscarPublicado(
    dni: string,
    fecha: string,
  ): Promise<TurnoPublicado | undefined>;
  publicar(turno: TurnoPublicado, actor?: Actor): Promise<void>;
  publicarEnLote(turnos: TurnoPublicado[], actor?: Actor): Promise<void>;
  asistenciaEstaProcesada(dni: string, fecha: string): Promise<boolean>;
  reemplazarSemanaPublicada(turnos: TurnoPublicado[], actor: Actor, motivo: string): Promise<void>;
  perteneceAPeriodoAbierto(fecha: string): Promise<boolean>;
  obtenerGrupoDelColaborador(dni: string): Promise<Grupo | undefined>;
}

export async function publicarTurnoSemanal(
  repositorio: RepositorioDeTurnos,
  actor: Actor,
  turno: TurnoPublicado,
): Promise<void> {
  if (actor.rol !== "operaciones" && actor.rol !== "administracion") {
    throw new Error("No tiene permiso para publicar turnos.");
  }

  if (!(await repositorio.perteneceAPeriodoAbierto(turno.fecha))) {
    throw new Error("La fecha no pertenece a un período de planilla abierto.");
  }

  if (await repositorio.buscarPublicado(turno.dni, turno.fecha)) {
    throw new Error("Ya existe un turno publicado para este colaborador y fecha.");
  }

  const grupo = await repositorio.obtenerGrupoDelColaborador(turno.dni);
  if (!grupo) throw new Error("El colaborador activo no existe.");
  await validarJornadaPlanificada(repositorio, grupo, turno);

  await repositorio.publicar(turno, actor);
}
