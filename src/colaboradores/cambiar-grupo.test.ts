import { describe, expect, it } from "vitest";

import type { Colaborador } from "./registrar-colaborador";
import type { RepositorioParaCambiarGrupo } from "./cambiar-grupo";
import { cambiarGrupoDeColaborador } from "./cambiar-grupo";

function crearRepositorioEnMemoria(colaboradorInicial: Colaborador, borradoresAbiertos: string[] = []): {
  repositorio: RepositorioParaCambiarGrupo;
  colaboradores: Map<string, Colaborador>;
} {
  const colaboradores = new Map<string, Colaborador>([[colaboradorInicial.dni, colaboradorInicial]]);

  return {
    repositorio: {
      buscarPorDni: async (dni) => colaboradores.get(dni),
      guardar: async (colaborador) => { colaboradores.set(colaborador.dni, colaborador); },
      actualizar: async (colaborador) => { colaboradores.set(colaborador.dni, colaborador); },
      tieneBorradorAbiertoEnGrupo: async (_dni, grupo) => borradoresAbiertos.includes(grupo),
    },
    colaboradores,
  };
}

const colaboradorBase: Colaborador = {
  dni: "00001024",
  nombre: "Ana Rojas",
  sede: "Lima",
  grupo: "Tiendas",
  activo: true,
};

describe("cambiarGrupoDeColaborador", () => {
  it("permite al Administrador cambiar el grupo cuando no hay borradores abiertos en el grupo actual", async () => {
    const { repositorio, colaboradores } = crearRepositorioEnMemoria(colaboradorBase);

    await cambiarGrupoDeColaborador(
      repositorio,
      { id: "admin-1", rol: "administrador" },
      "00001024",
      "Taller",
    );

    expect(colaboradores.get("00001024")).toMatchObject({ grupo: "Taller" });
  });

  it("rechaza a Finanzas y a un gerente de área aunque administre el grupo actual", async () => {
    const { repositorio, colaboradores } = crearRepositorioEnMemoria(colaboradorBase);

    for (const actor of [{ id: "finanzas-1", rol: "finanzas" as const }, { id: "gerente-1", rol: "gerente_de_area" as const, grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }, { nombre: "Taller", gestionaAsistencia: true }] }]) {
      await expect(cambiarGrupoDeColaborador(repositorio, actor, "00001024", "Taller")).rejects.toThrow("No tiene permiso para cambiar la configuración.");
    }

    expect(colaboradores.get("00001024")).toMatchObject({ grupo: "Tiendas" });
  });

  it("rechaza a un gerente sin grupos antes de cambiar el grupo", async () => {
    const { repositorio, colaboradores } = crearRepositorioEnMemoria(colaboradorBase);

    await expect(
      cambiarGrupoDeColaborador(repositorio, { id: "gerente-1", rol: "gerente_de_area" }, "00001024", "Taller"),
    ).rejects.toThrow("No tiene permiso para cambiar la configuración.");

    expect(colaboradores.get("00001024")).toMatchObject({ grupo: "Tiendas" });
  });

  it("rechaza el cambio si no existe un colaborador con ese DNI", async () => {
    const { repositorio } = crearRepositorioEnMemoria(colaboradorBase);

    await expect(
      cambiarGrupoDeColaborador(repositorio, { id: "admin-1", rol: "administrador" }, "00009999", "Taller"),
    ).rejects.toThrow("No existe un colaborador con ese DNI.");
  });

  it("rechaza el cambio si el colaborador tiene un borrador abierto en su grupo actual", async () => {
    const { repositorio, colaboradores } = crearRepositorioEnMemoria(colaboradorBase, ["Tiendas"]);

    await expect(
      cambiarGrupoDeColaborador(repositorio, { id: "admin-1", rol: "administrador" }, "00001024", "Taller"),
    ).rejects.toThrow("No se puede cambiar de grupo: el colaborador tiene un plan semanal en borrador en su grupo actual.");

    expect(colaboradores.get("00001024")).toMatchObject({ grupo: "Tiendas" });
  });

  it("no revisa borradores abiertos cuando el grupo nuevo es igual al actual", async () => {
    const { repositorio, colaboradores } = crearRepositorioEnMemoria(colaboradorBase, ["Tiendas"]);

    await cambiarGrupoDeColaborador(repositorio, { id: "admin-1", rol: "administrador" }, "00001024", "Tiendas");

    expect(colaboradores.get("00001024")).toMatchObject({ grupo: "Tiendas" });
  });

  it("rechaza un grupo vacío", async () => {
    const { repositorio } = crearRepositorioEnMemoria(colaboradorBase);

    await expect(
      cambiarGrupoDeColaborador(repositorio, { id: "admin-1", rol: "administrador" }, "00001024", "   "),
    ).rejects.toThrow("El grupo operativo es obligatorio.");
  });
});
