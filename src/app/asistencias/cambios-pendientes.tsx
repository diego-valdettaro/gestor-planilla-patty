"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface CambiosPendientes {
  marcarPendiente: (descartar: () => void) => void;
  limpiarPendiente: () => void;
  confirmarDescarte: () => void;
  navegar: (ruta: string) => void;
}

const ContextoCambiosPendientes = createContext<CambiosPendientes>({ marcarPendiente: () => undefined, limpiarPendiente: () => undefined, confirmarDescarte: () => undefined, navegar: () => undefined });
const CLAVE_INDICE_HISTORIAL = "__planillaIndiceHistorial";

export function ProveedorCambiosPendientes({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [confirmacion, setConfirmacion] = useState<(() => void) | undefined>();
  const [hayCambios, setHayCambios] = useState(false);
  const pendienteRef = useRef(false);
  const descartarRef = useRef<(() => void) | undefined>(undefined);
  const indiceActual = useRef(0);
  const restauracionPendiente = useRef<number | undefined>(undefined);
  const permitirSiguienteNavegacion = useRef(false);
  useEffect(() => {
    if (confirmacion) dialogo.current?.showModal();
    else if (dialogo.current?.open) dialogo.current.close();
  }, [confirmacion]);

  useEffect(() => {
    const estadoInicial = window.history.state;
    const indiceInicial = estadoInicial?.[CLAVE_INDICE_HISTORIAL];
    indiceActual.current = Number.isInteger(indiceInicial) ? indiceInicial : 0;
    window.history.replaceState({ ...(estadoInicial ?? {}), [CLAVE_INDICE_HISTORIAL]: indiceActual.current }, "");

    const pushStateOriginal = window.history.pushState;
    const replaceStateOriginal = window.history.replaceState;
    window.history.pushState = function (data, unused, url) {
      const indice = indiceActual.current + 1;
      const resultado = pushStateOriginal.call(window.history, { ...(data ?? {}), [CLAVE_INDICE_HISTORIAL]: indice }, unused, url);
      indiceActual.current = indice;
      return resultado;
    };
    window.history.replaceState = function (data, unused, url) {
      return replaceStateOriginal.call(window.history, { ...(data ?? {}), [CLAVE_INDICE_HISTORIAL]: indiceActual.current }, unused, url);
    };

    function protegerHistorial(evento: PopStateEvent) {
      const indiceDestino = evento.state?.[CLAVE_INDICE_HISTORIAL];
      if (restauracionPendiente.current !== undefined) {
        if (permitirSiguienteNavegacion.current) {
          permitirSiguienteNavegacion.current = false;
          indiceActual.current = Number.isInteger(indiceDestino) ? indiceDestino : restauracionPendiente.current;
          restauracionPendiente.current = undefined;
          return;
        }
        evento.stopImmediatePropagation();
        indiceActual.current = Number.isInteger(indiceDestino) ? indiceDestino : restauracionPendiente.current;
        restauracionPendiente.current = undefined;
        return;
      }
      if (!pendienteRef.current) {
        if (Number.isInteger(indiceDestino)) indiceActual.current = indiceDestino;
        return;
      }

      evento.stopImmediatePropagation();
      const indiceOrigen = indiceActual.current;
      const destinoConocido = Number.isInteger(indiceDestino) && indiceDestino !== indiceOrigen;
      const desplazamiento = destinoConocido ? indiceDestino - indiceOrigen : -1;
      indiceActual.current = destinoConocido ? indiceDestino : indiceOrigen - 1;
      restauracionPendiente.current = indiceOrigen;
      window.history.go(-desplazamiento);
      setConfirmacion(() => () => {
        const descartar = descartarRef.current;
        limpiarPendiente();
        descartar?.();
        restauracionPendiente.current = indiceActual.current;
        permitirSiguienteNavegacion.current = true;
        window.history.go(desplazamiento);
      });
    }
    window.addEventListener("popstate", protegerHistorial, true);

    return () => {
      window.removeEventListener("popstate", protegerHistorial, true);
      window.history.pushState = pushStateOriginal;
      window.history.replaceState = replaceStateOriginal;
    };
  }, []);

  useEffect(() => {
    if (!pendienteRef.current) return;
    function avisarAntesDeSalir(evento: BeforeUnloadEvent) {
      evento.preventDefault();
      evento.returnValue = "";
    }
    window.addEventListener("beforeunload", avisarAntesDeSalir);
    return () => window.removeEventListener("beforeunload", avisarAntesDeSalir);
  }, [hayCambios]);

  useEffect(() => {
    function interceptarEnlace(evento: MouseEvent) {
      if (!pendienteRef.current || evento.defaultPrevented || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
      const objetivo = evento.target;
      if (!(objetivo instanceof Element)) return;
      const enlace = objetivo.closest<HTMLAnchorElement>("a[href]");
      if (!enlace || enlace.hasAttribute("download") || (enlace.target && enlace.target !== "_self")) return;
      const url = new URL(enlace.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      evento.preventDefault();
      navegar(`${url.pathname}${url.search}${url.hash}`);
    }
    document.addEventListener("click", interceptarEnlace, true);
    return () => document.removeEventListener("click", interceptarEnlace, true);
  }, [router]);

  function marcarPendiente(descartar: () => void) {
    pendienteRef.current = true;
    setHayCambios(true);
    descartarRef.current = descartar;
  }

  function limpiarPendiente() {
    pendienteRef.current = false;
    setHayCambios(false);
    descartarRef.current = undefined;
  }

  function confirmarDescarte() {
    if (pendienteRef.current) setConfirmacion(() => () => {
      const descartar = descartarRef.current;
      limpiarPendiente();
      descartar?.();
    });
  }

  function navegar(ruta: string) {
    if (pendienteRef.current) setConfirmacion(() => () => {
      const descartar = descartarRef.current;
      limpiarPendiente();
      descartar?.();
      router.push(ruta);
    });
    else router.push(ruta);
  }

  function cancelar() {
    setConfirmacion(undefined);
  }

  function descartar() {
    const accion = confirmacion;
    setConfirmacion(undefined);
    accion?.();
  }

  return <ContextoCambiosPendientes.Provider value={{ marcarPendiente, limpiarPendiente, confirmarDescarte, navegar }}>
    {children}
    <dialog aria-labelledby="titulo-cambios-sin-guardar" className="dialogo-confirmacion" onCancel={cancelar} ref={dialogo}>
      <h2 id="titulo-cambios-sin-guardar">Cambios sin guardar</h2>
      <p>Hay una edición de asistencia que todavía no se guardó. ¿Desea conservarla o descartarla antes de salir?</p>
      <div className="acciones-dialogo"><button className="boton-secundario" onClick={cancelar} type="button">Cancelar</button><button className="boton-principal" onClick={descartar} type="button">Descartar cambios</button></div>
    </dialog>
  </ContextoCambiosPendientes.Provider>;
}

export function useCambiosPendientes(): CambiosPendientes {
  return useContext(ContextoCambiosPendientes);
}
