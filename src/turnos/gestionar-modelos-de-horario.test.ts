import { describe, expect, it } from "vitest";

import {
  crearModeloDeHorario,
  eliminarModeloDeHorario,
  guardarModeloDeHorario,
  type ModeloDeHorario,
  type RepositorioDeModelosDeHorario,
} from "./gestionar-modelos-de-horario";

function crearRepositorioEnMemoria(): { modelos: ModeloDeHorario[]; repositorio: RepositorioDeModelosDeHorario } {
  const modelos: ModeloDeHorario[] = [];
  return {
    modelos,
    repositorio: {
      guardar: async (modelo) => {
        const indice = modelos.findIndex((item) => item.id === modelo.id);
        if (indice >= 0) modelos[indice] = modelo;
        else modelos.push(modelo);
      },
      buscarPorId: async (id) => modelos.find((modelo) => modelo.id === id),
      eliminar: async (id) => { modelos.splice(modelos.findIndex((modelo) => modelo.id === id), 1); },
      tieneUso: async () => false,
    },
  };
}

describe("gestionar modelos de horario", () => {
  it("permite a Operaciones crear, editar y reactivar un modelo de horario", async () => {
    const { modelos, repositorio } = crearRepositorioEnMemoria();
    const actor = { id: "operaciones-1", rol: "operaciones" as const };

    await crearModeloDeHorario(repositorio, actor, {
      id: "modelo-1", sede: "Tienda Centro", nombre: "Apertura", entrada: "09:00", salida: "18:00",
    });
    await guardarModeloDeHorario(repositorio, actor, {
      id: "modelo-1", sede: "Tienda Centro", nombre: "Apertura extendida", entrada: "08:30", salida: "18:00", activo: true,
    });

    expect(modelos).toEqual([{
      id: "modelo-1", sede: "Tienda Centro", nombre: "Apertura extendida", entrada: "08:30", salida: "18:00", activo: true,
    }]);
  });

  it.each([
    ["9:00", "18:00", "horas v\u00e1lidas"],
    ["18:00", "18:00", "salida posterior"],
    ["22:00", "06:00", "horario nocturno"],
  ])("rechaza %s y %s por requerir %s", async (entrada, salida, mensaje) => {
    const { repositorio } = crearRepositorioEnMemoria();

    await expect(crearModeloDeHorario(repositorio, { id: "admin-1", rol: "administracion" }, {
      id: "modelo-1", sede: "Tienda Centro", nombre: "Inv\u00e1lido", entrada, salida,
    })).rejects.toThrow(mensaje);
  });

  it("solo permite desactivar un modelo que ya se us\u00f3", async () => {
    const { modelos, repositorio } = crearRepositorioEnMemoria();
    modelos.push({ id: "modelo-1", sede: "Tienda Centro", nombre: "Apertura", entrada: "09:00", salida: "18:00", activo: true });
    repositorio.tieneUso = async () => true;

    await eliminarModeloDeHorario(repositorio, { id: "admin-1", rol: "administracion" }, "modelo-1");

    expect(modelos).toEqual([{ id: "modelo-1", sede: "Tienda Centro", nombre: "Apertura", entrada: "09:00", salida: "18:00", activo: false }]);
  });

  it("rechaza editar o reactivar un modelo que ya se usó", async () => {
    const { modelos, repositorio } = crearRepositorioEnMemoria();
    modelos.push({ id: "modelo-1", sede: "Tienda Centro", nombre: "Apertura", entrada: "09:00", salida: "18:00", activo: false });
    repositorio.tieneUso = async () => true;

    await expect(guardarModeloDeHorario(repositorio, { id: "admin-1", rol: "administracion" }, {
      id: "modelo-1", sede: "Tienda Centro", nombre: "Apertura", entrada: "09:00", salida: "18:00", activo: true,
    })).rejects.toThrow("Un modelo de horario usado solo se puede desactivar.");
  });

  it("rechaza a Finanzas antes de modificar un modelo", async () => {
    const { repositorio } = crearRepositorioEnMemoria();

    await expect(crearModeloDeHorario(repositorio, { id: "finanzas-1", rol: "finanzas" }, {
      id: "modelo-1", sede: "Tienda Centro", nombre: "Apertura", entrada: "09:00", salida: "18:00",
    })).rejects.toThrow("No tiene permiso para administrar modelos de horario.");
  });
});
