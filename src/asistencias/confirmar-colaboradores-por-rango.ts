import type { Actor } from "@/colaboradores/registrar-colaborador";

export interface SolicitudDeConfirmacionPorRango {
  inicio: string;
  fin: string;
  idsHuellero: string[];
}

export interface RepositorioDeConfirmacionPorRango {
  confirmarColaboradoresPorRango(solicitud: SolicitudDeConfirmacionPorRango, responsableId: string): Promise<void>;
}

export async function confirmarColaboradoresPorRango(
  repositorio: RepositorioDeConfirmacionPorRango,
  actor: Actor,
  solicitud: SolicitudDeConfirmacionPorRango,
): Promise<void> {
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") throw new Error("No tiene permiso para revisar asistencias.");
  if (!esFecha(solicitud.inicio) || !esFecha(solicitud.fin) || solicitud.inicio > solicitud.fin) {
    throw new Error("El rango de confirmacion no es valido.");
  }
  const idsHuellero = [...new Set(solicitud.idsHuellero.filter(Boolean))];
  if (!idsHuellero.length) throw new Error("Debe seleccionar al menos un colaborador.");
  await repositorio.confirmarColaboradoresPorRango({ ...solicitud, idsHuellero }, actor.id);
}

function esFecha(valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(new Date(`${valor}T00:00:00Z`).getTime());
}
