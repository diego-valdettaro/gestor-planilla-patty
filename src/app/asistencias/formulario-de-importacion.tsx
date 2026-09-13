"use client";

import { useActionState } from "react";

import { importarAsistencia, type EstadoDeImportacion } from "./actions";

const estadoInicial: EstadoDeImportacion = {};

export function FormularioDeImportacion() {
  const [estado, accion, pendiente] = useActionState(importarAsistencia, estadoInicial);

  return <section className="tarjeta importacion-asistencia">
    <header className="encabezado-seccion"><div><h2>Importar asistencias</h2><p>Use un XLSX con la hoja Asistencias y las columnas ID de huellero, Sede, Fecha, Entrada y Salida.</p></div></header>
    <form action={accion} className="filtros">
      <label>Archivo XLSX de asistencias<input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" name="archivo" required type="file" /></label>
      <button disabled={pendiente} type="submit">{pendiente ? "Importando…" : "Importar"}</button>
    </form>
    {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
    {estado.errores && <section className="mensaje-operacion error" role="alert"><p>La importación no se guardó. Corrija el XLSX o el horario publicado y vuelva a intentarlo.</p><ul className="errores-importacion">{estado.errores.map((error, indice) => <li key={`${error.fila}-${error.idHuellero}-${error.fecha}-${indice}`}>Fila {error.fila}{error.idHuellero ? ` · ${error.idHuellero}` : ""}{error.fecha ? ` · ${error.fecha}` : ""}: {error.motivo}</li>)}</ul></section>}
    {estado.resultado && <p className="mensaje-operacion listo" role="status">Se importaron {estado.resultado.jornadas} jornadas. Quedan pendientes de revisión.</p>}
  </section>;
}
