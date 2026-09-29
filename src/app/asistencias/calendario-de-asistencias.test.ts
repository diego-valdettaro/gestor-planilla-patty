import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CalendarioDeAsistencias } from "./calendario-de-asistencias";

describe("calendario mensual de asistencias", () => {
  it("muestra la sede de una jornada laboral y el motivo de una no asistencia", () => {
    const html = renderToStaticMarkup(createElement(CalendarioDeAsistencias, {
      idHuellero: "HU-1",
      nombreColaborador: "Ana Pérez",
      dias: ["2031-03-10", "2031-03-11"],
      desfase: 0,
      asistencias: [
        { fecha: "2031-03-10", estado: "confirmada", estadoManual: null, entrada: "2031-03-10T09:00", salida: "2031-03-10T18:00", sedeProgramada: "Centro", entradaPropuesta: null, salidaPropuesta: null, hayMarcasCrudas: true, enPeriodoCerrado: false },
        { fecha: "2031-03-11", estado: "manual", estadoManual: "feriado", entrada: null, salida: null, sedeProgramada: null, entradaPropuesta: null, salidaPropuesta: null, hayMarcasCrudas: false, enPeriodoCerrado: false },
      ],
    }));

    expect(html).toContain("Centro");
    expect(html).toContain("Feriado");
    expect(html).not.toContain("sin entrada");
    expect(html).not.toContain("sin salida");
  });
});
