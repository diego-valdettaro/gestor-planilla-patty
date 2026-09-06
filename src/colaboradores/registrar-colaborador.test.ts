import { describe, expect, it } from "vitest";

import {
  type Colaborador,
  type RepositorioDeColaboradores,
  consultarColaborador,
  actualizarColaborador,
  registrarColaborador,
} from "./registrar-colaborador";

function crearRepositorioEnMemoria(): {
  repositorio: RepositorioDeColaboradores;
  colaboradores: Map<string, Colaborador>;
} {
  const colaboradores = new Map<string, Colaborador>();

  return {
    repositorio: {
      buscarPorIdHuellero: async (idHuellero) => colaboradores.get(idHuellero),
      guardar: async (colaborador) => {
        colaboradores.set(colaborador.idHuellero, colaborador);
      },
      actualizar: async (colaborador) => {
        colaboradores.set(colaborador.idHuellero, colaborador);
      },
    },
    colaboradores,
  };
}

describe("registrarColaborador", () => {
  it("permite a Administración crear un colaborador y consultarlo por su ID de huellero", async () => {
    const { colaboradores, repositorio } = crearRepositorioEnMemoria();
    const actor = { id: "admin-1", rol: "administracion" as const };

    await registrarColaborador(
      repositorio,
      actor,
      {
        idHuellero: "HU-1024",
        nombre: "Ana Rojas",
        sede: "Lima",        activo: true,
      },
    );

    await expect(
      consultarColaborador(repositorio, actor, "HU-1024"),
    ).resolves.toMatchObject({
      idHuellero: "HU-1024",
      nombre: "Ana Rojas",
      sede: "Lima",      activo: true,
    });
  });

  it("rechaza a Operaciones antes de modificar los colaboradores", async () => {
    const { colaboradores, repositorio } = crearRepositorioEnMemoria();

    await expect(
      registrarColaborador(
        repositorio,
        { id: "operaciones-1", rol: "operaciones" },
        {
          idHuellero: "HU-1024",
          nombre: "Ana Rojas",
          sede: "Lima",          activo: true,
        },
      ),
    ).rejects.toThrow("No tiene permiso para administrar colaboradores.");

    expect(colaboradores).toHaveLength(0);
  });

  it("rechaza un rol que no pertenece a Administración ni Finanzas", async () => {
    const { repositorio } = crearRepositorioEnMemoria();

    await expect(
      registrarColaborador(
        repositorio,
        { id: "sesion-invalida", rol: "superusuario" } as unknown as {
          id: string;
          rol: "operaciones";
        },
        {
          idHuellero: "HU-1024",
          nombre: "Ana Rojas",
          sede: "Lima",          activo: true,
        },
      ),
    ).rejects.toThrow("No tiene permiso para administrar colaboradores.");
  });

  it("impide registrar el mismo ID de huellero para dos colaboradores", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const actor = { id: "finanzas-1", rol: "finanzas" as const };
    const primeraColaboradora = {
      idHuellero: "HU-1024",
      nombre: "Ana Rojas",
      sede: "Lima",      activo: true,
    };

    await registrarColaborador(repositorio, actor, primeraColaboradora);

    await expect(
      registrarColaborador(repositorio, actor, {
        ...primeraColaboradora,
        nombre: "Brenda Soto",
      }),
    ).rejects.toThrow("El ID de huellero ya pertenece a un colaborador.");
  });

  it("permite a Finanzas actualizar los datos operativos y desactivar un colaborador", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const actor = { id: "finanzas-1", rol: "finanzas" as const };

    await registrarColaborador(repositorio, actor, {
      idHuellero: "HU-1024",
      nombre: "Ana Rojas",
      sede: "Lima",      activo: true,
    });

    await actualizarColaborador(repositorio, actor, {
      idHuellero: "HU-1024",
      nombre: "Ana Rojas",
      sede: "Callao",      activo: false,
    });

    await expect(
      consultarColaborador(repositorio, actor, "HU-1024"),
    ).resolves.toMatchObject({
      sede: "Callao",      activo: false,
    });
  });
});
