import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";
import { cerrarPeriodo, crearPeriodo, decidirHorasExtra, reabrirPeriodo, type NuevoPeriodo, type RepositorioDePeriodos, type SolicitudDeDecisionDeHorasExtra } from "./periodo-planilla";
export function crearCasosDeUsoDePeriodos(repositorio: RepositorioDePeriodos, sesion: SesionDelServidor) {
  return {
    async crear(datos: NuevoPeriodo) { await crearPeriodo(repositorio, await sesion.obtenerActorActual(), datos); },
    async decidirHorasExtra(solicitud: SolicitudDeDecisionDeHorasExtra) { await decidirHorasExtra(repositorio, await sesion.obtenerActorActual(), solicitud); },
    async cerrar(id: string) { await cerrarPeriodo(repositorio, await sesion.obtenerActorActual(), id); },
    async reabrir(id: string, motivo: string) { await reabrirPeriodo(repositorio, await sesion.obtenerActorActual(), id, motivo); },
  };
}
