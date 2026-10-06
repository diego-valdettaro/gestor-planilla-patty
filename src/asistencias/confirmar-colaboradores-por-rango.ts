import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeOperarAsistenciaDelGrupo, puedeRevisarAsistencias } from "@/autenticacion/permisos";

export interface ColaboradorParaConfirmar {
  dni: string;
  nombre: string;
}

export interface BloqueoDeConfirmacion {
  fecha: string;
  causa: string;
}

export interface EvaluacionDeColaborador {
  dni: string;
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
  dnis: string[];
}

export interface RepositorioDeConfirmacionPorRango {
  obtenerGruposDeColaboradores(dnis: string[]): Promise<Array<{ dni: string; grupo: string }>>;
  evaluarColaboradoresPorRango(solicitud: SolicitudDeEvaluacionPorRango): Promise<EvaluacionDeColaborador[]>;
  confirmarColaboradoresPorRango(solicitud: SolicitudDeConfirmacionPorRango, responsableId: string): Promise<void>;
}

export async function evaluarColaboradoresPorRango(
  repositorio: RepositorioDeConfirmacionPorRango,
  actor: Actor,
  solicitud: SolicitudDeEvaluacionPorRango,
): Promise<EvaluacionDeColaborador[]> {
  exigir(puedeRevisarAsistencias(actor), MENSAJE_SIN_PERMISO);
  validarRango(solicitud.inicio, solicitud.fin);
  const colaboradores = [...new Map(solicitud.colaboradores.filter(({ dni }) => dni).map((item) => [item.dni, item])).values()];
  if (!colaboradores.length) return [];
  await autorizarGruposDe(repositorio, actor, colaboradores.map(({ dni }) => dni));
  return repositorio.evaluarColaboradoresPorRango({ ...solicitud, colaboradores });
}

export async function confirmarColaboradoresPorRango(
  repositorio: RepositorioDeConfirmacionPorRango,
  actor: Actor,
  solicitud: SolicitudDeConfirmacionPorRango,
): Promise<void> {
  exigir(puedeRevisarAsistencias(actor), MENSAJE_SIN_PERMISO);
  validarRango(solicitud.inicio, solicitud.fin);
  const dnis = [...new Set(solicitud.dnis.filter(Boolean))];
  if (!dnis.length) throw new Error("Debe seleccionar al menos un colaborador.");
  await autorizarGruposDe(repositorio, actor, dnis);
  await repositorio.confirmarColaboradoresPorRango({ ...solicitud, dnis }, actor.id);
}

function validarRango(inicio: string, fin: string): void {
  if (!esFecha(inicio) || !esFecha(fin) || inicio > fin) throw new Error("El rango de confirmación no es válido.");
}

function esFecha(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  return new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) === valor;
}

const MENSAJE_SIN_PERMISO = "No tiene permiso para revisar asistencias.";

async function autorizarGruposDe(repositorio: RepositorioDeConfirmacionPorRango, actor: Actor, dnis: string[]): Promise<void> {
  const grupos = await repositorio.obtenerGruposDeColaboradores(dnis);
  const gruposPorDni = new Map(grupos.map(({ dni, grupo }) => [dni, grupo]));
  for (const dni of dnis) {
    const grupo = gruposPorDni.get(dni);
    exigir(grupo !== undefined && puedeOperarAsistenciaDelGrupo(actor, grupo), "No tiene permiso para revisar asistencias de este grupo.");
  }
}
