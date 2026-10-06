import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), listarColaboradores: vi.fn(), repositorio: undefined as unknown }));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/colaboradores/servicio", () => ({ repositorioDeColaboradores: { listar: simulacro.listarColaboradores } }));
vi.mock("@/relaciones-laborales/servicio", () => ({
  get repositorioDeRelacionesLaborales() { return simulacro.repositorio; },
}));
vi.mock("./formularios", () => ({
  FormularioDeIngreso: ({ colaboradores }: { colaboradores: Array<{ dni: string }> }) => createElement("output", undefined, `ingreso:${colaboradores.map(({ dni }) => dni).join(",")}`),
  ConfirmacionDeFecha: ({ etiqueta }: { etiqueta: string }) => createElement("button", undefined, etiqueta),
  FormularioDeFecha: ({ etiquetaDelBoton }: { etiquetaDelBoton: string }) => createElement("output", undefined, etiquetaDelBoton),
}));

import { ANA, BETO, crearRepositorioEnMemoria } from "@/relaciones-laborales/repositorio-en-memoria";
import { confirmarCese, confirmarIngreso, registrarCese, registrarIngreso } from "@/relaciones-laborales/gestionar-relaciones-laborales";

async function render(parametros: { desde?: string; hasta?: string } = {}) {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(parametros) }));
}

const recursosHumanos = { id: "rrhh-1", rol: "recursos_humanos" as const };

describe("página de Relaciones laborales (/relaciones-laborales)", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;

  beforeEach(async () => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    contexto = crearRepositorioEnMemoria();
    simulacro.repositorio = contexto.repositorio;
    simulacro.listarColaboradores.mockResolvedValue([
      { dni: ANA, nombre: "Ana Pérez", grupo: "Tiendas" },
      { dni: BETO, nombre: "Beto Ruiz", grupo: "Taller" },
    ]);
    // Ana: ingreso confirmado, cese por confirmar. Beto: ingreso por confirmar.
    const ana = await registrarIngreso(contexto.repositorio, recursosHumanos, { dni: ANA, ingreso: "2026-03-02" });
    await confirmarIngreso(contexto.repositorio, recursosHumanos, ana.id);
    await registrarCese(contexto.repositorio, recursosHumanos, ana.id, "2026-06-30");
    await registrarIngreso(contexto.repositorio, recursosHumanos, { dni: BETO, ingreso: "2026-09-01" });
  });

  it("Recursos Humanos ve el formulario, las acciones pendientes y las fechas con su estado de confirmación", async () => {
    simulacro.actor.mockResolvedValue(recursosHumanos);

    const html = await render({ desde: "2026-05-01" });

    expect(html).toContain("<h1>Relaciones laborales</h1>");
    expect(html).toContain("Registre y confirme las fechas de ingreso y cese");
    // Beto tiene una relación sin cese: no se le ofrece un reingreso.
    expect(html).toContain("ingreso:99900001");
    expect(html).not.toContain("ingreso:99900001,99900002");
    expect(html).toContain("02/03/2026");
    expect(html).toContain("30/06/2026");
    expect(html).toContain("Confirmar cese");
    expect(html).toContain("Confirmar ingreso");
    expect(html).toContain("Corregir ingreso");
    expect(html).toContain("2 relaciones · 2 con fechas por confirmar");
  });

  it("no ofrece registrar un reingreso a quien tiene una relación sin cese", async () => {
    simulacro.actor.mockResolvedValue(recursosHumanos);
    const [ana] = contexto.relaciones;
    await confirmarCese(contexto.repositorio, recursosHumanos, ana.id);

    const html = await render();

    expect(html).toContain("ingreso:99900001");
    expect(html).not.toContain("ingreso:99900001,99900002");
  });

  it("la consulta de vigencia lista solo relaciones con ingreso confirmado y respeta el rango", async () => {
    simulacro.actor.mockResolvedValue(recursosHumanos);

    const enLaFecha = await render({ desde: "2026-05-01" });
    expect(enLaFecha).toContain("1 persona vigente");
    expect(enLaFecha).toContain("Sin cese");
    // Un cese sin confirmar no corta la vigencia: Ana sigue vigente después del 30/06.
    expect(await render({ desde: "2026-09-10" })).toContain("1 persona vigente");
    const sinNadie = await render({ desde: "2026-02-01" });
    expect(sinNadie).toContain("Nadie tiene una relación laboral vigente");
    expect(await render({ desde: "2026-05-02", hasta: "2026-05-01" })).toContain('role="alert"');
  });

  it("Finanzas consulta en solo lectura: sin formulario ni acciones", async () => {
    simulacro.actor.mockResolvedValue({ id: "fin-1", rol: "finanzas" });

    const html = await render({ desde: "2026-05-01" });

    expect(html).toContain("Su rol solo puede consultarlas");
    expect(html).not.toContain("ingreso:");
    expect(html).not.toContain("Confirmar ingreso");
    expect(html).not.toContain("Registrar cese");
    expect(simulacro.listarColaboradores).not.toHaveBeenCalled();
  });

  it.each([
    ["un gerente de área", { id: "g1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ])("niega el acceso a %s con el estado vacío compartido", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);

    const html = await render();

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("Sin permiso");
    expect(html).not.toContain("Ana Pérez");
  });

  it("sin relaciones explica el siguiente paso", async () => {
    simulacro.actor.mockResolvedValue(recursosHumanos);
    contexto.relaciones.length = 0;

    const html = await render();

    expect(html).toContain("Todavía no hay relaciones laborales");
    expect(html).toContain("Registre el ingreso de un colaborador");
  });
});
