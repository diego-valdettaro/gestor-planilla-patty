import { describe, expect, it } from "vitest";

import { esElegibleParaPublicar, seleccionEfectiva } from "./seleccion-de-publicacion";

describe("esElegibleParaPublicar", () => {
  it("no es elegible si la fila está incompleta, aunque no esté publicada ni liquidada", () => {
    expect(esElegibleParaPublicar({ filaCompleta: false, semanaPublicada: false, semanaLiquidada: false })).toBe(false);
  });

  it("no es elegible si la semana ya está publicada, aunque la fila esté completa", () => {
    expect(esElegibleParaPublicar({ filaCompleta: true, semanaPublicada: true, semanaLiquidada: false })).toBe(false);
  });

  it("no es elegible si la semana está liquidada, aunque la fila esté completa y sin publicar", () => {
    expect(esElegibleParaPublicar({ filaCompleta: true, semanaPublicada: false, semanaLiquidada: true })).toBe(false);
  });

  it("es elegible solo cuando la fila está completa, no publicada y no liquidada", () => {
    expect(esElegibleParaPublicar({ filaCompleta: true, semanaPublicada: false, semanaLiquidada: false })).toBe(true);
  });
});

describe("seleccionEfectiva", () => {
  it("selecciona por defecto a cada elegible sin decisión manual", () => {
    expect(seleccionEfectiva(["A", "B"], new Map())).toEqual(new Set(["A", "B"]));
  });

  it("respeta una deselección manual aunque la fila siga elegible", () => {
    expect(seleccionEfectiva(["A", "B"], new Map([["A", false]]))).toEqual(new Set(["B"]));
  });

  it("respeta una selección manual explícita, igual que el valor por defecto", () => {
    expect(seleccionEfectiva(["A"], new Map([["A", true]]))).toEqual(new Set(["A"]));
  });

  it("ignora decisiones manuales de colaboradores que ya no son elegibles", () => {
    expect(seleccionEfectiva(["B"], new Map([["A", true]]))).toEqual(new Set(["B"]));
  });

  it("una deselección manual persiste aunque la fila deje de ser elegible y vuelva a serlo", () => {
    // Simula: A se completa (elegible, override false), se edita y deja de ser elegible,
    // luego vuelve a completarse (elegible otra vez) sin que el usuario haya tocado el checkbox.
    const overrides = new Map([["A", false]]);
    expect(seleccionEfectiva([], overrides)).toEqual(new Set());
    expect(seleccionEfectiva(["A"], overrides)).toEqual(new Set());
  });
});
