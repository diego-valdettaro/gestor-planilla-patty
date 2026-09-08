import type { EquipoOperativo } from "@/turnos/configurar-equipos-operativos";

export type FiltroDeColaboradores = {
  grupo?: EquipoOperativo;
  mostrarInactivos: boolean;
};

// Qué colaboradores muestra la tabla de Configuración dado el grupo elegido y si
// el control "Mostrar inactivos" está encendido. El grupo del colaborador sale de
// la sede a la que pertenece; `null` cuando su sede no tiene grupo asignado.
export function filtrarColaboradores<T extends { grupo: EquipoOperativo | null; activo: boolean }>(
  colaboradores: T[],
  filtro: FiltroDeColaboradores,
): T[] {
  return colaboradores.filter((colaborador) => {
    if (filtro.grupo && colaborador.grupo !== filtro.grupo) return false;
    if (!filtro.mostrarInactivos && !colaborador.activo) return false;
    return true;
  });
}
