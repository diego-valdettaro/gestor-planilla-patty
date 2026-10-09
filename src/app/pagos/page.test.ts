import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), redirigir: vi.fn() }));
const meses = vi.hoisted(() => ({ listar: vi.fn(), preparar: vi.fn() }));

// Como el real, `redirect` interrumpe la página lanzando.
simulacro.redirigir.mockImplementation((ruta: string) => { throw new Error(`REDIRECT ${ruta}`); });
vi.mock("next/navigation", () => ({ redirect: simulacro.redirigir }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/pagos/preparar-borrador", () => ({ listarMesesDePago: meses.listar, prepararBorrador: meses.preparar }));

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
    meses.listar.mockClear();
    meses.preparar.mockClear();
    meses.listar.mockResolvedValue(["2026-10"]);
    meses.preparar.mockResolvedValue({ mesDePago: "2026-10", corte: { inicio: "2026-09-26", fin: "2026-10-25" }, personas: [
      { relacion: { id: "r1", dni: "12345678", nombre: "Ana" }, bloqueos: [] },
    ], bloqueosDelMes: [] });
  });

  it("muestra la lista de meses a Finanzas", async () => {
    simulacro.actor.mockResolvedValue({ id: "fin-1", rol: "finanzas" });
    const html = await render();
    expect(html).toContain("Meses de pago");
    expect(html).toContain('href="/pagos/2026-10"');
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
    expect(meses.listar).not.toHaveBeenCalled();
  });
});
