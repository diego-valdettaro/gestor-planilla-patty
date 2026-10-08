import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import {
  anularImporte,
  confirmarFuente,
  consultarEstadoDeFuentes,
  consultarFuente,
  consultarImportesDePersona,
  registrarImporte,
  volverAPendiente,
  type ConfirmacionDeFuente,
  type DetalleDeFuente,
  type FilaDeFuente,
  type ImportesDePersonaEnFuente,
  type RepositorioDeFuentesExternas,
  type ResultadoDeCambio,
} from "./gestionar-fuentes-externas";
import type { CodigoDeTipoDeFuente } from "./tipos-de-fuente";

/** Casos de uso de fuentes externas con el actor tomado de la sesión del servidor. */
export function crearCasosDeUsoDeFuentesExternas(repositorio: RepositorioDeFuentesExternas, sesion: SesionDelServidor) {
  return {
    async estado(mes: string): Promise<FilaDeFuente[]> {
      return consultarEstadoDeFuentes(repositorio, await sesion.obtenerActorActual(), mes);
    },
    async fuente(tipoDeFuente: string, mes: string): Promise<DetalleDeFuente | undefined> {
      return consultarFuente(repositorio, await sesion.obtenerActorActual(), tipoDeFuente, mes);
    },
    async importesDePersona(dni: string, mes: string): Promise<Record<CodigoDeTipoDeFuente, ImportesDePersonaEnFuente>> {
      return consultarImportesDePersona(repositorio, await sesion.obtenerActorActual(), dni, mes);
    },
    async registrar(solicitud: Parameters<typeof registrarImporte>[2]): Promise<ResultadoDeCambio> {
      return registrarImporte(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
    async anular(solicitud: { importeId: string; motivo: string }): Promise<ResultadoDeCambio> {
      return anularImporte(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
    async confirmar(solicitud: { tipoDeFuente: string; mes: string }): Promise<ConfirmacionDeFuente> {
      return confirmarFuente(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
    async volverAPendiente(solicitud: { tipoDeFuente: string; mes: string }): Promise<void> {
      return volverAPendiente(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
  };
}
