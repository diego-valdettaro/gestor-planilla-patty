// Matriz de permisos del servidor (ADR 0012). Es el único lugar donde se decide qué rol puede
// hacer qué; los casos de uso, las páginas, las acciones, la API y la navegación la consultan.
//
// El Administrador del sistema es un superusuario temporal mientras se estabiliza el uso de la
// herramienta: puede ejecutar todo lo que pueden los demás roles, sin límite de grupo.

export const ROLES = ["administrador", "gerente_de_area", "recursos_humanos", "finanzas"] as const;

export type Rol = (typeof ROLES)[number];

export const NOMBRE_DE_ROL: Record<Rol, string> = {
  administrador: "Administrador del sistema",
  gerente_de_area: "Gerente de área",
  recursos_humanos: "Recursos Humanos",
  finanzas: "Finanzas",
};

export interface GrupoAsignado {
  nombre: string;
  gestionaAsistencia: boolean;
}

export interface Actor {
  id: string;
  rol: Rol;
  nombreUsuario?: string;
  /** Grupos asignados al gerente de área; vacío o ausente en los demás roles. */
  grupos?: GrupoAsignado[];
}

export function exigir(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(mensaje);
}

function gruposDe(actor: Actor): GrupoAsignado[] {
  return actor.rol === "gerente_de_area" ? (actor.grupos ?? []) : [];
}

function gerenteConGrupoQueGestionaAsistencia(actor: Actor): boolean {
  return gruposDe(actor).some((grupo) => grupo.gestionaAsistencia);
}

/** Grupos, sedes, atributo de grupo, política de tardanzas, cambio de grupo y desactivación de personas. */
export function puedeConfigurarGlobalmente(actor: Actor): boolean {
  return actor.rol === "administrador";
}

/** Crea cuentas el Administrador (cualquier rol) y Finanzas (solo gerentes de área y Recursos Humanos). */
export function rolesQueSePuedenCrear(actor: Actor): Rol[] {
  if (actor.rol === "administrador") return [...ROLES];
  if (actor.rol === "finanzas") return ["gerente_de_area", "recursos_humanos"];
  return [];
}

export function puedeAdministrarCuentas(actor: Actor): boolean {
  return rolesQueSePuedenCrear(actor).length > 0;
}

/** Crear, cerrar y reabrir períodos, decidir horas extra, exportar y consultar los períodos. */
export function puedeGestionarPeriodos(actor: Actor): boolean {
  return actor.rol === "administrador" || actor.rol === "finanzas";
}

/**
 * Consultar /periodos: Finanzas y el Administrador ven todo; un gerente de área con algún grupo que gestiona asistencia
 * entra solo a ver y aprobar la asistencia de sus grupos (sin exportación, totales, cierre ni horas extra).
 */
export function puedeConsultarPeriodos(actor: Actor): boolean {
  return puedeGestionarPeriodos(actor) || gerenteConGrupoQueGestionaAsistencia(actor);
}

/** Aprobar la asistencia de un grupo y período: solo quien opera el grupo. Finanzas no aprueba en nombre del gerente (ADR 0012). */
export function puedeAprobarAsistenciaDelGrupo(actor: Actor, grupo: string): boolean {
  return puedeOperarAsistenciaDelGrupo(actor, grupo);
}

export function puedeImportarMarcas(actor: Actor): boolean {
  return actor.rol === "administrador" || actor.rol === "finanzas" || gerenteConGrupoQueGestionaAsistencia(actor);
}

/** Marcas de una persona de un grupo: Finanzas y el Administrador las importan de cualquier grupo; un gerente, solo de los grupos que opera. */
export function puedeImportarMarcasDelGrupo(actor: Actor, grupo: string): boolean {
  if (actor.rol === "administrador" || actor.rol === "finanzas") return true;
  return puedeOperarAsistenciaDelGrupo(actor, grupo);
}

export function puedeConsultarAsistencias(actor: Actor): boolean {
  return actor.rol === "administrador" || actor.rol === "finanzas" || gerenteConGrupoQueGestionaAsistencia(actor);
}

/** Finanzas ve asistencias en solo lectura; revisar y confirmar es del gerente de cada grupo. */
export function puedeRevisarAsistencias(actor: Actor): boolean {
  return actor.rol === "administrador" || gerenteConGrupoQueGestionaAsistencia(actor);
}

export function puedeConsultarHorarios(actor: Actor): boolean {
  return actor.rol === "administrador" || gerenteConGrupoQueGestionaAsistencia(actor);
}

export function puedeConsultarConfiguracion(actor: Actor): boolean {
  return actor.rol === "administrador" || gruposDe(actor).length > 0;
}

/** Horarios, modelos de horario y asistencias de un grupo: solo si el grupo gestiona asistencia. */
export function puedeOperarAsistenciaDelGrupo(actor: Actor, grupo: string): boolean {
  if (actor.rol === "administrador") return true;
  return gruposDe(actor).some((asignado) => asignado.nombre === grupo && asignado.gestionaAsistencia);
}

/** Consulta de asistencias de un grupo: quien las opera y Finanzas, que las ve en solo lectura. */
export function puedeConsultarAsistenciaDelGrupo(actor: Actor, grupo: string): boolean {
  return actor.rol === "finanzas" || puedeOperarAsistenciaDelGrupo(actor, grupo);
}

/** Alta y edición de las personas de un grupo, aunque el grupo no gestione asistencia. */
export function puedeAdministrarPersonalDelGrupo(actor: Actor, grupo: string): boolean {
  if (actor.rol === "administrador") return true;
  return gruposDe(actor).some((asignado) => asignado.nombre === grupo);
}

/** Registrar y confirmar el ingreso y el cese de las relaciones laborales: Recursos Humanos y, como superusuario temporal, el Administrador. */
export function puedeGestionarRelacionesLaborales(actor: Actor): boolean {
  return actor.rol === "administrador" || actor.rol === "recursos_humanos";
}

/** Consultar las relaciones laborales y quién está vigente en una fecha: además, Finanzas en solo lectura (Pagos toma de ahí su población). */
export function puedeConsultarRelacionesLaborales(actor: Actor): boolean {
  return puedeGestionarRelacionesLaborales(actor) || actor.rol === "finanzas";
}

/** Calendario de feriados, descanso semanal asignado y descansos sustitutorios (y su consulta): Finanzas y, como superusuario temporal, el Administrador. */
export function puedeGestionarCalendarioLaboral(actor: Actor): boolean {
  return actor.rol === "administrador" || actor.rol === "finanzas";
}
