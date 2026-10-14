"use client";

import { useActionState } from "react";

import { clasificarGoceDesdeFormulario, type EstadoDeFormularioDeGoce } from "./actions";

export type EstadoDeClasificacion = "pendiente" | "con_goce" | "sin_goce";

const estadoInicial: EstadoDeFormularioDeGoce = {};
const TEXTO_DEL_ESTADO: Record<EstadoDeClasificacion, string> = { pendiente: "Pendiente de clasificar", con_goce: "Con goce", sin_goce: "Sin goce" };

/**
 * Una jornada de permiso o suspensión: si sigue pendiente, el control para clasificarla; si ya está clasificada, su estado.
 * El mismo componente persiste cuando la jornada pasa de pendiente a clasificada, así el mensaje de éxito no desaparece.
 */
export function ClasificacionDeGoce({ dni, fecha, etiqueta, estado }: { dni: string; fecha: string; etiqueta: string; estado: EstadoDeClasificacion }) {
  const [resultado, accion] = useActionState(clasificarGoceDesdeFormulario, estadoInicial);
  return <li>
    {estado === "pendiente"
      ? <form action={accion}>
        <input type="hidden" name="dni" value={dni} />
        <input type="hidden" name="fecha" value={fecha} />
        <fieldset>
          <legend>{etiqueta} del {fecha}</legend>
          <p><span className="insignia advertencia">{TEXTO_DEL_ESTADO[estado]}</span></p>
          <label><input type="radio" name="goce" value="con_goce" required />Con goce</label>
          <label><input type="radio" name="goce" value="sin_goce" required />Sin goce</label>
          <button className="boton-principal" type="submit">Guardar clasificación</button>
        </fieldset>
      </form>
      : <p>{etiqueta} del {fecha}: <strong>{TEXTO_DEL_ESTADO[estado]}</strong></p>}
    {resultado.error && <p className="mensaje-operacion error" role="alert">{resultado.error}</p>}
    {resultado.listo && <p className="mensaje-operacion listo" role="status">Clasificación guardada.</p>}
  </li>;
}
