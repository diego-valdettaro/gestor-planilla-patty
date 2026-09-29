import { describe, expect, it } from "vitest";

import { crearResumenDeAjuste } from "./resumen-de-ajuste";

const base = { fecha: "2031-03-10", colaborador: "Ana Pérez", sede: "Centro", entradaActual: "09:00", salidaActual: "18:00", entradaNueva: "09:00", salidaNueva: "17:00", motivo: "Salida anticipada" };

describe("resumen de ajuste de asistencia confirmada", () => {
  it("indica qué hora cambia y cuál queda igual", () => {
    const resumen = crearResumenDeAjuste(base);

    expect(resumen.cambios).toEqual(["Hora de ingreso: 09:00 (sin cambios)", "Hora de salida: 18:00 → 17:00", "Sede: Centro (sin cambios)"]);
    expect(resumen.fecha).toBe("2031-03-10");
    expect(resumen.colaborador).toBe("Ana Pérez");
    expect(resumen.motivo).toBe("Salida anticipada");
    expect(resumen.consecuencia).toContain("ya está confirmada");
  });

  it("tolera horas actuales ausentes", () => {
    expect(crearResumenDeAjuste({ ...base, entradaActual: null, sede: null }).cambios[0]).toBe("Hora de ingreso: sin dato → 09:00");
  });
});
