import { describe, expect, it } from "vitest";

import { asignarEquipoOperativo } from "./configurar-equipos-operativos";

describe("configurar equipos operativos", () => {
  it("permite a Administración asignar una sede activa a un equipo", async () => {
    const asignaciones: Array<{ sede: string; equipo: "tiendas" | "taller" }> = [];

    await asignarEquipoOperativo(
      { asignar: async (sede, equipo) => { asignaciones.push({ sede, equipo }); } },
      { id: "admin-1", rol: "administracion" },
      "Tienda Centro",
      "tiendas",
    );

    expect(asignaciones).toEqual([{ sede: "Tienda Centro", equipo: "tiendas" }]);
  });

  it("rechaza a un rol sin permiso antes de cambiar la sede", async () => {
    let llamadas = 0;
    const asignar = async () => { llamadas += 1; };

    await expect(asignarEquipoOperativo(
      { asignar },
      { id: "operaciones-1", rol: "operaciones" },
      "Tienda Centro",
      "tiendas",
    )).rejects.toThrow("No tiene permiso para cambiar la configuración.");
    expect(llamadas).toBe(0);
  });
});
