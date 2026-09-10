"use client";

import { useRouter } from "next/navigation";

import type { Grupo } from "@/turnos/configurar-equipos-operativos";

import { NAVEGACION_SIN_SALTO, rutaDeFiltros } from "./navegacion-de-filtros";
import type { FiltroDeColaboradores } from "./visibilidad-de-colaboradores";

// Filtros de la lista de Colaboradores. Aplican al cambiar de valor, sin botón de
// envío (mismo patrón que el selector de equipo de Horarios). El filtrado real lo
// resuelve el servidor a partir de estos parámetros de la URL; al navegar no se
// mueve el scroll, solo se refresca la tabla.
export function FiltrosDeColaboradores({
  grupo,
  grupos = [],
  mostrarInactivos,
}: FiltroDeColaboradores & { grupos?: string[] }) {
  const router = useRouter();

  const navegar = (proximo: FiltroDeColaboradores) => {
    router.push(rutaDeFiltros(proximo), NAVEGACION_SIN_SALTO);
  };

  return (
    <div className="filtros panel-filtros">
      <label>
        Grupo
        <select
          onChange={(evento) =>
            navegar({
              grupo: (evento.target.value || undefined) as
                | Grupo
                | undefined,
              mostrarInactivos,
            })
          }
          value={grupo ?? ""}
        >
          <option value="">Todos los grupos</option>
          {grupos.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox">
        <input
          checked={mostrarInactivos}
          onChange={(evento) =>
            navegar({ grupo, mostrarInactivos: evento.target.checked })
          }
          type="checkbox"
        />
        Mostrar inactivos
      </label>
    </div>
  );
}
