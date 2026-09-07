import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FiltrosDeAsistencia } from "./filtros-de-asistencia";
import { rutaDeImportacion } from "./ruta-de-importacion";

describe("ruta de importación de asistencias", () => {
  it("lleva al formulario de importación separado del calendario", () => {
    expect(rutaDeImportacion).toBe("/asistencias/importar");
  });

  it("muestra un enlace secundario al formulario en la fila de filtros", () => {
    const html = renderToStaticMarkup(createElement(FiltrosDeAsistencia, {
      colaborador: "H-1001",
      colaboradores: [{ idHuellero: "H-1001", nombre: "Ana" }],
      mes: "2026-09",
    }));

    expect(html).toContain('href="/asistencias/importar"');
    expect(html).toContain('class="boton-secundario importar-archivo"');
    expect(html).toContain("Importar archivo");
  });
});
