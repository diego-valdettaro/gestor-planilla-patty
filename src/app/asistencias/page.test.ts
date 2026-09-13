import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listarGrupos, listarColaboradores, listarResumen } = vi.hoisted(() => ({
  listarGrupos: vi.fn(),
  listarColaboradores: vi.fn(),
  listarResumen: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: vi.fn() }));
vi.mock("@/turnos/servicio", () => ({
  repositorioDeGrupos: { listar: listarGrupos },
  repositorioDeTurnos: { listarColaboradoresActivosPorEquipo: listarColaboradores },
}));
vi.mock("@/asistencias/servicio", () => ({ repositorioDeAsistencias: { listarResumenSemanal: listarResumen } }));

describe("página semanal de asistencias", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { obtenerActorActual } = await import("@/autenticacion/sesion-del-servidor");
    vi.mocked(obtenerActorActual).mockResolvedValue({ id: "admin-1", rol: "administracion" });
    listarGrupos.mockResolvedValue(["Tiendas"]);
    listarColaboradores.mockResolvedValue([{ idHuellero: "HU-1", nombre: "Ana Torres", sede: "Centro" }]);
    listarResumen.mockResolvedValue([]);
  });

  it("consulta el grupo elegido y muestra su matriz de siete días", async () => {
    const { default: PaginaDeAsistencias } = await import("./page");
    const html = renderToStaticMarkup(await PaginaDeAsistencias({ searchParams: Promise.resolve({ grupo: "Tiendas", semana: "2031-03-10" }) }));

    expect(listarColaboradores).toHaveBeenCalledWith("Tiendas");
    expect(listarResumen).toHaveBeenCalledWith(["HU-1"], "2031-03-10", "2031-03-16");
    expect((html.match(/<time /g) ?? [])).toHaveLength(7);
    expect(html).toContain("Tiendas");
    expect(html).toContain("Ana Torres");
    expect(html).not.toContain("Centro");
  });
});
