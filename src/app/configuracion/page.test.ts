import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const obtenerActorActual = vi.fn();
const listarGrupos = vi.fn();
const listarColaboradores = vi.fn();
const listarModelosPorSede = vi.fn();
const filasDeSedes = vi.fn();
const GERENTE_DE_TIENDAS = { rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] };

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
  repositorioDeGrupos: { listarConAtributos: async () => ((await listarGrupos()) as string[]).map((nombre) => ({ nombre, gestionaAsistencia: true })) },
  repositorioDeModelosDeHorario: { listarPorSede: listarModelosPorSede },
}));
vi.mock("@/app/boton-de-accion-confirmada", () => ({ BotonDeAccionConfirmada: () => createElement("button") }));
vi.mock("./actions", () => ({ asignarEquipoOperativoASede: vi.fn(), cambiarGrupoDeColaboradorDeConfiguracion: vi.fn(), crearModeloHorario: vi.fn(), desactivarColaborador: vi.fn(), desactivarModeloHorario: vi.fn(), eliminarModeloHorario: vi.fn(), eliminarSede: vi.fn(), guardarColaborador: vi.fn(), guardarModeloHorario: vi.fn(), guardarPoliticaDeTardanzas: vi.fn(), guardarGestionDeAsistenciaDelGrupo: vi.fn(), guardarSede: vi.fn(), reactivarColaborador: vi.fn(), reactivarModeloHorario: vi.fn() }));
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
    obtenerActorActual.mockResolvedValue({ rol: "administrador" });
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

  it("al gerente de área le ofrece modelos y colaboradores de sus grupos, sin acciones globales", async () => {
    obtenerActorActual.mockResolvedValue(GERENTE_DE_TIENDAS);
    filasDeSedes.mockReturnValue([{ nombre: "Norte", grupo: "Tiendas" }]);
    listarGrupos.mockResolvedValue(["Tiendas"]);

    const html = await render();

    expect(html).toContain("Crear modelo");
    expect(html).toContain("Crear colaborador");
    expect(html).not.toContain("Crear sede");
    expect(html).not.toContain("Guardar política");
    expect(html).not.toContain("Grupos operativos");
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

  it("sin sedes, no pide al gerente crear una sede que no puede administrar", async () => {
    obtenerActorActual.mockResolvedValue(GERENTE_DE_TIENDAS);

    const html = await render();

    expect(html).toContain("No hay modelos de horario");
    expect(html).toContain("Pida al Administrador del sistema");
    expect(html).not.toContain("Cree una sede");
    expect(html).not.toContain("No hay sedes activas");
  });

  it("distingue un filtro sin coincidencias de la ausencia total de colaboradores", async () => {
    filasDeSedes.mockReturnValue([{ nombre: "Centro", grupo: "Tiendas" }]);
    listarGrupos.mockResolvedValue(["Tiendas", "Bodega"]);
    listarColaboradores.mockResolvedValue([
      { dni: "00000001", nombre: "Ana", sede: "Centro", grupo: "Tiendas", activo: true },
    ]);

    const html = await render({ grupo: "Bodega" });

    expect(html).toContain("Ningún colaborador coincide con el filtro");
    expect(html).not.toContain("No hay colaboradores.");
    expect(html).not.toContain("<table");
  });
});

describe("página de Configuración (/configuracion) por rol", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    filasDeSedes.mockReturnValue([{ nombre: "Norte", grupo: "Tiendas" }, { nombre: "Taller", grupo: "Taller" }, { nombre: "Oficina", grupo: "Administración" }]);
    listarGrupos.mockResolvedValue(["Tiendas", "Taller", "Administración"]);
    listarModelosPorSede.mockResolvedValue([]);
    listarColaboradores.mockResolvedValue([
      { dni: "00000001", nombre: "Ana Tienda", sede: "Norte", grupo: "Tiendas", activo: true },
      { dni: "00000002", nombre: "Beto Taller", sede: "Taller", grupo: "Taller", activo: true },
    ]);
  });

  it("el Administrador ve los grupos con su atributo y todos los colaboradores", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "administrador" });

    const html = await render();

    expect(html).toContain("Gestiona asistencia y horarios");
    expect(html).toContain("Ana Tienda");
    expect(html).toContain("Beto Taller");
  });

  it("el gerente solo ve los colaboradores de sus grupos y no las acciones de grupo", async () => {
    obtenerActorActual.mockResolvedValue(GERENTE_DE_TIENDAS);

    const html = await render();

    expect(html).toContain("Ana Tienda");
    expect(html).not.toContain("Beto Taller");
    expect(html).not.toContain("Cambiar grupo");
  });

  it("el alta de un colaborador ofrece al gerente solo sus grupos y preselecciona el único que tiene", async () => {
    obtenerActorActual.mockResolvedValue(GERENTE_DE_TIENDAS);
    filasDeSedes.mockReturnValue([{ nombre: "Norte", grupo: "Tiendas" }, { nombre: "Taller", grupo: "Taller" }]);
    listarGrupos.mockResolvedValue(["Tiendas", "Taller"]);

    const html = await render();
    const selectorDeGrupo = html.match(/<label>Grupo<select[^>]*name="grupo"[^>]*>.*?<\/select>/s)?.[0] ?? "";

    expect(selectorDeGrupo).toContain('value="Tiendas" selected');
    expect(selectorDeGrupo).not.toContain("Taller");
  });

  it("el alta de un colaborador no preselecciona grupo cuando el gerente tiene varios", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }, { nombre: "Taller", gestionaAsistencia: true }] });
    filasDeSedes.mockReturnValue([{ nombre: "Norte", grupo: "Tiendas" }]);
    listarGrupos.mockResolvedValue(["Tiendas", "Taller"]);

    const html = await render();
    const selectorDeGrupo = html.match(/<label>Grupo<select[^>]*name="grupo"[^>]*>.*?<\/select>/s)?.[0] ?? "";

    expect(selectorDeGrupo).not.toMatch(/value="(Tiendas|Taller)"[^>]*selected|selected[^>]*value="(Tiendas|Taller)"/);
    expect(selectorDeGrupo).toContain("Tiendas");
    expect(selectorDeGrupo).toContain("Taller");
  });

  it("el gerente de un grupo que no gestiona asistencia ve colaboradores pero no modelos de horario", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "gerente_de_area", grupos: [{ nombre: "Administración", gestionaAsistencia: false }] });
    listarColaboradores.mockResolvedValue([{ dni: "00000003", nombre: "Hugo Oficina", sede: "Oficina", grupo: "Administración", activo: true }]);

    const html = await render();

    expect(html).toContain("Hugo Oficina");
    expect(html).not.toContain("Modelos de horario");
  });

  it.each([["gerente sin grupos", { rol: "gerente_de_area", grupos: [] }], ["Finanzas", { rol: "finanzas" }], ["Recursos Humanos", { rol: "recursos_humanos" }]])("rechaza con estado vacío a %s", async (_nombre, actor) => {
    obtenerActorActual.mockResolvedValue(actor);

    const html = await render();

    expect(html).toContain("Sin permiso");
    expect(html).not.toContain("Crear modelo");
  });
});
