"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import { confirmarCeseDesdeFormulario, confirmarIngresoDesdeFormulario, corregirIngresoDesdeFormulario, registrarCeseDesdeFormulario, registrarIngresoDesdeFormulario, type EstadoDeFormularioDeRelacionLaboral } from "./actions";

const estadoInicial: EstadoDeFormularioDeRelacionLaboral = {};

export function FormularioDeIngreso({ colaboradores }: { colaboradores: Array<{ dni: string; nombre: string; grupo: string }> }) {
  const [estado, accion, pendiente] = useActionState(registrarIngresoDesdeFormulario, estadoInicial);
  return <form action={accion} className="filtros panel-filtros" key={estado.listo ?? 0}>
    <label>Colaborador<select defaultValue="" name="dni" required><option disabled value="">Colaborador…</option>{colaboradores.map((colaborador) => <option key={colaborador.dni} value={colaborador.dni}>{colaborador.nombre} · {colaborador.dni} · {colaborador.grupo}</option>)}</select></label>
    <label>Fecha de ingreso<input name="ingreso" required type="date" /></label>
    <button className="boton-principal" disabled={pendiente || !colaboradores.length} type="submit">Registrar ingreso</button>
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
  const detalles = useRef<HTMLDetailsElement>(null);
  // Al guardar la fecha el panel se cierra: abierto taparía los botones vecinos de la fila.
  useEffect(() => { if (estado.listo) detalles.current?.removeAttribute("open"); }, [estado.listo]);
  return <details className="edicion-configuracion" ref={detalles}><summary>{etiquetaDelBoton}</summary>
    <form action={accion} className="formulario-edicion" key={estado.listo ?? 0}>
      <input name="relacionId" type="hidden" value={relacionId} />
      <label>Fecha de {campo} de {nombreDeLaPersona}<input defaultValue={valorInicial} min={minimo} name="fecha" required type="date" /></label>
      <button className="boton-secundario" disabled={pendiente} type="submit">Guardar fecha</button>
      {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
    </form>
  </details>;
}

/** Confirma una fecha tras un diálogo; si el servidor la rechaza, el error queda dentro del diálogo, junto a la acción. */
export function ConfirmacionDeFecha({ relacionId, campo, etiqueta, titulo, descripcion }: {
  relacionId: string;
  campo: Campo;
  etiqueta: string;
  titulo: string;
  descripcion: string;
}) {
  const [estado, accion, pendiente] = useActionState(campo === "ingreso" ? confirmarIngresoDesdeFormulario : confirmarCeseDesdeFormulario, estadoInicial);
  const dialogo = useRef<HTMLDialogElement>(null);
  const tituloId = useId();
  return <form action={accion}>
    <input name="relacionId" type="hidden" value={relacionId} />
    <button className="boton-secundario" onClick={() => dialogo.current?.showModal()} type="button">{etiqueta}</button>
    <dialog aria-labelledby={tituloId} className="dialogo-confirmacion" ref={dialogo}>
      <section>
        <h2 id={tituloId}>{titulo}</h2>
        <p>{descripcion}</p>
        {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
        <div className="acciones-dialogo">
          <button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button>
          <button className="boton-principal" disabled={pendiente} type="submit">{etiqueta}</button>
        </div>
      </section>
    </dialog>
  </form>;
}
