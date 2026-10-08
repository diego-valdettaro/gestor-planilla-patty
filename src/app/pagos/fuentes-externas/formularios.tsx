"use client";

import { useActionState, useId, useState } from "react";

import { formatearSoles } from "@/condiciones-laborales/valores";
import { formatearMes } from "@/fuentes-externas/valores";

import { useDialogo } from "../usar-dialogo";

import { ID_DEL_ANUNCIO } from "./anuncio";

import {
  anularImporteDesdeFormulario,
  confirmarFuenteDesdeFormulario,
  registrarImporteDesdeFormulario,
  volverAPendienteDesdeFormulario,
  type EstadoDeFormularioDeFuente,
} from "./actions";

const estadoInicial: EstadoDeFormularioDeFuente = {};

/**
 * El botón que abrió el diálogo deja de existir al guardar (la fila se anula, la fuente cambia de estado) y su componente se
 * desmonta en el mismo cambio que la respuesta del servidor. Por eso el foco pasa al título de la pantalla y el resultado se
 * anuncia en la región `role="status"` justo cuando vuelve la respuesta, sobre elementos que permanecen (diseño de
 * interacción, sección 6).
 */
function conAnuncio(accion: (estado: EstadoDeFormularioDeFuente, formData: FormData) => Promise<EstadoDeFormularioDeFuente>, mensaje: string) {
  return async (estadoAnterior: EstadoDeFormularioDeFuente, formData: FormData): Promise<EstadoDeFormularioDeFuente> => {
    const nuevo = await accion(estadoAnterior, formData);
    if (nuevo.listo) {
      document.querySelectorAll("dialog[open]").forEach((abierto) => (abierto as HTMLDialogElement).close());
      const titulo = document.querySelector("h1");
      if (titulo) { titulo.tabIndex = -1; titulo.focus(); }
      const anuncio = document.getElementById(ID_DEL_ANUNCIO);
      if (anuncio) anuncio.textContent = mensaje;
    }
    return nuevo;
  };
}

/** Diálogo 6.3: confirma que el listado del mes está completo; sin filas dice «sin importes». */
export function ConfirmacionDeListado({ tipoDeFuente, nombre, mes, filas, total }: { tipoDeFuente: string; nombre: string; mes: string; filas: number; total: number }) {
  const [estado, accion, pendiente] = useActionState(conAnuncio(confirmarFuenteDesdeFormulario, `${nombre} de ${formatearMes(mes)} confirmada.`), estadoInicial);
  const { dialogo, titulo, abrir } = useDialogo(estado.listo);
  const tituloId = useId();
  const sinImportes = filas === 0;

  return <>
    <button aria-haspopup="dialog" className="boton-secundario" onClick={abrir} type="button">{sinImportes ? "Confirmar sin importes" : "Confirmar listado completo"}<span className="sr-only"> de {nombre} {formatearMes(mes)}</span></button>
    <dialog aria-labelledby={tituloId} className="dialogo-confirmacion dialogo-de-pagos" ref={dialogo}>
      <form action={accion}>
        <input name="tipoDeFuente" type="hidden" value={tipoDeFuente} />
        <input name="mes" type="hidden" value={mes} />
        <h2 id={tituloId} ref={titulo} tabIndex={-1}>{sinImportes ? `¿Confirmar sin importes ${nombre} de ${formatearMes(mes)}?` : `¿Confirmar que el listado de ${nombre} de ${formatearMes(mes)} está completo?`}</h2>
        <p>Alcance: tipo de fuente {nombre}. Mes de pago: {formatearMes(mes)}. Aplica a todas las personas del mes; {filas} {filas === 1 ? "fila" : "filas"}, {formatearSoles(total)}.</p>
        <p>A partir de ahora, las personas sin fila cuentan como S/ 0,00 en esta fuente.</p>
        <p>Cancelar deja la fuente pendiente.</p>
        {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
        <div className="acciones-dialogo">
          <button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button>
          <button className="boton-principal" disabled={pendiente} type="submit">{pendiente ? "Confirmando…" : "Confirmar listado completo"}</button>
        </div>
      </form>
    </dialog>
  </>;
}

/** Diálogo 6.5: deshace la confirmación antes de finalizar el mes. */
export function VolverAPendiente({ tipoDeFuente, nombre, mes }: { tipoDeFuente: string; nombre: string; mes: string }) {
  const [estado, accion, pendiente] = useActionState(conAnuncio(volverAPendienteDesdeFormulario, `${nombre} de ${formatearMes(mes)} volvió a Pendiente.`), estadoInicial);
  const { dialogo, titulo, abrir } = useDialogo(estado.listo);
  const tituloId = useId();

  return <>
    <button aria-haspopup="dialog" className="boton-secundario" onClick={abrir} type="button">Volver a pendiente<span className="sr-only"> {nombre} {formatearMes(mes)}</span></button>
    <dialog aria-labelledby={tituloId} className="dialogo-confirmacion dialogo-de-pagos" ref={dialogo}>
      <form action={accion}>
        <input name="tipoDeFuente" type="hidden" value={tipoDeFuente} />
        <input name="mes" type="hidden" value={mes} />
        <h2 id={tituloId} ref={titulo} tabIndex={-1}>¿Volver {nombre} de {formatearMes(mes)} a Pendiente?</h2>
        <p>Alcance: solo esta fuente y este mes de pago.</p>
        <p>Mientras esté pendiente, las personas sin fila dejan de contar como S/ 0,00 y el mes no se puede finalizar.</p>
        <p>Cancelar deja la fuente confirmada.</p>
        {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
        <div className="acciones-dialogo">
          <button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button>
          <button className="boton-principal" disabled={pendiente} type="submit">{pendiente ? "Volviendo…" : "Volver a pendiente"}</button>
        </div>
      </form>
    </dialog>
  </>;
}

/** Anular un importe con motivo: es la forma de corregir una fuente (se anula y se vuelve a registrar). */
export function AnulacionDeImporte({ importeId, persona, dni, concepto, monto, confirmada }: { importeId: string; persona: string; dni: string; concepto: string; monto: number; confirmada: boolean }) {
  const [estado, accion, pendiente] = useActionState(conAnuncio(anularImporteDesdeFormulario, `Importe de ${persona} anulado.`), estadoInicial);
  const { dialogo, titulo, abrir } = useDialogo(estado.listo);
  const tituloId = useId();

  return <>
    <button aria-haspopup="dialog" className="peligro" onClick={abrir} type="button">Anular<span className="sr-only"> {concepto} de {persona} por {formatearSoles(monto)}</span></button>
    <dialog aria-labelledby={tituloId} className="dialogo-confirmacion dialogo-de-pagos" ref={dialogo}>
      <form action={accion}>
        <input name="importeId" type="hidden" value={importeId} />
        <h2 id={tituloId} ref={titulo} tabIndex={-1}>¿Anular {concepto} de {formatearSoles(monto)} de {persona}?</h2>
        <p>Alcance: solo este importe ({persona}, DNI {dni}). No se edita: queda en el historial como anulado y deja de contar.</p>
        <div className="formulario-dialogo"><label>Motivo de la anulación<input autoComplete="off" maxLength={250} name="motivo" required /></label></div>
        <p>{confirmada ? "La fuente está confirmada: al anular el importe vuelve a Pendiente y habrá que confirmar su listado otra vez." : "Si necesita otro monto, registre el importe correcto después de anular este."}</p>
        <p>Cancelar no anula nada.</p>
        {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
        <div className="acciones-dialogo">
          <button className="boton-secundario" onClick={() => dialogo.current?.close()} type="button">Cancelar</button>
          <button className="peligro" disabled={pendiente} type="submit">{pendiente ? "Anulando…" : "Anular importe"}</button>
        </div>
      </form>
    </dialog>
  </>;
}

/** Carga manual de un importe en la fuente y mes elegidos; el mes de aplicación es el mes de pago de la pantalla. */
export function RegistroDeImporte({ tipoDeFuente, mes, conceptos }: { tipoDeFuente: string; mes: string; conceptos: Array<{ codigo: string; nombre: string }> }) {
  const [estado, accion, pendiente] = useActionState(registrarImporteDesdeFormulario, estadoInicial);
  const [concepto, setConcepto] = useState(conceptos[0]?.codigo ?? "");

  return <form action={accion} className="formulario-dialogo formulario-de-importe" key={estado.listo ?? 0}>
    <input name="tipoDeFuente" type="hidden" value={tipoDeFuente} />
    <input name="mesDeAplicacion" type="hidden" value={mes} />
    <label>DNI de la persona<input autoComplete="off" inputMode="numeric" maxLength={8} name="dni" pattern="\d{8}" required /></label>
    {conceptos.length > 1
      ? <label>Concepto<select name="concepto" onChange={(evento) => setConcepto(evento.target.value)} value={concepto}>{conceptos.map((opcion) => <option key={opcion.codigo} value={opcion.codigo}>{opcion.nombre}</option>)}</select></label>
      : <input name="concepto" type="hidden" value={conceptos[0]?.codigo} />}
    <label>Fecha del hecho<input name="fechaDelHecho" required type="date" /></label>
    <label>Mes de devengue<input defaultValue={mes} name="mesDeDevengue" required type="month" /></label>
    <label>Importe (S/)<input autoComplete="off" inputMode="decimal" name="monto" placeholder="250,00" required /></label>
    <small className="linea-de-relacion">Se aplica en el mes de pago {formatearMes(mes)}. El signo sobre el neto lo da el concepto; escriba siempre un importe positivo.</small>
    {estado.error && <p className="mensaje-operacion error" role="alert">{estado.error}</p>}
    {estado.listo && !estado.error && <p className="mensaje-operacion listo" role="status">Importe registrado.{estado.aviso ? ` ${estado.aviso}` : ""}</p>}
    <div><button className="boton-principal" disabled={pendiente} type="submit">{pendiente ? "Registrando…" : "Registrar importe"}</button></div>
  </form>;
}
