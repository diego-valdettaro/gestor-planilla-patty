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
  repositorioDeGrupos: { listarOperablesPor: listarGrupos },
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
    vi.mocked(obtenerActorActual).mockResolvedValue({ id: "admin-1", rol: "administrador" });
    listarGrupos.mockResolvedValue(["Tiendas"]);
    listarColaboradores.mockResolvedValue([{ dni: "00000011", nombre: "Ana Torres", sede: "Centro" }]);
    listarResumen.mockResolvedValue([]);
    listarResumenMensual.mockResolvedValue([]);
  });

  it("consulta el grupo elegido y muestra su matriz de siete días", async () => {
    const { default: PaginaDeAsistencias } = await import("./page");
    const html = renderToStaticMarkup(await PaginaDeAsistencias({ searchParams: Promise.resolve({ grupo: "Tiendas", semana: "2031-03-10", colaborador: "00000011" }) }));

    expect(listarColaboradores).toHaveBeenCalledWith("Tiendas");
    expect(listarResumen).toHaveBeenCalledWith(["00000011"], "2031-03-10", "2031-03-16");
    expect((html.match(/<time /g) ?? [])).toHaveLength(7);
    expect(html).toContain("Tiendas");
    expect(html).toContain("Ana Torres");
    expect(html).toContain("Confirmar por rango");
    expect(html).not.toContain("Centro");
    expect(html).toContain('href="/asistencias?vista=mensual&amp;grupo=Tiendas&amp;fecha=2031-03-10&amp;colaborador=00000011"');
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
      vista: "mensual", grupo: "Tiendas", fecha: "2031-03-12", colaborador: "00000011",
    }) }));

    expect(listarColaboradores).toHaveBeenCalledWith("Tiendas");
    expect(listarResumenMensual).toHaveBeenCalledWith("00000011", "2031-03-01", "2031-03-31");
    expect((html.match(/Asistencia del 2031-03-/g) ?? [])).toHaveLength(31);
    expect(html).toContain('href="/asistencias?vista=semanal&amp;grupo=Tiendas&amp;fecha=2031-03-12&amp;colaborador=00000011"');
    expect(html).toContain("Vista semanal");
    expect(html).toContain("Confirmar por rango");
  });
  it("usa el estado vacío compartido para un rol sin permiso de Asistencias", async () => {
    const { obtenerActorActual } = await import("@/autenticacion/sesion-del-servidor");
    vi.mocked(obtenerActorActual).mockResolvedValue({ id: "op-1", rol: "gerente_de_area" });
    const { default: PaginaDeAsistencias } = await import("./page");
    const html = renderToStaticMarkup(await PaginaDeAsistencias({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("Sin permiso");
    expect(html).toContain("gerentes de área");
  });

  it("no manda a Finanzas a Configuración cuando no hay grupos operativos", async () => {
    const { obtenerActorActual } = await import("@/autenticacion/sesion-del-servidor");
    vi.mocked(obtenerActorActual).mockResolvedValue({ id: "fin-1", rol: "finanzas" });
    listarGrupos.mockResolvedValue([]);
    const { default: PaginaDeAsistencias } = await import("./page");
    const html = renderToStaticMarkup(await PaginaDeAsistencias({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("No hay grupos operativos");
    expect(html).not.toContain('href="/configuracion"');
    expect(html).toContain("Administrador del sistema");
  });

  it("ofrece Configuración al Administrador cuando no hay grupos operativos", async () => {
    listarGrupos.mockResolvedValue([]);
    const { default: PaginaDeAsistencias } = await import("./page");
    const html = renderToStaticMarkup(await PaginaDeAsistencias({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("No hay grupos operativos");
    expect(html).toContain('href="/configuracion"');
  });

  it("pide los grupos que el actor puede ver y entrega el actor al repositorio", async () => {
    const { obtenerActorActual } = await import("@/autenticacion/sesion-del-servidor");
    const gerente = { id: "ger-1", rol: "gerente_de_area" as const, grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] };
    vi.mocked(obtenerActorActual).mockResolvedValue(gerente);
    const { default: PaginaDeAsistencias } = await import("./page");
    const html = renderToStaticMarkup(await PaginaDeAsistencias({ searchParams: Promise.resolve({ grupo: "Tiendas", semana: "2031-03-10" }) }));

    expect(listarGrupos).toHaveBeenCalledWith(gerente);
    expect(html).toContain("Confirmar por rango");
  });

  it("muestra Asistencias en solo lectura a Finanzas, sin confirmar por rango", async () => {
    const { obtenerActorActual } = await import("@/autenticacion/sesion-del-servidor");
    vi.mocked(obtenerActorActual).mockResolvedValue({ id: "fin-1", rol: "finanzas" });
    const { default: PaginaDeAsistencias } = await import("./page");
    const html = renderToStaticMarkup(await PaginaDeAsistencias({ searchParams: Promise.resolve({ grupo: "Tiendas", semana: "2031-03-10" }) }));

    expect(html).toContain("Ana Torres");
    expect(html).toContain("Importar archivo");
    expect(html).toContain("Su rol no permite registrar ni confirmar asistencias");
    expect(html).not.toContain("Confirmar por rango");
  });

  it.each([["Recursos Humanos", { id: "rrhh-1", rol: "recursos_humanos" as const }], ["un gerente que solo gestiona Administración", { id: "ger-2", rol: "gerente_de_area" as const, grupos: [{ nombre: "Administración", gestionaAsistencia: false }] }]])("rechaza a %s", async (_nombre, actor) => {
    const { obtenerActorActual } = await import("@/autenticacion/sesion-del-servidor");
    vi.mocked(obtenerActorActual).mockResolvedValue(actor);
    const { default: PaginaDeAsistencias } = await import("./page");
    const html = renderToStaticMarkup(await PaginaDeAsistencias({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("Sin permiso");
    expect(listarColaboradores).not.toHaveBeenCalled();
  });
});
