import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const obtenerActorActual = vi.fn();
const obtenerOCrear = vi.fn();
const listarGrupos = vi.fn();
const listarEquiposConProcesamientosDeSemana = vi.fn();
const listarColaboradoresActivosPorEquipo = vi.fn();
const listarColaboradoresProcesadosPorSemanaYEquipo = vi.fn();
const listarPublicadosPorColaboradoresYSemana = vi.fn();
const listarProcesamientosDeSemana = vi.fn();
const listarModelosPorSede = vi.fn();

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual }));
vi.mock("@/turnos/casos-de-uso-planes-semanales", () => ({
  crearCasosDeUsoDePlanesSemanales: () => ({ obtenerOCrear }),
}));
vi.mock("@/turnos/servicio", () => ({
  repositorioDeGrupos: { listar: listarGrupos },
  repositorioDeModelosDeHorario: { listarPorSede: listarModelosPorSede },
  repositorioDeTurnos: {
    listarColaboradoresActivosPorEquipo,
    listarColaboradoresProcesadosPorSemanaYEquipo,
    listarEquiposConProcesamientosDeSemana,
    listarProcesamientosDeSemana,
    listarPublicadosPorColaboradoresYSemana,
  },
}));
vi.mock("./planificador-semanal", () => ({
  PlanificadorSemanal: () => createElement("div", undefined, "Planificador semanal"),
}));

async function render() {
  const { default: PaginaDeTurnos } = await import("./page");
  return renderToStaticMarkup(await PaginaDeTurnos({
    searchParams: Promise.resolve({ semana: "2026-09-07", equipo: "Tiendas" }),
  }));
}

describe("página de Horarios (/turnos)", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    obtenerActorActual.mockResolvedValue({ rol: "administracion" });
    listarGrupos.mockResolvedValue(["Tiendas"]);
    listarEquiposConProcesamientosDeSemana.mockResolvedValue([]);
    listarColaboradoresActivosPorEquipo.mockResolvedValue([]);
    listarColaboradoresProcesadosPorSemanaYEquipo.mockResolvedValue([]);
    listarPublicadosPorColaboradoresYSemana.mockResolvedValue([]);
    listarProcesamientosDeSemana.mockResolvedValue([]);
    obtenerOCrear.mockResolvedValue({ id: "plan-1", celdas: [] });
  });

  it("muestra la planificación sin un enlace redundante para crear horario", async () => {
    const html = await render();

    expect(html).toContain("<h1>Planificación de horarios</h1>");
    expect(html).not.toContain("Crear horario");
    expect(html).not.toContain('class="crear-horario"');
  });
});
