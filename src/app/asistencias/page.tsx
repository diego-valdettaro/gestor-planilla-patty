import { redirect } from "next/navigation";

import { obtenerActorActual } from "@/autenticacion/sesion-del-servidor";

import { importarAsistencia } from "./actions";

export const dynamic = "force-dynamic";

export default async function PaginaDeAsistencias() {
  const actor = await obtenerActorActual().catch(() => undefined);
  if (!actor) redirect("/iniciar-sesion");
  if (actor.rol !== "administracion" && actor.rol !== "finanzas") {
    return <main className="centrado"><p>No tiene permiso para importar asistencias.</p></main>;
  }
  return (
    <main className="contenido">
      <header className="encabezado"><div><p className="eyebrow">Administración y Finanzas</p><h1>Cargar asistencia</h1></div></header>
      <form action={importarAsistencia} className="filtros">
        <label>Sede<input name="sede" required /></label>
        <label>Semana<input name="semana" required type="date" /></label>
        <label>Archivo del huellero<input accept=".xlsx,.xls,.csv" name="archivo" required type="file" /></label>
        <button type="submit">Importar</button>
      </form>
      <p>El archivo debe incluir las columnas ID de huellero, fecha y marca (o fecha y hora).</p>
    </main>
  );
}
