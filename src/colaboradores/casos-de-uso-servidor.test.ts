import { describe, expect, it } from "vitest";

import type {
  Colaborador,
  RepositorioDeColaboradores,
} from "./registrar-colaborador";
import { crearCasosDeUsoDeColaboradores } from "./casos-de-uso-servidor";

describe("casos de uso de colaboradores en el servidor", () => {
  it("usa el actor de la sesión del servidor y rechaza a Operaciones", async () => {
    const colaboradores = new Map<string, Colaborador>();
    const repositorio: RepositorioDeColaboradores = {
      buscarPorIdHuellero: async (idHuellero) => colaboradores.get(idHuellero),
      guardar: async (colaborador) => {
        colaboradores.set(colaborador.idHuellero, colaborador);
      },
      actualizar: async (colaborador) => {
        colaboradores.set(colaborador.idHuellero, colaborador);
      },
    };
    const casosDeUso = crearCasosDeUsoDeColaboradores(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
    });

    await expect(
      casosDeUso.registrar({
        idHuellero: "HU-1024",
        nombre: "Ana Rojas",
        sede: "Lima",
        activo: true,
      }),
    ).rejects.toThrow("No tiene permiso para administrar colaboradores.");
  });
});
