import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), redirigir: vi.fn() }));

// Como el real, `redirect` interrumpe la página lanzando.
simulacro.redirigir.mockImplementation((ruta: string) => { throw new Error(`REDIRECT ${ruta}`); });
vi.mock("next/navigation", () => ({ redirect: simulacro.redirigir }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

async function render() {
  const { default: Pagina } = await import("./page");
  const resultado = await Pagina();
  return resultado ? renderToStaticMarkup(resultado) : "";
}

describe("raíz de Pagos (/pagos)", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    simulacro.redirigir.mockClear();
  });

  it("lleva a Finanzas a Condiciones laborales, la única sección de Pagos por ahora", async () => {
    simulacro.actor.mockResolvedValue({ id: "fin-1", rol: "finanzas" });
    await expect(render()).rejects.toThrow("REDIRECT /pagos/condiciones-laborales");
  });

  it("sin sesión lleva a iniciar sesión", async () => {
    simulacro.actor.mockRejectedValue(new Error("La sesión no es válida."));
    await expect(render()).rejects.toThrow("REDIRECT /iniciar-sesion");
  });

  it.each([
    ["el Administrador del sistema", { id: "a", rol: "administrador" }],
    ["Recursos Humanos", { id: "r", rol: "recursos_humanos" }],
    ["un gerente de área", { id: "g", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ])("niega el acceso a %s con el estado vacío compartido", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);
    const html = await render();
    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("Sin permiso");
    expect(html).toContain("Su rol no permite consultar Pagos.");
    expect(simulacro.redirigir).not.toHaveBeenCalledWith("/pagos/condiciones-laborales");
  });
});
