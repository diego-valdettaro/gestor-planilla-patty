"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { registrarAsistenciaManual, type EstadoDeRegistroManual } from "./actions";
import {
  estadoDeCeldaAsistencia,
  etiquetaDeCeldaAsistencia,
  type DiaDeAsistencia,
  type EstadoDeCeldaAsistencia,
} from "./estado-de-celda";

interface Asistencia {
  fecha: string;
  estado: "pendiente" | "confirmada" | "manual";
  entrada: string | null;
  salida: string | null;
  estadoManual: string | null;
  entradaPropuesta: string | null;
  salidaPropuesta: string | null;
  hayMarcasCrudas: boolean;
  enPeriodoCerrado: boolean;
}

const estadoInicial: EstadoDeRegistroManual = {};

function diaDeAsistencia(asistencia: Asistencia): DiaDeAsistencia {
  return {
    estado: asistencia.estado,
    designacionManual: asistencia.estadoManual,
    hayMarcasCrudas: asistencia.hayMarcasCrudas,
    propuestaCompleta: Boolean(asistencia.entradaPropuesta && asistencia.salidaPropuesta),
    enPeriodoCerrado: asistencia.enPeriodoCerrado,
  };
}

export function CalendarioDeAsistencias({
  asistencias,
  dias,
  desfase,
  idHuellero,
}: {
  asistencias: Asistencia[];
  dias: string[];
  desfase: number;
  idHuellero: string;
}) {
  const porFecha = new Map(asistencias.map((asistencia) => [asistencia.fecha, asistencia]));
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [estado, accion, pendiente] = useActionState(registrarAsistenciaManual, estadoInicial);
  const asistencia = fechaSeleccionada ? porFecha.get(fechaSeleccionada) : undefined;
  const estadoDeCelda: EstadoDeCeldaAsistencia = asistencia
    ? estadoDeCeldaAsistencia(diaDeAsistencia(asistencia))
    : "sin-planificacion";
  const editable = estadoDeCelda === "esperada" || estadoDeCelda === "pendiente-de-revision" || (estadoDeCelda === "registrada" && asistencia?.estado === "confirmada");

  useEffect(() => {
    if (estado.listo) dialogo.current?.close();
  }, [estado.listo]);

  function abrir(fecha: string) {
    setFechaSeleccionada(fecha);
    dialogo.current?.showModal();
  }

  return <>
    <div className="calendario"><div className="dias-semana">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((dia) => <span key={dia}>{dia}</span>)}</div><div className="celdas-calendario">{Array.from({ length: desfase }).map((_, indice) => <span className="celda-vacia" key={`vacia-${indice}`} />)}{dias.map((fecha) => {
      const item = porFecha.get(fecha);
      const estadoDelDia = item ? estadoDeCeldaAsistencia(diaDeAsistencia(item)) : "sin-planificacion";
      const etiqueta = etiquetaDeCeldaAsistencia(estadoDelDia, item?.estadoManual ?? null);
      return <button aria-label={`Editar asistencia del ${fecha}: ${etiqueta}`} className={`dia-calendario estado-color-${estadoDelDia}`} key={fecha} onClick={() => abrir(fecha)} type="button"><time>{Number(fecha.slice(-2))}</time><strong>{estadoDelDia === "liquidado" && <IconoCandado />}{etiqueta}</strong>{item ? <><span>{hora(item.entrada) ?? "sin entrada"}</span><span>{hora(item.salida) ?? "sin salida"}</span></> : <span>Sin planificación</span>}</button>;
    })}</div></div>
    <dialog aria-labelledby="titulo-asistencia" className="dialogo-confirmacion" ref={dialogo}>
      {fechaSeleccionada && editable ? <form action={accion}>
        <h2 id="titulo-asistencia">{asistencia?.estado === "confirmada" ? "Ajustar asistencia" : "Registrar asistencia"}</h2>
        <p>{fechaSeleccionada}</p>
        <input name="idHuellero" type="hidden" value={idHuellero} />
        <input name="fecha" type="hidden" value={fechaSeleccionada} />
        <input name="estadoActual" type="hidden" value={asistencia?.estado ?? "sin-asistencia"} />
        {asistencia ? <><label>Fecha<input defaultValue={fechaSeleccionada} readOnly type="date" /></label><label>Hora de ingreso<input defaultValue={hora(asistencia.entrada) ?? ""} name="entrada" required type="time" /></label><label>Hora de salida<input defaultValue={hora(asistencia.salida) ?? ""} name="salida" required type="time" /></label>{asistencia.estado === "confirmada" ? <label>Motivo del ajuste<input name="motivo" required /></label> : null}<div className="acciones-dialogo"><button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button><button disabled={pendiente} type="submit">{pendiente ? "Guardando…" : "Guardar asistencia"}</button></div></> : <><p>No hay un horario publicado para este día. Publique el horario antes de registrar la asistencia.</p><div className="acciones-dialogo"><button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cerrar</button></div></>}
        {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
      </form> : <form method="dialog"><h2 id="titulo-asistencia">{tituloNoEditable(estadoDeCelda)}</h2><p>{fechaSeleccionada}. {descripcionNoEditable(estadoDeCelda, asistencia?.estadoManual ?? null)}</p><div className="acciones-dialogo"><button className="boton-secundario">Cerrar</button></div></form>}
    </dialog>
  </>;
}

function hora(valor: string | null): string | undefined { return valor ? /T(\d{2}:\d{2})/.exec(valor)?.[1] : undefined; }

function tituloNoEditable(estado: EstadoDeCeldaAsistencia): string {
  if (estado === "liquidado") return "Día liquidado";
  if (estado === "sin-planificacion") return "Sin planificación";
  return "Día registrado";
}

function descripcionNoEditable(estado: EstadoDeCeldaAsistencia, designacionManual: string | null): string {
  if (estado === "liquidado") return "La asistencia cae en un período de planilla cerrado y quedó congelada. No se puede editar.";
  if (estado === "sin-planificacion") return "No hay un horario publicado para este día.";
  const etiqueta = etiquetaDeCeldaAsistencia(estado, designacionManual);
  return designacionManual ? `Esta jornada tiene la designación “${etiqueta}”.` : "Esta jornada ya está registrada.";
}

function IconoCandado() {
  return <svg aria-hidden="true" className="icono-candado" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><rect x="3.25" y="7" width="9.5" height="6.5" rx="1.4" fill="currentColor" /><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}
