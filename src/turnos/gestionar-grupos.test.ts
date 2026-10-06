import { describe, expect, it } from "vitest";

import { configurarGestionDeAsistenciaDelGrupo, crearGrupo, type RepositorioDeGrupos } from "./gestionar-grupos";

function crearRepositorio(): { repositorio: RepositorioDeGrupos; creados: string[]; atributos: Array<[string, boolean]> } {
  const creados: string[] = [];
  const atributos: Array<[string, boolean]> = [];
  return {
    creados,
    atributos,
    repositorio: {
      crear: async (nombre) => { creados.push(nombre); },
      actualizarGestionDeAsistencia: async (nombre, gestiona) => { atributos.push([nombre, gestiona]); },
    },
  };
}

describe("gestionar grupos", () => {
  it("permite al Administrador crear un grupo con nombre", async () => {
    const { repositorio, creados } = crearRepositorio();

    await crearGrupo(repositorio, { id: "admin-1", rol: "administrador" }, "Logistica");

    expect(creados).toEqual(["Logistica"]);
  });

  it("rechaza un nombre vacio y no escribe", async () => {
    const { repositorio, creados } = crearRepositorio();

    await expect(crearGrupo(repositorio, { id: "admin-1", rol: "administrador" }, "  ")).rejects.toThrow("El nombre del grupo es obligatorio.");
    expect(creados).toEqual([]);
  });

  it.each([
    ["Finanzas", { id: "fin-1", rol: "finanzas" as const }],
    ["un gerente de área", { id: "ger-1", rol: "gerente_de_area" as const, grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
    ["Recursos Humanos", { id: "rrhh-1", rol: "recursos_humanos" as const }],
  ])("rechaza a %s antes de escribir", async (_nombre, actor) => {
    const { repositorio, creados, atributos } = crearRepositorio();

    await expect(crearGrupo(repositorio, actor, "Logistica")).rejects.toThrow("No tiene permiso para cambiar la configuracion.");
    await expect(configurarGestionDeAsistenciaDelGrupo(repositorio, actor, "Tiendas", false)).rejects.toThrow("No tiene permiso para cambiar la configuracion.");
    expect(creados).toEqual([]);
    expect(atributos).toEqual([]);
  });

  it("permite al Administrador cambiar si un grupo gestiona asistencia y horarios", async () => {
    const { repositorio, atributos } = crearRepositorio();

    await configurarGestionDeAsistenciaDelGrupo(repositorio, { id: "admin-1", rol: "administrador" }, "Administración", false);

    expect(atributos).toEqual([["Administración", false]]);
  });
});
