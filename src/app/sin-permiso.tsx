import React from "react";
import type { ReactNode } from "react";

// Pantalla compartida de «Sin permiso»: conserva la navegación y explica el motivo en un solo tile.
export function SinPermiso({ children }: { children: ReactNode }) {
  return (
    <main className="contenido pagina pagina-ajustes">
      <div className="pantalla-estado">
        <section className="estado-vacio">
          <span aria-hidden="true" className="candado-estado">
            <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><rect height="9" rx="2" width="14" x="5" y="11" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          </span>
          <h1>Sin permiso</h1>
          <p>{children}</p>
        </section>
      </div>
    </main>
  );
}
