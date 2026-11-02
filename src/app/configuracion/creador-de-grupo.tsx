"use client";

import { useActionState } from "react";

import { BotonCancelar } from "./boton-cancelar";
import { crearGrupoDeConfiguracion, type EstadoDeCreacionDeGrupo } from "./actions";

const estadoInicial: EstadoDeCreacionDeGrupo = {};

export function CreadorDeGrupo() {
  const [estado, accion, pendiente] = useActionState(crearGrupoDeConfiguracion, estadoInicial);
  return <form action={accion} className="formulario-nuevo-grupo"><label>Nombre del grupo<input name="nombre" required /></label><label className="opcion-en-linea"><input defaultChecked name="gestiona" type="checkbox" value="true" />Gestiona asistencia y horarios</label><input name="gestiona" type="hidden" value="false" /><div className="acciones-formulario"><button className="boton-principal" disabled={pendiente} type="submit">Crear grupo</button><BotonCancelar /></div>{estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}</form>;
}
