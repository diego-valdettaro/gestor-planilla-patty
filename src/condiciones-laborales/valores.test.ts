import { describe, expect, it } from "vitest";

import { formatearJornada, formatearSoles, formatearValor, interpretarValor } from "./valores";

describe("interpretar el valor escrito por Finanzas", () => {
  it("convierte el sueldo en céntimos con punto o coma decimal", () => {
    expect(interpretarValor("sueldo", "1800")).toBe(180000);
    expect(interpretarValor("sueldo", "1800.5")).toBe(180050);
    expect(interpretarValor("sueldo", " 1800,55 ")).toBe(180055);
  });

  it.each(["", "0", "0,00", "-5", "12.345", "abc", "1.800,00", "99999999999"])("rechaza el sueldo %j", (texto) => {
    expect(() => interpretarValor("sueldo", texto)).toThrow(/sueldo/i);
  });

  it("convierte la jornada en minutos enteros", () => {
    expect(interpretarValor("jornada_ordinaria_diaria", "8")).toBe(480);
    expect(interpretarValor("jornada_ordinaria_diaria", "7,5")).toBe(450);
    expect(interpretarValor("jornada_ordinaria_diaria", "7.25")).toBe(435);
  });

  it.each(["0", "7,33", "25", "", "ocho"])("rechaza la jornada %j", (texto) => {
    expect(() => interpretarValor("jornada_ordinaria_diaria", texto)).toThrow(/jornada/i);
  });

  it("acepta solo valores del catálogo para régimen, afiliación y esquema", () => {
    expect(interpretarValor("regimen_laboral", "remype_pequena_empresa")).toBe("remype_pequena_empresa");
    expect(interpretarValor("afiliacion_pensionaria", "afp_integra")).toBe("afp_integra");
    expect(interpretarValor("comision_afp", "mixta")).toBe("mixta");
    expect(() => interpretarValor("regimen_laboral", "microempresa")).toThrow("régimen");
    expect(() => interpretarValor("afiliacion_pensionaria", "")).toThrow("afiliación");
    expect(() => interpretarValor("comision_afp", "otra")).toThrow("esquema");
  });

  it("interpreta si Patty otorgó la asignación familiar", () => {
    expect(interpretarValor("elegibilidad_familiar", "si")).toBe(true);
    expect(interpretarValor("elegibilidad_familiar", "no")).toBe(false);
    expect(() => interpretarValor("elegibilidad_familiar", "tal vez")).toThrow("asignación familiar");
  });

  it("recorta la sede y la exige", () => {
    expect(interpretarValor("sede_de_adscripcion", "  Taller ")).toBe("Taller");
    expect(() => interpretarValor("sede_de_adscripcion", "  ")).toThrow("sede");
  });
});

describe("dar formato a los valores", () => {
  it("escribe soles con punto de millar y coma decimal", () => {
    expect(formatearSoles(180000)).toBe("S/ 1.800,00");
    expect(formatearSoles(5)).toBe("S/ 0,05");
    expect(formatearSoles(123456789)).toBe("S/ 1.234.567,89");
  });

  it("escribe la jornada en horas y minutos", () => {
    expect(formatearJornada(480)).toBe("8 h");
    expect(formatearJornada(450)).toBe("7 h 30 min");
    expect(formatearJornada(45)).toBe("45 min");
  });

  it("da formato a cada dato", () => {
    expect(formatearValor("sueldo", 180000)).toBe("S/ 1.800,00");
    expect(formatearValor("regimen_laboral", "remype_pequena_empresa")).toBe("REMYPE pequeña empresa");
    expect(formatearValor("afiliacion_pensionaria", "afp_prima")).toBe("AFP Prima");
    expect(formatearValor("comision_afp", "flujo")).toBe("Flujo");
    expect(formatearValor("elegibilidad_familiar", true)).toBe("Otorgada");
    expect(formatearValor("elegibilidad_familiar", false)).toBe("No otorgada");
    expect(formatearValor("sede_de_adscripcion", "Taller")).toBe("Taller");
  });
});
