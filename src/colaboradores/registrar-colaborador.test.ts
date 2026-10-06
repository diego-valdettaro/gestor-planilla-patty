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
    const actor = { id: "admin-1", rol: "administrador" as const };

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

  it("rechaza a un gerente sin grupos antes de modificar los colaboradores", async () => {
    const { colaboradores, repositorio } = crearRepositorioEnMemoria();

    await expect(
      registrarColaborador(
        repositorio,
        { id: "gerente-1", rol: "gerente_de_area" },
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

  it("rechaza un rol que no existe", async () => {
    const { repositorio } = crearRepositorioEnMemoria();

    await expect(
      registrarColaborador(
        repositorio,
        { id: "sesion-invalida", rol: "superusuario" } as unknown as {
          id: string;
          rol: "gerente_de_area";
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
    const actor = { id: "admin-1", rol: "administrador" as const };

    await expect(
      registrarColaborador(repositorio, actor, { dni, nombre: "Ana Rojas", sede: "Lima", grupo: "Tiendas", activo: true }),
    ).rejects.toThrow(mensaje);
    expect(colaboradores.size).toBe(0);
  });

  it("impide registrar el mismo DNI para dos colaboradores", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const actor = { id: "admin-1", rol: "administrador" as const };
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

  it("permite al Administrador actualizar los datos operativos, cambiar el grupo y desactivar un colaborador", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const actor = { id: "admin-1", rol: "administrador" as const };

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

  describe("gerente de área", () => {
    const gerente = { id: "gerente-1", rol: "gerente_de_area" as const, grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }, { nombre: "Administración", gestionaAsistencia: false }] };
    const ana = { dni: "00001024", nombre: "Ana Rojas", sede: "Lima", grupo: "Tiendas", activo: true };

    it("da de alta y edita personas de sus grupos, incluso de uno que no gestiona asistencia", async () => {
      const { repositorio } = crearRepositorioEnMemoria();

      await registrarColaborador(repositorio, gerente, ana);
      await registrarColaborador(repositorio, gerente, { ...ana, dni: "00001025", nombre: "Hugo Marín", grupo: "Administración" });
      await actualizarColaborador(repositorio, gerente, { ...ana, sede: "Callao" });

      await expect(consultarColaborador(repositorio, gerente, "00001024")).resolves.toMatchObject({ sede: "Callao" });
    });

    it("rechaza el alta, la consulta y la edición en un grupo ajeno", async () => {
      const { repositorio, colaboradores } = crearRepositorioEnMemoria();
      const ajena = { ...ana, dni: "00001030", grupo: "Taller" };
      colaboradores.set(ajena.dni, ajena);

      await expect(registrarColaborador(repositorio, gerente, { ...ana, dni: "00001031", grupo: "Taller" })).rejects.toThrow("No tiene permiso para administrar colaboradores de este grupo.");
      await expect(consultarColaborador(repositorio, gerente, "00001030")).rejects.toThrow("No tiene permiso para administrar colaboradores de este grupo.");
      await expect(actualizarColaborador(repositorio, gerente, { ...ajena, sede: "Callao" })).rejects.toThrow("No tiene permiso para administrar colaboradores de este grupo.");
      expect(colaboradores.get("00001030")).toEqual(ajena);
    });

    it("no puede mover una persona a otro grupo ni activarla o desactivarla", async () => {
      const { repositorio } = crearRepositorioEnMemoria();
      await registrarColaborador(repositorio, gerente, ana);

      await expect(actualizarColaborador(repositorio, gerente, { ...ana, grupo: "Administración" })).rejects.toThrow("Solo el Administrador del sistema puede cambiar el grupo");
      await expect(actualizarColaborador(repositorio, gerente, { ...ana, activo: false })).rejects.toThrow("Solo el Administrador del sistema puede activar o desactivar");
    });
  });

  it.each([["Finanzas", { id: "fin-1", rol: "finanzas" as const }], ["Recursos Humanos", { id: "rrhh-1", rol: "recursos_humanos" as const }]])("rechaza a %s", async (_nombre, actor) => {
    const { repositorio, colaboradores } = crearRepositorioEnMemoria();

    await expect(registrarColaborador(repositorio, actor, { dni: "00001024", nombre: "Ana", sede: "Lima", grupo: "Tiendas", activo: true })).rejects.toThrow("No tiene permiso para administrar colaboradores.");
    expect(colaboradores.size).toBe(0);
  });
});
