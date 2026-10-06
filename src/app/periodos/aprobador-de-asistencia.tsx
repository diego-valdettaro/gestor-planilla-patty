"use client";

import { useActionState } from "react";

import { aprobarAsistenciaDesdeFormulario, type EstadoDeAprobacionDeAsistencia } from "./actions";

const estadoInicial: EstadoDeAprobacionDeAsistencia = {};

export function AprobadorDeAsistencia({ periodoId, grupo, renovar = false }: { periodoId: string; grupo: string; renovar?: boolean }) {
  const [estado, accion, pendiente] = useActionState(aprobarAsistenciaDesdeFormulario, estadoInicial);
  return (
    <form action={accion} className="aprobador-de-asistencia">
      <input name="periodoId" type="hidden" value={periodoId} />
      <input name="grupo" type="hidden" value={grupo} />
      <button className="boton-secundario" disabled={pendiente} type="submit">{renovar ? "Aprobar de nuevo" : "Aprobar asistencia"}<span className="sr-only"> del grupo {grupo}</span></button>
      {estado.error ? <p className="mensaje-operacion error" role="alert">{estado.error}</p> : null}
    </form>
  );
}
