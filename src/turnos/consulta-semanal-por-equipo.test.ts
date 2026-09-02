import { describe, expect, it } from "vitest";

import { crearConsultaSemanalPorEquipo } from "./consulta-semanal-por-equipo";

describe("consulta semanal por equipo", () => {
  it("agrupa las personas activas por su sede y muestra sus horarios publicados", () => {
    const consulta = crearConsultaSemanalPorEquipo({
      dias: ["2026-09-01", "2026-09-02"],
      colaboradores: [
        { idHuellero: "HU-1", nombre: "Ana", sede: "Tienda Centro" },
        { idHuellero: "HU-2", nombre: "Bea", sede: "Tienda Norte" },
      ],
      turnos: [
        {
          idHuellero: "HU-1", fecha: "2026-09-01", sede: "Tienda Centro",
          entradaProgramada: "09:00", salidaProgramada: "18:00", minutosDeAlmuerzo: 60, descanso: false,
        },
        {
          idHuellero: "HU-2", fecha: "2026-09-02", sede: "Tienda Norte",
          entradaProgramada: "00:00", salidaProgramada: "00:00", minutosDeAlmuerzo: 0, descanso: true,
        },
      ],
    });

    expect(consulta).toEqual([
      {
        sede: "Tienda Centro",
        colaboradores: [{
          idHuellero: "HU-1",
          nombre: "Ana",
          celdas: [{ estado: "publicado", sede: "Tienda Centro", entradaProgramada: "09:00", salidaProgramada: "18:00" }, { estado: "sin-publicacion" }],
        }],
      },
      {
        sede: "Tienda Norte",
        colaboradores: [{
          idHuellero: "HU-2",
          nombre: "Bea",
          celdas: [{ estado: "sin-publicacion" }, { estado: "descanso", sede: "Tienda Norte" }],
        }],
      },
    ]);
  });
});
