"use client";

import React, { useActionState, useRef } from "react";

import type { EstadoDeRegistroDeIncidencia } from "./actions";
import { registrarIncidenciaDeTienda } from "./actions";

const estadoInicial: EstadoDeRegistroDeIncidencia = {};

// `plegable`: con la matriz o el calendario a la vista, el formulario queda detrás de «+ Registrar incidencia de tienda».
// Sin ellos (el gerente solo registra incidencias) es el contenido de la pantalla y va abierto.
export function FormularioDeIncidenciaDeTienda({ colaboradores, fecha, plegable = false }: {
  colaboradores: Array<{ dni: string; nombre: string; grupo?: string }>;
  fecha: string;
  plegable?: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(registrarIncidenciaDeTienda, estadoInicial);
  const plegado = useRef<HTMLDetailsElement>(null);
  const formularioRef = useRef<HTMLFormElement>(null);
  const formulario = (
    <form action={accion} className="filtros panel-filtros formulario-de-incidencia" ref={formularioRef}>
      <label>Persona<select name="dni" required>{colaboradores.map(({ dni, nombre, grupo }) => <option key={dni} value={dni}>{nombre}{grupo ? ` · ${grupo}` : ""} · {dni}</option>)}</select></label>
      <label>Fecha del hecho<input defaultValue={fecha} name="fechaDelHecho" required type="date" /></label>
      <label>Monto (S/)<input inputMode="decimal" name="monto" placeholder="0,00" required /></label>
      <label className="campo-completo">Motivo<textarea maxLength={250} name="motivo" required rows={2} /></label>
      {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
      {estado.listo && <p className="mensaje-operacion listo" role="status">{estado.listo}</p>}
      <div className="acciones-formulario">
        <button className="boton-principal" disabled={!colaboradores.length || pendiente} type="submit">{pendiente ? "Registrando…" : "Registrar incidencia de tienda"}</button>
        <button className="boton-secundario" onClick={cancelar} type="button">Cancelar</button>
      </div>
    </form>
  );
  function cancelar() {
    formularioRef.current?.reset();
    if (plegado.current) plegado.current.open = false;
  }

  return <section aria-labelledby="titulo-incidencia-tienda" className="tile panel">
    <header className="panel-cabecera"><div><h2 id="titulo-incidencia-tienda">Registrar incidencia de tienda</h2><p>La incidencia queda pendiente de revisión y no se descuenta automáticamente.</p></div></header>
    {plegable
      ? <details className="nuevo-configuracion" ref={plegado}><summary>+ Registrar incidencia de tienda</summary>{formulario}</details>
      : formulario}
  </section>;
}
