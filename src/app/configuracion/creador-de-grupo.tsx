"use client";

import { useActionState } from "react";

import { crearGrupoDeConfiguracion, type EstadoDeCreacionDeGrupo } from "./actions";

const estadoInicial: EstadoDeCreacionDeGrupo = {};

export function CreadorDeGrupo() {
  const [estado, accion, pendiente] = useActionState(crearGrupoDeConfiguracion, estadoInicial);
  return <form action={accion} className="filtros filtros-configuracion"><label>Nombre del grupo<input name="nombre" required /></label><button className="boton-principal" disabled={pendiente} type="submit">Crear grupo</button>{estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}</form>;
}
