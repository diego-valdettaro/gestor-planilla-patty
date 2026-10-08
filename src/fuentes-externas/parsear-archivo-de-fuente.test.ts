import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { buscarTipoDeFuente } from "./tipos-de-fuente";
import { ENCABEZADOS_DE_FUENTE, HOJA_DE_IMPORTES, crearPlantillaDeFuente, parsearArchivoDeFuente } from "./parsear-archivo-de-fuente";

// Todos los archivos se arman en memoria con datos sintéticos: ningún XLSX real vive en el repositorio.
function libro(filas: unknown[][], hoja = HOJA_DE_IMPORTES): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), hoja);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

const ENCABEZADO = [...ENCABEZADOS_DE_FUENTE];
const valida = ["11111111", "comision_de_ventas", "2026-09-28", "2026-09", "250,50"];

describe("parsear el XLSX normalizado de una fuente externa", () => {
  it("lee las filas con DNI, concepto, fecha del hecho, mes de devengue e importe en céntimos", () => {
    const resultado = parsearArchivoDeFuente("comisiones.xlsx", libro([ENCABEZADO, valida, ["22222222", "Comisión de ventas", "2026-10-01", "2026-10", 100]]));

    expect(resultado.errorDelArchivo).toBeUndefined();
    expect(resultado.errores).toEqual([]);
    expect(resultado.filas).toEqual([
      { fila: 2, dni: "11111111", concepto: "comision_de_ventas", fechaDelHecho: "2026-09-28", mesDeDevengue: "2026-09", monto: 25050 },
      { fila: 3, dni: "22222222", concepto: "Comisión de ventas", fechaDelHecho: "2026-10-01", mesDeDevengue: "2026-10", monto: 10000 },
    ]);
  });

  it("acepta fechas y meses como celdas de fecha de Excel, DNI numérico e importes con S/", () => {
    const serial = (fecha: string) => Math.round(Date.parse(`${fecha}T00:00:00Z`) / 86_400_000) + 25569;
    const resultado = parsearArchivoDeFuente("a.xlsx", libro([ENCABEZADO, [11111111, "adelanto", serial("2026-09-28"), serial("2026-09-01"), "S/ 1250,50"]]));

    expect(resultado.errores).toEqual([]);
    expect(resultado.filas).toEqual([{ fila: 2, dni: "11111111", concepto: "adelanto", fechaDelHecho: "2026-09-28", mesDeDevengue: "2026-09", monto: 125050 }]);
  });

  it("ignora las filas totalmente vacías pero conserva la numeración de las filas del archivo", () => {
    const resultado = parsearArchivoDeFuente("a.xlsx", libro([ENCABEZADO, ["", "", "", "", ""], valida]));

    expect(resultado.filas.map((fila) => fila.fila)).toEqual([3]);
  });

  it("rechaza lo que no es un XLSX legible, la hoja ausente, los encabezados ausentes y el archivo sin filas", () => {
    expect(parsearArchivoDeFuente("a.csv", libro([ENCABEZADO, valida])).errorDelArchivo).toMatch(/extensión \.xlsx/);
    expect(parsearArchivoDeFuente("a.xlsx", new TextEncoder().encode("no es un libro")).errorDelArchivo).toMatch(/No se pudo leer/);
    expect(parsearArchivoDeFuente("a.xlsx", libro([ENCABEZADO, valida], "Otra")).errorDelArchivo).toMatch(/hoja obligatoria "Importes"/);
    expect(parsearArchivoDeFuente("a.xlsx", libro([["DNI", "Concepto"], ["1", "2"]])).errorDelArchivo).toMatch(/Faltan los encabezados.*Fecha del hecho.*Mes de devengue.*Importe/);
    expect(parsearArchivoDeFuente("a.xlsx", libro([ENCABEZADO])).errorDelArchivo).toMatch(/no tiene filas/);
  });

  it("reporta por fila lo que no se puede leer, sin tocar las demás filas", () => {
    const resultado = parsearArchivoDeFuente("a.xlsx", libro([
      ENCABEZADO,
      valida,
      ["123", "comision_de_ventas", "2026-09-28", "2026-09", "10"],
      ["11111111", "", "2026-09-28", "2026-09", "10"],
      ["11111111", "comision_de_ventas", "28/09/2026", "2026-09", "10"],
      ["11111111", "comision_de_ventas", "2026-02-30", "2026-09", "10"],
      ["11111111", "comision_de_ventas", "2026-09-28", "2026-13", "10"],
      ["11111111", "comision_de_ventas", "2026-09-28", "2026-09", 0],
      ["11111111", "comision_de_ventas", "2026-09-28", "2026-09", -5],
      ["11111111", "comision_de_ventas", "2026-09-28", "2026-09", 10.123],
      ["11111111", "comision_de_ventas", "2026-09-28", "2026-09", "abc"],
      ["11111111", "comision_de_ventas", "2026-09-28", "2026-09", ""],
    ]));

    expect(resultado.filas.map((fila) => fila.fila)).toEqual([2]);
    expect(resultado.errores.map(({ fila, motivo }) => [fila, motivo])).toEqual([
      [3, "El DNI debe tener exactamente 8 dígitos."],
      [4, "Falta el concepto."],
      [5, "La fecha del hecho debe ser una fecha de Excel o usar AAAA-MM-DD."],
      [6, "La fecha del hecho debe ser una fecha de Excel o usar AAAA-MM-DD."],
      [7, "El mes de devengue debe ser una fecha de Excel o usar AAAA-MM."],
      [8, expect.stringContaining("importe debe ser un monto")],
      [9, expect.stringContaining("importe debe ser un monto")],
      [10, expect.stringContaining("importe debe ser un monto")],
      [11, expect.stringContaining("importe debe ser un monto")],
      [12, "Falta el importe."],
    ]);
    expect(resultado.errores.every((error) => typeof error.dni === "string")).toBe(true);
  });

  it("una fila con varios problemas los informa todos", () => {
    const { errores } = parsearArchivoDeFuente("a.xlsx", libro([ENCABEZADO, ["x", "y", "y", "y", "y"]]));

    expect(errores.length).toBeGreaterThan(2);
    expect(new Set(errores.map((error) => error.fila))).toEqual(new Set([2]));
  });
});

describe("plantilla normalizada", () => {
  it("trae solo los encabezados y una hoja de instrucciones con los conceptos del tipo, sin filas de datos", () => {
    const tipo = buscarTipoDeFuente("gratificacion_y_bonificacion")!;
    const lectura = XLSX.read(crearPlantillaDeFuente(tipo), { type: "buffer" });

    expect(lectura.SheetNames).toEqual([HOJA_DE_IMPORTES, "Instrucciones"]);
    expect(XLSX.utils.sheet_to_json<unknown[]>(lectura.Sheets[HOJA_DE_IMPORTES], { header: 1 })).toEqual([ENCABEZADO]);
    const instrucciones = XLSX.utils.sheet_to_json<unknown[]>(lectura.Sheets.Instrucciones, { header: 1 }).flat().join("|");
    expect(instrucciones).toContain("gratificacion_legal");
    expect(instrucciones).toContain("Bonificación extraordinaria");
  });

  it("la plantilla vacía se rechaza como archivo sin filas", () => {
    const tipo = buscarTipoDeFuente("adelantos")!;
    expect(parsearArchivoDeFuente("plantilla.xlsx", crearPlantillaDeFuente(tipo)).errorDelArchivo).toMatch(/no tiene filas/);
  });
});
