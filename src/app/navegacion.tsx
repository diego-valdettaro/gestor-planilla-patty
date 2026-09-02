import Link from "next/link";

import type { Actor } from "@/colaboradores/registrar-colaborador";

import { cerrarSesionDesdeFormulario } from "./cerrar-sesion/actions";

const etiquetasDeRol = {
  operaciones: "Operaciones",
  administracion: "Administración",
  finanzas: "Finanzas",
};

export function Navegacion({ actor }: { actor?: Actor }) {
  if (!actor) return null;

  return (
    <nav className="navegacion" aria-label="Navegación principal">
      <Link href="/">Planilla Patty</Link>
      {(actor.rol === "operaciones" || actor.rol === "administracion") && <Link href="/turnos">Turnos</Link>}
      {(actor.rol === "administracion" || actor.rol === "finanzas") && <Link href="/asistencias">Asistencias</Link>}
      {(actor.rol === "administracion" || actor.rol === "finanzas") && <Link href="/periodos">Períodos</Link>}
      <span className="actor-actual">{etiquetasDeRol[actor.rol]}</span>
      <form action={cerrarSesionDesdeFormulario}><button type="submit">Cerrar sesión</button></form>
    </nav>
  );
}
