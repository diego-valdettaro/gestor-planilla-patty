"use client";

import React, { useEffect, useId, useRef, useState } from "react";

export interface ContenidoDeAviso { titulo: string; filas: Array<{ rotulo: string; texto: string }> }

const ANCHO_DEL_AVISO = 336;

// Tooltip de detalle: aparece al pasar el cursor, enfocar o tocar el elemento y se describe con aria-describedby.
// Se dibuja en `position: fixed` para que una tabla con desplazamiento propio no lo recorte.
export function ConAviso({ aviso, children }: { aviso?: ContenidoDeAviso; children: (descripcion: string | undefined) => React.ReactNode }) {
  const id = useId();
  const raiz = useRef<HTMLSpanElement>(null);
  const globo = useRef<HTMLSpanElement>(null);
  const [posicion, setPosicion] = useState<{ left: number; top: number }>();

  useEffect(() => {
    if (!posicion) return;
    const cerrar = () => setPosicion(undefined);
    const alTeclear = (evento: KeyboardEvent) => { if (evento.key === "Escape") cerrar(); };
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
      window.removeEventListener("keydown", alTeclear);
    };
  }, [posicion]);

  if (!aviso) return <>{children(undefined)}</>;

  function abrir() {
    const caja = raiz.current?.getBoundingClientRect();
    if (!caja) return;
    const ancho = Math.min(ANCHO_DEL_AVISO, window.innerWidth - 16);
    const alto = globo.current?.offsetHeight ?? 120;
    const left = Math.max(8, Math.min(caja.left, window.innerWidth - ancho - 8));
    let top = caja.bottom + 6;
    if (top + alto > window.innerHeight - 8 && caja.top - alto - 6 > 8) top = caja.top - alto - 6;
    setPosicion({ left, top });
  }

  return <span className="aviso-dia" onBlur={() => setPosicion(undefined)} onFocus={abrir} onMouseEnter={abrir} onMouseLeave={() => setPosicion(undefined)} ref={raiz}>
    {children(id)}
    <span className={posicion ? "aviso-tip abierto" : "aviso-tip"} id={id} ref={globo} role="tooltip" style={posicion ? { left: posicion.left, top: posicion.top } : undefined}>
      <strong className="tip-titulo">{aviso.titulo}</strong>
      {aviso.filas.map(({ rotulo, texto }) => <span className="tip-fila" key={rotulo}><b>{rotulo}:</b> {texto}</span>)}
    </span>
  </span>;
}
