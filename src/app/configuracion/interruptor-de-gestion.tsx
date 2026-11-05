"use client";

import { useId, useRef } from "react";

type AccionDeFormulario = (formData: FormData) => void | Promise<void>;

// Interruptor de «gestiona asistencia y horarios» de un grupo. Cambiarlo afecta a Horarios y
// Asistencias, así que abre un diálogo de confirmación antes de enviar el formulario.
export function InterruptorDeGestion({ accion, grupo, gestiona }: { accion: AccionDeFormulario; grupo: string; gestiona: boolean }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const tituloId = useId();
  const estadoId = useId();
  return <form action={accion} className="interruptor-de-gestion">
    <span id={estadoId}>{gestiona ? "Gestiona asistencia y horarios" : "No gestiona asistencia ni horarios"}</span>
    <button aria-checked={gestiona} aria-labelledby={estadoId} className="interruptor" onClick={() => dialogo.current?.showModal()} role="switch" type="button"><span aria-hidden="true" className="interruptor-perilla" /></button>
    <dialog aria-labelledby={tituloId} className="dialogo-confirmacion" ref={dialogo}>
      <section>
        <h2 id={tituloId}>¿Cambiar la gestión de asistencia de {grupo}?</h2>
        <p>{gestiona ? `${grupo} dejará de aparecer en Horarios y Asistencias y no requerirá aprobación de asistencia. Sus personas siguen en planilla.` : `${grupo} volverá a aparecer en Horarios y Asistencias.`}</p>
        <input name="nombre" type="hidden" value={grupo} />
        <input name="gestiona" type="hidden" value={gestiona ? "false" : "true"} />
        <div className="acciones-dialogo">
          <button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button>
          <button className="boton-principal" type="submit">{gestiona ? "Dejar de gestionar" : "Gestionar asistencia"}</button>
        </div>
      </section>
    </dialog>
  </form>;
}
