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
const listarSedesActivasPorGrupo = vi.fn();

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
    listarSedesActivasPorGrupo,
  },
}));
vi.mock("./planificador-semanal", () => ({
  PlanificadorSemanal: ({ soloLectura }: { soloLectura?: boolean }) => createElement("div", undefined, soloLectura ? "Planificador semanal de solo lectura" : "Planificador semanal editable"),
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
    listarSedesActivasPorGrupo.mockResolvedValue([]);
    obtenerOCrear.mockResolvedValue({ id: "plan-1", celdas: [] });
  });

  it("muestra la planificación sin un enlace redundante para crear horario", async () => {
    const html = await render();

    expect(html).toContain("<h1>Planificación de horarios</h1>");
    expect(html).not.toContain("Crear horario");
    expect(html).not.toContain('class="crear-horario"');
  });

  it("carga colaboradores y sedes activas por el grupo operativo", async () => {
    listarColaboradoresActivosPorEquipo.mockResolvedValue([
      { idHuellero: "HU-1", nombre: "Ana", sede: "Norte" },
    ]);
    listarSedesActivasPorGrupo.mockResolvedValue(["Norte", "Sur"]);
    listarModelosPorSede.mockResolvedValue([]);

    await render();

    expect(listarColaboradoresActivosPorEquipo).toHaveBeenCalledWith("Tiendas");
    expect(listarSedesActivasPorGrupo).toHaveBeenCalledWith("Tiendas");
    expect(listarModelosPorSede.mock.calls.map(([sede]) => sede)).toEqual(["Norte", "Sur"]);
  });

  it("permite a Finanzas consultar el horario semanal en solo lectura", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "finanzas" });

    const html = await render();

    expect(html).toContain("Planificador semanal de solo lectura");
    expect(html).toContain("Su rol no permite editarlo ni publicarlo.");
    expect(html).not.toContain("Sin permiso");
  });

  it.each(["operaciones", "administracion"])("entrega el planificador editable a %s", async (rol) => {
    obtenerActorActual.mockResolvedValue({ rol });

    const html = await render();

    expect(html).toContain("Planificador semanal editable");
  });

  it("explica con el patrón de estado vacío que no hay grupo y ofrece ir a Configuración a Operaciones", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "operaciones" });
    listarGrupos.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain('href="/configuracion"');
  });

  it("no ofrece ir a Configuración a Finanzas cuando no hay grupo", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "finanzas" });
    listarGrupos.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain('class="estado-vacio"');
    expect(html).not.toContain('href="/configuracion"');
  });

  it("muestra el estado sin permiso con el patrón compartido a un rol no autorizado", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "otro" });

    const html = await render();

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("Sin permiso");
  });
});
