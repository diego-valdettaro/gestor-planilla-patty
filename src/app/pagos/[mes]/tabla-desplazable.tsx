import type { ReactNode } from "react";

/** Tabla de Pagos en ancho estrecho (interacción §3 y §7): se desplaza dentro de su región, con su aviso, sin ensanchar la página. */
export function TablaDesplazable({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return <>
    <p className="aviso-desplazamiento">Desplácese horizontalmente para ver todas las columnas.</p>
    <div className="panel-tabla primera-columna-fija" role="region" aria-label={etiqueta} tabIndex={0}><table>{children}</table></div>
  </>;
}
