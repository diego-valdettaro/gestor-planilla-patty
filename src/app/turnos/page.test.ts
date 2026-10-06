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
  repositorioDeGrupos: { listarOperablesPor: listarGrupos },
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
    obtenerActorActual.mockResolvedValue({ rol: "administrador" });
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
    expect(html).toContain("modelo de horario en el horario semanal de cada persona del grupo");
    expect(html).not.toContain("Crear horario");
    expect(html).not.toContain('class="crear-horario"');
  });

  it("carga colaboradores y sedes activas por el grupo operativo", async () => {
    listarColaboradoresActivosPorEquipo.mockResolvedValue([
      { dni: "00000011", nombre: "Ana", sede: "Norte" },
    ]);
    listarSedesActivasPorGrupo.mockResolvedValue(["Norte", "Sur"]);
    listarModelosPorSede.mockResolvedValue([]);

    await render();

    expect(listarColaboradoresActivosPorEquipo).toHaveBeenCalledWith("Tiendas");
    expect(listarSedesActivasPorGrupo).toHaveBeenCalledWith("Tiendas");
    expect(listarModelosPorSede.mock.calls.map(([sede]) => sede)).toEqual(["Norte", "Sur"]);
  });

  it.each([["Finanzas", { rol: "finanzas" }], ["Recursos Humanos", { rol: "recursos_humanos" }], ["un gerente sin grupos", { rol: "gerente_de_area", grupos: [] }], ["un gerente de un grupo que no gestiona asistencia", { rol: "gerente_de_area", grupos: [{ nombre: "Administración", gestionaAsistencia: false }] }]])("niega Horarios a %s", async (_nombre, actor) => {
    obtenerActorActual.mockResolvedValue(actor);

    const html = await render();

    expect(html).toContain("Sin permiso");
    expect(html).not.toContain("Planificador semanal");
    expect(obtenerOCrear).not.toHaveBeenCalled();
  });

  it.each([["administrador", { rol: "administrador" }], ["un gerente del grupo", { rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }]])("entrega el planificador editable a %s", async (_nombre, actor) => {
    obtenerActorActual.mockResolvedValue(actor);

    const html = await render();

    expect(html).toContain("Planificador semanal editable");
    expect(listarGrupos).toHaveBeenCalledWith(actor);
  });

  it("no manda al gerente a Configuración cuando no hay grupo operativo disponible", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] });
    listarGrupos.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("No hay grupos operativos");
    expect(html).toContain("Pida al Administrador del sistema");
    expect(html).not.toContain("/configuracion");
    expect(html).not.toContain("Planificador semanal");
  });

  it("ofrece Configuración al Administrador cuando no hay grupo", async () => {
    listarGrupos.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("No hay grupos operativos");
    expect(html).toContain('href="/configuracion"');
  });

  it("usa el estado vacío compartido para un rol sin permiso de Horarios", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "otro" });

    const html = await render();

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("Sin permiso");
    expect(html).toContain("Su rol no permite consultar Horarios");
  });
});
