"use client";

import { useActionState, useEffect, useState } from "react";

import {
  asignarEquipoOperativoASede,
  type EstadoDeAsignacionDeGrupo,
} from "./actions";

const estadoInicial: EstadoDeAsignacionDeGrupo = {};

export function EditorDeGrupoDeSede({
  grupoActual,
  grupos,
  nombre,
}: {
  grupoActual: string | null;
  grupos: string[];
  nombre: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [grupo, setGrupo] = useState(grupoActual ?? "");
  const [estado, accion, pendiente] = useActionState(
    asignarEquipoOperativoASede,
    estadoInicial,
  );

  useEffect(() => {
    if (estado.listo) setAbierto(false);
  }, [estado.listo]);

  return (
    <details
      className="edicion-configuracion"
      onToggle={(evento) => setAbierto(evento.currentTarget.open)}
      open={abierto}
    >
      <summary>Editar</summary>
      <form
        action={accion}
        className="formulario-edicion formulario-edicion-corto"
      >
        <input name="nombre" type="hidden" value={nombre} />
        <label>
          Grupo
          <select
            name="grupo"
            onChange={(evento) => setGrupo(evento.target.value)}
            required
            value={grupo}
          >
            <option disabled value="">
              Sin asignar
            </option>
            {grupos.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button className="boton-principal" disabled={pendiente} type="submit">
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        {estado.error && (
          <p className="mensaje-operacion error" role="alert">
            {estado.error}
          </p>
        )}
      </form>
    </details>
  );
}
