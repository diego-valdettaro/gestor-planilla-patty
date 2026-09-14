import { describe, expect, it } from "vitest";

import {
  confirmarColaboradoresPorRango,
  evaluarColaboradoresPorRango,
  type RepositorioDeConfirmacionPorRango,
} from "./confirmar-colaboradores-por-rango";

describe("confirmación de asistencias por rango", () => {
  const evaluacion = [{
    idHuellero: "HU-1",
    nombre: "Ana Torres",
    seleccionable: true,
    jornadasPendientes: 2,
    jornadasRegistradas: 1,
    bloqueos: [],
  }];
  const llamadas: string[] = [];
  const repositorio: RepositorioDeConfirmacionPorRango = {
    evaluarColaboradoresPorRango: async () => evaluacion,
    confirmarColaboradoresPorRango: async (solicitud, responsableId) => {
      llamadas.push(`${responsableId}:${solicitud.idsHuellero.join(",")}`);
    },
  };

  it("evalúa el rango para una selección única de colaboradores", async () => {
    const resultado = await evaluarColaboradoresPorRango(repositorio, { id: "admin-1", rol: "administracion" }, {
      inicio: "2031-03-24",
      fin: "2031-03-27",
      colaboradores: [
        { idHuellero: "HU-1", nombre: "Ana Torres" },
        { idHuellero: "HU-1", nombre: "Ana Torres" },
      ],
    });

    expect(resultado).toEqual(evaluacion);
  });

  it("confirma la selección completa con el responsable autenticado", async () => {
    await confirmarColaboradoresPorRango(repositorio, { id: "finanzas-1", rol: "finanzas" }, {
      inicio: "2031-03-24",
      fin: "2031-03-27",
      idsHuellero: ["HU-1", "HU-1"],
    });

    expect(llamadas).toEqual(["finanzas-1:HU-1"]);
  });

  it("rechaza rangos inválidos, selecciones vacías y roles sin permiso", async () => {
    await expect(evaluarColaboradoresPorRango(repositorio, { id: "op-1", rol: "operaciones" }, {
      inicio: "2031-03-24", fin: "2031-03-27", colaboradores: [{ idHuellero: "HU-1", nombre: "Ana" }],
    })).rejects.toThrow("No tiene permiso");
    await expect(confirmarColaboradoresPorRango(repositorio, { id: "admin-1", rol: "administracion" }, {
      inicio: "2031-03-28", fin: "2031-03-27", idsHuellero: ["HU-1"],
    })).rejects.toThrow("rango de confirmación");
    await expect(confirmarColaboradoresPorRango(repositorio, { id: "admin-1", rol: "administracion" }, {
      inicio: "2031-03-24", fin: "2031-03-27", idsHuellero: [],
    })).rejects.toThrow("al menos un colaborador");
  });
});
