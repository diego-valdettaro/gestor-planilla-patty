import { describe, expect, it } from "vitest";

import { crearConsultaSemanalPorEquipo } from "./consulta-semanal-por-equipo";

describe("consulta semanal por equipo", () => {
  it("agrupa las personas activas por su sede y muestra sus horarios publicados", () => {
    const consulta = crearConsultaSemanalPorEquipo({
      dias: ["2026-09-01", "2026-09-02"],
      colaboradores: [
        { dni: "00000011", nombre: "Ana", sede: "Tienda Centro" },
        { dni: "00000012", nombre: "Bea", sede: "Tienda Norte" },
      ],
      turnos: [
        {
          dni: "00000011", fecha: "2026-09-01", sede: "Tienda Centro",
          entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
        },
        {
          dni: "00000012", fecha: "2026-09-02", sede: "Tienda Norte",
          entradaProgramada: null, salidaProgramada: null, descanso: true,
        },
      ],
    });

    expect(consulta).toEqual([
      {
        sede: "Tienda Centro",
        colaboradores: [{
          dni: "00000011",
          nombre: "Ana",
          celdas: [{ estado: "publicado", sede: "Tienda Centro", entradaProgramada: "09:00", salidaProgramada: "18:00" }, { estado: "sin-publicacion" }],
        }],
      },
      {
        sede: "Tienda Norte",
        colaboradores: [{
          dni: "00000012",
          nombre: "Bea",
          celdas: [{ estado: "sin-publicacion" }, { estado: "descanso", sede: "Tienda Norte" }],
        }],
      },
    ]);
  });
});
