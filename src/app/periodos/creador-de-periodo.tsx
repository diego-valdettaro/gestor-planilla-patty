"use client";

import { useActionState } from "react";

import { crearPeriodoDesdeFormulario, type EstadoDeCreacionDePeriodo } from "./actions";

const estadoInicial: EstadoDeCreacionDePeriodo = {};

export function CreadorDePeriodo({ sugerencia }: { sugerencia: { inicio: string; fin: string } }) {
  const [estado, accion, pendiente] = useActionState(crearPeriodoDesdeFormulario, estadoInicial);
  const inicio = estado.valores?.inicio ?? sugerencia.inicio;
  const fin = estado.valores?.fin ?? sugerencia.fin;

  return (
    <form action={accion} className="filtros panel-filtros creador-de-periodo">
      <label>Inicio<input defaultValue={inicio} key={inicio} name="inicio" required type="date" /></label>
      <label>Fin<input defaultValue={fin} key={fin} name="fin" required type="date" /></label>
      <button className="boton-principal" disabled={pendiente} type="submit">
        {estado.advertencia ? "Crear de todas formas" : "Crear período"}
      </button>
      {estado.error ? <p className="mensaje-operacion error creador-de-periodo-fila-completa" role="alert">{estado.error}</p> : null}
      {estado.advertencia ? (
        <>
          <p className="mensaje-operacion advertencia creador-de-periodo-fila-completa" role="alert">{estado.advertencia}</p>
          <label className="checkbox creador-de-periodo-fila-completa">
            <input name="confirmarHueco" required type="checkbox" value="true" /> Confirmo que quiero dejar este hueco sin período
          </label>
        </>
      ) : null}
    </form>
  );
}
