import { describe, expect, it } from "vitest";

import { filtrarColaboradores } from "./visibilidad-de-colaboradores";

const personas = [
  { idHuellero: "T-1", grupo: "tiendas" as const, activo: true },
  { idHuellero: "T-2", grupo: "tiendas" as const, activo: false },
  { idHuellero: "W-1", grupo: "taller" as const, activo: true },
  { idHuellero: "W-2", grupo: "taller" as const, activo: false },
];

const ids = (lista: { idHuellero: string }[]) => lista.map((persona) => persona.idHuellero);

describe("filtrarColaboradores", () => {
  it("filtra por un grupo creado durante la operación", () => {
    expect(ids(filtrarColaboradores([
      { idHuellero: "L-1", grupo: "Logística", activo: true },
      { idHuellero: "T-1", grupo: "Tiendas", activo: true },
    ], { grupo: "Logística", mostrarInactivos: false }))).toEqual(["L-1"]);
  });

  it("sin grupo elegido y con inactivos apagado deja solo los activos de todos los grupos", () => {
    expect(ids(filtrarColaboradores(personas, { mostrarInactivos: false }))).toEqual(["T-1", "W-1"]);
  });

  it("con un grupo elegido y con inactivos apagado deja solo los activos de ese grupo", () => {
    expect(ids(filtrarColaboradores(personas, { grupo: "taller", mostrarInactivos: false }))).toEqual(["W-1"]);
  });

  it("con inactivos encendido incluye a los inactivos", () => {
    expect(ids(filtrarColaboradores(personas, { mostrarInactivos: true }))).toEqual(["T-1", "T-2", "W-1", "W-2"]);
  });

  it("combina grupo e inactivos encendido: activos e inactivos solo de ese grupo", () => {
    expect(ids(filtrarColaboradores(personas, { grupo: "taller", mostrarInactivos: true }))).toEqual(["W-1", "W-2"]);
  });
});
