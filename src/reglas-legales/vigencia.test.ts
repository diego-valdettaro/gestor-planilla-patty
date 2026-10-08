import { describe, expect, it } from "vitest";

import { armarHistorial, reglaVigenteEn, type ReglaLegal } from "./vigencia";

let contador = 0;
function regla(parcial: Partial<ReglaLegal> & Pick<ReglaLegal, "valor" | "vigenteDesde">): ReglaLegal {
  contador += 1;
  return {
    id: `regla-${contador}`, codigo: "essalud_tasa", fuenteOficial: "Norma de prueba", activadaPorId: "fin-1", activadaPor: "finanzas",
    activadaEn: new Date(`2026-01-${String(contador).padStart(2, "0")}T12:00:00Z`), reemplazadaEn: null, motivoDeReemplazo: null, ...parcial,
  };
}

describe("regla vigente en una fecha", () => {
  const reglas = [regla({ valor: 900, vigenteDesde: "2024-01-01" }), regla({ valor: 950, vigenteDesde: "2026-03-01" })];

  it("devuelve la última versión que ya había empezado", () => {
    expect(reglaVigenteEn(reglas, "2024-01-01")?.valor).toBe(900);
    expect(reglaVigenteEn(reglas, "2026-02-28")?.valor).toBe(900);
    expect(reglaVigenteEn(reglas, "2026-03-01")?.valor).toBe(950);
    expect(reglaVigenteEn(reglas, "2030-01-01")?.valor).toBe(950);
  });

  it("antes de la primera vigencia falta: undefined, nunca cero", () => {
    expect(reglaVigenteEn(reglas, "2023-12-31")).toBeUndefined();
    expect(reglaVigenteEn([], "2026-01-01")).toBeUndefined();
  });

  it("ignora las versiones reemplazadas aunque su vigencia sea posterior", () => {
    const conReemplazo = [...reglas, regla({ valor: 999, vigenteDesde: "2026-05-01", reemplazadaEn: new Date(), motivoDeReemplazo: "Error" })];
    expect(reglaVigenteEn(conReemplazo, "2026-06-01")?.valor).toBe(950);
  });

  it("no depende del orden en que se cargaron las versiones", () => {
    const desordenadas = [regla({ valor: 950, vigenteDesde: "2026-03-01" }), regla({ valor: 800, vigenteDesde: "2020-01-01" }), regla({ valor: 900, vigenteDesde: "2024-01-01" })];
    expect(reglaVigenteEn(desordenadas, "2025-01-01")?.valor).toBe(900);
    expect(reglaVigenteEn(desordenadas, "2021-01-01")?.valor).toBe(800);
  });
});

describe("historial de un valor legal", () => {
  it("marca vigente, anterior y programado, y cierra cada vigencia el día previo a la siguiente", () => {
    const historial = armarHistorial([
      regla({ valor: 900, vigenteDesde: "2024-01-01" }), regla({ valor: 950, vigenteDesde: "2026-03-01" }), regla({ valor: 990, vigenteDesde: "2026-11-01" }),
    ], "2026-10-07");
    expect(historial.map(({ valor, vigenteDesde, vigenteHasta, estado }) => ({ valor, vigenteDesde, vigenteHasta, estado }))).toEqual([
      { valor: 900, vigenteDesde: "2024-01-01", vigenteHasta: "2026-02-28", estado: "anterior" },
      { valor: 950, vigenteDesde: "2026-03-01", vigenteHasta: "2026-10-31", estado: "vigente" },
      { valor: 990, vigenteDesde: "2026-11-01", vigenteHasta: null, estado: "programado" },
    ]);
  });

  it("una versión cargada después con vigencia anterior parte la vigencia que la contenía", () => {
    const historial = armarHistorial([regla({ valor: 900, vigenteDesde: "2024-01-01" }), regla({ valor: 880, vigenteDesde: "2022-06-01" })], "2026-10-07");
    expect(historial.map(({ valor, vigenteHasta }) => ({ valor, vigenteHasta }))).toEqual([{ valor: 880, vigenteHasta: "2023-12-31" }, { valor: 900, vigenteHasta: null }]);
  });

  it("una versión reemplazada queda en el historial con su motivo, sin vigencia hasta", () => {
    const historial = armarHistorial([
      regla({ valor: 900, vigenteDesde: "2024-01-01", reemplazadaEn: new Date("2026-02-01T00:00:00Z"), motivoDeReemplazo: "Error de digitación" }),
      regla({ valor: 905, vigenteDesde: "2024-01-01" }),
    ], "2026-10-07");
    expect(historial.map(({ valor, estado }) => ({ valor, estado }))).toEqual([{ valor: 900, estado: "reemplazado" }, { valor: 905, estado: "vigente" }]);
    expect(historial[0]).toMatchObject({ motivoDeReemplazo: "Error de digitación", vigenteHasta: null });
  });

  it("sin versiones el historial está vacío", () => {
    expect(armarHistorial([], "2026-10-07")).toEqual([]);
  });
});
