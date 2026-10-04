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
      buscarPorDni: async (dni) => colaboradores.get(dni),
      guardar: async (colaborador) => {
        colaboradores.set(colaborador.dni, colaborador);
      },
      actualizar: async (colaborador) => {
        colaboradores.set(colaborador.dni, colaborador);
      },
    },
    colaboradores,
  };
}

describe("registrarColaborador", () => {
  it("permite a Administración crear un colaborador y consultarlo por su DNI", async () => {
    const { colaboradores, repositorio } = crearRepositorioEnMemoria();
    const actor = { id: "admin-1", rol: "administracion" as const };

    await registrarColaborador(
      repositorio,
      actor,
      {
        dni: "00001024",
        nombre: "Ana Rojas",
        sede: "Lima",
        grupo: "Tiendas",
        activo: true,
      },
    );

    await expect(
      consultarColaborador(repositorio, actor, "00001024"),
    ).resolves.toMatchObject({
      dni: "00001024",
      nombre: "Ana Rojas",
      sede: "Lima",
      grupo: "Tiendas",
      activo: true,
    });
  });

  it("rechaza a Operaciones antes de modificar los colaboradores", async () => {
    const { colaboradores, repositorio } = crearRepositorioEnMemoria();

    await expect(
      registrarColaborador(
        repositorio,
        { id: "operaciones-1", rol: "operaciones" },
        {
          dni: "00001024",
          nombre: "Ana Rojas",
          sede: "Lima",
          grupo: "Tiendas",
          activo: true,
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
          dni: "00001024",
          nombre: "Ana Rojas",
          sede: "Lima",
          grupo: "Tiendas",
          activo: true,
        },
      ),
    ).rejects.toThrow("No tiene permiso para administrar colaboradores.");
  });

  it.each([
    ["", "El DNI es obligatorio."],
    ["   ", "El DNI es obligatorio."],
    ["1234567", "El DNI debe tener exactamente 8 dígitos."],
    ["123456789", "El DNI debe tener exactamente 8 dígitos."],
    ["1234567A", "El DNI debe tener exactamente 8 dígitos."],
    ["H-1024", "El DNI debe tener exactamente 8 dígitos."],
  ])("rechaza el alta con DNI %j sin guardar nada", async (dni, mensaje) => {
    const { colaboradores, repositorio } = crearRepositorioEnMemoria();
    const actor = { id: "admin-1", rol: "administracion" as const };

    await expect(
      registrarColaborador(repositorio, actor, { dni, nombre: "Ana Rojas", sede: "Lima", grupo: "Tiendas", activo: true }),
    ).rejects.toThrow(mensaje);
    expect(colaboradores.size).toBe(0);
  });

  it("impide registrar el mismo DNI para dos colaboradores", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const actor = { id: "finanzas-1", rol: "finanzas" as const };
    const primeraColaboradora = {
      dni: "00001024",
      nombre: "Ana Rojas",
      sede: "Lima",
      grupo: "Tiendas",
      activo: true,
    };

    await registrarColaborador(repositorio, actor, primeraColaboradora);

    await expect(
      registrarColaborador(repositorio, actor, {
        ...primeraColaboradora,
        nombre: "Brenda Soto",
      }),
    ).rejects.toThrow("El DNI ya pertenece a un colaborador.");
  });

  it("permite a Finanzas actualizar los datos operativos y desactivar un colaborador", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const actor = { id: "finanzas-1", rol: "finanzas" as const };

    await registrarColaborador(repositorio, actor, {
      dni: "00001024",
      nombre: "Ana Rojas",
      sede: "Lima",
      grupo: "Tiendas",
      activo: true,
    });

    await actualizarColaborador(repositorio, actor, {
      dni: "00001024",
      nombre: "Ana Rojas",
      sede: "Callao",
      grupo: "Taller",
      activo: false,
    });

    await expect(
      consultarColaborador(repositorio, actor, "00001024"),
    ).resolves.toMatchObject({
      sede: "Callao",
      grupo: "Taller",
      activo: false,
    });
  });
});
