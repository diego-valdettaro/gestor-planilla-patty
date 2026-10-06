"use client";

import { useActionState } from "react";

import { asignarGerenteDesdeFormulario, type EstadoDeFormularioDeCuentas } from "./actions";

const estadoInicial: EstadoDeFormularioDeCuentas = {};

export function AsignadorDeGerente({ grupo, gerentes }: { grupo: string; gerentes: Array<{ id: string; nombreUsuario: string }> }) {
  const [estado, accion, pendiente] = useActionState(asignarGerenteDesdeFormulario, estadoInicial);
  return <form action={accion} className="formulario-asignacion formulario-politica">
    <input name="grupo" type="hidden" value={grupo} />
    <label>Gerente de {grupo}<select defaultValue="" name="cuentaId" required><option disabled value="">Gerente…</option>{gerentes.map((gerente) => <option key={gerente.id} value={gerente.id}>{gerente.nombreUsuario}</option>)}</select></label>
    <button className="boton-secundario" disabled={pendiente} type="submit">Asignar</button>
    {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
  </form>;
}
