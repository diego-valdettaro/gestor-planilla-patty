"use client";

import React, { useRef, useState } from "react";
import { ConAviso } from "@/app/aviso-flotante";
import { avisoDeDia, CLASE_DE_ESTADO_DE_ASISTENCIA } from "./aviso-de-dia";
import { EditorDeAsistencia, type AsistenciaDelEditor } from "./editor-de-asistencia";
import { estadoDeCeldaAsistencia, etiquetaDeCeldaAsistencia } from "./estado-de-celda";
import { GlifoDeEstado } from "./glifo-de-estado";

export function CalendarioDeAsistencias({ asistencias, dias, desfase, dni, nombreColaborador, soloLectura = false }: {
  asistencias: AsistenciaDelEditor[]; dias: string[]; desfase: number; dni: string; nombreColaborador: string; soloLectura?: boolean;
}) {
  const porFecha = new Map(asistencias.map(asistencia => [asistencia.fecha, asistencia]));
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>();
  const celdaActiva = useRef<HTMLButtonElement | null>(null);
  function cerrar() {
    setFechaSeleccionada(undefined);
    requestAnimationFrame(() => celdaActiva.current?.focus());
  }
  return <>
    <div className="calendario"><div className="dias-semana">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((dia) => <span key={dia}>{dia}</span>)}</div><div className="celdas-calendario">{Array.from({ length: desfase }).map((_, indice) => <span className="celda-vacia" key={`vacia-${indice}`} />)}{dias.map((fecha) => {
      const item = porFecha.get(fecha);
      const estadoDelDia = estadoDeCeldaAsistencia(item);
      const etiqueta = etiquetaDeCeldaAsistencia(estadoDelDia, item?.estadoManual ?? null);
      const entrada = hora(item?.entrada ?? null)?.slice(0, 5);
      const salida = hora(item?.salida ?? null)?.slice(0, 5);
      return <ConAviso aviso={avisoDeDia(estadoDelDia, "abrir-el-dia")} key={fecha}>{(descripcion) => <button aria-describedby={descripcion} aria-label={`Asistencia del ${fecha}: ${etiqueta}`} className={`dia-calendario est ${CLASE_DE_ESTADO_DE_ASISTENCIA[estadoDelDia]}`} onClick={(evento) => { celdaActiva.current = evento.currentTarget; setFechaSeleccionada(fecha); }} type="button">
        <span className="dia-cabecera"><time dateTime={fecha}>{Number(fecha.slice(-2))}</time><span className="dia-nombre">{nombreCortoDelDia(fecha)}</span></span>
        <em className="dia-estado"><GlifoDeEstado estado={estadoDelDia} />{etiqueta}</em>
        {item && !item.estadoManual && <span className="dia-datos">{item.sedeProgramada && <b>{item.sedeProgramada}</b>}{entrada && salida && <small>{entrada}–{salida}</small>}</span>}
      </button>}</ConAviso>;
    })}</div></div>
    {fechaSeleccionada && <EditorDeAsistencia alCerrar={cerrar} asistencia={porFecha.get(fechaSeleccionada)} dni={dni} fechaSeleccionada={fechaSeleccionada} key={`${dni}-${fechaSeleccionada}`} nombreColaborador={nombreColaborador} soloLectura={soloLectura} />}
  </>;
}

function nombreCortoDelDia(fecha: string): string {
  return ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"][(new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7];
}
function hora(valor: string | null): string | undefined { return valor ? /T(\d{2}:\d{2}(?::\d{2})?)/.exec(valor)?.[1] : undefined; }
