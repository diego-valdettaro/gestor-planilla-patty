import React from "react";
import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";
import { repositorioDeTurnos } from "@/turnos/servicio";

import { FormularioDeImportacion } from "../formulario-de-importacion";

export const dynamic = "force-dynamic";

export default async function PaginaDeImportacionDeAsistencias() {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") return <main className="centrado"><p>No tiene permiso para revisar asistencias.</p></main>;

  const sedes = await repositorioDeTurnos.listarSedesConColaboradoresActivos();

  return <main className="contenido">
    <header className="encabezado"><div><p className="eyebrow">Administración y Finanzas</p><h1>Importar marcas</h1><p>Importe las marcas del huellero para una sede y semana.</p></div></header>
    <FormularioDeImportacion sedes={sedes} />
  </main>;
}
