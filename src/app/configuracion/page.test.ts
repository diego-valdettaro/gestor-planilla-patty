import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const obtenerActorActual = vi.fn();
const listarGrupos = vi.fn();
const listarColaboradores = vi.fn();
const listarModelosPorSede = vi.fn();
const sedesActivas = vi.fn();

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual }));
vi.mock("@/colaboradores/servicio", () => ({ repositorioDeColaboradores: { listar: listarColaboradores } }));
vi.mock("@/turnos/servicio", () => ({
  repositorioDeGrupos: { listar: listarGrupos },
  repositorioDeModelosDeHorario: { listarPorSede: listarModelosPorSede },
}));
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: (tabla: { nombre?: unknown }) => ({
        where: () => ({ orderBy: async () => sedesActivas() }),
        orderBy: async () => [],
        __tabla: tabla,
      }),
    }),
  },
}));
vi.mock("./actions", () => ({ asignarEquipoOperativoASede: vi.fn(), cambiarGrupoDeColaboradorDeConfiguracion: vi.fn(), crearModeloHorario: vi.fn(), desactivarColaborador: vi.fn(), desactivarModeloHorario: vi.fn(), eliminarModeloHorario: vi.fn(), eliminarSede: vi.fn(), guardarColaborador: vi.fn(), guardarModeloHorario: vi.fn(), guardarPoliticaDeTardanzas: vi.fn(), guardarSede: vi.fn(), reactivarColaborador: vi.fn(), reactivarModeloHorario: vi.fn() }));
vi.mock("@/app/boton-de-accion-confirmada", () => ({ BotonDeAccionConfirmada: () => null }));
vi.mock("./filtros-de-colaboradores", () => ({ FiltrosDeColaboradores: () => null }));
vi.mock("./editor-de-grupo", () => ({ EditorDeGrupo: () => null }));
vi.mock("./creador-de-grupo", () => ({ CreadorDeGrupo: () => null }));

async function render() {
  const { default: PaginaDeConfiguracion } = await import("./page");
  return renderToStaticMarkup(await PaginaDeConfiguracion({ searchParams: Promise.resolve({}) }));
}

describe("página de Configuración", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    obtenerActorActual.mockResolvedValue({ rol: "administracion" });
    sedesActivas.mockReturnValue([{ nombre: "Norte", grupo: "Tiendas" }]);
    listarGrupos.mockResolvedValue(["Tiendas"]);
    listarColaboradores.mockResolvedValue([]);
    listarModelosPorSede.mockResolvedValue([]);
  });

  it("muestra un estado vacío con la siguiente acción cuando no hay modelos", async () => {
    const html = await render();

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("Todavía no hay modelos de horario");
    expect(html).not.toContain("está deshabilitado");
  });

  it("explica junto a cada acción por qué está deshabilitada cuando no hay sedes ni grupos", async () => {
    sedesActivas.mockReturnValue([]);
    listarGrupos.mockResolvedValue([]);

    const html = await render();

    expect(html).toMatch(/aria-describedby="motivo-crear-modelo"[^>]*disabled=""/);
    expect(html).toContain('id="motivo-crear-modelo"');
    expect(html).toContain("Crear colaborador está deshabilitado porque no hay sedes activas ni grupos.");
    expect(html).toContain("Crear sede está deshabilitado porque no hay grupos.");
    expect(html).toContain("Guardar política está deshabilitado porque no hay sedes activas.");
  });

  it("no ofrece a Operaciones acciones de Administración", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "operaciones" });

    const html = await render();

    expect(html).toContain("Crear modelo");
    expect(html).not.toContain("Crear colaborador");
    expect(html).not.toContain("Crear sede");
    expect(html).not.toContain("Guardar política");
  });

  it("muestra el estado sin permiso con el patrón compartido a Finanzas", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "finanzas" });

    const html = await render();

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("Sin permiso");
    expect(html).not.toContain("Crear modelo");
  });
});
