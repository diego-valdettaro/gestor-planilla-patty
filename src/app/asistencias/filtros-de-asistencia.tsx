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
  titulo,
  descripcion,
  acciones,
  children,
}: {
  colaborador?: string;
  colaboradores: Colaborador[];
  fecha: string;
  grupo?: string;
  grupos: string[];
  vista: VistaDeAsistencias;
  titulo?: string;
  descripcion?: string;
  acciones?: React.ReactNode;
  children?: React.ReactNode;
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

  const hrefOtraVista = `/asistencias?${parametros.toString()}`;
  const parametrosDeLaVistaActual = new URLSearchParams({ vista, grupo: grupo ?? "", fecha });
  if (colaborador) parametrosDeLaVistaActual.set("colaborador", colaborador);
  const hrefVistaActual = `/asistencias?${parametrosDeLaVistaActual.toString()}`;
  const pestanas = [
    { vista: "semanal" as const, etiqueta: "Vista semanal", href: vista === "semanal" ? hrefVistaActual : hrefOtraVista },
    { vista: "mensual" as const, etiqueta: "Vista mensual", href: vista === "mensual" ? hrefVistaActual : hrefOtraVista },
  ];

  return <>
    <nav aria-label="Vista" className="pestanas-personal">{pestanas.map((pestana) => pestana.vista === vista
      ? <Link aria-current="page" className="activo" href={pestana.href} key={pestana.vista}>{pestana.etiqueta}</Link>
      : <Link aria-disabled={!interactivo} href={pestana.href} key={pestana.vista} onClick={(evento) => { if (!interactivo) evento.preventDefault(); else cambiarVista(evento); }}>{pestana.etiqueta}</Link>)}</nav>
    <section className="tile panel tile-asistencias">
      <header className="panel-cabecera">
        <div>{titulo && <h2>{titulo}</h2>}{descripcion && <p>{descripcion}</p>}</div>
        <div className="acciones-de-asistencias">
          <Link className="boton-secundario importar-archivo" href={rutaDeImportacion}>Importar archivo</Link>
          {acciones}
        </div>
      </header>
      <div className="filtros panel-filtros filtros-asistencias">
        {vista === "semanal" && <fieldset disabled={!interactivo} style={{ display: "contents" }}><SelectorSemanal semana={inicioDeSemana(fecha)} alSeleccionar={(semana) => actualizar({ fecha: semana })} /></fieldset>}
        <label>Grupo operativo<select aria-label="Grupo operativo" disabled={!interactivo} value={grupo} onChange={(evento) => actualizar({ grupo: evento.target.value })}>{grupos.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        {vista === "mensual" && <label>Colaborador<select aria-label="Colaborador" value={colaborador ?? ""} disabled={!interactivo || !colaboradores.length} onChange={(evento) => actualizar({ colaborador: evento.target.value })}>{colaboradores.map((item) => <option key={item.dni} value={item.dni}>{item.nombre} · {item.dni}</option>)}</select></label>}
        <label>Fecha de referencia<input aria-label="Fecha de referencia" disabled={!interactivo} value={fecha} onChange={(evento) => actualizar({ fecha: evento.target.value })} suppressHydrationWarning type="date" /></label>
      </div>
      {children}
    </section>
  </>;
}
