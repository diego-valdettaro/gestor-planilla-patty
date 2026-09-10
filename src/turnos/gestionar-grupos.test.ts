import { describe, expect, it } from "vitest";

import { crearGrupo } from "./gestionar-grupos";

describe("gestionar grupos", () => {
  it("permite a Administracion crear un grupo con nombre", async () => {
    const grupos: string[] = [];

    await crearGrupo({ crear: async (nombre) => { grupos.push(nombre); } }, { id: "admin-1", rol: "administracion" }, "Logistica");

    expect(grupos).toEqual(["Logistica"]);
  });

  it("rechaza un nombre vacio y no escribe", async () => {
    let llamadas = 0;

    await expect(crearGrupo({ crear: async () => { llamadas += 1; } }, { id: "admin-1", rol: "administracion" }, "  "))
      .rejects.toThrow("El nombre del grupo es obligatorio.");
    expect(llamadas).toBe(0);
  });

  it("rechaza a Finanzas antes de escribir", async () => {
    let llamadas = 0;

    await expect(crearGrupo({ crear: async () => { llamadas += 1; } }, { id: "fin-1", rol: "finanzas" }, "Logistica"))
      .rejects.toThrow("No tiene permiso para cambiar la configuracion.");
    expect(llamadas).toBe(0);
  });

  it("rechaza a Operaciones antes de escribir", async () => {
    let llamadas = 0;
    await expect(crearGrupo({ crear: async () => { llamadas += 1; } }, { id: "ops-1", rol: "operaciones" }, "Logistica"))
      .rejects.toThrow("No tiene permiso para cambiar la configuracion.");
    expect(llamadas).toBe(0);
  });
});
