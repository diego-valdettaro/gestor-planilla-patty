import type { Actor } from "@/autenticacion/permisos";
import {
  puedeAdministrarCuentas,
  puedeConsultarAsistencias,
  puedeConsultarConfiguracion,
  puedeConsultarHorarios,
  puedeGestionarPeriodos,
} from "@/autenticacion/permisos";

export type EnlaceDeNavegacion = { href: string; etiqueta: string; icono: string };

// Cada enlace usa el mismo permiso que comprueba la ruta: el menú muestra exactamente lo que el rol puede abrir.
const enlacesDeLaAplicacion: (EnlaceDeNavegacion & { permitido: (actor: Actor) => boolean })[] = [
  { href: "/configuracion", etiqueta: "Configuración", icono: "♧", permitido: puedeConsultarConfiguracion },
  { href: "/cuentas", etiqueta: "Cuentas", icono: "◉", permitido: puedeAdministrarCuentas },
  { href: "/turnos", etiqueta: "Horarios", icono: "▣", permitido: puedeConsultarHorarios },
  { href: "/asistencias", etiqueta: "Asistencia", icono: "◷", permitido: puedeConsultarAsistencias },
  { href: "/periodos", etiqueta: "Períodos de planilla", icono: "▤", permitido: puedeGestionarPeriodos },
];

const RUTAS_DE_INICIO_EN_ORDEN = ["/turnos", "/asistencias", "/periodos", "/cuentas", "/configuracion"];

export function enlacesPermitidos(actor: Actor): EnlaceDeNavegacion[] {
  return enlacesDeLaAplicacion.filter((enlace) => enlace.permitido(actor)).map(({ href, etiqueta, icono }) => ({ href, etiqueta, icono }));
}

/** Primera ruta que el actor puede abrir, o undefined si su rol aún no tiene pantallas. */
export function rutaDeInicio(actor: Actor): string | undefined {
  const permitidas = new Set(enlacesPermitidos(actor).map((enlace) => enlace.href));
  return RUTAS_DE_INICIO_EN_ORDEN.find((ruta) => permitidas.has(ruta));
}

export function esEnlaceActivo(ruta: string, href: string): boolean {
  return ruta === href || ruta.startsWith(`${href}/`);
}

export function seccionActiva(ruta: string, enlaces: EnlaceDeNavegacion[]): EnlaceDeNavegacion | undefined {
  return enlaces.find((enlace) => esEnlaceActivo(ruta, enlace.href));
}
