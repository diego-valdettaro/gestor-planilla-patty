import { describe, expect, it } from "vitest";

import { REGLAS_LEGALES, buscarDefinicion, conArticulo } from "./catalogo";
import { formatearPorcentaje, formatearValorLegal, interpretarValorLegal } from "./valores";

describe("catálogo de reglas legales", () => {
  it("cada valor legal tiene un código único, un nombre y una unidad", () => {
    const codigos = REGLAS_LEGALES.map(({ codigo }) => codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const definicion of REGLAS_LEGALES) {
      expect(definicion.nombre.trim()).not.toBe("");
      expect(["porcentaje", "importe"]).toContain(definicion.unidad);
    }
  });

  it("incluye la comisión sobre flujo y la mixta de cada AFP, sin ONP", () => {
    const codigos = REGLAS_LEGALES.map(({ codigo }) => codigo);
    for (const afp of ["afp_habitat", "afp_integra", "afp_prima", "afp_profuturo"]) {
      expect(codigos).toContain(`${afp}_comision_flujo`);
      expect(codigos).toContain(`${afp}_comision_mixta`);
    }
    expect(codigos.some((codigo) => codigo.startsWith("onp_comision"))).toBe(false);
  });

  it("nombra cada valor con su artículo para los textos del diseño", () => {
    expect(conArticulo(buscarDefinicion("essalud_tasa")!)).toBe("la Tasa de EsSalud");
    expect(conArticulo(buscarDefinicion("afp_aporte_obligatorio")!)).toBe("el Aporte obligatorio al fondo AFP");
  });

  it("busca una definición por código y no inventa las que no existen", () => {
    expect(buscarDefinicion("rmv")).toMatchObject({ unidad: "importe" });
    expect(buscarDefinicion("essalud_tasa")).toMatchObject({ unidad: "porcentaje" });
    expect(buscarDefinicion("centro_de_costo")).toBeUndefined();
  });
});

describe("valores legales", () => {
  it("interpreta porcentajes con hasta dos decimales como centésimas de punto", () => {
    expect(interpretarValorLegal("porcentaje", "9")).toBe(900);
    expect(interpretarValorLegal("porcentaje", "7,25")).toBe(725);
    expect(interpretarValorLegal("porcentaje", " 1.5 % ")).toBe(150);
    expect(interpretarValorLegal("porcentaje", "0")).toBe(0);
    expect(interpretarValorLegal("porcentaje", "100")).toBe(10000);
  });

  it("rechaza porcentajes inválidos, negativos, con más de dos decimales o mayores que 100", () => {
    for (const texto of ["", "abc", "-1", "9,999", "100,01", "1,2,3"]) {
      expect(() => interpretarValorLegal("porcentaje", texto), texto).toThrow(/porcentaje/i);
    }
  });

  it("interpreta importes en soles como céntimos y no acepta cero ni negativos", () => {
    expect(interpretarValorLegal("importe", "1130")).toBe(113000);
    expect(interpretarValorLegal("importe", "12345,6")).toBe(1234560);
    expect(interpretarValorLegal("importe", "S/ 1130,50")).toBe(113050);
    // «1.130» (punto de millar) no se lee como S/ 1,13: se rechaza.
    for (const texto of ["", "0", "-5", "abc", "10,999", "1.130"]) {
      expect(() => interpretarValorLegal("importe", texto), texto).toThrow(/importe/i);
    }
  });

  it("da formato según el contrato visual", () => {
    expect(formatearPorcentaje(900)).toBe("9,00 %");
    expect(formatearPorcentaje(725)).toBe("7,25 %");
    expect(formatearPorcentaje(0)).toBe("0,00 %");
    expect(formatearValorLegal("importe", 113000)).toBe("S/ 1.130,00");
    expect(formatearValorLegal("porcentaje", 1000)).toBe("10,00 %");
  });
});
