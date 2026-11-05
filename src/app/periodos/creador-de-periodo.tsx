"use client";

import { useActionState, useEffect, useRef } from "react";

import { crearPeriodoDesdeFormulario, type EstadoDeCreacionDePeriodo } from "./actions";

const estadoInicial: EstadoDeCreacionDePeriodo = {};

export function CreadorDePeriodo({ sugerencia }: { sugerencia: { inicio: string; fin: string } }) {
  const [estado, accion, pendiente] = useActionState(crearPeriodoDesdeFormulario, estadoInicial);
  const inicio = estado.valores?.inicio ?? sugerencia.inicio;
  const fin = estado.valores?.fin ?? sugerencia.fin;

  // Al crear el período el formulario se pliega; si hay error o advertencia sigue abierto junto a su mensaje.
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => { if (estado.listo) formulario.current?.closest("details")?.removeAttribute("open"); }, [estado.listo]);

  return (
    <form action={accion} className="filtros panel-filtros creador-de-periodo" ref={formulario} key={estado.listo ? "listo" : "nuevo"}>
      <p className="titulo-formulario">Nuevo período</p>
      <p className="pista-configuracion pista-formulario">Se sugiere continuar del día 26 al 25, pero puede indicar otras fechas.</p>
      <label>Inicio<input defaultValue={inicio} key={inicio} name="inicio" required type="date" /></label>
      <label>Fin<input defaultValue={fin} key={fin} name="fin" required type="date" /></label>
      {estado.error ? <p className="mensaje-operacion error creador-de-periodo-fila-completa" role="alert">{estado.error}</p> : null}
      {estado.advertencia ? (
        <>
          <p className="mensaje-operacion advertencia creador-de-periodo-fila-completa" role="status">{estado.advertencia}</p>
          <label className="checkbox creador-de-periodo-fila-completa">
            <input name="confirmarHueco" required type="checkbox" value="true" /> Confirmo que quiero dejar este hueco sin período
          </label>
        </>
      ) : null}
      <div className="acciones-formulario">
        <button className="boton-principal" disabled={pendiente} type="submit">
          {estado.advertencia ? "Crear de todas formas" : "Crear período"}
        </button>
        <button className="boton-secundario" onClick={(evento) => { evento.currentTarget.closest("form")?.reset(); evento.currentTarget.closest("details")?.removeAttribute("open"); }} type="button">Cancelar</button>
      </div>
    </form>
  );
}
