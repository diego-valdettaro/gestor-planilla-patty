"use client";

import React, { useActionState, useEffect, useRef, useState } from "react";

import { ConAviso } from "@/app/aviso-flotante";
import { TIPOS_DE_ESTADO_MANUAL_REGISTRABLE, type TipoDeEstadoManualRegistrable } from "@/asistencias/estado-manual";

import { registrarAsistenciaManual, type EstadoDeRegistroManual } from "./actions";
import { avisoDeDia, CLASE_DE_ESTADO_DE_ASISTENCIA, detalleDeDia } from "./aviso-de-dia";
import { useCambiosPendientes } from "./cambios-pendientes";
import { GlifoDeEstado } from "./glifo-de-estado";
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
  dni,
  nombreColaborador,
  soloLectura = false,
}: {
  asistencias: Asistencia[];
  dias: string[];
  desfase: number;
  dni: string;
  nombreColaborador: string;
  soloLectura?: boolean;
}) {
  const porFecha = new Map(asistencias.map((asistencia) => [asistencia.fecha, asistencia]));
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>();
  const [tipoDeAsistencia, setTipoDeAsistencia] = useState<TipoDeAsistencia>("trabajo");
  const dialogo = useRef<HTMLDialogElement>(null);
  const celdaActiva = useRef<HTMLButtonElement | null>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const [resumen, setResumen] = useState<ResumenDeAjuste>();
  const [edicionModificada, setEdicionModificada] = useState(false);
  const [estado, accion, pendiente] = useActionState(registrarAsistenciaManual, estadoInicial);
  const { marcarPendiente, limpiarPendiente, confirmarDescarte } = useCambiosPendientes();
  const asistencia = fechaSeleccionada ? porFecha.get(fechaSeleccionada) : undefined;
  const estadoSeleccionado: EstadoDeCeldaAsistencia = estadoDeCeldaAsistencia(asistencia);
  const editable = !soloLectura && celdaDeAsistenciaEsEditable(asistencia);

  useEffect(() => {
    if (estado.listo) { limpiarPendiente(); setEdicionModificada(false); dialogo.current?.close(); }
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
    setEdicionModificada(false);
    dialogo.current?.showModal();
  }

  function cancelarEdicion() {
    limpiarPendiente();
    setEdicionModificada(false);
    setFechaSeleccionada(undefined);
    setResumen(undefined);
    setTipoDeAsistencia("trabajo");
    dialogo.current?.close();
    requestAnimationFrame(() => celdaActiva.current?.focus());
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
  const detalleDelDia = detalleDeDia(estadoSeleccionado, "abrir-el-dia");

  return <>
    <div className="calendario"><div className="dias-semana">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((dia) => <span key={dia}>{dia}</span>)}</div><div className="celdas-calendario">{Array.from({ length: desfase }).map((_, indice) => <span className="celda-vacia" key={`vacia-${indice}`} />)}{dias.map((fecha) => {
      const item = porFecha.get(fecha);
      const estadoDelDia = estadoDeCeldaAsistencia(item);
      const etiqueta = etiquetaDeCeldaAsistencia(estadoDelDia, item?.estadoManual ?? null);
      const entrada = hora(item?.entrada ?? null)?.slice(0, 5);
      const salida = hora(item?.salida ?? null)?.slice(0, 5);
      return <ConAviso aviso={avisoDeDia(estadoDelDia, "abrir-el-dia")} key={fecha}>{(descripcion) => <button aria-describedby={descripcion} aria-label={`Asistencia del ${fecha}: ${etiqueta}`} className={`dia-calendario est ${CLASE_DE_ESTADO_DE_ASISTENCIA[estadoDelDia]}`} onClick={(evento) => { celdaActiva.current = evento.currentTarget; abrir(fecha); }} type="button">
        <span className="dia-cabecera"><time dateTime={fecha}>{Number(fecha.slice(-2))}</time><span className="dia-nombre">{nombreCortoDelDia(fecha)}</span></span>
        <em className="dia-estado"><GlifoDeEstado estado={estadoDelDia} />{etiqueta}</em>
        {item && !item.estadoManual && <span className="dia-datos">{item.sedeProgramada && <b>{item.sedeProgramada}</b>}{entrada && salida && <small>{entrada}–{salida}</small>}</span>}
      </button>}</ConAviso>;
    })}</div></div>
    <dialog aria-labelledby="titulo-asistencia" className="dialogo-confirmacion" onCancel={(evento) => {
      evento.preventDefault();
      if (edicionModificada) confirmarDescarte();
      else cancelarEdicion();
    }} ref={dialogo}>
      {fechaSeleccionada && editable && asistencia ? <form action={accion} className="formulario-dialogo" key={fechaSeleccionada} onInput={() => { setEdicionModificada(true); marcarPendiente(cancelarEdicion); }} ref={formulario}>
        <h2 id="titulo-asistencia" ref={titulo} tabIndex={-1}>{resumen ? "¿Confirmar el ajuste de asistencia?" : confirmada ? "Ajustar asistencia" : "Registrar asistencia"}</h2>
        {!resumen && <p className="subtitulo-dialogo">{nombreColaborador} · {fechaLarga(fechaSeleccionada)}</p>}
        {resumen ? <section aria-label="Resumen del ajuste" className="resumen-de-ajuste">
          <p>Colaborador: {resumen.colaborador}. Fecha: {resumen.fecha}.</p>
          <ul>{resumen.cambios.map((linea) => <li key={linea}>{linea}</li>)}</ul>
          <p>Motivo: {resumen.motivo}</p>
          <p>{resumen.consecuencia}</p>
        </section> : null}
        <div className="campos-de-asistencia" hidden={Boolean(resumen)}>
        <input name="dni" type="hidden" value={dni} />
        <input name="fecha" type="hidden" value={fechaSeleccionada} />
        <input name="estadoActual" type="hidden" value={asistencia.estado} />
        <p className="linea-de-estado">Estado <span className={`est est-etiqueta ${CLASE_DE_ESTADO_DE_ASISTENCIA[estadoSeleccionado]}`}><GlifoDeEstado estado={estadoSeleccionado} />{etiquetaDeCeldaAsistencia(estadoSeleccionado, asistencia.estadoManual)}</span>{detalleDelDia && <span className="texto-suave">{detalleDelDia.detalle[0].toUpperCase() + detalleDelDia.detalle.slice(1)}</span>}</p>
        {asistencia.estado === "confirmada" ? <><input name="tipoDeAsistencia" type="hidden" value="trabajo" /><p>Asistencia confirmada: Jornada laboral</p></> : <label>Tipo de asistencia<select name="tipoDeAsistencia" onChange={(evento) => setTipoDeAsistencia(evento.target.value as TipoDeAsistencia)} value={tipoDeAsistencia}>{TIPOS_DE_ASISTENCIA.map((opcion) => <option key={opcion} value={opcion}>{etiquetaTipoDeAsistencia(opcion)}</option>)}</select></label>}
        {tipoDeAsistencia === "trabajo" ? <>{asistencia.estado === "confirmada" ? <p>Sede planificada: {asistencia.sedeProgramada}</p> : <><label>Sede<input defaultValue={asistencia.sedeProgramada ?? ""} name="sede" required /></label><p className="ayuda-campo">Debe coincidir con la sede planificada.</p></>}<div className="fila-de-campos"><label>Hora de ingreso<input defaultValue={hora(asistencia.entrada) ?? ""} name="entrada" required step="1" type="time" /></label><label>Hora de salida<input defaultValue={hora(asistencia.salida) ?? ""} name="salida" required step="1" type="time" /></label></div>{asistencia.estado === "confirmada" ? <label>Motivo del ajuste<input name="motivo" required /></label> : null}</> : <label>Comentario<input name="comentario" required /></label>}</div>
        <div className="acciones-dialogo">
          <button className="boton-secundario" onClick={cancelarEdicion} type="button">Cancelar</button>
          {resumen ? <><button className="boton-secundario" onClick={volverAlFormulario} type="button">Volver al formulario</button><button className="boton-principal" disabled={pendiente} type="submit">{pendiente ? "Guardando…" : "Confirmar ajuste"}</button></>
            : confirmada && tipoDeAsistencia === "trabajo" ? <button className="boton-principal" onClick={revisarAjuste} type="button">Revisar ajuste</button>
            : <button className="boton-principal" disabled={pendiente} type="submit">{pendiente ? "Guardando…" : "Guardar asistencia"}</button>}
        </div>
        {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
      </form> : <FormularioSoloLectura estado={estadoSeleccionado} estadoManual={asistencia?.estadoManual ?? null} fecha={fechaSeleccionada} soloConsulta={soloLectura} />}
    </dialog>
  </>;
}

function FormularioSoloLectura({ estado, estadoManual, fecha, soloConsulta = false }: {
  estado: EstadoDeCeldaAsistencia;
  estadoManual: EvidenciaDeCeldaAsistencia["estadoManual"];
  fecha: string | undefined;
  soloConsulta?: boolean;
}) {
  const { titulo, descripcion } = soloConsulta
    ? { titulo: "Solo consulta", descripcion: `Estado del día: ${etiquetaDeCeldaAsistencia(estado, estadoManual)}. Su rol no registra ni confirma asistencias: lo hace el gerente de área del grupo.` }
    : textoSoloLectura(estado, estadoManual);
  return <form className="formulario-dialogo" method="dialog">
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

function fechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", timeZone: "UTC", weekday: "long", year: "numeric" }).format(new Date(`${fecha}T00:00:00Z`));
}

function nombreCortoDelDia(fecha: string): string {
  return ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"][(new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7];
}

function hora(valor: string | null): string | undefined { return valor ? /T(\d{2}:\d{2}(?::\d{2})?)/.exec(valor)?.[1] : undefined; }

function etiquetaTipoDeAsistencia(tipo: TipoDeAsistencia): string {
  return tipo === "trabajo" ? "Jornada laboral" : tipo[0].toUpperCase() + tipo.slice(1);
}
