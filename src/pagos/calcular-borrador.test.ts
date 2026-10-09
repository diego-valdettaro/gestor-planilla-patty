import { describe, expect, it } from "vitest";

import { calcularBorrador, type EntradaDeBorrador } from "./calcular-borrador";

const mes = "2026-10";
const persona = { id: "r1", dni: "12345678", nombre: "Ana", grupo: "Taller", ingreso: "2026-01-01", cese: null, ingresoConfirmado: true, ceseConfirmado: false };

function entrada(parcial: Partial<EntradaDeBorrador> = {}): EntradaDeBorrador {
  return {
    mesDePago: mes,
    corte: { inicio: "2026-09-26", fin: "2026-10-25" },
    relaciones: [persona],
    condiciones: [{ relacionId: "r1", dato: "sueldo", valor: 300001, vigenteDesde: "2026-01-01" }],
    reglas: [],
    problemasDelCorte: [],
    revisiones: [],
    hechosPorDni: {},
    fuentesPendientes: [],
    importes: [],
    ...parcial,
  };
}

describe("borrador de sueldo", () => {
  it("usa divisor 30 y el día 31 no crea sueldo adicional", () => {
    const resultado = calcularBorrador(entrada());
    expect(resultado.personas[0].lineas[0].importeCentimos).toBe(300001);
    expect(resultado.personas[0].lineas[0].dias).toBe(30);
    expect(calcularBorrador(entrada())).toEqual(resultado);
  });

  it("prorratea un cambio de sueldo y redondea cada tramo mitad arriba", () => {
    const resultado = calcularBorrador(entrada({ condiciones: [
      { relacionId: "r1", dato: "sueldo", valor: 10001, vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "sueldo", valor: 20001, vigenteDesde: "2026-10-16" },
    ] }));
    expect(resultado.personas[0].lineas.map((linea) => linea.importeCentimos)).toEqual([5001, 10001]);
  });

  it("un cambio de sueldo el día 31 no añade un día pagado", () => {
    const resultado = calcularBorrador(entrada({ condiciones: [
      { relacionId: "r1", dato: "sueldo", valor: 300000, vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "sueldo", valor: 330000, vigenteDesde: "2026-10-31" },
    ] }));
    expect(resultado.personas[0].lineas.map((linea) => linea.importeCentimos)).toEqual([300000]);
  });

  it("un ingreso el día 31 conserva un día devengado para el siguiente pago", () => {
    const siguiente = calcularBorrador(entrada({ mesDePago: "2026-11", relaciones: [{ ...persona, ingreso: "2026-10-31" }] }));
    expect(siguiente.personas[0].lineas[0]).toMatchObject({ dias: 1, mesDeDevengue: "2026-10" });
  });

  it("un cambio de sueldo en febrero conserva los 30 días convencionales", () => {
    const resultado = calcularBorrador(entrada({ mesDePago: "2026-02", condiciones: [
      { relacionId: "r1", dato: "sueldo", valor: 300000, vigenteDesde: "2026-01-01" },
      { relacionId: "r1", dato: "sueldo", valor: 330000, vigenteDesde: "2026-02-16" },
    ] }));
    expect(resultado.personas[0].lineas.map(({ dias }) => dias)).toEqual([15, 15]);
  });

  it("pasa un ingreso posterior al 25 al siguiente pago sin mover su devengue", () => {
    const relacion = { ...persona, ingreso: "2026-10-27" };
    expect(calcularBorrador(entrada({ relaciones: [relacion] })).personas).toEqual([]);
    const siguiente = calcularBorrador(entrada({ mesDePago: "2026-11", relaciones: [relacion] }));
    expect(siguiente.personas[0].lineas[0]).toMatchObject({ mesDePago: "2026-11", mesDeDevengue: "2026-10" });
  });

  it("separa dato faltante y cobertura incompleta del cero, sin neto definitivo", () => {
    const resultado = calcularBorrador(entrada({ condiciones: [], problemasDelCorte: ["Falta cobertura del corte."] }));
    expect(resultado.personas[0].netoCentimos).toBeNull();
    expect(resultado.personas[0].bloqueos.some((texto) => texto.includes("sueldo"))).toBe(true);
    expect(resultado.bloqueosDelMes).toContain("Falta cobertura del corte.");
  });
});
