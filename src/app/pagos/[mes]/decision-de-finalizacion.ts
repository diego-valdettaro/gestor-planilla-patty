import type { EstadoDeFinalizacion } from "./actions";

/** Qué debe hacer la pantalla con el resultado de la acción del servidor (interacción §6.1). */
export type DecisionDePantalla = { abrir: false; foco: "bloqueos" } | { abrir: true; modo: "normal" | "cambio" };

/**
 * Decide sin tocar el navegador: con bloqueos nuevos no se abre el diálogo, se actualiza el panel y el foco va a él (§6.1.c, decisión de Diego
 * 2026-10-18); si el cálculo cambió, el diálogo abre en su modo «cambió»; en cualquier otro caso abre el normal, que también muestra un error.
 * Quien la usa hace las llamadas del navegador (`showModal()`, `focus()`, `role="status"`).
 */
export function decidirPantalla(estado: EstadoDeFinalizacion): DecisionDePantalla {
  if (estado.bloqueado) return { abrir: false, foco: "bloqueos" };
  if (estado.cambio) return { abrir: true, modo: "cambio" };
  return { abrir: true, modo: "normal" };
}
