import { describe, expect, it } from "vitest";

import { calcularHoraExtra } from "./calcular-hora-extra";

describe("calcularHoraExtra", () => {
  it("calcula una hora extra desde una hora manual sin zona horaria", () => {
    expect(calcularHoraExtra("18:00", "2026-09-01T19:00")).toEqual({
      minutosAl25: 60,
      minutosAl35: 0,
      estado: "pendiente",
    });
  });

  it("mantiene el cálculo para una marca del huellero con zona horaria", () => {
    expect(calcularHoraExtra("18:00", "2026-09-01T20:30:00-05:00")).toEqual({
      minutosAl25: 120,
      minutosAl35: 30,
      estado: "pendiente",
    });
  });
});
