import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const obtenerActorActual = vi.fn();
const listarGruposConAtributos = vi.fn();
const listarColaboradores = vi.fn();
const GERENTE_DE_TIENDAS = { rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] };

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual }));
vi.mock("@/colaboradores/servicio", () => ({ repositorioDeColaboradores: { listar: listarColaboradores } }));
vi.mock("@/turnos/servicio", () => ({ repositorioDeGrupos: { listarConAtributos: listarGruposConAtributos } }));
vi.mock("@/app/boton-de-accion-confirmada", () => ({ BotonDeAccionConfirmada: () => createElement("button") }));
vi.mock("../configuracion/actions", () => ({ cambiarGrupoDeColaboradorDeConfiguracion: vi.fn(), desactivarColaborador: vi.fn(), guardarColaborador: vi.fn(), reactivarColaborador: vi.fn() }));
vi.mock("../configuracion/editor-de-grupo", () => ({ EditorDeGrupo: () => createElement("div", undefined, "Cambiar grupo") }));
vi.mock("./filtros-de-colaboradores", () => ({ FiltrosDeColaboradores: () => createElement("div") }));

async function render(searchParams: Record<string, string> = {}) {
  const { default: PaginaDePersonal } = await import("./page");
  return renderToStaticMarkup(await PaginaDePersonal({ searchParams: Promise.resolve(searchParams) }));
}

describe("página de Personal (/personal)", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    obtenerActorActual.mockResolvedValue({ rol: "administrador" });
    listarGruposConAtributos.mockResolvedValue([{ nombre: "Tiendas", gestionaAsistencia: true }, { nombre: "Taller", gestionaAsistencia: true }]);
    listarColaboradores.mockResolvedValue([
      { dni: "00000001", nombre: "Ana Tienda", sede: "Norte", grupo: "Tiendas", activo: true },
      { dni: "00000002", nombre: "Beto Taller", sede: "Taller", grupo: "Taller", activo: true },
    ]);
  });

  it("el Administrador ve a todos los colaboradores, las acciones de grupo y las dos pestañas", async () => {
    const html = await render();

    expect(html).toContain("<h1>Personal</h1>");
    expect(html).toContain("Ana Tienda");
    expect(html).toContain("Beto Taller");
    expect(html).toContain("Cambiar grupo");
    expect(html).toMatch(/aria-current="page"[^>]*>Colaboradores<\/a>/);
    expect(html).toContain('href="/relaciones-laborales"');
  });

  it("G20 permite alta sin sede fija cuando el grupo existe", async () => {
    const html = await render();
    const formularioDeAlta = html.slice(html.indexOf("<h2>Colaboradores</h2>")).match(/<form[^>]*>.*?<\/form>/s)?.[0] ?? "";

    expect(formularioDeAlta).toContain('name="dni"');
    expect(formularioDeAlta).toContain('name="nombre"');
    expect(formularioDeAlta).toContain('name="grupo"');
    expect(formularioDeAlta).not.toContain('name="sede"');
    expect(formularioDeAlta).not.toMatch(/<button[^>]*disabled=/);
  });

  it("el gerente solo ve los colaboradores de sus grupos, sin acciones de grupo ni pestaña de relaciones laborales", async () => {
    obtenerActorActual.mockResolvedValue(GERENTE_DE_TIENDAS);

    const html = await render();

    expect(html).toContain("Ana Tienda");
    expect(html).not.toContain("Beto Taller");
    expect(html).not.toContain("Cambiar grupo");
    expect(html).not.toContain("Secciones de personal");
  });

  it("el alta ofrece al gerente solo sus grupos y preselecciona el único que tiene", async () => {
    obtenerActorActual.mockResolvedValue(GERENTE_DE_TIENDAS);

    const selector = (await render()).match(/<label>Grupo<select[^>]*name="grupo"[^>]*>.*?<\/select>/s)?.[0] ?? "";

    expect(selector).toContain('value="Tiendas" selected');
    expect(selector).not.toContain("Taller");
  });

  it("el alta no preselecciona grupo cuando el gerente tiene varios", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }, { nombre: "Taller", gestionaAsistencia: true }] });

    const selector = (await render()).match(/<label>Grupo<select[^>]*name="grupo"[^>]*>.*?<\/select>/s)?.[0] ?? "";

    expect(selector).not.toMatch(/value="(Tiendas|Taller)"[^>]*selected|selected[^>]*value="(Tiendas|Taller)"/);
    expect(selector).toContain("Tiendas");
    expect(selector).toContain("Taller");
  });

  it("distingue un filtro sin coincidencias de la ausencia total de colaboradores", async () => {
    listarGruposConAtributos.mockResolvedValue([{ nombre: "Tiendas", gestionaAsistencia: true }, { nombre: "Bodega", gestionaAsistencia: true }]);

    const html = await render({ grupo: "Bodega" });

    expect(html).toContain("Ningún colaborador coincide con el filtro");
    expect(html).not.toContain("<table");
  });

  it("sin grupos explica con el estado vacío que hay que crear uno en Configuración", async () => {
    listarGruposConAtributos.mockResolvedValue([]);
    listarColaboradores.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("No hay colaboradores");
    expect(html).toContain("créelo en Configuración");
    expect(html).toContain("Crear colaborador está deshabilitado porque no hay grupos. Cree un grupo primero.");
  });

  it.each([["Recursos Humanos", { rol: "recursos_humanos" }], ["Finanzas", { rol: "finanzas" }]])("lleva a %s a Relaciones laborales, lo único de Personal que consulta", async (_nombre, actor) => {
    obtenerActorActual.mockResolvedValue(actor);
    vi.mocked(redirect).mockImplementationOnce(() => { throw new Error("NEXT_REDIRECT"); });

    await expect(render()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/relaciones-laborales");
  });

  it.each([["gerente sin grupos", { rol: "gerente_de_area", grupos: [] }]])("rechaza con estado vacío a %s", async (_nombre, actor) => {
    obtenerActorActual.mockResolvedValue(actor);

    const html = await render();

    expect(html).toContain("Sin permiso");
    expect(html).not.toContain("Crear colaborador");
  });
});
