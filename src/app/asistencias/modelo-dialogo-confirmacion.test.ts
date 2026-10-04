import { describe, expect, it } from "vitest";

import { crearModeloDelDialogo } from "./modelo-dialogo-confirmacion";

describe("modelo del diálogo de confirmación por rango", () => {
  it("selecciona los colaboradores elegibles y explica cada bloqueo", () => {
    const modelo = crearModeloDelDialogo([
      { dni: "00000011", nombre: "Ana", seleccionable: true, jornadasPendientes: 2, jornadasRegistradas: 1, bloqueos: [] },
      {
        dni: "00000012",
        nombre: "Bruno",
        seleccionable: false,
        jornadasPendientes: 3,
        jornadasRegistradas: 0,
        bloqueos: [
          { fecha: "2031-03-25", causa: "Falta la marca de salida." },
          { fecha: "2031-03-26", causa: "La jornada pertenece a un período cerrado." },
        ],
      },
      { dni: "00000013", nombre: "Carla", seleccionable: false, jornadasPendientes: 0, jornadasRegistradas: 3, bloqueos: [] },
    ]);

    expect(modelo.seleccionados).toEqual(["00000011"]);
    expect(modelo.opciones).toEqual([
      expect.objectContaining({ dni: "00000011", detalles: ["2 asistencias por registrar · 1 ya registrada"] }),
      expect.objectContaining({ dni: "00000012", detalles: [
        "25 mar 2031: Falta la marca de salida.",
        "26 mar 2031: La jornada pertenece a un período cerrado.",
      ] }),
      expect.objectContaining({ dni: "00000013", detalles: ["No hay asistencias por registrar en el rango."] }),
    ]);
  });
});
