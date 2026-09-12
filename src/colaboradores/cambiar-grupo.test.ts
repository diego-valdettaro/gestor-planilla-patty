import { describe, expect, it } from "vitest";

import type { Colaborador } from "./registrar-colaborador";
import type { RepositorioParaCambiarGrupo } from "./cambiar-grupo";
import { cambiarGrupoDeColaborador } from "./cambiar-grupo";

function crearRepositorioEnMemoria(colaboradorInicial: Colaborador, borradoresAbiertos: string[] = []): {
  repositorio: RepositorioParaCambiarGrupo;
  colaboradores: Map<string, Colaborador>;
} {
  const colaboradores = new Map<string, Colaborador>([[colaboradorInicial.idHuellero, colaboradorInicial]]);

  return {
    repositorio: {
      buscarPorIdHuellero: async (idHuellero) => colaboradores.get(idHuellero),
      guardar: async (colaborador) => { colaboradores.set(colaborador.idHuellero, colaborador); },
      actualizar: async (colaborador) => { colaboradores.set(colaborador.idHuellero, colaborador); },
      tieneBorradorAbiertoEnGrupo: async (_idHuellero, grupo) => borradoresAbiertos.includes(grupo),
    },
    colaboradores,
  };
}

const colaboradorBase: Colaborador = {
  idHuellero: "HU-1024",
  nombre: "Ana Rojas",
  sede: "Lima",
  grupo: "Tiendas",
  activo: true,
};

describe("cambiarGrupoDeColaborador", () => {
  it("permite a Administración cambiar el grupo cuando no hay borradores abiertos en el grupo actual", async () => {
    const { repositorio, colaboradores } = crearRepositorioEnMemoria(colaboradorBase);

    await cambiarGrupoDeColaborador(
      repositorio,
      { id: "admin-1", rol: "administracion" },
      "HU-1024",
      "Taller",
    );

    expect(colaboradores.get("HU-1024")).toMatchObject({ grupo: "Taller" });
  });

  it("permite a Finanzas cambiar el grupo", async () => {
    const { repositorio, colaboradores } = crearRepositorioEnMemoria(colaboradorBase);

    await cambiarGrupoDeColaborador(
      repositorio,
      { id: "finanzas-1", rol: "finanzas" },
      "HU-1024",
      "Taller",
    );

    expect(colaboradores.get("HU-1024")).toMatchObject({ grupo: "Taller" });
  });

  it("rechaza a Operaciones antes de cambiar el grupo", async () => {
    const { repositorio, colaboradores } = crearRepositorioEnMemoria(colaboradorBase);

    await expect(
      cambiarGrupoDeColaborador(repositorio, { id: "operaciones-1", rol: "operaciones" }, "HU-1024", "Taller"),
    ).rejects.toThrow("No tiene permiso para administrar colaboradores.");

    expect(colaboradores.get("HU-1024")).toMatchObject({ grupo: "Tiendas" });
  });

  it("rechaza el cambio si no existe un colaborador con ese ID de huellero", async () => {
    const { repositorio } = crearRepositorioEnMemoria(colaboradorBase);

    await expect(
      cambiarGrupoDeColaborador(repositorio, { id: "admin-1", rol: "administracion" }, "HU-9999", "Taller"),
    ).rejects.toThrow("No existe un colaborador con ese ID de huellero.");
  });

  it("rechaza el cambio si el colaborador tiene un borrador abierto en su grupo actual", async () => {
    const { repositorio, colaboradores } = crearRepositorioEnMemoria(colaboradorBase, ["Tiendas"]);

    await expect(
      cambiarGrupoDeColaborador(repositorio, { id: "admin-1", rol: "administracion" }, "HU-1024", "Taller"),
    ).rejects.toThrow("No se puede cambiar de grupo: el colaborador tiene un plan semanal en borrador en su grupo actual.");

    expect(colaboradores.get("HU-1024")).toMatchObject({ grupo: "Tiendas" });
  });

  it("no revisa borradores abiertos cuando el grupo nuevo es igual al actual", async () => {
    const { repositorio, colaboradores } = crearRepositorioEnMemoria(colaboradorBase, ["Tiendas"]);

    await cambiarGrupoDeColaborador(repositorio, { id: "admin-1", rol: "administracion" }, "HU-1024", "Tiendas");

    expect(colaboradores.get("HU-1024")).toMatchObject({ grupo: "Tiendas" });
  });

  it("rechaza un grupo vacío", async () => {
    const { repositorio } = crearRepositorioEnMemoria(colaboradorBase);

    await expect(
      cambiarGrupoDeColaborador(repositorio, { id: "admin-1", rol: "administracion" }, "HU-1024", "   "),
    ).rejects.toThrow("El grupo operativo es obligatorio.");
  });
});
