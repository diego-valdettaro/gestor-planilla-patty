"use client";

import { useRouter } from "next/navigation";

import type { EquipoOperativo } from "@/turnos/configurar-equipos-operativos";

import { NAVEGACION_SIN_SALTO, rutaDeFiltros } from "./navegacion-de-filtros";
import type { FiltroDeColaboradores } from "./visibilidad-de-colaboradores";

// Filtros de la lista de Colaboradores. Aplican al cambiar de valor, sin botón de
// envío (mismo patrón que el selector de equipo de Horarios). El filtrado real lo
// resuelve el servidor a partir de estos parámetros de la URL; al navegar no se
// mueve el scroll, solo se refresca la tabla.
export function FiltrosDeColaboradores({ grupo, mostrarInactivos }: FiltroDeColaboradores) {
  const router = useRouter();

  const navegar = (proximo: FiltroDeColaboradores) => {
    router.push(rutaDeFiltros(proximo), NAVEGACION_SIN_SALTO);
  };

  return <div className="filtros filtros-configuracion">
    <label>Grupo<select
      onChange={(evento) => navegar({ grupo: (evento.target.value || undefined) as EquipoOperativo | undefined, mostrarInactivos })}
      value={grupo ?? ""}
    ><option value="">Todos los grupos</option><option value="tiendas">Tiendas</option><option value="taller">Taller</option></select></label>
    <label className="checkbox"><input
      checked={mostrarInactivos}
      onChange={(evento) => navegar({ grupo, mostrarInactivos: evento.target.checked })}
      type="checkbox"
    />Mostrar inactivos</label>
  </div>;
}
