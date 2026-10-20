"use client";

import { useActionState, useEffect, useRef } from "react";

import { confirmarPagoDesdeFormulario, type EstadoDeConfirmacionDePago } from "./actions";
import { DialogoDeConfirmacionDePago, type PropiedadesDelDialogoDePago } from "./dialogo-de-confirmacion-de-pago";

const estadoInicial: EstadoDeConfirmacionDePago = {};
const TITULO_DE_LA_PANTALLA = "main h1";

/**
 * Acción principal del mes finalizado sin pago (diseño de interacción 4.7 y 6.2): «Confirmar pago realizado» abre el diálogo y el diálogo envía la
 * constancia con la versión que Finanzas vio. Aquí se conectan el estado de la acción con la presentación y con el navegador (cableado F-61:
 * `showModal()`, `close()`, `focus()` y el anuncio `role="status"`). Sigue montado cuando el mes pasa a tener el pago confirmado (entonces recibe la
 * explicación en lugar de la confirmación) para que el resultado se siga anunciando aunque el botón ya no exista.
 */
export function ConfirmacionDelPago({ confirmacion, explicacion }: {
  /** Lo que el diálogo declara; sin ello el mes ya está pagado y solo se muestra la explicación. */
  confirmacion?: Pick<PropiedadesDelDialogoDePago, "mes" | "numeroDeVersion" | "personas" | "subtotalCentimos" | "responsable" | "hoy">;
  explicacion?: string;
}) {
  const [resultado, confirmar, pendiente] = useActionState(confirmarPagoDesdeFormulario, estadoInicial);
  const dialogo = useRef<HTMLDialogElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  // Si el foco no vuelve al botón (el éxito lo manda al título de la pantalla), el cierre no debe quitárselo.
  const focoAparte = useRef(false);
  const hayDialogo = confirmacion !== undefined;

  // Cancelar y Escape cierran el diálogo y el foco vuelve al botón que lo abrió.
  useEffect(() => {
    const elemento = dialogo.current;
    const alCerrar = () => { if (!focoAparte.current) boton.current?.focus(); focoAparte.current = false; };
    elemento?.addEventListener("close", alCerrar);
    return () => elemento?.removeEventListener("close", alCerrar);
  }, [hayDialogo]);

  useEffect(() => {
    if (resultado === estadoInicial) return;
    if (resultado.listo) {
      if (dialogo.current?.open) { focoAparte.current = true; dialogo.current.close(); }
      document.querySelector<HTMLElement>(TITULO_DE_LA_PANTALLA)?.focus();
      return;
    }
    titulo.current?.focus();
  }, [resultado]);

  const cancelar = () => dialogo.current?.close();
  const abrir = () => { dialogo.current?.showModal(); titulo.current?.focus(); };

  return <>
    {confirmacion ? <>
      <button aria-haspopup="dialog" className="boton-principal" onClick={abrir} ref={boton} type="button">Confirmar pago realizado</button>
      <DialogoDeConfirmacionDePago {...confirmacion} accion={confirmar} alCancelar={cancelar} dialogoRef={dialogo} error={resultado.error} pendiente={pendiente} tituloRef={titulo} />
    </> : explicacion && <small className="linea-de-relacion">{explicacion}</small>}
    {resultado.mensaje && <p className="mensaje-operacion listo" role="status">{resultado.mensaje}</p>}
  </>;
}
