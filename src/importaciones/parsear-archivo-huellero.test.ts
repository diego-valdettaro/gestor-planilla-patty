import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { parsearArchivoHuellero } from "./parsear-archivo-huellero";

async function archivoXlsx(filas: unknown[][], nombreDeHoja = "Asistencias"): Promise<File> {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), nombreDeHoja);
  return new File([XLSX.write(libro, { bookType: "xlsx", type: "array" })], "asistencias.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("parsearArchivoHuellero", () => {
  it("lee jornadas desde la hoja y encabezados requeridos, con fechas y horas de Excel o texto", async () => {
    const archivo = await archivoXlsx([
      ["ID de huellero", "Sede", "Fecha", "Entrada", "Salida", "Ignorada"],
      ["HU-1024", " Centro ", new Date(Date.UTC(2026, 8, 1)), 9 / 24, 18 / 24, "valor"],
      ["HU-1025", "Norte", "2026-09-02", "08:30", "17:15", "valor"],
    ]);

    await expect(parsearArchivoHuellero(archivo)).resolves.toEqual({
      filas: [
        { fila: 2, idHuellero: "HU-1024", sede: "Centro", fecha: "2026-09-01", entrada: "09:00", salida: "18:00" },
        { fila: 3, idHuellero: "HU-1025", sede: "Norte", fecha: "2026-09-02", entrada: "08:30", salida: "17:15" },
      ],
      errores: [],
    });
  });

  it("informa todos los defectos estructurales y de filas, sin ocultar duplicados", async () => {
    const archivo = await archivoXlsx([
      ["ID de huellero", "Sede", "Fecha", "Entrada", "Salida"],
      ["HU-1024", "Centro", "2026-09-01", "09:00", "08:00"],
      ["HU-1024", "Centro", "2026-09-01", "10:00", "18:00"],
      ["", "", "2026-99-01", "25:00", ""],
    ]);

    const resultado = await parsearArchivoHuellero(archivo);

    expect(resultado.filas).toHaveLength(2);
    expect(resultado.errores).toEqual(expect.arrayContaining([
      expect.objectContaining({ fila: 4, motivo: "ID de huellero es obligatorio." }),
      expect.objectContaining({ fila: 4, motivo: "Sede es obligatoria." }),
      expect.objectContaining({ fila: 4, motivo: "Fecha debe ser una fecha Excel o usar YYYY-MM-DD." }),
      expect.objectContaining({ fila: 4, motivo: "Entrada debe ser una hora Excel o usar HH:MM." }),
      expect.objectContaining({ fila: 4, motivo: "Salida es obligatoria." }),
      expect.objectContaining({ fila: 3, idHuellero: "HU-1024", fecha: "2026-09-01", motivo: "La jornada duplica la fila 2." }),
    ]));
  });

  it("exige un XLSX, la hoja Asistencias y todos los encabezados exactos", async () => {
    const sinHoja = await archivoXlsx([["ID de huellero"]], "Marcas");
    const sinEncabezados = await archivoXlsx([["ID de huellero", "Sede", "Fecha"]]);
    const csv = new File(["ID de huellero,Sede,Fecha,Entrada,Salida"], "asistencias.csv");

    await expect(parsearArchivoHuellero(sinHoja)).resolves.toEqual(expect.objectContaining({
      errores: [expect.objectContaining({ motivo: 'Falta la hoja obligatoria "Asistencias".' })],
    }));
    await expect(parsearArchivoHuellero(sinEncabezados)).resolves.toEqual(expect.objectContaining({
      errores: expect.arrayContaining([
        expect.objectContaining({ motivo: 'Falta el encabezado obligatorio "Entrada".' }),
        expect.objectContaining({ motivo: 'Falta el encabezado obligatorio "Salida".' }),
      ]),
    }));
    await expect(parsearArchivoHuellero(csv)).resolves.toEqual(expect.objectContaining({
      errores: [expect.objectContaining({ motivo: "El archivo debe tener extensión .xlsx." })],
    }));
  });

  it("conserva el error de duplicado aunque la fila repetida también tenga una hora inválida", async () => {
    const archivo = await archivoXlsx([
      ["ID de huellero", "Sede", "Fecha", "Entrada", "Salida"],
      ["HU-1024", "Centro", "2026-09-01", "09:00", "18:00"],
      ["HU-1024", "Centro", "2026-09-01", "25:00", "18:00"],
    ]);

    await expect(parsearArchivoHuellero(archivo)).resolves.toEqual(expect.objectContaining({
      errores: expect.arrayContaining([
        expect.objectContaining({ fila: 3, motivo: "Entrada debe ser una hora Excel o usar HH:MM." }),
        expect.objectContaining({ fila: 3, motivo: "La jornada duplica la fila 2." }),
      ]),
    }));
  });
});
