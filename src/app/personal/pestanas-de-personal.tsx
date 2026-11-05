import Link from "next/link";

import type { Actor } from "@/autenticacion/permisos";
import { puedeConsultarColaboradores, puedeConsultarRelacionesLaborales } from "@/autenticacion/permisos";

// Pestañas de la sección Personal. Cada rol ve solo las que ya podía abrir:
// colaboradores (Administrador y gerentes) y relaciones laborales (Administrador, RR. HH. y Finanzas).
export function PestanasDePersonal({ actor, activa }: { actor: Actor; activa: "colaboradores" | "relaciones-laborales" }) {
  const pestanas = [
    { clave: "colaboradores", etiqueta: "Colaboradores", href: "/personal", visible: puedeConsultarColaboradores(actor) },
    { clave: "relaciones-laborales", etiqueta: "Relaciones laborales", href: "/relaciones-laborales", visible: puedeConsultarRelacionesLaborales(actor) },
  ].filter((pestana) => pestana.visible);
  if (pestanas.length < 2) return null;
  return <nav aria-label="Secciones de personal" className="pestanas-personal">{pestanas.map((pestana) => <Link aria-current={pestana.clave === activa ? "page" : undefined} className={pestana.clave === activa ? "activo" : ""} href={pestana.href} key={pestana.clave}>{pestana.etiqueta}</Link>)}</nav>;
}
