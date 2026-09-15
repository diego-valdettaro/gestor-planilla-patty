"use client";

import React, { useEffect, useRef, useState } from "react";

import type { ColaboradorParaConfirmar } from "@/asistencias/confirmar-colaboradores-por-rango";

import { confirmarSeleccionPorRango, evaluarConfirmacionPorRango } from "./actions";
import { crearModeloDelDialogo, type OpcionDelDialogo } from "./modelo-dialogo-confirmacion";

export function DialogoConfirmacionPorRango({
  colaboradores,
  finInicial,
  inicioInicial,
}: {
  colaboradores: ColaboradorParaConfirmar[];
  finInicial: string;
  inicioInicial: string;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [inicio, setInicio] = useState(inicioInicial);
  const [fin, setFin] = useState(finInicial);
  const [opciones, setOpciones] = useState<OpcionDelDialogo[]>([]);
  const [seleccionados, setSeleccionados] = useState(new Set<string>());
  const [evaluando, setEvaluando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setInicio(inicioInicial);
    setFin(finInicial);
  }, [inicioInicial, finInicial]);

  async function evaluar(rango = { inicio, fin }) {
    setEvaluando(true);
    setError(undefined);
    const resultado = await evaluarConfirmacionPorRango({ ...rango, colaboradores });
    if (resultado.error) {
      setOpciones([]);
      setSeleccionados(new Set());
      setError(resultado.error);
    } else {
      const modelo = crearModeloDelDialogo(resultado.evaluacion ?? []);
      setOpciones(modelo.opciones);
      setSeleccionados(new Set(modelo.seleccionados));
    }
    setEvaluando(false);
  }

  async function abrir() {
    setInicio(inicioInicial);
    setFin(finInicial);
    dialogo.current?.showModal();
    await evaluar({ inicio: inicioInicial, fin: finInicial });
  }

  async function confirmar() {
    setConfirmando(true);
    setError(undefined);
    const resultado = await confirmarSeleccionPorRango({ inicio, fin, idsHuellero: [...seleccionados] });
    setConfirmando(false);
    if (resultado.error) {
      await evaluar();
      setError(resultado.error);
      return;
    }
    dialogo.current?.close();
  }

  function alternar(idHuellero: string, marcado: boolean) {
    setSeleccionados((actuales) => {
      const siguientes = new Set(actuales);
      if (marcado) siguientes.add(idHuellero);
      else siguientes.delete(idHuellero);
      return siguientes;
    });
  }

  const etiquetaDeConfirmacion = seleccionados.size === 0
    ? "Confirmar selección"
    : `Confirmar ${seleccionados.size} ${seleccionados.size === 1 ? "colaborador" : "colaboradores"}`;

  return <>
    <button className="boton-principal" data-rango-inicio={inicioInicial} onClick={abrir} type="button">Confirmar por rango</button>
    <dialog aria-labelledby="titulo-confirmacion-rango" className="dialogo-confirmacion dialogo-confirmacion-rango" ref={dialogo}>
      <section>
        <header><h2 id="titulo-confirmacion-rango">Confirmar asistencias por rango</h2><p>Las jornadas resueltas se guardarán juntas. Si alguna cambió, no se confirmará ninguna.</p></header>
        <div className="campos-rango-confirmacion">
          <label>Desde<input disabled={evaluando || confirmando} onChange={(evento) => setInicio(evento.target.value)} type="date" value={inicio} /></label>
          <label>Hasta<input disabled={evaluando || confirmando} onChange={(evento) => setFin(evento.target.value)} type="date" value={fin} /></label>
          <button className="boton-secundario" disabled={evaluando || confirmando} onClick={() => evaluar()} type="button">{evaluando ? "Revisando…" : "Revisar rango"}</button>
        </div>
        {!evaluando && opciones.length === 0 && !error ? <p className="estado-vacio">No hay colaboradores para revisar en esta vista.</p> : null}
        <ul aria-label="Colaboradores del rango" className="opciones-confirmacion-rango">
          {opciones.map((opcion) => <li key={opcion.idHuellero}>
            <label><input checked={seleccionados.has(opcion.idHuellero)} disabled={!opcion.seleccionable || evaluando || confirmando} onChange={(evento) => alternar(opcion.idHuellero, evento.target.checked)} type="checkbox" /><span><strong>{opcion.nombre}</strong><small>{opcion.idHuellero}</small>{opcion.detalles.map((detalle) => <small className={opcion.bloqueos.length ? "causa-bloqueo-rango" : undefined} key={detalle}>{detalle}</small>)}</span></label>
          </li>)}
        </ul>
        {error && <p className="mensaje-operacion error" role="alert">{error}</p>}
        <footer className="acciones-dialogo"><button className="boton-secundario" disabled={confirmando} onClick={() => dialogo.current?.close()} type="button">Cancelar</button><button className="boton-principal" disabled={evaluando || confirmando || seleccionados.size === 0} onClick={confirmar} type="button">{confirmando ? "Confirmando…" : etiquetaDeConfirmacion}</button></footer>
      </section>
    </dialog>
  </>;
}
