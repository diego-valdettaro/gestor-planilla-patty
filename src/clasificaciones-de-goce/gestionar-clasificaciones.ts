import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeGestionarPagos } from "@/autenticacion/permisos";
import { validarFechaDeRelacion } from "@/relaciones-laborales/gestionar-relaciones-laborales";

import type { ClasificacionGuardada, RepositorioPostgresDeClasificacionesDeGoce } from "./repositorio-postgres";

export type RepositorioDeClasificacionesDeGoce = Pick<RepositorioPostgresDeClasificacionesDeGoce, "guardar" | "listarEntre">;

const SIN_PERMISO = "No tiene permiso para consultar ni editar Pagos.";

/**
 * Finanzas decide si un permiso o suspensión es con o sin goce. La decisión queda vinculada a la jornada (dni + fecha) con su
 * actor y fecha; el registro fuente de Asistencia no se toca. Clasificar de nuevo reemplaza la decisión vigente.
 */
export async function clasificarGoce(
  repositorio: Pick<RepositorioDeClasificacionesDeGoce, "guardar">,
  actor: Actor,
  solicitud: { dni: string; fecha: string; conGoce: boolean },
): Promise<ClasificacionGuardada> {
  exigir(puedeGestionarPagos(actor), SIN_PERMISO);
  exigir(/^\d{8}$/.test(solicitud.dni), "El DNI debe tener 8 dígitos.");
  validarFechaDeRelacion(solicitud.fecha, "la jornada");
  return repositorio.guardar({ ...solicitud, clasificadoPorId: actor.id });
}

export async function consultarClasificaciones(
  repositorio: Pick<RepositorioDeClasificacionesDeGoce, "listarEntre">,
  actor: Actor,
  rango: { desde: string; hasta: string },
): Promise<ClasificacionGuardada[]> {
  exigir(puedeGestionarPagos(actor), SIN_PERMISO);
  return repositorio.listarEntre(rango.desde, rango.hasta);
}
