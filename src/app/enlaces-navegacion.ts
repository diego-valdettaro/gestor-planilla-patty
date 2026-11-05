import type { Actor } from "@/autenticacion/permisos";
import {
  puedeAbrirConfiguracion,
  puedeAdministrarCuentas,
  puedeConsultarAsistencias,
  puedeConsultarHorarios,
  puedeConsultarPersonal,
  puedeConsultarPeriodos,
  puedeGestionarPagos,
  puedeRegistrarIncidenciasDeGrupo,
} from "@/autenticacion/permisos";

// `rutas` agrupa las pantallas que pertenecen a la misma sección del menú (por ejemplo, Cuentas vive dentro de Configuración).
export type EnlaceDeNavegacion = { href: string; etiqueta: string; icono: string; rutas?: string[] };

// Cada enlace usa el mismo permiso que comprueba la ruta: el menú muestra exactamente lo que el rol puede abrir.
const enlacesDeLaAplicacion: (EnlaceDeNavegacion & { permitido: (actor: Actor) => boolean })[] = [
  { href: "/configuracion", etiqueta: "Configuración", icono: "configuracion", rutas: ["/cuentas"], permitido: puedeAbrirConfiguracion },
  { href: "/personal", etiqueta: "Personal", icono: "personal", rutas: ["/relaciones-laborales"], permitido: puedeConsultarPersonal },
  { href: "/turnos", etiqueta: "Planificación de horarios", icono: "horarios", permitido: puedeConsultarHorarios },
  { href: "/asistencias", etiqueta: "Registro de asistencias", icono: "asistencias", permitido: (actor) => puedeConsultarAsistencias(actor) || puedeRegistrarIncidenciasDeGrupo(actor) },
  { href: "/periodos", etiqueta: "Revisión de asistencia para planilla", icono: "revision", permitido: puedeConsultarPeriodos },
  { href: "/pagos", etiqueta: "Pagos", icono: "pagos", permitido: puedeGestionarPagos },
];

const RUTAS_DE_INICIO_EN_ORDEN = ["/turnos", "/asistencias", "/periodos", "/configuracion", "/personal", "/pagos"];

export function enlacesPermitidos(actor: Actor): EnlaceDeNavegacion[] {
  return enlacesDeLaAplicacion.filter((enlace) => enlace.permitido(actor)).map(({ href, etiqueta, icono, rutas }) => ({ href, etiqueta, icono, rutas }));
}

/** Primera ruta que el actor puede abrir, o undefined si su rol aún no tiene pantallas. */
export function rutaDeInicio(actor: Actor): string | undefined {
  const permitidas = new Set(enlacesPermitidos(actor).map((enlace) => enlace.href));
  return RUTAS_DE_INICIO_EN_ORDEN.find((ruta) => permitidas.has(ruta));
}

export function esEnlaceActivo(ruta: string, href: string): boolean {
  return ruta === href || ruta.startsWith(`${href}/`);
}

export function esSeccionActiva(ruta: string, enlace: EnlaceDeNavegacion): boolean {
  return [enlace.href, ...(enlace.rutas ?? [])].some((href) => esEnlaceActivo(ruta, href));
}

export function seccionActiva(ruta: string, enlaces: EnlaceDeNavegacion[]): EnlaceDeNavegacion | undefined {
  return enlaces.find((enlace) => esSeccionActiva(ruta, enlace));
}
