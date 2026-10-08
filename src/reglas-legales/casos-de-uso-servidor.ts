import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import {
  activarReglaLegal,
  consultarHistorialDeRegla,
  consultarReglaVigente,
  corregirReglaLegal,
  listarReglasLegales,
  type ConsultaDeReglaVigente,
  type FilaDeReglaLegal,
  type HistorialDeReglaLegal,
  type ReglaLegal,
  type RepositorioDeReglasLegales,
} from "./gestionar-reglas-legales";

/** Casos de uso de reglas legales con el actor tomado de la sesión del servidor. */
export function crearCasosDeUsoDeReglasLegales(repositorio: RepositorioDeReglasLegales, sesion: SesionDelServidor) {
  return {
    async listar(hoy: string): Promise<FilaDeReglaLegal[]> {
      return listarReglasLegales(repositorio, await sesion.obtenerActorActual(), { hoy });
    },
    async historial(codigo: string, hoy: string): Promise<HistorialDeReglaLegal | undefined> {
      return consultarHistorialDeRegla(repositorio, await sesion.obtenerActorActual(), codigo, hoy);
    },
    async vigenteEn(codigo: string, fecha: string): Promise<ConsultaDeReglaVigente> {
      return consultarReglaVigente(repositorio, await sesion.obtenerActorActual(), codigo, fecha);
    },
    async activar(solicitud: { codigo: string; valor: string; vigenteDesde: string; fuenteOficial: string }): Promise<ReglaLegal> {
      return activarReglaLegal(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
    async corregir(solicitud: { reglaId: string; valor: string; fuenteOficial?: string; motivo: string }): Promise<ReglaLegal> {
      return corregirReglaLegal(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
  };
}
