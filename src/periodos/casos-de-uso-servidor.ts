import type { SesionDelServidor } from "@/colaboradores/casos-de-uso-servidor";
import { cerrarPeriodo, reabrirPeriodo, type RepositorioDePeriodos } from "./periodo-planilla";
export function crearCasosDeUsoDePeriodos(repositorio: RepositorioDePeriodos, sesion: SesionDelServidor) {
  return { async cerrar(id: string) { await cerrarPeriodo(repositorio, await sesion.obtenerActorActual(), id); }, async reabrir(id: string, motivo: string) { await reabrirPeriodo(repositorio, await sesion.obtenerActorActual(), id, motivo); } };
}
