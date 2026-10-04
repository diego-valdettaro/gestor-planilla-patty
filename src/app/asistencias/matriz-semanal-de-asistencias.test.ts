import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MatrizSemanalDeAsistencias } from "./matriz-semanal-de-asistencias";

describe("matriz semanal de asistencias", () => {
  it("muestra un grupo de colaboradores en siete días con la evidencia diaria", () => {
    const dias = ["2031-03-10", "2031-03-11", "2031-03-12", "2031-03-13", "2031-03-14", "2031-03-15", "2031-03-16"];
    const html = renderToStaticMarkup(createElement(MatrizSemanalDeAsistencias, {
      dias,
      colaboradores: [{ dni: "00000011", nombre: "Ana Torres" }],
      asistencias: [
        { dni: "00000011", fecha: dias[0], estado: "confirmada", estadoManual: null, entrada: `${dias[0]}T09:00`, salida: `${dias[0]}T18:00`, sedeProgramada: "Centro", entradaPropuesta: null, salidaPropuesta: null, hayMarcasCrudas: true, enPeriodoCerrado: false },
        { dni: "00000011", fecha: dias[1], estado: "manual", estadoManual: "feriado", entrada: null, salida: null, sedeProgramada: null, entradaPropuesta: null, salidaPropuesta: null, hayMarcasCrudas: false, enPeriodoCerrado: false },
      ],
    }));

    expect((html.match(/<time /g) ?? [])).toHaveLength(7);
    expect(html).toContain("Ana Torres");
    expect(html).toContain("Centro");
    expect(html).toContain("09:00–18:00");
    expect(html).toContain("Feriado");
  });
});
