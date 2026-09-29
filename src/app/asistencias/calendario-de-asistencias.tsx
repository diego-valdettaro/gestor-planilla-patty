"use client";

import React, { useActionState, useEffect, useRef, useState } from "react";

import { IconoCandado } from "@/app/icono-candado";
import { TIPOS_DE_ESTADO_MANUAL_REGISTRABLE, type TipoDeEstadoManualRegistrable } from "@/asistencias/estado-manual";

import { registrarAsistenciaManual, type EstadoDeRegistroManual } from "./actions";
import { crearResumenDeAjuste, type ResumenDeAjuste } from "./resumen-de-ajuste";
import {
  celdaDeAsistenciaEsEditable,
  estadoDeCeldaAsistencia,
  etiquetaDeCeldaAsistencia,
  type EstadoDeCeldaAsistencia,
  type EvidenciaDeCeldaAsistencia,
} from "./estado-de-celda";

interface Asistencia extends EvidenciaDeCeldaAsistencia {
  fecha: string;
  entrada: string | null;
  salida: string | null;
  sedeProgramada: string | null;
}

const estadoInicial: EstadoDeRegistroManual = {};
const TIPOS_DE_ASISTENCIA = ["trabajo", ...TIPOS_DE_ESTADO_MANUAL_REGISTRABLE] as const;
type TipoDeAsistencia = "trabajo" | TipoDeEstadoManualRegistrable;

export function CalendarioDeAsistencias({
  asistencias,
  dias,
  desfase,
  idHuellero,
  nombreColaborador,
}: {
  asistencias: Asistencia[];
  dias: string[];
  desfase: number;
  idHuellero: string;
  nombreColaborador: string;
}) {
  const porFecha = new Map(asistencias.map((asistencia) => [asistencia.fecha, asistencia]));
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>();
  const [tipoDeAsistencia, setTipoDeAsistencia] = useState<TipoDeAsistencia>("trabajo");
  const dialogo = useRef<HTMLDialogElement>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const [resumen, setResumen] = useState<ResumenDeAjuste>();
  const [estado, accion, pendiente] = useActionState(registrarAsistenciaManual, estadoInicial);
  const asistencia = fechaSeleccionada ? porFecha.get(fechaSeleccionada) : undefined;
  const estadoSeleccionado: EstadoDeCeldaAsistencia = estadoDeCeldaAsistencia(asistencia);
  const editable = celdaDeAsistenciaEsEditable(asistencia);

  useEffect(() => {
    if (estado.listo) dialogo.current?.close();
  }, [estado.listo]);

  useEffect(() => {
    if (resumen) titulo.current?.focus();
  }, [resumen]);

  function volverAlFormulario() {
    setResumen(undefined);
    requestAnimationFrame(() => formulario.current?.querySelector<HTMLElement>('input:not([type="hidden"])')?.focus());
  }

  function abrir(fecha: string) {
    setFechaSeleccionada(fecha);
    setTipoDeAsistencia("trabajo");
    setResumen(undefined);
    dialogo.current?.showModal();
  }

  function revisarAjuste() {
    const form = formulario.current;
    if (!form || !fechaSeleccionada || !asistencia || !form.reportValidity()) return;
    const datos = new FormData(form);
    setResumen(crearResumenDeAjuste({
      fecha: fechaSeleccionada,
      colaborador: nombreColaborador,
      sede: asistencia.sedeProgramada,
      entradaActual: hora(asistencia.entrada) ?? null,
      salidaActual: hora(asistencia.salida) ?? null,
      entradaNueva: String(datos.get("entrada") ?? ""),
      salidaNueva: String(datos.get("salida") ?? ""),
      motivo: String(datos.get("motivo") ?? ""),
    }));
  }

  const confirmada = asistencia?.estado === "confirmada";

  return <>
    <div className="calendario"><div className="dias-semana">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((dia) => <span key={dia}>{dia}</span>)}</div><div className="celdas-calendario">{Array.from({ length: desfase }).map((_, indice) => <span className="celda-vacia" key={`vacia-${indice}`} />)}{dias.map((fecha) => {
      const item = porFecha.get(fecha);
      const estadoDelDia = estadoDeCeldaAsistencia(item);
      const etiqueta = etiquetaDeCeldaAsistencia(estadoDelDia, item?.estadoManual ?? null);
      return <button aria-label={`Asistencia del ${fecha}: ${etiqueta}`} className={`dia-calendario estado-color-${estadoDelDia}`} key={fecha} onClick={() => abrir(fecha)} type="button"><time>{Number(fecha.slice(-2))}</time><strong>{estadoDelDia === "liquidado" && <IconoCandado />}{etiqueta}</strong>{item ? item.estadoManual ? null : <><span>{item.sedeProgramada ?? "sin sede"}</span><span>{hora(item.entrada) ?? "sin entrada"}</span><span>{hora(item.salida) ?? "sin salida"}</span></> : <span>Sin planificación</span>}</button>;
    })}</div></div>
    <dialog aria-labelledby="titulo-asistencia" className="dialogo-confirmacion" ref={dialogo}>
      {fechaSeleccionada && editable && asistencia ? <form action={accion} key={fechaSeleccionada} ref={formulario}>
        <h2 id="titulo-asistencia" ref={titulo} tabIndex={-1}>{resumen ? "¿Confirmar el ajuste de asistencia?" : confirmada ? "Ajustar asistencia" : "Registrar asistencia"}</h2>
        {resumen ? <section aria-label="Resumen del ajuste">
          <p>Colaborador: {resumen.colaborador}. Fecha: {resumen.fecha}.</p>
          <ul>{resumen.cambios.map((linea) => <li key={linea}>{linea}</li>)}</ul>
          <p>Motivo: {resumen.motivo}</p>
          <p>{resumen.consecuencia}</p>
        </section> : null}
        <div hidden={Boolean(resumen)}>
        <input name="idHuellero" type="hidden" value={idHuellero} />
        <input name="fecha" type="hidden" value={fechaSeleccionada} />
        <input name="estadoActual" type="hidden" value={asistencia.estado} />
        {asistencia.estado === "confirmada" ? <><input name="tipoDeAsistencia" type="hidden" value="trabajo" /><p>Asistencia confirmada: Jornada laboral</p></> : <label>Tipo de asistencia<select name="tipoDeAsistencia" onChange={(evento) => setTipoDeAsistencia(evento.target.value as TipoDeAsistencia)} value={tipoDeAsistencia}>{TIPOS_DE_ASISTENCIA.map((opcion) => <option key={opcion} value={opcion}>{etiquetaTipoDeAsistencia(opcion)}</option>)}</select></label>}
        {tipoDeAsistencia === "trabajo" ? <>{asistencia.estado === "confirmada" ? <p>Sede planificada: {asistencia.sedeProgramada}</p> : <><label>Sede<input defaultValue={asistencia.sedeProgramada ?? ""} name="sede" required /></label><p className="ayuda-campo">Debe coincidir con la sede planificada.</p></>}<label>Hora de ingreso<input defaultValue={hora(asistencia.entrada) ?? ""} name="entrada" required type="time" /></label><label>Hora de salida<input defaultValue={hora(asistencia.salida) ?? ""} name="salida" required type="time" /></label>{asistencia.estado === "confirmada" ? <label>Motivo del ajuste<input name="motivo" required /></label> : null}</> : <label>Comentario<input name="comentario" required /></label>}</div>
        <div className="acciones-dialogo">
          <button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button>
          {resumen ? <><button className="boton-secundario" onClick={volverAlFormulario} type="button">Volver al formulario</button><button className="boton-principal" disabled={pendiente} type="submit">{pendiente ? "Guardando…" : "Confirmar ajuste"}</button></>
            : confirmada && tipoDeAsistencia === "trabajo" ? <button className="boton-principal" onClick={revisarAjuste} type="button">Revisar ajuste</button>
            : <button className="boton-principal" disabled={pendiente} type="submit">{pendiente ? "Guardando…" : "Guardar asistencia"}</button>}
        </div>
        {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
      </form> : <FormularioSoloLectura estado={estadoSeleccionado} estadoManual={asistencia?.estadoManual ?? null} fecha={fechaSeleccionada} />}
    </dialog>
  </>;
}

function FormularioSoloLectura({ estado, estadoManual, fecha }: {
  estado: EstadoDeCeldaAsistencia;
  estadoManual: EvidenciaDeCeldaAsistencia["estadoManual"];
  fecha: string | undefined;
}) {
  const { titulo, descripcion } = textoSoloLectura(estado, estadoManual);
  return <form method="dialog">
    <h2 id="titulo-asistencia">{titulo}</h2>
    <p>{fecha}. {descripcion}</p>
    <div className="acciones-dialogo"><button className="boton-secundario">Cerrar</button></div>
  </form>;
}

function textoSoloLectura(
  estado: EstadoDeCeldaAsistencia,
  estadoManual: EvidenciaDeCeldaAsistencia["estadoManual"],
): { titulo: string; descripcion: string } {
  switch (estado) {
    case "liquidado":
      return { titulo: "Día liquidado", descripcion: "La asistencia cae en un período de planilla cerrado y quedó congelada. No se puede editar." };
    case "sin-planificacion":
      return { titulo: "Sin planificación", descripcion: "No hay un horario publicado para este día. Publique el horario antes de registrar la asistencia." };
    default:
      return {
        titulo: "Día registrado",
        descripcion: estadoManual
          ? `Esta jornada tiene la designación “${etiquetaDeCeldaAsistencia(estado, estadoManual)}”.`
          : "Esta jornada ya está registrada.",
      };
  }
}

function hora(valor: string | null): string | undefined { return valor ? /T(\d{2}:\d{2})/.exec(valor)?.[1] : undefined; }

function etiquetaTipoDeAsistencia(tipo: TipoDeAsistencia): string {
  return tipo === "trabajo" ? "Jornada laboral" : tipo[0].toUpperCase() + tipo.slice(1);
}
