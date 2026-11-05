import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { CreadorDeGrupo } from "./creador-de-grupo";
import { getTableName } from "drizzle-orm";

const obtenerActorActual = vi.fn();
const listarGrupos = vi.fn();
const listarGruposConAtributos = vi.fn();
const listarPoliticasDeGrupo = vi.fn();
const listarColaboradores = vi.fn();
const listarModelosPorSede = vi.fn();
const filasDeSedes = vi.fn();
const filasDePoliticas = vi.fn();
const GERENTE_DE_TIENDAS = { rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] };

function consulta(filas: () => unknown) {
  const cadena: Record<string, unknown> = {};
  let tabla: string | undefined;
  cadena.from = (objeto: Parameters<typeof getTableName>[0]) => { tabla = getTableName(objeto); return cadena; };
  cadena.where = () => cadena;
  cadena.orderBy = () => Promise.resolve(tabla === "politicas_de_penalizacion_por_tardanzas" ? filasDePoliticas() : filas());
  return cadena;
}

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual }));
vi.mock("@/db/client", () => ({ db: { select: () => consulta(() => filasDeSedes()) } }));
vi.mock("@/colaboradores/servicio", () => ({ repositorioDeColaboradores: { listar: listarColaboradores } }));
vi.mock("@/turnos/servicio", () => ({
  repositorioDeGrupos: { listarConAtributos: listarGruposConAtributos },
  repositorioDeModelosDeHorario: { listarPorSede: listarModelosPorSede },
}));
vi.mock("@/tardanzas/servicio", () => ({ repositorioDeTardanzas: { listarPoliticasDeGrupo } }));
vi.mock("@/app/boton-de-accion-confirmada", () => ({ BotonDeAccionConfirmada: () => createElement("button") }));
vi.mock("./actions", () => ({ asignarEquipoOperativoASede: vi.fn(), cambiarGrupoDeColaboradorDeConfiguracion: vi.fn(), crearGrupoDeConfiguracion: vi.fn(), crearModeloHorario: vi.fn(), desactivarColaborador: vi.fn(), desactivarModeloHorario: vi.fn(), eliminarModeloHorario: vi.fn(), eliminarSede: vi.fn(), guardarColaborador: vi.fn(), guardarModeloHorario: vi.fn(), guardarPoliticaDeTardanzas: vi.fn(), guardarGestionDeAsistenciaDelGrupo: vi.fn(), guardarSede: vi.fn(), reactivarColaborador: vi.fn(), reactivarModeloHorario: vi.fn() }));
vi.mock("./editor-de-grupo", () => ({ EditorDeGrupo: () => createElement("div") }));

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
    listarGruposConAtributos.mockImplementation(async () => ((await listarGrupos()) as string[]).map((nombre) => ({ nombre, gestionaAsistencia: true })));
    listarPoliticasDeGrupo.mockResolvedValue([]);
    listarColaboradores.mockResolvedValue([]);
    listarModelosPorSede.mockResolvedValue([]);
    filasDePoliticas.mockReturnValue([]);
  });

  it("G18 muestra los grupos y Cuentas en el menú, y permite elegir gestión al crear", async () => {
    listarGrupos.mockResolvedValue(["Tiendas"]);
    const html = await render();
    const grupos = html.indexOf(">Tiendas</a>");
    const nuevoGrupo = html.indexOf("+ Nuevo grupo");
    const cuentas = html.indexOf(">Cuentas</a>");
    const creador = renderToStaticMarkup(createElement(CreadorDeGrupo));

    expect(grupos).toBeGreaterThanOrEqual(0);
    expect(grupos).toBeLessThan(nuevoGrupo);
    expect(nuevoGrupo).toBeLessThan(cuentas);
    expect(creador).toMatch(/<input[^>]*type="checkbox"[^>]*name="gestiona"[^>]*checked=""[^>]*value="true"/);
    expect(creador).toContain('<input type="hidden" name="gestiona" value="false"/>');
    expect(creador).not.toContain('type="radio"');
  });

  it("muestra solo el detalle del grupo elegido y toma el primero por defecto", async () => {
    filasDeSedes.mockReturnValue([{ nombre: "Centro", grupo: "Tiendas" }, { nombre: "Planta", grupo: "Taller" }]);
    listarGrupos.mockResolvedValue(["Tiendas", "Taller"]);

    const porDefecto = await render();
    const elegido = await render({ grupo: "Taller" });

    expect(porDefecto).toContain(">Tiendas</h2>");
    expect(porDefecto).toContain("<strong>Centro</strong>");
    expect(porDefecto).not.toContain("<strong>Planta</strong>");
    expect(elegido).toContain(">Taller</h2>");
    expect(elegido).toContain("<strong>Planta</strong>");
    expect(elegido).not.toContain("<strong>Centro</strong>");
    expect(elegido).toMatch(/aria-current="page"[^>]*>Taller<\/a>/);
    expect(porDefecto).not.toContain("colaboradores activos");
  });

  it("G19 no ofrece configurar tardanzas para grupos que no gestionan asistencia", async () => {
    filasDeSedes.mockReturnValue([{ nombre: "Oficina", grupo: "Administración" }]);
    listarGrupos.mockResolvedValue(["Administración"]);
    listarGruposConAtributos.mockResolvedValue([{ nombre: "Administración", gestionaAsistencia: false }]);

    const html = await render();

    expect(html).not.toContain("Guardar política");
  });

  it("G19 muestra el conflicto histórico y exige elegir una política sin preselección", async () => {
    filasDeSedes.mockReturnValue([{ nombre: "Centro", grupo: "Tiendas", activa: true }, { nombre: "Norte", grupo: "Tiendas", activa: true }]);
    listarGrupos.mockResolvedValue(["Tiendas"]);
    listarPoliticasDeGrupo.mockResolvedValue([{ grupo: "Tiendas", conflicto: true, toleranciaEnMinutos: null, tardanzasAcumuladas: null, horasPenalizadas: null }]);
    filasDePoliticas.mockReturnValue([
      { sede: "Centro", toleranciaEnMinutos: 10, tardanzasAcumuladas: 3, horasPenalizadas: 1, vigenteDesde: "2026-01-01", version: 1 },
      { sede: "Norte", toleranciaEnMinutos: 15, tardanzasAcumuladas: 2, horasPenalizadas: 1, vigenteDesde: "2026-01-01", version: 1 },
    ]);

    const html = await render();

    expect(html).toContain("Tiendas tiene políticas históricas en conflicto");
    expect(html).toContain('name="politicaSeleccionada"');
    expect(html).toContain("Centro · vigente desde 2026-01-01 · sede activa · 10 min · 3 tardanzas · 1 h");
    expect(html).toContain("Norte · vigente desde 2026-01-01 · sede activa · 15 min · 2 tardanzas · 1 h");
    expect(html).not.toMatch(/name="politicaSeleccionada"[^>]*checked/);
  });


  it("no explica acciones deshabilitadas cuando hay sedes y grupos", async () => {
    filasDeSedes.mockReturnValue([{ nombre: "Norte", grupo: "Tiendas" }]);
    listarGrupos.mockResolvedValue(["Tiendas"]);

    const html = await render();

    expect(html).not.toContain("está deshabilitado");
  });

  it("sin sedes en el grupo, no ofrece crear modelos y explica el siguiente paso", async () => {
    listarGrupos.mockResolvedValue(["Tiendas"]);

    const html = await render();

    expect(html).toContain("Un modelo pertenece a una sede. Cree una sede en este grupo y luego el primer modelo.");
    expect(html).not.toContain("+ Nuevo modelo");
    expect(html).not.toContain("Crear modelo");
  });

  it("sin grupos, Administración indica crear el primero y no ofrece política ni sedes", async () => {
    const html = await render();

    expect(html).toContain("No hay grupos");
    expect(html).toContain("Cree el primer grupo");
    expect(html).not.toContain("Crear sede");
    expect(html).not.toContain("Guardar política de");
  });

  it("al gerente de área le ofrece modelos de sus grupos, sin acciones globales ni Cuentas", async () => {
    obtenerActorActual.mockResolvedValue(GERENTE_DE_TIENDAS);
    filasDeSedes.mockReturnValue([{ nombre: "Norte", grupo: "Tiendas" }]);
    listarGrupos.mockResolvedValue(["Tiendas"]);

    const html = await render();

    expect(html).toContain("Crear modelo");
    expect(html).not.toContain(">Cuentas</a>");
    expect(html).not.toContain("Crear sede");
    expect(html).not.toContain("Guardar política");
    expect(html).not.toContain("Nuevo grupo");
    expect(html).not.toContain("Dejar de gestionar");
  });

  it("explica con el estado vacío compartido que Recursos Humanos no puede cambiar la configuración", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "recursos_humanos" });

    const html = await render();

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("Sin permiso");
    expect(html).not.toContain("Crear modelo");
  });

  it("lleva a Finanzas a Cuentas, lo único de Configuración que administra", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "finanzas" });
    vi.mocked(redirect).mockImplementationOnce(() => { throw new Error("NEXT_REDIRECT"); });

    await expect(render()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/cuentas");
  });

  it("sin sedes, Administración ve estados vacíos de sedes y modelos con su siguiente paso", async () => {
    listarGrupos.mockResolvedValue(["Tiendas"]);
    const html = await render();

    expect((html.match(/class="estado-vacio"/g) ?? [])).toHaveLength(2);
    expect(html).toContain("No hay modelos de horario");
    expect(html).toContain("No hay sedes activas");
    expect(html).toContain("Cree una sede");
    expect(html).not.toContain("Todavía no hay modelos de horario.");
  });

  it("con sedes y sin modelos, cada sede ofrece su propio formulario con la sede fijada", async () => {
    filasDeSedes.mockReturnValue([{ nombre: "Centro", grupo: "Tiendas" }, { nombre: "Norte", grupo: "Tiendas" }]);
    listarGrupos.mockResolvedValue(["Tiendas"]);

    const html = await render();

    expect(html).toContain("Todavía no tiene modelos de horario.");
    expect(html).toContain("Nuevo modelo para Centro");
    expect(html).toContain("Nuevo modelo para Norte");
    expect(html.match(/>Cancelar<\/button>/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('<input type="hidden" name="sede" value="Centro"/>');
    expect(html).not.toMatch(/<select[^>]*name="sede"/);
    expect(html).not.toContain("No hay sedes activas");
  });

  it("agrupa los modelos bajo su sede y no repite la sede en cada fila", async () => {
    filasDeSedes.mockReturnValue([{ nombre: "Centro", grupo: "Tiendas" }, { nombre: "Norte", grupo: "Tiendas" }]);
    listarGrupos.mockResolvedValue(["Tiendas"]);
    listarModelosPorSede.mockImplementation(async (sede: string) => [{ id: `m-${sede}`, sede, nombre: "Apertura", entrada: "08:00", salida: "16:00", activo: true }]);

    const html = await render();

    expect(html).toMatch(/<h4>Centro<\/h4>.*Apertura · 08:00 a 16:00.*<h4>Norte<\/h4>.*Apertura · 08:00 a 16:00/s);
    expect(html).not.toContain("<small>Centro</small>");
  });

  it("el Administrador cambia la gestión con un interruptor; el gerente solo ve el estado", async () => {
    listarGrupos.mockResolvedValue(["Tiendas"]);
    const administrador = await render();
    obtenerActorActual.mockResolvedValue(GERENTE_DE_TIENDAS);
    const gerente = await render();

    expect(administrador).toMatch(/role="switch"[^>]*aria-checked="true"|aria-checked="true"[^>]*role="switch"/);
    expect(administrador).toContain("¿Cambiar la gestión de asistencia de Tiendas?");
    expect(gerente).not.toContain('role="switch"');
    expect(gerente).toContain("Gestiona asistencia y horarios");
  });

  it("sin sedes, no pide al gerente crear una sede que no puede administrar", async () => {
    obtenerActorActual.mockResolvedValue(GERENTE_DE_TIENDAS);
    listarGrupos.mockResolvedValue(["Tiendas"]);

    const html = await render();

    expect(html).toContain("No hay modelos de horario");
    expect(html).toContain("Pida al Administrador del sistema");
    expect(html).not.toContain("Cree una sede");
    expect(html).not.toContain("No hay sedes activas");
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

  it("el Administrador ve los grupos con su atributo, Cuentas y las acciones de grupo", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "administrador" });

    const detalle = await render();

    expect(detalle).toContain("Gestiona asistencia y horarios");
    expect(detalle).toContain("+ Nuevo grupo");
    expect(detalle).toContain(">Cuentas</a>");
    expect(detalle).not.toContain("Ana Tienda");
  });




  it("el gerente de un grupo que no gestiona asistencia no ve modelos de horario", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "gerente_de_area", grupos: [{ nombre: "Administración", gestionaAsistencia: false }] });
    listarGruposConAtributos.mockResolvedValue([{ nombre: "Administración", gestionaAsistencia: false }]);

    const detalle = await render();

    expect(detalle).not.toContain("Modelos de horario");
    expect(detalle).toContain("No gestiona asistencia ni horarios");
  });

  it.each([["gerente sin grupos", { rol: "gerente_de_area", grupos: [] }], ["Recursos Humanos", { rol: "recursos_humanos" }]])("rechaza con estado vacío a %s", async (_nombre, actor) => {
    obtenerActorActual.mockResolvedValue(actor);

    const html = await render();

    expect(html).toContain("Sin permiso");
    expect(html).not.toContain("Crear modelo");
  });
});
