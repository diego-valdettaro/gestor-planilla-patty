import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import {
  confirmarCese,
  confirmarIngreso,
  consultarPersonasConRelacionVigente,
  corregirIngreso,
  listarRelacionesLaborales,
  registrarCese,
  registrarIngreso,
  type PersonaConRelacionVigente,
  type RelacionConPersona,
  type RelacionLaboral,
  type RepositorioDeRelacionesLaborales,
} from "./gestionar-relaciones-laborales";

/** Casos de uso de relaciones laborales con el actor tomado de la sesión del servidor. */
export function crearCasosDeUsoDeRelacionesLaborales(repositorio: RepositorioDeRelacionesLaborales, sesion: SesionDelServidor) {
  return {
    async registrarIngreso(solicitud: { dni: string; ingreso: string }): Promise<RelacionLaboral> {
      return registrarIngreso(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
    async corregirIngreso(relacionId: string, ingreso: string): Promise<void> {
      await corregirIngreso(repositorio, await sesion.obtenerActorActual(), relacionId, ingreso);
    },
    async confirmarIngreso(relacionId: string): Promise<void> {
      await confirmarIngreso(repositorio, await sesion.obtenerActorActual(), relacionId);
    },
    async registrarCese(relacionId: string, cese: string): Promise<void> {
      await registrarCese(repositorio, await sesion.obtenerActorActual(), relacionId, cese);
    },
    async confirmarCese(relacionId: string): Promise<void> {
      await confirmarCese(repositorio, await sesion.obtenerActorActual(), relacionId);
    },
    async listar(): Promise<RelacionConPersona[]> {
      return listarRelacionesLaborales(repositorio, await sesion.obtenerActorActual());
    },
    async consultarVigentes(desde: string, hasta?: string): Promise<PersonaConRelacionVigente[]> {
      return consultarPersonasConRelacionVigente(repositorio, await sesion.obtenerActorActual(), desde, hasta);
    },
  };
}
