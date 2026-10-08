import Link from "next/link";

// Navegación secundaria de Pagos (diseño de interacción, V7). Cada ticket de Pagos agrega aquí su sección
// cuando existe su pantalla: «Meses de pago» no tiene enlace hasta entonces.
const SECCIONES = [
  { clave: "condiciones-laborales", href: "/pagos/condiciones-laborales", etiqueta: "Condiciones laborales" },
  { clave: "reglas-legales", href: "/pagos/reglas-legales", etiqueta: "Reglas legales" },
  { clave: "fuentes-externas", href: "/pagos/fuentes-externas", etiqueta: "Fuentes externas" },
] as const;

export type SeccionDePagos = (typeof SECCIONES)[number]["clave"];

export function NavegacionDePagos({ actual }: { actual: SeccionDePagos }) {
  return <nav aria-label="Secciones de Pagos" className="navegacion-secundaria">
    {SECCIONES.map((seccion) => {
      const activa = seccion.clave === actual;
      return <Link aria-current={activa ? "page" : undefined} className={activa ? "activo" : ""} href={seccion.href} key={seccion.clave}>{seccion.etiqueta}{activa && <small className="texto-activo"> (sección actual)</small>}</Link>;
    })}
  </nav>;
}
