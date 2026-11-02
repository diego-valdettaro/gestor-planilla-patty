import Link from "next/link";

import { CreadorDeGrupo } from "./creador-de-grupo";

// Menú lateral compartido por las pantallas de Configuración (grupos y Cuentas).
// Finanzas solo entra para Cuentas: sin grupos que listar, solo ve ese enlace.
export function MenuDeConfiguracion({ grupos, grupoActivo, cuentasActiva = false, puedeVerCuentas, puedeCrearGrupos }: {
  grupos: string[];
  grupoActivo?: string;
  cuentasActiva?: boolean;
  puedeVerCuentas: boolean;
  puedeCrearGrupos: boolean;
}) {
  return <nav aria-label="Secciones de configuración" className="menu-configuracion">
    {(grupos.length > 0 || puedeCrearGrupos) && <>
      <p className="titulo-menu-configuracion">Grupos</p>
      {grupos.length ? <ul aria-label="Grupos operativos">{grupos.map((nombre) => <li key={nombre}><Link aria-current={nombre === grupoActivo ? "page" : undefined} className={nombre === grupoActivo ? "activo" : ""} href={`/configuracion?grupo=${encodeURIComponent(nombre)}`}>{nombre}</Link></li>)}</ul> : <p className="pista-configuracion">Todavía no hay grupos.</p>}
      {puedeCrearGrupos && <details className="nuevo-configuracion"><summary>+ Nuevo grupo</summary><CreadorDeGrupo /></details>}
    </>}
    {puedeVerCuentas && <>
      <p className="titulo-menu-configuracion">General</p>
      <ul><li><Link aria-current={cuentasActiva ? "page" : undefined} className={cuentasActiva ? "activo" : ""} href="/cuentas">Cuentas</Link></li></ul>
    </>}
  </nav>;
}
