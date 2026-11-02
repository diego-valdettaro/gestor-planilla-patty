"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { SelectorSemanal } from "@/app/selector-semanal";
import { inicioDeSemana } from "@/turnos/semana";

import { rutaDeImportacion } from "./ruta-de-importacion";
import { useCambiosPendientes } from "./cambios-pendientes";

type VistaDeAsistencias = "semanal" | "mensual";

interface Colaborador { dni: string; nombre: string; }

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
  const { navegar } = useCambiosPendientes();
  const [interactivo, setInteractivo] = useState(false);
  useEffect(() => setInteractivo(true), []);
  const otraVista = vista === "semanal" ? "mensual" : "semanal";
  const parametros = new URLSearchParams({ vista: otraVista, grupo: grupo ?? "", fecha });
  if (colaborador) parametros.set("colaborador", colaborador);

  function actualizar(cambios: Record<string, string>) {
    const nuevos = new URLSearchParams({ vista, grupo: grupo ?? "", fecha });
    if (colaborador) nuevos.set("colaborador", colaborador);
    for (const [clave, valor] of Object.entries(cambios)) nuevos.set(clave, valor);
    navegar(`/asistencias?${nuevos.toString()}`);
  }

  function cambiarVista(evento: React.MouseEvent<HTMLAnchorElement>) {
    evento.preventDefault();
    navegar(`/asistencias?${parametros.toString()}`);
  }

  return <><div className="filtros selector-asistencia">
    {vista === "semanal" && <fieldset disabled={!interactivo} style={{ display: "contents" }}><SelectorSemanal semana={inicioDeSemana(fecha)} alSeleccionar={(semana) => actualizar({ fecha: semana })} /></fieldset>}
    <label>Grupo operativo<select aria-label="Grupo operativo" disabled={!interactivo} value={grupo} onChange={(evento) => actualizar({ grupo: evento.target.value })}>{grupos.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    {vista === "mensual" && <label>Colaborador<select aria-label="Colaborador" value={colaborador ?? ""} disabled={!interactivo || !colaboradores.length} onChange={(evento) => actualizar({ colaborador: evento.target.value })}>{colaboradores.map((item) => <option key={item.dni} value={item.dni}>{item.nombre} · {item.dni}</option>)}</select></label>}
    <label>Fecha de referencia<input aria-label="Fecha de referencia" disabled={!interactivo} value={fecha} onChange={(evento) => actualizar({ fecha: evento.target.value })} suppressHydrationWarning type="date" /></label>
    <Link aria-disabled={!interactivo} className="boton-secundario" href={`/asistencias?${parametros.toString()}`} onClick={(evento) => { if (!interactivo) evento.preventDefault(); else cambiarVista(evento); }}>Vista {otraVista}</Link>
    <Link className="boton-secundario importar-archivo" href={rutaDeImportacion}>Importar archivo</Link>
  </div></>;
}
