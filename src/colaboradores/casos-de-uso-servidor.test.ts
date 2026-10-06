import { describe, expect, it } from "vitest";

import type { Colaborador } from "./registrar-colaborador";
import type { RepositorioParaCambiarGrupo } from "./cambiar-grupo";
import { crearCasosDeUsoDeColaboradores } from "./casos-de-uso-servidor";

function crearRepositorioEnMemoria(): {
  repositorio: RepositorioParaCambiarGrupo;
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
      tieneBorradorAbiertoEnGrupo: async () => false,
    },
    colaboradores,
  };
}

describe("casos de uso de colaboradores en el servidor", () => {
  it("usa el actor de la sesión del servidor y rechaza a un gerente sin grupos", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeColaboradores(repositorio, {
      obtenerActorActual: async () => ({ id: "gerente-1", rol: "gerente_de_area" }),
    });

    await expect(
      casosDeUso.registrar({
        dni: "00001024",
        nombre: "Ana Rojas",
        sede: "Lima",
        grupo: "Tiendas",
        activo: true,
      }),
    ).rejects.toThrow("No tiene permiso para administrar colaboradores.");
  });

  it("cambia el grupo de un colaborador usando el actor de la sesión del servidor", async () => {
    const { repositorio, colaboradores } = crearRepositorioEnMemoria();
    colaboradores.set("00001024", {
      dni: "00001024", nombre: "Ana Rojas", sede: "Lima", grupo: "Tiendas", activo: true,
    });
    const casosDeUso = crearCasosDeUsoDeColaboradores(repositorio, {
      obtenerActorActual: async () => ({ id: "admin-1", rol: "administrador" }),
    });

    await casosDeUso.cambiarGrupo("00001024", "Taller");

    expect(colaboradores.get("00001024")).toMatchObject({ grupo: "Taller" });
  });
});
