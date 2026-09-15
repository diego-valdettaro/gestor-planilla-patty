import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BotonDeAccionConfirmada } from "./boton-de-accion-confirmada";

describe("BotonDeAccionConfirmada", () => {
  it("asocia cada diálogo a un título único", () => {
    const html = renderToStaticMarkup(createElement("div", undefined,
      createElement(BotonDeAccionConfirmada, { accion: () => undefined, etiqueta: "Uno", titulo: "Título uno", descripcion: "Primero", confirmar: "Confirmar" }),
      createElement(BotonDeAccionConfirmada, { accion: () => undefined, etiqueta: "Dos", titulo: "Título dos", descripcion: "Segundo", confirmar: "Confirmar" }),
    ));
    const ids = [...html.matchAll(/<h2 id="([^"]+)"/g)].map((coincidencia) => coincidencia[1]);

    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => html.includes(`aria-labelledby="${id}"`))).toBe(true);
  });

  it("deshabilita la confirmación mientras falta una selección requerida", () => {
    const html = renderToStaticMarkup(createElement(BotonDeAccionConfirmada, {
      accion: () => undefined,
      etiqueta: "Decidir",
      titulo: "Decidir extras",
      descripcion: "Seleccione al menos una.",
      confirmar: "Confirmar",
      requiereSeleccion: "horaExtraId",
      children: createElement("input", { name: "horaExtraId", type: "checkbox", value: "extra-1" }),
    }));

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*type="submit">Confirmar<\/button>/);
  });
});
