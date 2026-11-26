"use client";

import React, { useRef, useState } from "react";

import { ConAviso } from "@/app/aviso-flotante";

import { avisoDeDia, CLASE_DE_ESTADO_DE_ASISTENCIA } from "./aviso-de-dia";
import { NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA } from "./estado-de-celda";
import { EditorDeAsistencia } from "./editor-de-asistencia";
import { GlifoDeEstado } from "./glifo-de-estado";
import { resumirAsistenciasSemanales, type AsistenciaSemanal } from "./resumen-semanal";

export function MatrizSemanalDeAsistencias({ asistencias, colaboradores, dias, soloLectura = false }: { soloLectura?: boolean; asistencias: AsistenciaSemanal[]; colaboradores: Array<{ dni: string; nombre: string }>; dias: string[] }) {
  const [seleccion, setSeleccion] = useState<{ dni: string; nombre: string; fecha: string }>();
  const celdaActiva = useRef<HTMLButtonElement | null>(null);
  function cerrar() {
    setSeleccion(undefined);
    requestAnimationFrame(() => celdaActiva.current?.focus());
  }
  const resumen = resumirAsistenciasSemanales(colaboradores, dias, asistencias);
  return <>
    <p className="aviso-desplazamiento">Desplácese horizontalmente para ver los siete días.</p>
    <div className="tabla-asistencias"><table><thead><tr><th scope="col">Colaborador</th>{dias.map((fecha) => <th key={fecha} scope="col"><time dateTime={fecha}>{nombreDelDia(fecha)} {Number(fecha.slice(-2))}</time></th>)}</tr></thead><tbody>{resumen.map((colaborador) => <tr key={colaborador.dni}><th scope="row"><strong>{colaborador.nombre}</strong><small>{colaborador.dni}</small></th>{colaborador.jornadas.map((jornada) => {
      const nombre = NOMBRE_DEL_ESTADO_DE_CELDA_ASISTENCIA[jornada.estado];
      const aviso = avisoDeDia(jornada.estado, "abrir-el-dia");
      return <td key={jornada.fecha}><ConAviso aviso={aviso}>{(descripcion) => <button aria-describedby={descripcion} aria-label={`Asistencia de ${colaborador.nombre} para ${jornada.fecha}: ${nombre}`} className={`celda-asistencia est ${CLASE_DE_ESTADO_DE_ASISTENCIA[jornada.estado]}`} onClick={(evento) => { celdaActiva.current = evento.currentTarget; setSeleccion({ dni: colaborador.dni, nombre: colaborador.nombre, fecha: jornada.fecha }); }} tabIndex={0} type="button">
        <em><GlifoDeEstado estado={jornada.estado} />{nombre}</em>
        {jornada.motivo ? <b>{jornada.motivo}</b> : <>{jornada.sede && <b>{jornada.sede}</b>}{jornada.entrada && jornada.salida && <small>{jornada.entrada}–{jornada.salida}</small>}</>}
        {jornada.causa === "Propuesta importada por revisar" && <small>Propuesta importada</small>}
      </button>}</ConAviso></td>;
    })}</tr>)}</tbody></table></div>
    {seleccion && <EditorDeAsistencia alCerrar={cerrar} asistencia={asistencias.find(a => a.dni === seleccion.dni && a.fecha === seleccion.fecha)} dni={seleccion.dni} fechaSeleccionada={seleccion.fecha} key={`${seleccion.dni}-${seleccion.fecha}`} nombreColaborador={seleccion.nombre} soloLectura={soloLectura} />}
  </>;
}

function nombreDelDia(fecha: string): string {
  return ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][(new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7];
}
