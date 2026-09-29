import type { Actor } from "@/colaboradores/registrar-colaborador";

export type EnlaceDeNavegacion = { href: string; etiqueta: string; icono: string };

const enlacesDeLaAplicacion: (EnlaceDeNavegacion & { roles: Actor["rol"][] })[] = [
  { href: "/configuracion", etiqueta: "Configuración", icono: "♧", roles: ["administracion"] },
  { href: "/turnos", etiqueta: "Horarios", icono: "▣", roles: ["operaciones", "administracion"] },
  { href: "/asistencias", etiqueta: "Asistencia", icono: "◷", roles: ["administracion", "finanzas"] },
  { href: "/periodos", etiqueta: "Liquidaciones", icono: "▤", roles: ["administracion", "finanzas"] },
];

export function enlacesPermitidos(rol: Actor["rol"]): EnlaceDeNavegacion[] {
  return enlacesDeLaAplicacion.filter((enlace) => enlace.roles.includes(rol));
}

export function esEnlaceActivo(ruta: string, href: string): boolean {
  return ruta === href || ruta.startsWith(`${href}/`);
}

export function seccionActiva(ruta: string, enlaces: EnlaceDeNavegacion[]): EnlaceDeNavegacion | undefined {
  return enlaces.find((enlace) => esEnlaceActivo(ruta, enlace.href));
}
