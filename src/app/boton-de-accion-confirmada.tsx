"use client";

import { useRef } from "react";

type AccionDeFormulario = (formData: FormData) => void | Promise<void>;

export function BotonDeAccionConfirmada({ accion, etiqueta, titulo, descripcion, confirmar, peligro = false, children }: {
  accion: AccionDeFormulario;
  etiqueta: string;
  titulo: string;
  descripcion: string;
  confirmar: string;
  peligro?: boolean;
  children?: React.ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);

  return <form action={accion}>
    <button className={peligro ? "peligro" : "boton-secundario"} onClick={() => dialogo.current?.showModal()} type="button">{etiqueta}</button>
    <dialog aria-labelledby="titulo-confirmacion" className="dialogo-confirmacion" ref={dialogo}>
      <section>
        <h2 id="titulo-confirmacion">{titulo}</h2>
        <p>{descripcion}</p>
        {children}
        <div className="acciones-dialogo">
          <button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button>
          <button className={peligro ? "peligro" : "boton-principal"} type="submit">{confirmar}</button>
        </div>
      </section>
    </dialog>
  </form>;
}
