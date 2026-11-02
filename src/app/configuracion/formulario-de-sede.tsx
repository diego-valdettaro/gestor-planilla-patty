"use client";

import { useActionState, useEffect, useRef } from "react";

import { BotonCancelar } from "./boton-cancelar";
import { guardarSede, type EstadoDeCreacionDeSede } from "./actions";

const estadoInicial: EstadoDeCreacionDeSede = {};

export function FormularioDeSede({ grupo }: { grupo: string }) {
  const [estado, accion, pendiente] = useActionState(guardarSede, estadoInicial);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!estado.listo) return;
    formulario.current?.reset();
    const desplegable = formulario.current?.closest("details");
    if (desplegable) desplegable.open = false;
  }, [estado.listo]);

  return <form action={accion} className="filtros panel-filtros formulario-de-sede" ref={formulario}>
    <input name="grupo" type="hidden" value={grupo} />
    <label>Nombre de la sede<input aria-describedby={estado.error ? "error-de-sede" : undefined} aria-invalid={estado.error ? true : undefined} defaultValue={estado.nombre ?? ""} key={estado.error ?? "sin-error"} name="nombre" placeholder="Tienda Centro" required /></label>
    <div className="acciones-formulario"><button className="boton-principal" disabled={pendiente} type="submit">{pendiente ? "Creando…" : "Crear sede"}</button><BotonCancelar /></div>
    {estado.error && <p className="mensaje-operacion error" id="error-de-sede" role="alert">{estado.error}</p>}
  </form>;
}
