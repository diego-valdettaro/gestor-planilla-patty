import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), preparar: vi.fn(), redirigir: vi.fn(), noEncontrado: vi.fn() }));
simulacro.redirigir.mockImplementation((ruta: string) => { throw new Error(`REDIRECT ${ruta}`); });
simulacro.noEncontrado.mockImplementation(() => { throw new Error("NOT FOUND"); });
vi.mock("next/navigation", () => ({ redirect: simulacro.redirigir, notFound: simulacro.noEncontrado }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/pagos/preparar-borrador", () => ({ prepararBorrador: simulacro.preparar }));

async function render(dni = "12345678") {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ mes: "2026-10", dni }) }));
}

describe("desglose de una persona", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    simulacro.actor.mockResolvedValue({ id: "f", rol: "finanzas" });
    simulacro.preparar.mockClear();
    simulacro.preparar.mockResolvedValue({ corte: { inicio: "2026-09-26", fin: "2026-10-25" }, personas: [
      { relacion: { id: "r1", dni: "12345678", nombre: "Ana", grupo: "Taller", ingreso: "2026-10-01", cese: null, ceseConfirmado: false },
        sueldoCalculadoCentimos: 100000, netoCentimos: null, bloqueos: ["Sin jornada ordinaria diaria vigente el 2026-10-25."],
        lineas: [{ concepto: "sueldo_basico", importeCentimos: 100000, dias: 30, sueldoMensualCentimos: 100000,
          desde: "2026-10-01", hasta: "2026-10-31", mesDeDevengue: "2026-10", mesDePago: "2026-10",
          corte: { inicio: "2026-09-26", fin: "2026-10-25" }, origen: "Condición laboral" }] },
    ] });
  });

  it("muestra los tres tiempos y la base de la línea, con bloqueo enlazado", async () => {
    const html = await render();
    expect(html).toContain("Mes de devengue");
    expect(html).toContain("Mes de pago");
    expect(html).toContain("Corte de incidencias");
    expect(html).toContain("divisor 30");
    expect(html).toContain("role=\"status\"");
    expect(html).toContain("/pagos/condiciones-laborales/r1");
    expect(html).toContain("Incompleto");
  });

  it("niega el detalle monetario a Recursos Humanos", async () => {
    simulacro.actor.mockResolvedValue({ id: "r", rol: "recursos_humanos" });
    expect(await render()).toContain("Sin permiso");
    expect(simulacro.preparar).not.toHaveBeenCalled();
  });

  it("no expone una persona fuera del mes", async () => {
    await expect(render("87654321")).rejects.toThrow("NOT FOUND");
  });
});
