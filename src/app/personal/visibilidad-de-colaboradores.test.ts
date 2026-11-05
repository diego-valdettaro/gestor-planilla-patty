import { describe, expect, it } from "vitest";

import { filtrarColaboradores } from "./visibilidad-de-colaboradores";

const personas = [
  { dni: "00000201", grupo: "tiendas" as const, activo: true },
  { dni: "00000202", grupo: "tiendas" as const, activo: false },
  { dni: "00000301", grupo: "taller" as const, activo: true },
  { dni: "00000302", grupo: "taller" as const, activo: false },
];

const ids = (lista: { dni: string }[]) => lista.map((persona) => persona.dni);

describe("filtrarColaboradores", () => {
  it("filtra por un grupo creado durante la operación", () => {
    expect(ids(filtrarColaboradores([
      { dni: "00000401", grupo: "Logística", activo: true },
      { dni: "00000201", grupo: "Tiendas", activo: true },
    ], { grupo: "Logística", mostrarInactivos: false }))).toEqual(["00000401"]);
  });

  it("sin grupo elegido y con inactivos apagado deja solo los activos de todos los grupos", () => {
    expect(ids(filtrarColaboradores(personas, { mostrarInactivos: false }))).toEqual(["00000201", "00000301"]);
  });

  it("con un grupo elegido y con inactivos apagado deja solo los activos de ese grupo", () => {
    expect(ids(filtrarColaboradores(personas, { grupo: "taller", mostrarInactivos: false }))).toEqual(["00000301"]);
  });

  it("con inactivos encendido incluye a los inactivos", () => {
    expect(ids(filtrarColaboradores(personas, { mostrarInactivos: true }))).toEqual(["00000201", "00000202", "00000301", "00000302"]);
  });

  it("combina grupo e inactivos encendido: activos e inactivos solo de ese grupo", () => {
    expect(ids(filtrarColaboradores(personas, { grupo: "taller", mostrarInactivos: true }))).toEqual(["00000301", "00000302"]);
  });
});
