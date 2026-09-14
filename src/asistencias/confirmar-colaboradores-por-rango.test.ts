import { describe, expect, it } from "vitest";

import { confirmarColaboradoresPorRango, type SolicitudDeConfirmacionPorRango } from "./confirmar-colaboradores-por-rango";

describe("confirmar colaboradores por rango", () => {
  const solicitud: SolicitudDeConfirmacionPorRango = {
    inicio: "2031-03-24", fin: "2031-03-27", idsHuellero: ["HU-1", "HU-1", "HU-2"],
  };

  it("autoriza a Administracion y entrega una unica seleccion al repositorio", async () => {
    const llamadas: Array<{ solicitud: SolicitudDeConfirmacionPorRango; responsableId: string }> = [];
    await confirmarColaboradoresPorRango({
      confirmarColaboradoresPorRango: async (seleccion, responsableId) => { llamadas.push({ solicitud: seleccion, responsableId }); },
    }, { id: "admin-1", rol: "administracion" }, solicitud);

    expect(llamadas).toEqual([{ solicitud: { ...solicitud, idsHuellero: ["HU-1", "HU-2"] }, responsableId: "admin-1" }]);
  });

  it("rechaza rangos invalidos, selecciones vacias y roles no revisores", async () => {
    const repositorio = { confirmarColaboradoresPorRango: async () => undefined };
    await expect(confirmarColaboradoresPorRango(repositorio, { id: "op-1", rol: "operaciones" }, solicitud)).rejects.toThrow("No tiene permiso");
    await expect(confirmarColaboradoresPorRango(repositorio, { id: "admin-1", rol: "administracion" }, { ...solicitud, inicio: "2031-03-28", fin: "2031-03-27" })).rejects.toThrow("rango de confirmacion");
    await expect(confirmarColaboradoresPorRango(repositorio, { id: "admin-1", rol: "administracion" }, { ...solicitud, idsHuellero: [] })).rejects.toThrow("al menos un colaborador");
  });
});
