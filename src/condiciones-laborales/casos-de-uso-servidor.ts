import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";

import {
  consultarCondicionesVigentes,
  consultarDetalleDeRelacion,
  corregirCondicionLaboral,
  listarCondicionesLaborales,
  listarSedesDeAdscripcion,
  registrarCondicionLaboral,
  type CondicionLaboral,
  type DetalleDeRelacion,
  type FiltrosDeCondiciones,
  type ListadoDeCondiciones,
  type RepositorioDeCondicionesLaborales,
  type ValoresVigentes,
} from "./gestionar-condiciones-laborales";

/** Casos de uso de condiciones laborales con el actor tomado de la sesión del servidor. */
export function crearCasosDeUsoDeCondicionesLaborales(repositorio: RepositorioDeCondicionesLaborales, sesion: SesionDelServidor) {
  return {
    async listar(hoy: string, filtros?: FiltrosDeCondiciones): Promise<ListadoDeCondiciones> {
      return listarCondicionesLaborales(repositorio, await sesion.obtenerActorActual(), { hoy, filtros });
    },
    async detalle(relacionId: string, hoy: string): Promise<DetalleDeRelacion | undefined> {
      return consultarDetalleDeRelacion(repositorio, await sesion.obtenerActorActual(), relacionId, hoy);
    },
    async vigentesEn(relacionId: string, fecha: string): Promise<ValoresVigentes> {
      return consultarCondicionesVigentes(repositorio, await sesion.obtenerActorActual(), relacionId, fecha);
    },
    async sedesDeAdscripcion(): Promise<string[]> {
      return listarSedesDeAdscripcion(repositorio, await sesion.obtenerActorActual());
    },
    async registrar(solicitud: { relacionId: string; dato: string; valor: string; vigenteDesde: string }): Promise<CondicionLaboral> {
      return registrarCondicionLaboral(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
    async corregir(solicitud: { condicionId: string; valor: string; motivo: string }): Promise<CondicionLaboral> {
      return corregirCondicionLaboral(repositorio, await sesion.obtenerActorActual(), solicitud);
    },
  };
}
