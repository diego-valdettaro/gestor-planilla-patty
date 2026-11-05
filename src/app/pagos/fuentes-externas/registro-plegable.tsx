"use client";

import type { ReactNode } from "react";

/**
 * Formulario de carga manual plegado detrás de «+ Registrar un importe», con «Cancelar» (contrato visual de formularios poco frecuentes).
 * Cancelar descarta lo escrito y pliega el bloque sin enviar nada. Con la fuente vacía se muestra abierto, porque es lo único que hay que hacer.
 */
export function RegistroPlegable({ abierto = false, children, etiqueta }: { abierto?: boolean; children: ReactNode; etiqueta: string }) {
  return <details className="nuevo-configuracion registro-plegable" open={abierto || undefined}>
    <summary>{etiqueta}</summary>
    <div className="registro-plegable-cuerpo">
      {children}
      <div className="acciones-formulario">
        <button className="boton-secundario" onClick={(evento) => {
          const desplegable = evento.currentTarget.closest("details");
          desplegable?.querySelectorAll("form").forEach((formulario) => formulario.reset());
          if (desplegable) desplegable.open = false;
        }} type="button">Cancelar</button>
      </div>
    </div>
  </details>;
}
