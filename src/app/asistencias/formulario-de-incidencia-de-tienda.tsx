"use client";

import React, { useActionState } from "react";

import type { EstadoDeRegistroDeIncidencia } from "./actions";
import { registrarIncidenciaDeTienda } from "./actions";

const estadoInicial: EstadoDeRegistroDeIncidencia = {};

export function FormularioDeIncidenciaDeTienda({ colaboradores, fecha }: {
  colaboradores: Array<{ dni: string; nombre: string; grupo?: string }>;
  fecha: string;
}) {
  const [estado, accion, pendiente] = useActionState(registrarIncidenciaDeTienda, estadoInicial);
  return <section aria-labelledby="titulo-incidencia-tienda" className="tarjeta panel">
    <header className="panel-cabecera"><div><h2 id="titulo-incidencia-tienda">Registrar incidencia de tienda</h2><p>La incidencia queda pendiente de revisión y no se descuenta automáticamente.</p></div></header>
    <form action={accion} className="filtros panel-filtros">
      <label>Persona<select name="dni" required>{colaboradores.map(({ dni, nombre, grupo }) => <option key={dni} value={dni}>{nombre}{grupo ? ` · ${grupo}` : ""} · {dni}</option>)}</select></label>
      <label>Fecha del hecho<input defaultValue={fecha} name="fechaDelHecho" required type="date" /></label>
      <label>Monto (S/)<input inputMode="decimal" name="monto" placeholder="0,00" required /></label>
      <label>Motivo<textarea maxLength={250} name="motivo" required /></label>
      <button className="boton-principal" disabled={!colaboradores.length || pendiente} type="submit">{pendiente ? "Registrando…" : "Registrar incidencia de tienda"}</button>
      {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
      {estado.listo && <p className="mensaje-operacion" role="status">{estado.listo}</p>}
    </form>
  </section>;
}
