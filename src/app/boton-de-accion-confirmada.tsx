"use client";

import React, { useId, useRef, useState } from "react";

type AccionDeFormulario = (formData: FormData) => void | Promise<void>;

export function BotonDeAccionConfirmada({ accion, etiqueta, titulo, descripcion, confirmar, peligro = false, requiereSeleccion, children }: {
  accion: AccionDeFormulario;
  etiqueta: string;
  titulo: string;
  descripcion: string;
  confirmar: string;
  peligro?: boolean;
  requiereSeleccion?: string;
  children?: React.ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const tituloId = useId();
  const [seleccionValida, setSeleccionValida] = useState(!requiereSeleccion);

  return <form action={accion} onChange={(evento) => {
    if (requiereSeleccion) setSeleccionValida(new FormData(evento.currentTarget).getAll(requiereSeleccion).length > 0);
  }}>
    <button className={peligro ? "peligro" : "boton-secundario"} onClick={() => dialogo.current?.showModal()} type="button">{etiqueta}</button>
    <dialog aria-labelledby={tituloId} className="dialogo-confirmacion" ref={dialogo}>
      <section>
        <h2 id={tituloId}>{titulo}</h2>
        <p>{descripcion}</p>
        {children}
        <div className="acciones-dialogo">
          <button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button>
          <button className={peligro ? "peligro" : "boton-principal"} disabled={!seleccionValida} type="submit">{confirmar}</button>
        </div>
      </section>
    </dialog>
  </form>;
}
