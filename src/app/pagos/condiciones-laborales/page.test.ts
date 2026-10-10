import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), redirigir: vi.fn(), repositorio: undefined as unknown }));

simulacro.redirigir.mockImplementation((ruta: string) => { throw new Error(`REDIRECT ${ruta}`); });
vi.mock("next/navigation", () => ({ redirect: simulacro.redirigir }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/condiciones-laborales/servicio", () => ({
  get repositorioDeCondicionesLaborales() { return simulacro.repositorio; },
}));

import type { Actor } from "@/autenticacion/permisos";
import { registrarCondicionLaboral } from "@/condiciones-laborales/gestionar-condiciones-laborales";
import { ANA_REINGRESO, ANA_RELACION, BETO_RELACION, crearRepositorioEnMemoria } from "@/condiciones-laborales/repositorio-en-memoria";

const finanzas: Actor = { id: "fin-1", rol: "finanzas" };

async function render(parametros: { grupo?: string; sede?: string; persona?: string; faltantes?: string } = {}) {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(parametros) }));
}

describe("página de Condiciones laborales (/pagos/condiciones-laborales)", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;

  beforeEach(async () => {
    vi.stubGlobal("React", React);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T15:00:00Z"));
    simulacro.redirigir.mockClear();
    contexto = crearRepositorioEnMemoria();
    simulacro.repositorio = contexto.repositorio;
    simulacro.actor.mockResolvedValue(finanzas);
    const registrar = (relacionId: string, dato: string, valor: string, vigenteDesde: string) => registrarCondicionLaboral(contexto.repositorio, finanzas, { relacionId, dato, valor, vigenteDesde });
    // Beto completo, con un cambio de sueldo; Ana (reingreso) con AFP sin esquema; la primera relación de Ana sin nada.
    await registrar(BETO_RELACION, "sueldo", "1500", "2024-01-08");
    await registrar(BETO_RELACION, "sueldo", "1800", "2026-09-16");
    await registrar(BETO_RELACION, "jornada_ordinaria_diaria", "8", "2024-01-08");
    await registrar(BETO_RELACION, "regimen_laboral", "remype_pequena_empresa", "2024-01-08");
    await registrar(BETO_RELACION, "afiliacion_pensionaria", "onp", "2024-01-08");
    await registrar(BETO_RELACION, "elegibilidad_familiar", "no", "2024-01-08");
    await registrar(BETO_RELACION, "sede_de_adscripcion", "Taller", "2024-01-08");
    await registrar(ANA_REINGRESO, "sueldo", "1700", "2026-06-01");
    await registrar(ANA_REINGRESO, "afiliacion_pensionaria", "afp_integra", "2026-06-01");
  });

  afterEach(() => vi.useRealTimers());

  it("Finanzas ve una fila por relación laboral confirmada con los valores vigentes hoy", async () => {
    const html = await render();

    expect(html).toContain("<h1>Condiciones laborales</h1>");
    expect(html).toContain("Valores vigentes hoy (07/10/2026)");
    expect(html).toContain("Ingreso 08/01/2024 – vigente");
    expect(html).toContain("Ingreso 02/03/2025 – cese 31/01/2026");
    expect(html).toContain("S/ 1.800,00");
    expect(html).not.toContain("S/ 1.500,00");
    expect(html).toContain("8 h");
    expect(html).toContain("REMYPE pequeña empresa");
    expect(html).toContain("Taller");
    expect(html).toContain("AFP Integra · ");
    expect(html).toContain("Esquema pendiente");
    expect(html).toContain("Completa");
    expect(html).toContain("(sección actual)");
    expect(html).toContain('href="/pagos/condiciones-laborales/' + BETO_RELACION + '"');
    expect(html).toContain("3 relaciones · 2 con datos faltantes");
  });

  it("un dato faltante dice «Pendiente» con texto y nunca se muestra como S/ 0,00", async () => {
    const html = await render();

    expect(html).toContain("Pendiente");
    expect(html).toContain("Falta: sueldo, jornada ordinaria diaria, régimen laboral");
    expect(html).not.toContain("S/ 0,00");
    expect(html).toContain("Falta: jornada ordinaria diaria, régimen laboral, esquema de comisión AFP, asignación familiar otorgada, sede de adscripción");
  });

  it("filtra por grupo, sede, persona y datos faltantes y rotula el alcance", async () => {
    const taller = await render({ grupo: "Taller" });
    expect(taller).toContain("Beto Ruiz");
    expect(taller).not.toContain("Ana Pérez");
    expect(taller).toContain("1 de 3 relaciones");

    expect(await render({ sede: "Taller" })).not.toContain("Ana Pérez");
    expect(await render({ persona: "99900001" })).not.toContain("Beto Ruiz");
    const incompletas = await render({ faltantes: "1" });
    expect(incompletas).toContain("Ana Pérez");
    expect(incompletas).not.toContain("Beto Ruiz");
  });

  it("sin coincidencias explica qué hacer", async () => {
    const html = await render({ persona: "zzz" });

    expect(html).toContain("Ninguna relación coincide con los filtros");
    expect(html).toContain("quite los filtros");
  });

  it("sin relaciones confirmadas explica quién las registra", async () => {
    contexto.relaciones.length = 0;

    const html = await render();

    expect(html).toContain("Todavía no hay relaciones laborales confirmadas");
    expect(html).toContain("Recursos Humanos las registra y confirma.");
    expect(html).not.toContain("<table");
  });

  it.each([
    ["el Administrador del sistema", { id: "a", rol: "administrador" }],
    ["Recursos Humanos", { id: "r", rol: "recursos_humanos" }],
    ["un gerente de área", { id: "g", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ])("niega el acceso a %s y no consulta ningún dato salarial", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);

    const html = await render();

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("Sin permiso");
    expect(html).not.toContain("Beto Ruiz");
    expect(html).not.toContain("S/ ");
  });

  it("sin sesión lleva a iniciar sesión", async () => {
    simulacro.actor.mockRejectedValue(new Error("La sesión no es válida."));
    await expect(render()).rejects.toThrow("REDIRECT /iniciar-sesion");
  });

  it("la relación anterior de Ana no hereda el sueldo de su reingreso", async () => {
    const html = await render({ persona: "ana" });
    expect(html.indexOf(ANA_REINGRESO)).toBeGreaterThan(-1);
    expect(html.indexOf(ANA_RELACION)).toBeGreaterThan(-1);
    expect(html.match(/S\/ 1\.700,00/g)).toHaveLength(1);
  });
});
