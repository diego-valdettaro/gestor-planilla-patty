import React from "react";
import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";

import { FormularioDeImportacion } from "../formulario-de-importacion";

export const dynamic = "force-dynamic";

export default async function PaginaDeImportacionDeAsistencias() {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") return <main className="centrado"><p>No tiene permiso para revisar asistencias.</p></main>;

  return <main className="contenido">
    <header className="encabezado"><div><p className="eyebrow">Administración y Finanzas</p><h1>Importar asistencias</h1><p>El XLSX define las sedes y fechas que se importarán.</p></div></header>
    <FormularioDeImportacion />
  </main>;
}
