export const ID_DEL_ANUNCIO = "anuncio-de-fuentes-externas";

/** Región donde se anuncia el resultado de un diálogo cuyo botón de origen desaparece al guardar. */
export function AnuncioDelResultado() {
  return <p className="sr-only" id={ID_DEL_ANUNCIO} role="status" />;
}
