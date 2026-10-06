import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const obtenerActorActual = vi.fn();
const listarCuentas = vi.fn();
const listarGruposConGerente = vi.fn();

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual }));
vi.mock("@/autenticacion/servicio", () => ({ repositorioDeCuentas: { listarCuentas, listarGruposConGerente } }));
vi.mock("@/app/boton-de-accion-confirmada", () => ({ BotonDeAccionConfirmada: ({ etiqueta }: { etiqueta: string }) => createElement("button", undefined, etiqueta) }));
vi.mock("./actions", () => ({ quitarGerenteDesdeFormulario: vi.fn() }));
vi.mock("./formulario-de-cuenta", () => ({ FormularioDeCuenta: ({ roles }: { roles: string[] }) => createElement("output", undefined, `roles:${roles.join(",")}`) }));
vi.mock("./asignador-de-gerente", () => ({ AsignadorDeGerente: ({ grupo }: { grupo: string }) => createElement("output", undefined, `asignar:${grupo}`) }));

async function render() {
  const { default: PaginaDeCuentas } = await import("./page");
  return renderToStaticMarkup(await PaginaDeCuentas());
}

describe("página de Cuentas (/cuentas)", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    listarCuentas.mockResolvedValue([
      { id: "g1", nombreUsuario: "gerente-1", rol: "gerente_de_area", grupos: ["Tiendas"] },
      { id: "g2", nombreUsuario: "gerente-2", rol: "gerente_de_area", grupos: [] },
      { id: "f1", nombreUsuario: "fin-1", rol: "finanzas", grupos: [] },
    ]);
    listarGruposConGerente.mockResolvedValue([
      { nombre: "Tiendas", gestionaAsistencia: true, gerenteId: "g1" },
      { nombre: "Administración", gestionaAsistencia: false, gerenteId: null },
    ]);
  });

  it("Finanzas solo puede crear gerentes de área y Recursos Humanos, y ve gerentes por grupo", async () => {
    obtenerActorActual.mockResolvedValue({ id: "f1", rol: "finanzas" });

    const html = await render();

    expect(html).toContain("roles:gerente_de_area,recursos_humanos");
    expect(html).toContain("Gerentes por grupo");
    expect(html).toContain("1 de 2 grupos con gerente");
    expect(html).toContain("Quitar gerente");
    expect(html).toContain("asignar:Administración");
    expect(html).toContain("No gestiona asistencia");
    expect(html).toContain("Sin grupos");
  });

  it("el Administrador puede crear cuentas de los cuatro roles", async () => {
    obtenerActorActual.mockResolvedValue({ id: "a1", rol: "administrador" });

    const html = await render();

    expect(html).toContain("roles:administrador,gerente_de_area,recursos_humanos,finanzas");
  });

  it.each([
    ["un gerente de área", { id: "g1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
    ["Recursos Humanos", { id: "r1", rol: "recursos_humanos" }],
  ])("niega el acceso a %s con el estado vacío compartido", async (_nombre, actor) => {
    obtenerActorActual.mockResolvedValue(actor);

    const html = await render();

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("Sin permiso");
    expect(listarCuentas).not.toHaveBeenCalled();
  });

  it("sin cuentas de gerente explica el siguiente paso en vez de ofrecer una asignación imposible", async () => {
    obtenerActorActual.mockResolvedValue({ id: "f1", rol: "finanzas" });
    listarCuentas.mockResolvedValue([{ id: "f1", nombreUsuario: "fin-1", rol: "finanzas", grupos: [] }]);
    listarGruposConGerente.mockResolvedValue([{ nombre: "Tiendas", gestionaAsistencia: true, gerenteId: null }]);

    const html = await render();

    expect(html).toContain("Cree primero una cuenta de gerente de área");
    expect(html).not.toContain("asignar:Tiendas");
  });

  it("sin grupos, Finanzas no recibe un enlace a Configuración que no puede usar", async () => {
    obtenerActorActual.mockResolvedValue({ id: "f1", rol: "finanzas" });
    listarGruposConGerente.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("No hay grupos");
    expect(html).toContain("Pida al Administrador del sistema");
    expect(html).not.toContain('href="/configuracion"');
  });

  it("sin grupos, el Administrador sí recibe el enlace a Configuración", async () => {
    obtenerActorActual.mockResolvedValue({ id: "a1", rol: "administrador" });
    listarGruposConGerente.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain('href="/configuracion"');
  });
});
