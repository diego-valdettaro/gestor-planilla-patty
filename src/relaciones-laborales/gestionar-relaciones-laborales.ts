import type { Actor } from "@/autenticacion/permisos";
import { exigir, puedeConsultarRelacionesLaborales, puedeGestionarRelacionesLaborales } from "@/autenticacion/permisos";
import { validarDni } from "@/colaboradores/registrar-colaborador";

import { formatearFechaDeRelacion, seSuperponeConElRango, vigenciasConfirmadas, type RelacionLaboral } from "./vigencia";

export type { RelacionLaboral } from "./vigencia";

export interface PersonaDeRelacion {
  nombre: string;
  grupo: string;
}

export interface RelacionConPersona extends RelacionLaboral, PersonaDeRelacion {}

/** Operaciones sobre las relaciones de una persona; dentro de `ejecutarSobreColaborador` corren en una transacción con su fila bloqueada. */
export interface AlmacenDeRelaciones {
  listarDelColaborador(dni: string): Promise<RelacionLaboral[]>;
  buscar(id: string): Promise<RelacionLaboral | undefined>;
  insertar(relacion: { dni: string; ingreso: string; responsableId: string }): Promise<RelacionLaboral>;
  actualizarIngreso(id: string, ingreso: string): Promise<void>;
  confirmarIngreso(id: string, responsableId: string, confirmadoEn: Date): Promise<void>;
  actualizarCese(id: string, cese: string): Promise<void>;
  confirmarCese(id: string, responsableId: string, confirmadoEn: Date): Promise<void>;
}

export interface RepositorioDeRelacionesLaborales extends AlmacenDeRelaciones {
  buscarColaborador(dni: string): Promise<(PersonaDeRelacion & { dni: string }) | undefined>;
  listarConPersona(): Promise<RelacionConPersona[]>;
  /** Serializa las operaciones de una misma persona para que dos relaciones suyas nunca se solapen. */
  ejecutarSobreColaborador<T>(dni: string, operacion: (almacen: AlmacenDeRelaciones) => Promise<T>): Promise<T>;
}

export interface PersonaConRelacionVigente {
  dni: string;
  nombre: string;
  grupo: string;
  relacionId: string;
  ingreso: string;
  /** Cese confirmado; null mientras no haya uno. */
  cese: string | null;
}

const FIN_DE_LOS_TIEMPOS = "9999-12-31";

export function validarFechaDeRelacion(valor: string, etiqueta: string): void {
  const coincide = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  const fecha = coincide ? new Date(`${valor}T00:00:00Z`) : undefined;
  if (!fecha || Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
    throw new Error(`La fecha de ${etiqueta} no es válida.`);
  }
}

function exigirPermisoParaGestionar(actor: Actor): void {
  exigir(puedeGestionarRelacionesLaborales(actor), "No tiene permiso para registrar ni confirmar relaciones laborales.");
}

function exigirPermisoParaConsultar(actor: Actor): void {
  exigir(puedeConsultarRelacionesLaborales(actor), "No tiene permiso para consultar relaciones laborales.");
}

function solapan(a: { ingreso: string; cese: string | null }, b: { ingreso: string; cese: string | null }): boolean {
  return a.ingreso <= (b.cese ?? FIN_DE_LOS_TIEMPOS) && b.ingreso <= (a.cese ?? FIN_DE_LOS_TIEMPOS);
}

function verificarQueNoSeSolape(propuesta: { ingreso: string; cese: string | null }, otras: RelacionLaboral[], esNueva = false): void {
  for (const otra of otras) {
    if (!solapan(propuesta, otra)) continue;
    if (esNueva && otra.cese === null) {
      throw new Error("La persona ya tiene una relación laboral sin cese. Registre y confirme su cese antes de registrar un reingreso.");
    }
    const periodo = otra.cese === null ? `desde el ${formatearFechaDeRelacion(otra.ingreso)}, sin cese` : `${formatearFechaDeRelacion(otra.ingreso)} al ${formatearFechaDeRelacion(otra.cese)}`;
    throw new Error(`Las fechas se solapan con otra relación laboral de la persona (${periodo}). El ingreso debe ser posterior al cese anterior.`);
  }
}

async function buscarOFallar(repositorio: RepositorioDeRelacionesLaborales, id: string): Promise<RelacionLaboral> {
  const relacion = await repositorio.buscar(id);
  if (!relacion) throw new Error("No existe esa relación laboral.");
  return relacion;
}

/** Ejecuta `operacion` sobre la relación `id` con la persona bloqueada, releyendo la relación dentro del bloqueo. */
async function sobreRelacion<T>(
  repositorio: RepositorioDeRelacionesLaborales,
  id: string,
  operacion: (almacen: AlmacenDeRelaciones, relacion: RelacionLaboral) => Promise<T>,
): Promise<T> {
  const { dni } = await buscarOFallar(repositorio, id);
  return repositorio.ejecutarSobreColaborador(dni, async (almacen) => operacion(almacen, await buscarEnAlmacen(almacen, id)));
}

async function buscarEnAlmacen(almacen: AlmacenDeRelaciones, id: string): Promise<RelacionLaboral> {
  const relacion = await almacen.buscar(id);
  if (!relacion) throw new Error("No existe esa relación laboral.");
  return relacion;
}

/** Registra el ingreso de una persona ya dada de alta por el gerente de su grupo; es su primera relación o un reingreso con el mismo DNI. */
export async function registrarIngreso(
  repositorio: RepositorioDeRelacionesLaborales,
  actor: Actor,
  solicitud: { dni: string; ingreso: string },
): Promise<RelacionLaboral> {
  exigirPermisoParaGestionar(actor);
  validarDni(solicitud.dni);
  validarFechaDeRelacion(solicitud.ingreso, "ingreso");
  if (!(await repositorio.buscarColaborador(solicitud.dni))) {
    throw new Error("No existe un colaborador con ese DNI. El gerente de su grupo debe darlo de alta primero.");
  }
  return repositorio.ejecutarSobreColaborador(solicitud.dni, async (almacen) => {
    verificarQueNoSeSolape({ ingreso: solicitud.ingreso, cese: null }, await almacen.listarDelColaborador(solicitud.dni), true);
    return almacen.insertar({ dni: solicitud.dni, ingreso: solicitud.ingreso, responsableId: actor.id });
  });
}

/** Corrige la fecha de ingreso mientras Recursos Humanos no la confirmó. */
export async function corregirIngreso(
  repositorio: RepositorioDeRelacionesLaborales,
  actor: Actor,
  relacionId: string,
  ingreso: string,
): Promise<void> {
  exigirPermisoParaGestionar(actor);
  validarFechaDeRelacion(ingreso, "ingreso");
  await sobreRelacion(repositorio, relacionId, async (almacen, relacion) => {
    if (relacion.ingresoConfirmado) throw new Error("El ingreso ya está confirmado y no puede modificarse.");
    if (relacion.cese !== null && ingreso > relacion.cese) throw new Error("El ingreso no puede ser posterior al cese registrado.");
    const otras = (await almacen.listarDelColaborador(relacion.dni)).filter(({ id }) => id !== relacion.id);
    verificarQueNoSeSolape({ ingreso, cese: relacion.cese }, otras);
    await almacen.actualizarIngreso(relacion.id, ingreso);
  });
}

export async function confirmarIngreso(
  repositorio: RepositorioDeRelacionesLaborales,
  actor: Actor,
  relacionId: string,
): Promise<void> {
  exigirPermisoParaGestionar(actor);
  await sobreRelacion(repositorio, relacionId, async (almacen, relacion) => {
    if (relacion.ingresoConfirmado) throw new Error("El ingreso ya está confirmado.");
    await almacen.confirmarIngreso(relacion.id, actor.id, new Date());
  });
}

/** Registra la fecha de cese, o la corrige mientras no esté confirmada. Exige el ingreso confirmado. */
export async function registrarCese(
  repositorio: RepositorioDeRelacionesLaborales,
  actor: Actor,
  relacionId: string,
  cese: string,
): Promise<void> {
  exigirPermisoParaGestionar(actor);
  validarFechaDeRelacion(cese, "cese");
  await sobreRelacion(repositorio, relacionId, async (almacen, relacion) => {
    if (!relacion.ingresoConfirmado) throw new Error("Confirme el ingreso antes de registrar el cese.");
    if (relacion.ceseConfirmado) throw new Error("El cese ya está confirmado y no puede modificarse.");
    if (cese < relacion.ingreso) throw new Error("El cese no puede ser anterior al ingreso.");
    const otras = (await almacen.listarDelColaborador(relacion.dni)).filter(({ id }) => id !== relacion.id);
    verificarQueNoSeSolape({ ingreso: relacion.ingreso, cese }, otras);
    await almacen.actualizarCese(relacion.id, cese);
  });
}

export async function confirmarCese(
  repositorio: RepositorioDeRelacionesLaborales,
  actor: Actor,
  relacionId: string,
): Promise<void> {
  exigirPermisoParaGestionar(actor);
  await sobreRelacion(repositorio, relacionId, async (almacen, relacion) => {
    if (relacion.cese === null) throw new Error("Registre la fecha de cese antes de confirmarla.");
    if (relacion.ceseConfirmado) throw new Error("El cese ya está confirmado.");
    if (!relacion.ingresoConfirmado) throw new Error("Confirme el ingreso antes de confirmar el cese.");
    await almacen.confirmarCese(relacion.id, actor.id, new Date());
  });
}

export async function listarRelacionesLaborales(
  repositorio: RepositorioDeRelacionesLaborales,
  actor: Actor,
): Promise<RelacionConPersona[]> {
  exigirPermisoParaConsultar(actor);
  return repositorio.listarConPersona();
}

/**
 * Personas con relación laboral vigente en una fecha (`hasta` omitido) o con al menos un día vigente en el
 * rango `desde`–`hasta`. Parte de las relaciones confirmadas, no de las filas de asistencia.
 */
export async function consultarPersonasConRelacionVigente(
  repositorio: RepositorioDeRelacionesLaborales,
  actor: Actor,
  desde: string,
  hasta: string = desde,
): Promise<PersonaConRelacionVigente[]> {
  exigirPermisoParaConsultar(actor);
  validarFechaDeRelacion(desde, "inicio de la consulta");
  validarFechaDeRelacion(hasta, "fin de la consulta");
  if (hasta < desde) throw new Error("El fin de la consulta no puede ser anterior a su inicio.");

  const vigentes: PersonaConRelacionVigente[] = [];
  for (const relacion of await repositorio.listarConPersona()) {
    const [vigencia] = vigenciasConfirmadas([relacion]);
    if (!vigencia || !seSuperponeConElRango(vigencia, desde, hasta)) continue;
    vigentes.push({ dni: relacion.dni, nombre: relacion.nombre, grupo: relacion.grupo, relacionId: relacion.id, ingreso: vigencia.ingreso, cese: vigencia.cese });
  }
  return vigentes.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.ingreso.localeCompare(b.ingreso));
}
