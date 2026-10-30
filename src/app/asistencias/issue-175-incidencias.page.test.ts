import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), colaboradores: vi.fn(), grupos: vi.fn(), semanal: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: (ruta: string) => { throw new Error(`REDIRECT ${ruta}`); }, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/turnos/servicio", () => ({
  repositorioDeGrupos: { listarOperablesPor: simulacro.grupos },
  repositorioDeTurnos: { listarColaboradoresActivosPorEquipo: simulacro.colaboradores },
}));
vi.mock("@/asistencias/servicio", () => ({ repositorioDeAsistencias: { listarResumenSemanal: simulacro.semanal } }));
vi.mock("@/app/asistencias/actions", () => ({ registrarIncidenciaDeTienda: vi.fn() }));

async function render(searchParams: Record<string, string> = {}) {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(searchParams) }));
}

describe("G25 formulario de incidencia de tienda en Asistencias", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    simulacro.actor.mockResolvedValue({ id: "gerente-1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] });
    simulacro.grupos.mockResolvedValue(["Tiendas"]);
    simulacro.colaboradores.mockResolvedValue([{ dni: "00001024", nombre: "Ana Tienda" }]);
    simulacro.semanal.mockResolvedValue([]);
  });

  it("G25 pide persona del grupo actual, fecha, monto y motivo sin mostrar datos de Pagos", async () => {
    const html = await render({ grupo: "Tiendas", fecha: "2026-10-26" });

    expect(html).toContain("Registrar incidencia de tienda");
    expect(html).toContain('name="dni"');
    expect(html).toContain('name="fechaDelHecho"');
    expect(html).toContain('name="monto"');
    expect(html).toContain('name="motivo"');
    expect(html).toContain("Ana Tienda");
    expect(html).not.toContain("Banco de pago");
    expect(html).not.toContain("Sueldo mensual");
  });
});
