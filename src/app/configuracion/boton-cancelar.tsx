"use client";

// Cierra el bloque desplegable («+ Nueva sede», «+ Nuevo grupo»…) que contiene el botón y descarta lo escrito, sin enviar nada.
export function BotonCancelar() {
  return <button className="boton-secundario" onClick={(evento) => {
    const boton = evento.currentTarget;
    boton.closest("form")?.reset();
    const desplegable = boton.closest("details");
    if (desplegable) desplegable.open = false;
  }} type="button">Cancelar</button>;
}
