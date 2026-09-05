"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { registrarAsistenciaManual, type EstadoDeRegistroManual } from "./actions";

type Estado = "pendiente" | "confirmada" | "manual";

interface Asistencia {
  fecha: string;
  estado: Estado;
  entrada: string | null;
  salida: string | null;
  estadoManual: string | null;
}

const estadoInicial: EstadoDeRegistroManual = {};

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
      return <button aria-label={`Editar asistencia del ${fecha}`} className={`dia-calendario ${item ? `estado-${item.estado}` : "sin-asistencia"}`} key={fecha} onClick={() => abrir(fecha)} type="button"><time>{Number(fecha.slice(-2))}</time>{item ? <><strong>{etiquetaEstado(item.estado, item.estadoManual)}</strong><span>{hora(item.entrada) ?? "sin entrada"}</span><span>{hora(item.salida) ?? "sin salida"}</span></> : <span>Sin programación</span>}</button>;
    })}</div></div>
    <dialog aria-labelledby="titulo-asistencia" className="dialogo-confirmacion" ref={dialogo}>
      {fechaSeleccionada && asistencia?.estado !== "manual" ? <form action={accion}>
        <h2 id="titulo-asistencia">{asistencia?.estado === "confirmada" ? "Ajustar asistencia" : "Registrar asistencia"}</h2>
        <p>{fechaSeleccionada}</p>
        <input name="idHuellero" type="hidden" value={idHuellero} />
        <input name="fecha" type="hidden" value={fechaSeleccionada} />
        <input name="estadoActual" type="hidden" value={asistencia?.estado ?? "sin-asistencia"} />
        {asistencia ? <><label>Fecha<input defaultValue={fechaSeleccionada} readOnly type="date" /></label><label>Hora de ingreso<input defaultValue={hora(asistencia.entrada) ?? ""} name="entrada" required type="time" /></label><label>Hora de salida<input defaultValue={hora(asistencia.salida) ?? ""} name="salida" required type="time" /></label>{asistencia.estado === "confirmada" ? <label>Motivo del ajuste<input name="motivo" required /></label> : null}<div className="acciones-dialogo"><button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button><button disabled={pendiente} type="submit">{pendiente ? "Guardando…" : "Guardar asistencia"}</button></div></> : <><p>No hay un horario publicado para este día. Publique el horario antes de registrar la asistencia.</p><div className="acciones-dialogo"><button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cerrar</button></div></>}
        {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
      </form> : <form method="dialog"><h2 id="titulo-asistencia">Estado manual</h2><p>{fechaSeleccionada}. Esta jornada tiene el estado {asistencia?.estadoManual ?? "manual"}.</p><div className="acciones-dialogo"><button className="boton-secundario">Cerrar</button></div></form>}
    </dialog>
  </>;
}

function hora(valor: string | null): string | undefined { return valor ? /T(\d{2}:\d{2})/.exec(valor)?.[1] : undefined; }
function etiquetaEstado(estado: Estado, manual: string | null): string { if (estado === "manual") return manual ?? "Estado manual"; return estado === "confirmada" ? "Confirmada" : "Pendiente"; }
