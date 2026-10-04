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
      colaborador: "00000011",
      grupo: "Tiendas",
      grupos: ["Tiendas"],
      colaboradores: [{ dni: "00000011", nombre: "Ana Torres" }],
      fecha: "2026-09-14",
      vista: "semanal",
    }));

    expect(html).toContain('href="/asistencias/importar"');
    expect(html).toContain('class="boton-secundario importar-archivo"');
    expect(html).toContain("Importar archivo");
    expect(html).toContain("Vista mensual");
    expect(html).toContain('name="colaborador" value="00000011"');
  });
});
