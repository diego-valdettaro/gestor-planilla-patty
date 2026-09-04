import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";
import { publicarTurnoSemanal } from "./publicar-turno-semanal";
import { procesarHorarioSemanal, type RepositorioParaProcesarHorarioSemanal } from "./procesar-horario-semanal";

export function crearCasosDeUsoDeTurnos(
  repositorio: RepositorioDeTurnos & Partial<RepositorioParaProcesarHorarioSemanal>,
  sesion: SesionDelServidor,
) {
  return {
    async publicar(turno: TurnoPublicado): Promise<void> {
      await publicarTurnoSemanal(
        repositorio,
        await sesion.obtenerActorActual(),
        turno,
      );
    },
    async procesar(idHuellero: string, semana: string): Promise<void> {
      if (!esRepositorioParaProcesarHorarioSemanal(repositorio)) throw new Error("El repositorio no permite procesar horarios semanales.");
      await procesarHorarioSemanal(repositorio, await sesion.obtenerActorActual(), idHuellero, semana);
    },
  };
}

function esRepositorioParaProcesarHorarioSemanal(
  repositorio: RepositorioDeTurnos & Partial<RepositorioParaProcesarHorarioSemanal>,
): repositorio is RepositorioDeTurnos & RepositorioParaProcesarHorarioSemanal {
  return Boolean(repositorio.listarSemanaPublicada && repositorio.asistenciasLaboralesEstanProcesadas && repositorio.registrarProcesamiento);
}
