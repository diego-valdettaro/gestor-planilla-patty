import React from "react";
import { redirect } from "next/navigation";

import { NOMBRE_DE_ROL, puedeImportarMarcas } from "@/autenticacion/permisos";
import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";

import { FormularioDeImportacion } from "../formulario-de-importacion";

export const dynamic = "force-dynamic";

export default async function PaginaDeImportacionDeAsistencias() {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (!puedeImportarMarcas(actor)) return <main className="centrado"><section className="estado-vacio"><h1>Sin permiso</h1><p>Su rol no permite importar asistencias. Solo los gerentes de área, Finanzas y el Administrador del sistema pueden hacerlo. Pida al Administrador del sistema que revise su rol.</p></section></main>;

  return <main className="contenido">
    <header className="encabezado"><div><p className="eyebrow">{NOMBRE_DE_ROL[actor.rol]}</p><h1>Importar asistencias</h1><p>El XLSX define las sedes y fechas que se importarán.{actor.rol === "gerente_de_area" ? " Solo puede importar marcas de las personas de sus grupos." : ""}</p></div></header>
    <FormularioDeImportacion />
  </main>;
}
