import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const obtenerActorActual = vi.fn();
const listar = vi.fn();
const listarResumen = vi.fn();
const listarSedesConColaboradoresActivos = vi.fn();
const listarColaboradoresActivos = vi.fn();

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual }));
vi.mock("@/periodos/servicio", () => ({ repositorioDePeriodos: { listar, listarResumen } }));
vi.mock("@/turnos/servicio", () => ({
  repositorioDeTurnos: { listarSedesConColaboradoresActivos, listarColaboradoresActivos },
}));
vi.mock("@/app/boton-de-accion-confirmada", () => ({
  BotonDeAccionConfirmada: ({ etiqueta }: { etiqueta: string }) => createElement("button", undefined, etiqueta),
}));
vi.mock("./actions", () => ({
  cerrarPeriodoDesdeFormulario: vi.fn(),
  reabrirPeriodoDesdeFormulario: vi.fn(),
  crearPeriodoDesdeFormulario: vi.fn(),
}));
vi.mock("./creador-de-periodo", () => ({
  CreadorDePeriodo: ({ sugerencia }: { sugerencia: { inicio: string; fin: string } }) =>
    createElement("p", { "data-testid": "creador-de-periodo" }, `${sugerencia.inicio} a ${sugerencia.fin}`),
}));

async function render(searchParams: Record<string, string> = {}) {
  const { default: PaginaDePeriodos } = await import("./page");
  return renderToStaticMarkup(await PaginaDePeriodos({ searchParams: Promise.resolve(searchParams) }));
}

describe("página de Liquidaciones (/periodos)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerActorActual.mockResolvedValue({ rol: "finanzas" });
    listarSedesConColaboradoresActivos.mockResolvedValue(["Centro"]);
    listarColaboradoresActivos.mockResolvedValue([{ idHuellero: "H-1", nombre: "Ana" }]);
    listarResumen.mockResolvedValue([]);
  });

  it("usa el encabezado de página compartido con el h1 'Liquidaciones'", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);

    const html = await render();

    expect(html).toContain('class="encabezado encabezado-pagina"');
    expect(html).toContain('class="eyebrow"');
    expect(html).toContain("<h1>Liquidaciones</h1>");
    expect(html).not.toContain("Resumen del período");
  });

  it("conserva el filtro GET con botón Filtrar y el enlace de exportación XLSX", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);

    const html = await render({ sede: "Centro" });

    expect(html).toContain('method="get"');
    expect(html).toContain("Filtrar</button>");
    expect(html).toContain("/api/periodos/p1/exportar?sede=Centro");
    expect(html).toContain('class="insignia ok"');
    expect(html).toContain("Abierto");
  });

  it("muestra el formulario de reapertura y la insignia neutra cuando el período está cerrado", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "cerrado" }]);

    const html = await render();

    expect(html).toContain("Motivo de reapertura");
    expect(html).toContain("Reabrir período</button>");
    expect(html).toContain('class="insignia neutro"');
    expect(html).toContain("Cerrado");
  });

  it("mantiene el estado vacío cuando no hay períodos", async () => {
    listar.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("No hay períodos de planilla");
  });

  it("muestra el formulario para crear un período, incluso sin períodos previos", async () => {
    listar.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain('data-testid="creador-de-periodo"');
  });

  it("oculta los controles de cierre y reapertura para Administración", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "administracion" });
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);

    const html = await render();

    expect(html).not.toContain("Cerrar período");
  });

  it("oculta el formulario de reapertura para Administración cuando el período está cerrado", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "administracion" });
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "cerrado" }]);

    const html = await render();

    expect(html).not.toContain("Motivo de reapertura");
    expect(html).not.toContain("Reabrir período");
  });

  it("niega el acceso a Operaciones", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "operaciones" });

    const html = await render();

    expect(html).toContain("Sin permiso");
  });
});
