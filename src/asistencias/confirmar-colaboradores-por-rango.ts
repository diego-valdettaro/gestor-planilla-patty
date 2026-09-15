import type { Actor } from "@/colaboradores/registrar-colaborador";

export interface ColaboradorParaConfirmar {
  idHuellero: string;
  nombre: string;
}

export interface BloqueoDeConfirmacion {
  fecha: string;
  causa: string;
}

export interface EvaluacionDeColaborador {
  idHuellero: string;
  nombre: string;
  seleccionable: boolean;
  jornadasPendientes: number;
  jornadasRegistradas: number;
  bloqueos: BloqueoDeConfirmacion[];
}

export interface SolicitudDeEvaluacionPorRango {
  inicio: string;
  fin: string;
  colaboradores: ColaboradorParaConfirmar[];
}

export interface SolicitudDeConfirmacionPorRango {
  inicio: string;
  fin: string;
  idsHuellero: string[];
}

export interface RepositorioDeConfirmacionPorRango {
  evaluarColaboradoresPorRango(solicitud: SolicitudDeEvaluacionPorRango): Promise<EvaluacionDeColaborador[]>;
  confirmarColaboradoresPorRango(solicitud: SolicitudDeConfirmacionPorRango, responsableId: string): Promise<void>;
}

export async function evaluarColaboradoresPorRango(
  repositorio: RepositorioDeConfirmacionPorRango,
  actor: Actor,
  solicitud: SolicitudDeEvaluacionPorRango,
): Promise<EvaluacionDeColaborador[]> {
  autorizarRevision(actor);
  validarRango(solicitud.inicio, solicitud.fin);
  const colaboradores = [...new Map(solicitud.colaboradores.filter(({ idHuellero }) => idHuellero).map((item) => [item.idHuellero, item])).values()];
  if (!colaboradores.length) return [];
  return repositorio.evaluarColaboradoresPorRango({ ...solicitud, colaboradores });
}

export async function confirmarColaboradoresPorRango(
  repositorio: RepositorioDeConfirmacionPorRango,
  actor: Actor,
  solicitud: SolicitudDeConfirmacionPorRango,
): Promise<void> {
  autorizarRevision(actor);
  validarRango(solicitud.inicio, solicitud.fin);
  const idsHuellero = [...new Set(solicitud.idsHuellero.filter(Boolean))];
  if (!idsHuellero.length) throw new Error("Debe seleccionar al menos un colaborador.");
  await repositorio.confirmarColaboradoresPorRango({ ...solicitud, idsHuellero }, actor.id);
}

function validarRango(inicio: string, fin: string): void {
  if (!esFecha(inicio) || !esFecha(fin) || inicio > fin) throw new Error("El rango de confirmación no es válido.");
}

function esFecha(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  return new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) === valor;
}

function autorizarRevision(actor: Actor): void {
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") throw new Error("No tiene permiso para revisar asistencias.");
}
