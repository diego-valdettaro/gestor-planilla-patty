"use client";

export default function ErrorDePagos({ reset }: { error: Error; reset: () => void }) {
  return <main className="contenido pagina"><section className="panel">
    <p className="mensaje-operacion error" role="alert">No se pudo cargar la pantalla de Pagos. No se guardó nada.</p>
    <button className="boton-secundario" onClick={() => reset()} type="button">Reintentar</button>
  </section></main>;
}
