import React from "react";
import Link from "next/link";

import { rutaDeImportacion } from "./ruta-de-importacion";

type VistaDeAsistencias = "semanal" | "mensual";

interface Colaborador { idHuellero: string; nombre: string; }

export function FiltrosDeAsistencia({
  colaborador,
  colaboradores,
  fecha,
  grupo,
  grupos,
  vista,
}: {
  colaborador?: string;
  colaboradores: Colaborador[];
  fecha: string;
  grupo?: string;
  grupos: string[];
  vista: VistaDeAsistencias;
}) {
  const otraVista = vista === "semanal" ? "mensual" : "semanal";
  const parametros = new URLSearchParams({ vista: otraVista, grupo: grupo ?? "", fecha });
  if (colaborador) parametros.set("colaborador", colaborador);

  return <form className="filtros selector-asistencia" method="get">
    <input name="vista" type="hidden" value={vista} />
    {vista === "semanal" && colaborador && <input name="colaborador" type="hidden" value={colaborador} />}
    <label>Grupo operativo<select defaultValue={grupo} name="grupo">{grupos.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    {vista === "mensual" && <label>Colaborador<select defaultValue={colaborador} disabled={!colaboradores.length} name="colaborador">{colaboradores.map((item) => <option key={item.idHuellero} value={item.idHuellero}>{item.nombre} · {item.idHuellero}</option>)}</select></label>}
    <label>Fecha de referencia<input defaultValue={fecha} name="fecha" suppressHydrationWarning type="date" /></label>
    <button type="submit">Actualizar vista</button>
    <Link className="boton-secundario" href={`/asistencias?${parametros.toString()}`}>Vista {otraVista}</Link>
    <Link className="boton-secundario importar-archivo" href={rutaDeImportacion}>Importar archivo</Link>
  </form>;
}
