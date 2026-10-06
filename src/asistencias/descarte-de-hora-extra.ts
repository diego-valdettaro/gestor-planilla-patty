export const CAUSAS_DE_DESCARTE = ["marca_erronea", "permanencia_sin_trabajo"] as const;

export type CausaDeDescarte = (typeof CAUSAS_DE_DESCARTE)[number];

export const NOMBRE_DE_CAUSA_DE_DESCARTE: Record<CausaDeDescarte, string> = {
  marca_erronea: "Marca errónea",
  permanencia_sin_trabajo: "Permanencia sin trabajo",
};

export interface DescarteDeHoraExtra {
  causa: CausaDeDescarte;
  motivo: string;
}

/** Decisión de Finanzas sobre una hora extra pendiente: aprobarla, o descartarla con su evidencia y motivo. */
export type DecisionDeHoraExtra = { estado: "aprobada" } | ({ estado: "descartada" } & DescarteDeHoraExtra);

/**
 * Una hora extra solo se descarta con la evidencia de una marca errónea o de permanencia sin
 * trabajo efectivo, y con el motivo que la describe. La falta de autorización previa no es causa.
 */
export function validarDescarteDeHoraExtra(solicitud: { causa?: string | null; motivo?: string | null }): DescarteDeHoraExtra {
  const causa = solicitud.causa?.trim();
  if (!causa) throw new Error("Descartar una hora extra requiere indicar la evidencia: marca errónea o permanencia sin trabajo.");
  if (!esCausaDeDescarte(causa)) {
    throw new Error("La evidencia no es válida: solo se descarta una hora extra por marca errónea o permanencia sin trabajo. La falta de autorización previa no justifica descartarla.");
  }
  const motivo = solicitud.motivo?.trim();
  if (!motivo) throw new Error("Descartar una hora extra requiere un motivo.");
  return { causa, motivo };
}

function esCausaDeDescarte(valor: string): valor is CausaDeDescarte {
  return (CAUSAS_DE_DESCARTE as readonly string[]).includes(valor);
}
