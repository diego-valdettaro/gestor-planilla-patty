"use client";

import { useActionState } from "react";

import { importarAsistencia, type EstadoDeImportacion } from "./actions";

const estadoInicial: EstadoDeImportacion = {};

export function FormularioDeImportacion({ sedes }: { sedes: string[] }) {
  const [estado, accion, pendiente] = useActionState(importarAsistencia, estadoInicial);

  return <section className="tarjeta importacion-asistencia">
    <header className="encabezado-seccion"><div><h2>Importar marcas</h2><p>Use un archivo XLSX, XLS o CSV del huellero para una sola sede y semana.</p></div></header>
    <form action={accion} className="filtros">
      <label>Sede<select name="sede" required>{sedes.map((sede) => <option key={sede}>{sede}</option>)}</select></label>
      <label>Semana<input name="semana" required type="date" /></label>
      <label>Archivo del huellero<input accept=".xlsx,.xls,.csv" name="archivo" required type="file" /></label>
      <button disabled={pendiente} type="submit">{pendiente ? "Importando…" : "Importar"}</button>
    </form>
    {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
    {estado.resultado && <p className="mensaje-operacion listo" role="status">Se importaron {estado.resultado.marcasCrudas} marcas. {estado.resultado.asistenciasPendientes} asistencias quedan pendientes de revisión, {estado.resultado.marcasSinHorario} no tienen horario publicado y {estado.resultado.incidencias} requieren revisar el ID de huellero.</p>}
  </section>;
}
