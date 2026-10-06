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

export function puedeImportarMarcas(actor: Actor): boolean {
  return actor.rol === "administrador" || actor.rol === "finanzas" || gerenteConGrupoQueGestionaAsistencia(actor);
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

/** Alta y edición de las personas de un grupo, aunque el grupo no gestione asistencia. */
export function puedeAdministrarPersonalDelGrupo(actor: Actor, grupo: string): boolean {
  if (actor.rol === "administrador") return true;
  return gruposDe(actor).some((asignado) => asignado.nombre === grupo);
}
