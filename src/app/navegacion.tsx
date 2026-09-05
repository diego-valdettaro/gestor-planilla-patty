"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Actor } from "@/colaboradores/registrar-colaborador";

import { cerrarSesionDesdeFormulario } from "./cerrar-sesion/actions";

const etiquetasDeRol = {
  operaciones: "Operaciones",
  administracion: "Administración",
  finanzas: "Finanzas",
};

export function Navegacion({ actor }: { actor?: Actor }) {
  if (!actor) return null;

  const ruta = usePathname();
  const enlaces = [
    { href: "/configuracion", etiqueta: "Configuración", icono: "♧", visible: actor.rol === "administracion" },
    { href: "/turnos", etiqueta: "Horarios", icono: "▣", visible: actor.rol === "operaciones" || actor.rol === "administracion" },
    { href: "/asistencias", etiqueta: "Asistencia", icono: "◷", visible: actor.rol === "administracion" || actor.rol === "finanzas" },
    { href: "/periodos", etiqueta: "Liquidaciones", icono: "▤", visible: actor.rol === "administracion" || actor.rol === "finanzas" },
  ];

  return (
    <nav className="navegacion" aria-label="Navegación principal">
      <Link className="marca" href="/">Patty</Link>
      <div className="enlaces-navegacion">
        {enlaces.filter((enlace) => enlace.visible).map((enlace) => <Link className={ruta === enlace.href || (enlace.href !== "/" && ruta.startsWith(enlace.href)) ? "activo" : ""} href={enlace.href} key={enlace.href}><span aria-hidden="true">{enlace.icono}</span>{enlace.etiqueta}</Link>)}
      </div>
      <div className="cuenta-navegacion"><span className="avatar-navegacion">{iniciales(actor.nombreUsuario ?? etiquetasDeRol[actor.rol])}</span><span><strong>{actor.nombreUsuario ?? "Sesión activa"}</strong><small>{etiquetasDeRol[actor.rol]}</small></span><form action={cerrarSesionDesdeFormulario}><button aria-label="Cerrar sesión" title="Cerrar sesión" type="submit">⌄</button></form></div>
    </nav>
  );
}

function iniciales(valor: string): string {
  return valor.split(/[.@\s]+/).filter(Boolean).map((parte) => parte[0]).join("").slice(0, 2).toUpperCase();
}
