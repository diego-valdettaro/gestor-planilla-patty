import type { Actor } from "@/colaboradores/registrar-colaborador";

export interface TurnoPublicado {
  idHuellero: string;
  fecha: string;
  sede: string;
  entradaProgramada: string | null;
  salidaProgramada: string | null;
  descanso: boolean;
}

export interface AsistenciaEsperada {
  idHuellero: string;
  fecha: string;
  estado: "pendiente";
}

export interface RepositorioDeTurnos {
  buscarPublicado(
    idHuellero: string,
    fecha: string,
  ): Promise<TurnoPublicado | undefined>;
  publicar(turno: TurnoPublicado): Promise<void>;
  publicarEnLote(turnos: TurnoPublicado[]): Promise<void>;
  perteneceAPeriodoAbierto(fecha: string): Promise<boolean>;
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

  if (await repositorio.buscarPublicado(turno.idHuellero, turno.fecha)) {
    throw new Error("Ya existe un turno publicado para este colaborador y fecha.");
  }

  await repositorio.publicar(turno);
}
