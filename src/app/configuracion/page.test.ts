import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const obtenerActorActual = vi.fn();
const listarGrupos = vi.fn();
const listarColaboradores = vi.fn();
const listarModelosPorSede = vi.fn();
const filasDeSedes = vi.fn();

function consulta(filas: () => unknown) {
  const cadena: Record<string, unknown> = {};
  cadena.from = () => cadena;
  cadena.where = () => cadena;
  cadena.orderBy = () => Promise.resolve(filas());
  return cadena;
}

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual }));
vi.mock("@/db/client", () => ({ db: { select: () => consulta(() => filasDeSedes()) } }));
vi.mock("@/colaboradores/servicio", () => ({ repositorioDeColaboradores: { listar: listarColaboradores } }));
vi.mock("@/turnos/servicio", () => ({
  repositorioDeGrupos: { listar: listarGrupos },
  repositorioDeModelosDeHorario: { listarPorSede: listarModelosPorSede },
}));
vi.mock("@/app/boton-de-accion-confirmada", () => ({ BotonDeAccionConfirmada: () => createElement("button") }));
vi.mock("./actions", () => ({ asignarEquipoOperativoASede: vi.fn(), cambiarGrupoDeColaboradorDeConfiguracion: vi.fn(), crearModeloHorario: vi.fn(), desactivarColaborador: vi.fn(), desactivarModeloHorario: vi.fn(), eliminarModeloHorario: vi.fn(), eliminarSede: vi.fn(), guardarColaborador: vi.fn(), guardarModeloHorario: vi.fn(), guardarPoliticaDeTardanzas: vi.fn(), guardarSede: vi.fn(), reactivarColaborador: vi.fn(), reactivarModeloHorario: vi.fn() }));
vi.mock("./filtros-de-colaboradores", () => ({ FiltrosDeColaboradores: () => createElement("div") }));
vi.mock("./editor-de-grupo", () => ({ EditorDeGrupo: () => createElement("div") }));
vi.mock("./creador-de-grupo", () => ({ CreadorDeGrupo: () => createElement("div") }));

async function render(searchParams: Record<string, string> = {}) {
  const { default: PaginaDeConfiguracion } = await import("./page");
  return renderToStaticMarkup(await PaginaDeConfiguracion({ searchParams: Promise.resolve(searchParams) }));
}

describe("página de Configuración (/configuracion)", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    obtenerActorActual.mockResolvedValue({ rol: "administracion" });
    filasDeSedes.mockReturnValue([]);
    listarGrupos.mockResolvedValue([]);
    listarColaboradores.mockResolvedValue([]);
    listarModelosPorSede.mockResolvedValue([]);
  });

  it("no explica acciones deshabilitadas cuando hay sedes y grupos", async () => {
    filasDeSedes.mockReturnValue([{ nombre: "Norte", grupo: "Tiendas" }]);
    listarGrupos.mockResolvedValue(["Tiendas"]);

    const html = await render();

    expect(html).not.toContain("está deshabilitado");
  });

  it("explica junto a cada acción por qué está deshabilitada cuando no hay sedes ni grupos", async () => {
    const html = await render();

    expect(html).toMatch(/aria-describedby="motivo-crear-modelo"[^>]*disabled=""/);
    expect(html).toContain('id="motivo-crear-modelo"');
    expect(html).toContain("Crear colaborador está deshabilitado porque no hay sedes activas ni grupos.");
    expect(html).toContain("Crear sede está deshabilitado porque no hay grupos.");
    expect(html).toContain("Guardar política está deshabilitado porque no hay sedes activas.");
  });

  it("no ofrece a Operaciones acciones de Administración", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "operaciones" });
    filasDeSedes.mockReturnValue([{ nombre: "Norte", grupo: "Tiendas" }]);
    listarGrupos.mockResolvedValue(["Tiendas"]);

    const html = await render();

    expect(html).toContain("Crear modelo");
    expect(html).not.toContain("Crear colaborador");
    expect(html).not.toContain("Crear sede");
    expect(html).not.toContain("Guardar política");
  });

  it("explica con el estado vacío compartido que Finanzas no puede cambiar la configuración", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "finanzas" });

    const html = await render();

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("Sin permiso");
    expect(html).not.toContain("Crear modelo");
  });

  it("sin sedes, Administración ve estados vacíos de modelos, sedes y colaboradores con su siguiente paso", async () => {
    const html = await render();

    expect((html.match(/class="estado-vacio"/g) ?? [])).toHaveLength(3);
    expect(html).toContain("No hay modelos de horario");
    expect(html).toContain("No hay sedes activas");
    expect(html).toContain("No hay colaboradores");
    expect(html).toContain("Cree una sede");
    expect(html).not.toContain("Todavía no hay modelos de horario.");
  });

  it("con sedes y sin modelos, indica crear el primer modelo con el formulario", async () => {
    filasDeSedes.mockReturnValue([{ nombre: "Centro", grupo: "Tiendas" }]);
    listarGrupos.mockResolvedValue(["Tiendas"]);

    const html = await render();

    expect(html).toContain("No hay modelos de horario");
    expect(html).toContain("Cree el primer modelo con el formulario de arriba");
    expect(html).not.toContain("No hay sedes activas");
  });

  it("sin sedes, no pide a Operaciones crear una sede que no puede administrar", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "operaciones" });

    const html = await render();

    expect(html).toContain("No hay modelos de horario");
    expect(html).toContain("Pida a Administración");
    expect(html).not.toContain("Cree una sede");
    expect(html).not.toContain("No hay sedes activas");
    expect(html).not.toContain("No hay colaboradores");
  });

  it("distingue un filtro sin coincidencias de la ausencia total de colaboradores", async () => {
    filasDeSedes.mockReturnValue([{ nombre: "Centro", grupo: "Tiendas" }]);
    listarGrupos.mockResolvedValue(["Tiendas", "Bodega"]);
    listarColaboradores.mockResolvedValue([
      { idHuellero: "H-1", nombre: "Ana", sede: "Centro", grupo: "Tiendas", activo: true },
    ]);

    const html = await render({ grupo: "Bodega" });

    expect(html).toContain("Ningún colaborador coincide con el filtro");
    expect(html).not.toContain("No hay colaboradores.");
    expect(html).not.toContain("<table");
  });
});
