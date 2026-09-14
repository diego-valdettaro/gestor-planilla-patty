"use client";

import React, { useState } from "react";

import { confirmarColaboradoresPorRango } from "./actions";

export interface OpcionDeConfirmacionPorRango {
  idHuellero: string;
  nombre: string;
  seleccionable: boolean;
  causa?: string;
}

export function SelectorConfirmacionPorRango({ inicio, fin, opciones }: { inicio: string; fin: string; opciones: OpcionDeConfirmacionPorRango[] }) {
  const [seleccionados, setSeleccionados] = useState(() => new Set(opciones.filter(({ seleccionable }) => seleccionable).map(({ idHuellero }) => idHuellero)));
  const [error, setError] = useState<string>();
  const [pendiente, setPendiente] = useState(false);
  const seleccionables = opciones.filter(({ seleccionable }) => seleccionable);

  async function confirmar() {
    setPendiente(true);
    setError(undefined);
    try {
      await confirmarColaboradoresPorRango({ inicio, fin, idsHuellero: [...seleccionados] });
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : "No se pudo confirmar la seleccion.");
    } finally {
      setPendiente(false);
    }
  }

  return <section className="selector-confirmacion-rango">
    <h2>Confirmar asistencias por rango</h2>
    <p>Seleccione colaboradores con jornadas resueltas entre {inicio} y {fin}.</p>
    <ul>{opciones.map((opcion) => <li key={opcion.idHuellero}><label><input checked={seleccionados.has(opcion.idHuellero)} disabled={!opcion.seleccionable} onChange={(evento) => setSeleccionados((actual) => {
      const siguiente = new Set(actual);
      if (evento.target.checked) siguiente.add(opcion.idHuellero); else siguiente.delete(opcion.idHuellero);
      return siguiente;
    })} type="checkbox" value={opcion.idHuellero} />{opcion.nombre} <small>{opcion.idHuellero}</small></label>{opcion.causa && <p>{opcion.causa}</p>}</li>)}</ul>
    <button className="boton-principal" disabled={pendiente || !seleccionados.size || !seleccionables.length} onClick={confirmar} type="button">{pendiente ? "Confirmando..." : "Confirmar seleccion"}</button>
    {error && <p className="mensaje-operacion error" role="alert">{error}</p>}
  </section>;
}
