"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import type { AlcanceDeFinalizacion, HuellaDeRevision } from "@/pagos/finalizar-mes";

import { finalizarMesDesdeFormulario, verificarFinalizacionDesdeFormulario, type EstadoDeFinalizacion } from "./actions";
import { decidirPantalla } from "./decision-de-finalizacion";
import { DialogoDeFinalizacion } from "./dialogo-de-finalizacion";

const estadoInicial: EstadoDeFinalizacion = {};

/** Destinos de foco de la pantalla del mes (interacción §6 y §6.1.c): el título de la pantalla y el panel «Bloqueos del mes». */
const enfocar = (selector: string) => document.querySelector<HTMLElement>(selector)?.focus();
const TITULO_DE_LA_PANTALLA = "main h1";
const PANEL_DE_BLOQUEOS = "#bloqueos-del-mes";

/**
 * Acción principal del mes (diseño de interacción 4.6 y 6.1): «Finalizar mes» o «Crear otra versión» verifica en el servidor antes de abrir el
 * diálogo y el diálogo envía la finalización con la huella de lo revisado. Aquí se conectan los estados de las dos acciones con la presentación
 * y con el navegador (cableado F-61: `showModal()`, `close()`, `focus()` y el anuncio `role="status"`); qué mostrar y a quién enfocar lo decide
 * `decidirPantalla`. El componente se mantiene montado también cuando el mes pasa a tener bloqueos (entonces muestra el botón deshabilitado con su causa),
 * para que el foco al panel «Bloqueos del mes» se pida después de que la página refrescada lo muestre (F-75).
 */
export function FinalizacionDelMes({ mes, etiqueta, bloqueos, evaluacion, causaDeshabilitado, secundaria = false }: {
  mes: string; etiqueta: string;
  /** «Crear otra versión» convive con «Confirmar pago realizado», la acción principal (§4.2, §6.1): se presenta como acción secundaria. */
  secundaria?: boolean;
  /** Bloqueos que muestra el panel «Bloqueos del mes» en esta versión de la página (el mismo N de su título). */
  bloqueos: number;
  /** Lo revisado (alcance y huella) cuando se puede finalizar; sin ello, el botón se muestra deshabilitado con su causa. */
  evaluacion?: { alcance: AlcanceDeFinalizacion; huella: HuellaDeRevision };
  causaDeshabilitado?: string;
}) {
  const router = useRouter();
  const [verificacion, verificar] = useActionState(verificarFinalizacionDesdeFormulario, estadoInicial);
  const [resultado, finalizar, pendiente] = useActionState(finalizarMesDesdeFormulario, estadoInicial);
  // Una verificación nueva descarta el resultado de la finalización anterior (error, aviso de cambio o mensaje de éxito).
  const [descartado, setDescartado] = useState<EstadoDeFinalizacion>();
  const vigente = resultado === descartado ? estadoInicial : resultado;
  const dialogo = useRef<HTMLDialogElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  // Si el foco no vuelve al botón (el resultado lo manda al título o al panel), el cierre no debe quitárselo.
  const focoAparte = useRef(false);
  const decision = decidirPantalla(vigente);
  // Estados «bloqueado» que ya llevaron el foco al panel (no repetirlo cuando solo cambia el número de bloqueos).
  const conFocoEntregado = useRef(new Set<EstadoDeFinalizacion>());

  // Cancelar y Escape cierran el diálogo y el foco vuelve al botón que lo abrió.
  useEffect(() => {
    const elemento = dialogo.current;
    const alCerrar = () => { if (!focoAparte.current) boton.current?.focus(); focoAparte.current = false; };
    elemento?.addEventListener("close", alCerrar);
    return () => elemento?.removeEventListener("close", alCerrar);
  }, []);

  const cerrar = (conFocoAparte: boolean) => {
    if (!dialogo.current?.open) return;
    focoAparte.current = conFocoAparte;
    dialogo.current.close();
  };

  useEffect(() => {
    if (verificacion === estadoInicial) return;
    setDescartado(resultado);
    const siguiente = decidirPantalla(verificacion);
    if (!siguiente.abrir) return;
    if (!dialogo.current?.open) dialogo.current?.showModal();
    titulo.current?.focus();
  }, [verificacion]);

  useEffect(() => {
    if (resultado === estadoInicial) return;
    const siguiente = decidirPantalla(resultado);
    if (!siguiente.abrir) return cerrar(true);
    if (resultado.listo) { cerrar(true); return enfocar(TITULO_DE_LA_PANTALLA); }
    titulo.current?.focus();
  }, [resultado]);

  // Con bloqueos nuevos, la acción devuelve el estado y la página se refresca aparte: el foco se pide cuando el panel ya muestra los bloqueos
  // (N > 0), no al llegar el estado, y aunque la página refrescada sustituya el botón (F-75).
  useEffect(() => {
    const pendientes = [verificacion, vigente].filter((estado) => !decidirPantalla(estado).abrir && !conFocoEntregado.current.has(estado));
    if (pendientes.length === 0 || bloqueos === 0) return;
    for (const estado of pendientes) conFocoEntregado.current.add(estado);
    enfocar(PANEL_DE_BLOQUEOS);
  }, [verificacion, vigente, bloqueos]);

  const clase = secundaria ? "boton-secundario" : "boton-principal";
  const revisar = () => { cerrar(false); setDescartado(resultado); router.refresh(); };

  if (!evaluacion) {
    return <><button aria-describedby="causa-de-finalizar" className={clase} disabled type="button">{etiqueta}</button><small className="linea-de-relacion" id="causa-de-finalizar">{causaDeshabilitado}</small></>;
  }
  return <>
    <form action={verificar}>
      <input name="mes" type="hidden" value={mes} />
      <button aria-haspopup="dialog" className={clase} ref={boton} type="submit">{etiqueta}</button>
    </form>
    {vigente.mensaje && <p className="mensaje-operacion listo" role="status">{vigente.mensaje}</p>}
    <DialogoDeFinalizacion accion={finalizar} alCancelar={() => cerrar(false)} alRevisar={revisar} alcance={evaluacion.alcance} cambio={vigente.cambio} dialogoRef={dialogo}
      error={vigente.error ?? verificacion.error} huella={evaluacion.huella} mes={mes} modo={decision.abrir ? decision.modo : "normal"} pendiente={pendiente} tituloRef={titulo} />
  </>;
}
