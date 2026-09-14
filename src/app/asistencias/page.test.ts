import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listarGrupos, listarColaboradores, listarResumen, listarResumenMensual } = vi.hoisted(() => ({
  listarGrupos: vi.fn(),
  listarColaboradores: vi.fn(),
  listarResumen: vi.fn(),
  listarResumenMensual: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: vi.fn() }));
vi.mock("@/turnos/servicio", () => ({
  repositorioDeGrupos: { listar: listarGrupos },
  repositorioDeTurnos: { listarColaboradoresActivosPorEquipo: listarColaboradores },
}));
vi.mock("@/asistencias/servicio", () => ({ repositorioDeAsistencias: {
  listarResumenSemanal: listarResumen,
  listarResumenMensual,
} }));

describe("página semanal de asistencias", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { obtenerActorActual } = await import("@/autenticacion/sesion-del-servidor");
    vi.mocked(obtenerActorActual).mockResolvedValue({ id: "admin-1", rol: "administracion" });
    listarGrupos.mockResolvedValue(["Tiendas"]);
    listarColaboradores.mockResolvedValue([{ idHuellero: "HU-1", nombre: "Ana Torres", sede: "Centro" }]);
    listarResumen.mockResolvedValue([]);
    listarResumenMensual.mockResolvedValue([]);
  });

  it("consulta el grupo elegido y muestra su matriz de siete días", async () => {
    const { default: PaginaDeAsistencias } = await import("./page");
    const html = renderToStaticMarkup(await PaginaDeAsistencias({ searchParams: Promise.resolve({ grupo: "Tiendas", semana: "2031-03-10", colaborador: "HU-1" }) }));

    expect(listarColaboradores).toHaveBeenCalledWith("Tiendas");
    expect(listarResumen).toHaveBeenCalledWith(["HU-1"], "2031-03-10", "2031-03-16");
    expect((html.match(/<time /g) ?? [])).toHaveLength(7);
    expect(html).toContain("Tiendas");
    expect(html).toContain("Ana Torres");
    expect(html).not.toContain("Centro");
    expect(html).toContain('href="/asistencias?vista=mensual&amp;grupo=Tiendas&amp;fecha=2031-03-10&amp;colaborador=HU-1"');
  }, 15_000);

  it("muestra un estado vacío mensual cuando el grupo no tiene colaboradores activos", async () => {
    listarColaboradores.mockResolvedValue([]);
    const { default: PaginaDeAsistencias } = await import("./page");
    const html = renderToStaticMarkup(await PaginaDeAsistencias({ searchParams: Promise.resolve({
      vista: "mensual", grupo: "Tiendas", fecha: "2031-03-12",
    }) }));

    expect(html).toContain("No hay colaboradores activos");
    expect(html).toContain('select disabled="" name="colaborador"');
    expect(html).not.toContain("<table");
  });

  it("muestra el mes completo de un colaborador y conserva su contexto para volver a la semana", async () => {
    const { default: PaginaDeAsistencias } = await import("./page");
    const html = renderToStaticMarkup(await PaginaDeAsistencias({ searchParams: Promise.resolve({
      vista: "mensual", grupo: "Tiendas", fecha: "2031-03-12", colaborador: "HU-1",
    }) }));

    expect(listarColaboradores).toHaveBeenCalledWith("Tiendas");
    expect(listarResumenMensual).toHaveBeenCalledWith("HU-1", "2031-03-01", "2031-03-31");
    expect((html.match(/Asistencia del 2031-03-/g) ?? [])).toHaveLength(31);
    expect(html).toContain('href="/asistencias?vista=semanal&amp;grupo=Tiendas&amp;fecha=2031-03-12&amp;colaborador=HU-1"');
    expect(html).toContain("Vista semanal");
  });
});
