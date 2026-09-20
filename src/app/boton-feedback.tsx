"use client";

import { useEffect, useRef, useState } from "react";

export function BotonDeFeedback() {
  const [abierto, setAbierto] = useState(false);
  const [comentario, setComentario] = useState("");
  const [estado, setEstado] = useState<"inactivo" | "enviando" | "error" | "listo">("inactivo");
  const [mensaje, setMensaje] = useState("");
  const disparador = useRef<HTMLButtonElement>(null);
  const comentarioRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (abierto) comentarioRef.current?.focus(); }, [abierto]);

  function cerrar() {
    setAbierto(false);
    disparador.current?.focus();
  }

  async function enviarFeedback(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setEstado("enviando");
    setMensaje("");
    const respuesta = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comentario, ruta: window.location.pathname }),
    });
    const datos = await respuesta.json() as { error?: string; url?: string };
    if (!respuesta.ok || !datos.url) {
      setEstado("error");
      setMensaje(datos.error ?? "No se pudo enviar el feedback.");
      return;
    }
    setEstado("listo");
    setMensaje(datos.url);
    setComentario("");
  }

  return <aside className="feedback-flotante">
    <button aria-expanded={abierto} aria-haspopup="dialog" aria-label="Enviar feedback" onClick={() => setAbierto(true)} ref={disparador} type="button"><svg aria-hidden="true" fill="none" focusable="false" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="22"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></button>
    {abierto && <div className="modal-feedback" onKeyDown={(evento) => { if (evento.key === "Escape") cerrar(); }} role="presentation"><section aria-labelledby="titulo-feedback" aria-modal="true" className="panel-feedback" role="dialog">
      <header><h2 id="titulo-feedback">Enviar feedback</h2><button aria-label="Cerrar feedback" className="cerrar-feedback" onClick={cerrar} type="button">×</button></header>
      <p>Convertiremos tu comentario en un issue listo para revisar.</p>
      <form onSubmit={enviarFeedback}><label>Comentario<textarea maxLength={5000} onChange={(evento) => setComentario(evento.target.value)} ref={comentarioRef} required rows={5} value={comentario} /></label><div className="acciones-feedback"><button className="boton-secundario" onClick={cerrar} type="button">Cancelar</button><button disabled={estado === "enviando"} type="submit">{estado === "enviando" ? "Creando issue…" : "Crear issue"}</button></div></form>
      {estado === "error" && <p className="mensaje-feedback error" role="alert">{mensaje}</p>}
      {estado === "listo" && <p className="mensaje-feedback listo"><a href={mensaje} rel="noreferrer" target="_blank">Issue creado en GitHub</a></p>}
    </section></div>}
  </aside>;
}
