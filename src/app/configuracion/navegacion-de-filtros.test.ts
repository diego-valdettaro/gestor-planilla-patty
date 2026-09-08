import { describe, expect, it } from "vitest";

import { NAVEGACION_SIN_SALTO, rutaDeFiltros } from "./navegacion-de-filtros";

describe("rutaDeFiltros", () => {
  it("sin grupo y con inactivos apagado apunta a /configuracion sin parámetros", () => {
    expect(rutaDeFiltros({ mostrarInactivos: false })).toBe("/configuracion");
  });

  it("solo grupo agrega ?grupo=", () => {
    expect(rutaDeFiltros({ grupo: "taller", mostrarInactivos: false })).toBe("/configuracion?grupo=taller");
  });

  it("solo mostrar inactivos agrega ?inactivos=1", () => {
    expect(rutaDeFiltros({ mostrarInactivos: true })).toBe("/configuracion?inactivos=1");
  });

  it("combina grupo e inactivos en la misma URL", () => {
    expect(rutaDeFiltros({ grupo: "tiendas", mostrarInactivos: true })).toBe("/configuracion?grupo=tiendas&inactivos=1");
  });
});

describe("NAVEGACION_SIN_SALTO", () => {
  // Regresión #32: al aplicar un filtro la página saltaba al top como si recargara.
  // La navegación del App Router debe pedir explícitamente que no mueva el scroll.
  it("desactiva el desplazamiento automático de router.push", () => {
    expect(NAVEGACION_SIN_SALTO.scroll).toBe(false);
  });
});
