import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), preparar: vi.fn(), redirigir: vi.fn(), noEncontrado: vi.fn() }));
simulacro.redirigir.mockImplementation((ruta: string) => { throw new Error(`REDIRECT ${ruta}`); });
simulacro.noEncontrado.mockImplementation(() => { throw new Error("NOT FOUND"); });
vi.mock("next/navigation", () => ({ redirect: simulacro.redirigir, notFound: simulacro.noEncontrado }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/pagos/preparar-borrador", () => ({ prepararBorrador: simulacro.preparar }));

async function render(mes = "2026-10", searchParams = {}) {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ mes }), searchParams: Promise.resolve(searchParams) }));
}

describe("mes de pago", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    simulacro.actor.mockResolvedValue({ id: "f", rol: "finanzas" });
    simulacro.preparar.mockClear();
    simulacro.preparar.mockResolvedValue({ mesDePago: "2026-10", corte: { inicio: "2026-09-26", fin: "2026-10-25" }, revisiones: [],
      bloqueosDelMes: ["Falta cobertura del corte."], sueldoCalculadoCentimos: 100000, personas: [
        { relacion: { id: "r1", dni: "12345678", nombre: "Ana", grupo: "Taller" }, sedeDeAdscripcion: "Taller", sueldoCalculadoCentimos: 100000, netoCentimos: null, bloqueos: [] },
      ] });
  });

  it("muestra bloqueos, población, importe calculado y neto incompleto", async () => {
    const html = await render();
    expect(html).toContain("Falta cobertura del corte");
    expect(html).toContain("Ana");
    expect(html).toContain("S/ 1.000,00");
    expect(html).toContain("Incompleto");
    expect(html).toContain("Sede de adscripción");
    expect(html).toContain("Totales del mes completo");
    expect(html).toContain("Por sede de adscripción");
  });

  it("filtra por sede sin cambiar el total del mes", async () => {
    const html = await render("2026-10", { sede: "Otra" });
    expect(html).not.toContain('href="/pagos/2026-10/12345678"');
    expect(html).toContain("S/ 1.000,00");
  });

  it("rechaza otros roles antes de consultar importes", async () => {
    simulacro.actor.mockResolvedValue({ id: "a", rol: "administrador" });
    expect(await render()).toContain("Sin permiso");
    expect(simulacro.preparar).not.toHaveBeenCalled();
  });

  it("rechaza un mes inválido", async () => {
    await expect(render("2026-13")).rejects.toThrow("NOT FOUND");
  });
});
