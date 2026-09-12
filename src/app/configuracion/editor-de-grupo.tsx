"use client";

import { useActionState, useEffect, useState } from "react";

export interface EstadoDeEdicionDeGrupo {
  error?: string;
  listo?: number;
}

const estadoInicial: EstadoDeEdicionDeGrupo = {};

// Editor de grupo compartido por Configuración: cambia el grupo de una sede o
// de un colaborador según el `accion` y el `campoOculto` que reciba, para no
// duplicar el mismo diálogo de edición en la misma ruta.
export function EditorDeGrupo({
  accion,
  campoOculto,
  etiqueta,
  grupoActual,
  grupos,
  permitirSinAsignar = false,
}: {
  accion: (
    estadoAnterior: EstadoDeEdicionDeGrupo,
    formData: FormData,
  ) => Promise<EstadoDeEdicionDeGrupo>;
  campoOculto: { nombre: string; valor: string };
  etiqueta: string;
  grupoActual: string | null;
  grupos: string[];
  permitirSinAsignar?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [grupo, setGrupo] = useState(grupoActual ?? "");
  const [estado, accionFormulario, pendiente] = useActionState(
    accion,
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
      <summary>{etiqueta}</summary>
      <form
        action={accionFormulario}
        className="formulario-edicion formulario-edicion-corto"
      >
        <input name={campoOculto.nombre} type="hidden" value={campoOculto.valor} />
        <label>
          Grupo
          <select
            name="grupo"
            onChange={(evento) => setGrupo(evento.target.value)}
            required
            value={grupo}
          >
            {permitirSinAsignar && (
              <option disabled value="">
                Sin asignar
              </option>
            )}
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
