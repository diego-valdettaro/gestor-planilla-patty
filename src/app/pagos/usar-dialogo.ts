"use client";

import { useEffect, useRef } from "react";

/** Cierra el diálogo cuando el servidor guarda y devuelve el foco al botón que lo abrió (lo hace el `<dialog>`). */
export function useDialogo(listo: number | undefined) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (listo) dialogo.current?.close(); }, [listo]);
  // El foco inicial va en el título, nunca en la acción de confirmar.
  const abrir = () => { dialogo.current?.showModal(); titulo.current?.focus(); };
  return { dialogo, titulo, abrir };
}
