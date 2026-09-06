"use client";

import { useState } from "react";

export function BotonDeFeedback() {
  const [abierto, setAbierto] = useState(false);
  const [comentario, setComentario] = useState("");
  const [estado, setEstado] = useState<"inactivo" | "enviando" | "error" | "listo">("inactivo");
  const [mensaje, setMensaje] = useState("");

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
    <button aria-expanded={abierto} aria-haspopup="dialog" aria-label="Enviar feedback" onClick={() => setAbierto(true)} type="button"><span aria-hidden="true">🐛</span><span className="sr-only">Enviar feedback</span></button>
    {abierto && <div className="modal-feedback" role="presentation"><section aria-label="Enviar feedback" aria-modal="true" className="panel-feedback" role="dialog">
      <header><h2>Enviar feedback</h2><button aria-label="Cerrar feedback" className="cerrar-feedback" onClick={() => setAbierto(false)} type="button">×</button></header>
      <p>Convertiremos tu comentario en un issue listo para revisar.</p>
      <form onSubmit={enviarFeedback}><label>Comentario<textarea maxLength={5000} onChange={(evento) => setComentario(evento.target.value)} required rows={5} value={comentario} /></label><button disabled={estado === "enviando"} type="submit">{estado === "enviando" ? "Creando issue…" : "Crear issue"}</button></form>
      {estado === "error" && <p className="mensaje-feedback error" role="alert">{mensaje}</p>}
      {estado === "listo" && <p className="mensaje-feedback listo"><a href={mensaje} rel="noreferrer" target="_blank">Issue creado en GitHub</a></p>}
    </section></div>}
  </aside>;
}
