"use client";

import { useActionState } from "react";

import { corregirIngresoDesdeFormulario, registrarCeseDesdeFormulario, registrarIngresoDesdeFormulario, type EstadoDeFormularioDeRelacionLaboral } from "./actions";

const estadoInicial: EstadoDeFormularioDeRelacionLaboral = {};

export function FormularioDeIngreso({ colaboradores }: { colaboradores: Array<{ dni: string; nombre: string; grupo: string }> }) {
  const [estado, accion, pendiente] = useActionState(registrarIngresoDesdeFormulario, estadoInicial);
  return <form action={accion} className="filtros panel-filtros" key={estado.listo ?? 0}>
    <label>Colaborador<select defaultValue="" name="dni" required><option disabled value="">Colaborador…</option>{colaboradores.map((colaborador) => <option key={colaborador.dni} value={colaborador.dni}>{colaborador.nombre} · {colaborador.dni} · {colaborador.grupo}</option>)}</select></label>
    <label>Fecha de ingreso<input name="ingreso" required type="date" /></label>
    <button className="boton-principal" disabled={pendiente} type="submit">Registrar ingreso</button>
    {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
    {estado.listo ? <p className="mensaje-operacion listo" role="status">El ingreso quedó registrado. Falta confirmarlo.</p> : null}
  </form>;
}

type Campo = "ingreso" | "cese";

/** Fecha de ingreso (corrección mientras no está confirmada) o de cese (registro y corrección), con su error junto al campo. */
export function FormularioDeFecha({ relacionId, campo, valorInicial, minimo, etiquetaDelBoton, nombreDeLaPersona }: {
  relacionId: string;
  campo: Campo;
  valorInicial?: string;
  minimo?: string;
  etiquetaDelBoton: string;
  nombreDeLaPersona: string;
}) {
  const [estado, accion, pendiente] = useActionState(campo === "ingreso" ? corregirIngresoDesdeFormulario : registrarCeseDesdeFormulario, estadoInicial);
  const nombreDelCampo = campo === "ingreso" ? "ingreso" : "cese";
  return <details className="edicion-configuracion"><summary>{etiquetaDelBoton}</summary>
    <form action={accion} className="formulario-edicion" key={estado.listo ?? 0}>
      <input name="relacionId" type="hidden" value={relacionId} />
      <label>Fecha de {nombreDelCampo} de {nombreDeLaPersona}<input defaultValue={valorInicial} min={minimo} name="fecha" required type="date" /></label>
      <button className="boton-principal" disabled={pendiente} type="submit">Guardar fecha</button>
      {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
    </form>
  </details>;
}
