"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { IconoCandado } from "@/app/icono-candado";

import { registrarAsistenciaManual, type EstadoDeRegistroManual } from "./actions";
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
  entradaProgramada: string | null;
  salidaProgramada: string | null;
  minutosTrabajados: number | null;
  minutosDeTardanza: number | null;
  minutosAl25: number;
  minutosAl35: number;
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
  const estadoSeleccionado: EstadoDeCeldaAsistencia = estadoDeCeldaAsistencia(asistencia);
  const editable = celdaDeAsistenciaEsEditable(asistencia);

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
      const estadoDelDia = estadoDeCeldaAsistencia(item);
      const etiqueta = etiquetaDeCeldaAsistencia(estadoDelDia, item?.estadoManual ?? null);
      const señales = [item?.minutosDeTardanza ? `Tardanza: ${item.minutosDeTardanza} min` : null, item && item.minutosAl25 ? `Extra 25%: ${item.minutosAl25} min` : null, item && item.minutosAl35 ? `Extra 35%: ${item.minutosAl35} min` : null].filter(Boolean);
      const horario = `Programado: ${item?.entradaProgramada ?? "—"}–${item?.salidaProgramada ?? "—"} · Real: ${hora(item?.entrada ?? null) ?? "—"}–${hora(item?.salida ?? null) ?? "—"}`;
      return <button aria-label={`Asistencia del ${fecha}: ${etiqueta}. ${horario}${señales.length ? `. ${señales.join(". ")}` : ""}`} className={`dia-calendario estado-color-${estadoDelDia}`} key={fecha} onClick={() => abrir(fecha)} type="button"><time>{Number(fecha.slice(-2))}</time><strong>{estadoDelDia === "liquidado" && <IconoCandado />}{etiqueta}</strong><span className="horario-dia">{horario}</span>{señales.map((señal) => <span className="senal-dia" key={señal}>{señal}</span>)}</button>;
    })}</div></div>
    <dialog aria-labelledby="titulo-asistencia" className="dialogo-confirmacion" ref={dialogo}>
      {fechaSeleccionada && editable && asistencia ? <form action={accion}>
        <h2 id="titulo-asistencia">{asistencia.estado === "confirmada" ? "Ajustar asistencia" : "Registrar asistencia"}</h2>
        <p>{fechaSeleccionada}</p>
        <input name="idHuellero" type="hidden" value={idHuellero} />
        <input name="fecha" type="hidden" value={fechaSeleccionada} />
        <input name="estadoActual" type="hidden" value={asistencia.estado} />
        <label>Fecha<input defaultValue={fechaSeleccionada} readOnly type="date" /></label><label>Hora de ingreso<input defaultValue={hora(asistencia.entrada) ?? ""} name="entrada" required type="time" /></label><label>Hora de salida<input defaultValue={hora(asistencia.salida) ?? ""} name="salida" required type="time" /></label>{asistencia.estado === "confirmada" ? <label>Motivo del ajuste<input name="motivo" required /></label> : null}<div className="acciones-dialogo"><button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button><button disabled={pendiente} type="submit">{pendiente ? "Guardando…" : "Guardar asistencia"}</button></div>
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
