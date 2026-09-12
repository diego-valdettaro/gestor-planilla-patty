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
      buscarPorIdHuellero: async (idHuellero) => colaboradores.get(idHuellero),
      guardar: async (colaborador) => {
        colaboradores.set(colaborador.idHuellero, colaborador);
      },
      actualizar: async (colaborador) => {
        colaboradores.set(colaborador.idHuellero, colaborador);
      },
      tieneBorradorAbiertoEnGrupo: async () => false,
    },
    colaboradores,
  };
}

describe("casos de uso de colaboradores en el servidor", () => {
  it("usa el actor de la sesión del servidor y rechaza a Operaciones", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeColaboradores(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
    });

    await expect(
      casosDeUso.registrar({
        idHuellero: "HU-1024",
        nombre: "Ana Rojas",
        sede: "Lima",
        grupo: "Tiendas",
        activo: true,
      }),
    ).rejects.toThrow("No tiene permiso para administrar colaboradores.");
  });

  it("cambia el grupo de un colaborador usando el actor de la sesión del servidor", async () => {
    const { repositorio, colaboradores } = crearRepositorioEnMemoria();
    colaboradores.set("HU-1024", {
      idHuellero: "HU-1024", nombre: "Ana Rojas", sede: "Lima", grupo: "Tiendas", activo: true,
    });
    const casosDeUso = crearCasosDeUsoDeColaboradores(repositorio, {
      obtenerActorActual: async () => ({ id: "admin-1", rol: "administracion" }),
    });

    await casosDeUso.cambiarGrupo("HU-1024", "Taller");

    expect(colaboradores.get("HU-1024")).toMatchObject({ grupo: "Taller" });
  });
});
