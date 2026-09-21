"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { Actor } from "@/colaboradores/registrar-colaborador";

import { cerrarSesionDesdeFormulario } from "./cerrar-sesion/actions";
import { enlacesPermitidos, esEnlaceActivo, seccionActiva } from "./enlaces-navegacion";

const etiquetasDeRol = {
  operaciones: "Operaciones",
  administracion: "Administración",
  finanzas: "Finanzas",
};

export function Navegacion({ actor }: { actor?: Actor }) {
  const ruta = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => setMenuAbierto(false), [ruta]);
  useEffect(() => {
    if (!menuAbierto) return;
    const cerrarConEscape = (evento: KeyboardEvent) => { if (evento.key === "Escape") setMenuAbierto(false); };
    document.addEventListener("keydown", cerrarConEscape);
    return () => document.removeEventListener("keydown", cerrarConEscape);
  }, [menuAbierto]);

  if (!actor) return null;

  const enlaces = enlacesPermitidos(actor.rol);
  const seccion = seccionActiva(ruta, enlaces);

  return (
    <nav className={menuAbierto ? "navegacion navegacion-abierta" : "navegacion"} aria-label="Navegación principal">
      <div className="barra-navegacion">
        <Link className="marca" href="/">Patty</Link>
        <span className="seccion-navegacion">{seccion?.etiqueta}</span>
        <button aria-controls="menu-navegacion" aria-expanded={menuAbierto} className="boton-menu-navegacion" onClick={() => setMenuAbierto(!menuAbierto)} type="button">{menuAbierto ? "Cerrar menú" : "Menú"}</button>
      </div>
      <div className="menu-navegacion" id="menu-navegacion">
        <div className="enlaces-navegacion">
          {enlaces.map((enlace) => {
            const activo = esEnlaceActivo(ruta, enlace.href);
            return <Link aria-current={activo ? "page" : undefined} className={activo ? "activo" : ""} href={enlace.href} key={enlace.href}><span aria-hidden="true">{enlace.icono}</span>{enlace.etiqueta}{activo && <small className="texto-activo"> (sección actual)</small>}</Link>;
          })}
        </div>
        <div className="cuenta-navegacion"><span className="avatar-navegacion">{iniciales(actor.nombreUsuario ?? etiquetasDeRol[actor.rol])}</span><span><strong>{actor.nombreUsuario ?? "Sesión activa"}</strong><small>{etiquetasDeRol[actor.rol]}</small></span><form action={cerrarSesionDesdeFormulario}><button aria-label="Cerrar sesión" title="Cerrar sesión" type="submit">⌄</button></form></div>
      </div>
    </nav>
  );
}

function iniciales(valor: string): string {
  return valor.split(/[.@\s]+/).filter(Boolean).map((parte) => parte[0]).join("").slice(0, 2).toUpperCase();
}
