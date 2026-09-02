import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { parsearArchivoHuellero } from "./parsear-archivo-huellero";

describe("parsearArchivoHuellero", () => {
  it("acepta el encabezado legible ID de huellero", async () => {
    const libro = XLSX.utils.book_new();
    const hoja = XLSX.utils.aoa_to_sheet([
      ["ID de huellero", "fecha", "marca"],
      ["HU-1024", "2026-09-01", "09:04:00"],
    ]);
    XLSX.utils.book_append_sheet(libro, hoja, "Marcas");
    const contenido = XLSX.write(libro, { bookType: "xlsx", type: "array" });
    const archivo = new File([contenido], "huellero.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await expect(parsearArchivoHuellero(archivo)).resolves.toEqual([
      { idHuellero: "HU-1024", fecha: "2026-09-01", instante: "2026-09-01T09:04:00-05:00" },
    ]);
  });
});
