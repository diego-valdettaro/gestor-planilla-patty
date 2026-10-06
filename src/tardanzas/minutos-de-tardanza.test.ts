import { describe, expect, it } from "vitest";

import { minutosDeTardanzaFueraDeTolerancia } from "./politica-de-penalizacion";

describe("minutosDeTardanzaFueraDeTolerancia", () => {
  const politica = { toleranciaEnMinutos: 10 };

  it("no hay tardanza hasta la tolerancia inclusive", () => {
    expect(minutosDeTardanzaFueraDeTolerancia(politica, "09:00", "2026-09-01T09:10")).toBeUndefined();
    expect(minutosDeTardanzaFueraDeTolerancia(politica, "09:00", "2026-09-01T08:50")).toBeUndefined();
  });

  it("devuelve los minutos reales, sin descontar la tolerancia, al superarla", () => {
    expect(minutosDeTardanzaFueraDeTolerancia(politica, "09:00", "2026-09-01T09:11")).toBe(11);
    expect(minutosDeTardanzaFueraDeTolerancia(politica, "09:00", "2026-09-01T10:05")).toBe(65);
  });
});
