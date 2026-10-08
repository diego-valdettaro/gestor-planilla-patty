import { describe, expect, it } from "vitest";

import { formatearMes, interpretarMonto, mesDeLaFecha, textoDeProcedencia, validarMes } from "./valores";

describe("valores de las fuentes externas", () => {
  it.each([
    ["250", 25000],
    ["250,5", 25050],
    ["250.50", 25050],
    ["S/ 1250,50", 125050],
    ["S/.10", 1000],
    ["0,01", 1],
  ])("interpreta %j como %i céntimos", (texto, centimos) => {
    expect(interpretarMonto(texto)).toBe(centimos);
  });

  it.each(["", "0", "0,00", "-1", "abc", "1,234", "1.000,00", "99999999999", "S/"])("rechaza el monto %j", (texto) => {
    expect(() => interpretarMonto(texto)).toThrow(/importe debe ser un monto en soles mayor que cero/);
  });

  it("valida el mes como AAAA-MM y lo formatea como MM/AAAA", () => {
    expect(() => validarMes("2026-10", "mes")).not.toThrow();
    for (const invalido of ["2026-00", "2026-13", "26-10", "2026-1", "octubre", "2026-10-01", ""]) {
      expect(() => validarMes(invalido, "mes de pago"), invalido).toThrow(/mes de pago no es válido/);
    }
    expect(formatearMes("2026-10")).toBe("10/2026");
    expect(mesDeLaFecha("2026-10-25")).toBe("2026-10");
  });

  it("la procedencia de la carga manual se lee «Carga manual»; otra se muestra tal cual", () => {
    expect(textoDeProcedencia("carga_manual")).toBe("Carga manual");
    expect(textoDeProcedencia("archivo.xlsx")).toBe("archivo.xlsx");
  });
});
