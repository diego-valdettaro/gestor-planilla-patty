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

describe("185 acceso diario compartido", () => {
  it.each([
    { caso: "pendiente", estado: "pendiente" as const, estadoManual: null, enPeriodoCerrado: false, etiqueta: "Esperada" },
    { caso: "confirmada", estado: "confirmada" as const, estadoManual: null, enPeriodoCerrado: false, etiqueta: "Registrada" },
    { caso: "liquidada", estado: "confirmada" as const, estadoManual: null, enPeriodoCerrado: true, etiqueta: "Liquidado" },
    { caso: "sin planificación", estado: "pendiente" as const, estadoManual: null, enPeriodoCerrado: false, etiqueta: "Sin planificación" },
    { caso: "manual", estado: "manual" as const, estadoManual: "feriado" as const, enPeriodoCerrado: false, etiqueta: "Registrada" },
  ])("ofrece botón nativo identificado para $caso", ({ caso, estado, estadoManual, enPeriodoCerrado, etiqueta }) => {
    const fecha = "2019-09-26";
    const html = renderToStaticMarkup(createElement(MatrizSemanalDeAsistencias, {
      dias: [fecha], colaboradores: [{ dni: "18500001", nombre: "Ana QA185" }],
      asistencias: caso === "sin planificación" ? [] : [{ dni: "18500001", fecha, estado, estadoManual, enPeriodoCerrado,
        entrada: null, salida: null, sedeProgramada: "QA185 Sede", entradaPropuesta: null, salidaPropuesta: null, hayMarcasCrudas: false }],
    }));
    expect(html).toMatch(new RegExp(`<button[^>]*aria-label="Asistencia de Ana QA185 para ${fecha}: ${etiqueta}"[^>]*type="button"`));
    expect(html).not.toContain("pase a la vista mensual");
    expect(html).not.toContain('role="group"');
  });
});
