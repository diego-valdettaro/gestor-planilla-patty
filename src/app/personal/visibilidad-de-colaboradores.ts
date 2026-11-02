import type { Grupo } from "@/turnos/configurar-equipos-operativos";

export type FiltroDeColaboradores = {
  grupo?: Grupo;
  mostrarInactivos: boolean;
};

// Qué colaboradores muestra la tabla de Configuración dado el grupo elegido y si
// el control "Mostrar inactivos" está encendido. El colaborador pertenece
// directamente a un grupo operativo (no se deriva de su sede).
export function filtrarColaboradores<T extends { grupo: Grupo; activo: boolean }>(
  colaboradores: T[],
  filtro: FiltroDeColaboradores,
): T[] {
  return colaboradores.filter((colaborador) => {
    if (filtro.grupo && colaborador.grupo !== filtro.grupo) return false;
    if (!filtro.mostrarInactivos && !colaborador.activo) return false;
    return true;
  });
}
