"use client";

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export interface AccionDeMenu {
  clave: string;
  etiqueta: string;
  alElegir: () => void;
  // Una acción que no aplica sigue visible, desactivada y con su motivo.
  motivoSiNoAplica?: string;
  deshabilitada?: boolean;
}

const ANCHO_DEL_MENU = 272;

// Un solo botón «Acciones» que reúne las acciones por persona. El menú se dibuja en `position: fixed` para que la
// tabla con desplazamiento propio no lo recorte, se cierra con Escape, al salir con Tab, al hacer clic fuera o al
// desplazar la página, y devuelve el foco al botón (también al abrir un diálogo desde una acción).
export function MenuDeAcciones({ nombre, acciones }: { nombre: string; acciones: AccionDeMenu[] }) {
  const id = useId();
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLSpanElement>(null);
  const [abierto, setAbierto] = useState(false);

  useLayoutEffect(() => {
    if (!abierto || !menu.current || !boton.current) return;
    const caja = boton.current.getBoundingClientRect();
    const alto = menu.current.offsetHeight;
    const ancho = Math.min(ANCHO_DEL_MENU, window.innerWidth - 16);
    let top = caja.bottom + 4;
    if (top + alto > window.innerHeight - 8 && caja.top - alto - 4 > 8) top = caja.top - alto - 4;
    menu.current.style.left = `${Math.max(8, Math.min(caja.left, window.innerWidth - ancho - 8))}px`;
    menu.current.style.top = `${top}px`;
    menu.current.style.width = `${ancho}px`;
    menu.current.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setAbierto(false);
    // Un evento de scroll puede llegar después de abrir (p. ej. el que dejó el desplazamiento previo al clic): solo
    // cierra si el botón se movió, porque el menú está fijo y quedaría desalineado.
    const origen = boton.current?.getBoundingClientRect();
    const alDesplazar = () => {
      const actual = boton.current?.getBoundingClientRect();
      if (!origen || !actual || Math.abs(actual.top - origen.top) > 1 || Math.abs(actual.left - origen.left) > 1) cerrar();
    };
    const alHacerClic = (evento: MouseEvent) => {
      if (!(evento.target instanceof Node)) return;
      if (menu.current?.contains(evento.target) || boton.current?.contains(evento.target)) return;
      cerrar();
    };
    window.addEventListener("scroll", alDesplazar, true);
    window.addEventListener("resize", cerrar);
    document.addEventListener("mousedown", alHacerClic);
    return () => {
      window.removeEventListener("scroll", alDesplazar, true);
      window.removeEventListener("resize", cerrar);
      document.removeEventListener("mousedown", alHacerClic);
    };
  }, [abierto]);

  function cerrarYDevolverElFoco() {
    setAbierto(false);
    boton.current?.focus();
  }
  function alTeclear(evento: React.KeyboardEvent) {
    if (evento.key === "Escape") { evento.preventDefault(); cerrarYDevolverElFoco(); return; }
    if (evento.key === "Tab") { setAbierto(false); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(evento.key)) return;
    evento.preventDefault();
    const opciones = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const actual = opciones.indexOf(document.activeElement as HTMLElement);
    const destino = evento.key === "Home" ? 0 : evento.key === "End" ? opciones.length - 1 : (actual + (evento.key === "ArrowDown" ? 1 : -1) + opciones.length) % opciones.length;
    opciones[destino]?.focus();
  }
  function elegir(accion: AccionDeMenu) {
    if (accion.deshabilitada) return;
    // El foco vuelve al botón antes de abrir el diálogo: al cerrarlo, el navegador lo devuelve ahí.
    cerrarYDevolverElFoco();
    accion.alElegir();
  }

  return <span className="menu-acciones" onKeyDown={alTeclear}>
    <button aria-controls={id} aria-expanded={abierto} aria-haspopup="menu" aria-label={`Acciones de ${nombre}`} className="boton-secundario boton-acciones" onClick={() => setAbierto((actual) => !actual)} ref={boton} type="button">Acciones <span aria-hidden="true">▾</span></button>
    <span aria-label={`Acciones de ${nombre}`} className={abierto ? "menu-lista abierto" : "menu-lista"} hidden={!abierto} id={id} ref={menu} role="menu">
      {acciones.map((accion) => <button aria-disabled={accion.deshabilitada || undefined} className="menu-item" key={accion.clave} onClick={() => elegir(accion)} role="menuitem" tabIndex={-1} type="button">{accion.etiqueta}{accion.motivoSiNoAplica && <small>{accion.motivoSiNoAplica}</small>}</button>)}
    </span>
  </span>;
}
