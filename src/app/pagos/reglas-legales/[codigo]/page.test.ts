import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), redirigir: vi.fn(), repositorio: undefined as unknown }));

simulacro.redirigir.mockImplementation((ruta: string) => { throw new Error(`REDIRECT ${ruta}`); });
vi.mock("next/navigation", () => ({ redirect: simulacro.redirigir }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/reglas-legales/servicio", () => ({
  get repositorioDeReglasLegales() { return simulacro.repositorio; },
}));

import type { Actor } from "@/autenticacion/permisos";
import { activarReglaLegal, corregirReglaLegal } from "@/reglas-legales/gestionar-reglas-legales";
import { crearRepositorioEnMemoria } from "@/reglas-legales/repositorio-en-memoria";

const finanzas: Actor = { id: "fin-1", rol: "finanzas", nombreUsuario: "finanzas" };

async function render(codigo = "essalud_tasa", fecha?: string) {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ codigo }), searchParams: Promise.resolve({ fecha }) }));
}

describe("página de un valor legal (/pagos/reglas-legales/[codigo])", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;
  const activar = (codigo: string, valor: string, vigenteDesde: string, fuenteOficial = "Norma sintética") => activarReglaLegal(contexto.repositorio, finanzas, { codigo, valor, vigenteDesde, fuenteOficial });

  beforeEach(async () => {
    vi.stubGlobal("React", React);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T15:00:00Z"));
    simulacro.redirigir.mockClear();
    contexto = crearRepositorioEnMemoria();
    simulacro.repositorio = contexto.repositorio;
    simulacro.actor.mockResolvedValue(finanzas);
    await activar("essalud_tasa", "8", "2024-01-01", "Fuente de 2024");
    await activar("essalud_tasa", "9", "2025-01-01", "Fuente de 2025");
    await activar("essalud_tasa", "9,5", "2026-12-01", "Fuente de 2026");
  });

  afterEach(() => vi.useRealTimers());

  it("muestra una fila por versión con su vigencia, fuente, responsable y estado", async () => {
    const html = await render();

    expect(html).toContain("<h1>Tasa de EsSalud</h1>");
    expect(html).toContain("Vigente hoy (07/10/2026): <strong>9,00 %</strong>");
    expect(html).toContain("31/12/2024");
    expect(html).toContain("30/11/2026");
    for (const fuente of ["Fuente de 2024", "Fuente de 2025", "Fuente de 2026"]) expect(html).toContain(fuente);
    for (const estado of ["Anterior", "Vigente", "Programado"]) expect(html).toContain(`>${estado}</span>`);
    expect(html).toContain("usuario-fin-1");
    expect(html).toContain("Sin fecha de fin");
    expect(html).toContain("Activar nuevo valor");
    expect(html).toContain("¿Reemplazar la Tasa de EsSalud vigente desde el 01/01/2025?");
  });

  it("consultar una fecha informa la versión que rige entonces", async () => {
    const html = await render("essalud_tasa", "2024-06-15");

    expect(html).toContain("En 15/06/2024 rige <strong>8,00 %</strong>, vigente desde el 01/01/2024. Fuente oficial: Fuente de 2024.");
  });

  it("una fecha sin regla vigente dice la falta de forma explícita", async () => {
    const html = await render("essalud_tasa", "2023-12-31");

    expect(html).toContain("Sin regla vigente en esa fecha (31/12/2023)");
    expect(html).toContain("Pendiente");
    expect(html).not.toContain("0,00 %");
  });

  it("una fecha inválida se dice junto al campo sin reemplazar la pantalla", async () => {
    const html = await render("essalud_tasa", "2026-02-30");

    expect(html).toContain("La fecha de la consulta no es válida.");
    expect(html).toContain("<h1>Tasa de EsSalud</h1>");
  });

  it("una versión reemplazada queda en el historial con su motivo y sin acción de corregir", async () => {
    const [primera] = contexto.reglas();
    await corregirReglaLegal(contexto.repositorio, finanzas, { reglaId: primera.id, valor: "7,5", motivo: "Error de digitación" });

    const html = await render();

    expect(html).toContain(">Reemplazado</span>");
    expect(html).toContain("Motivo: Error de digitación");
    expect(html).toContain("7,50 %");
  });

  it("si una versión finalizada usó el valor, «Corregir» queda deshabilitado con la causa visible", async () => {
    const vigente = contexto.reglas().find(({ valor }) => valor === 900)!;
    contexto.versionesFinalizadas.set(vigente.id, [{ mes: "2026-09", numero: 2 }]);

    const html = await render();

    expect(html).toContain("Lo usa la versión 2 de 09/2026; corríjalo con un ajuste de preliquidación.");
    expect(html).toMatch(/<button class="boton-secundario" disabled="" type="button">Corregir/);
  });

  it("un valor legal que no existe dice que no existe, sin la pantalla de error", async () => {
    const html = await render("centro_de_costo");

    expect(html).toContain("No existe ese valor legal");
    expect(html).toContain('href="/pagos/reglas-legales"');
  });

  it("un valor sin versiones muestra el estado vacío con su siguiente paso", async () => {
    const html = await render("rmv");

    expect(html).toContain("Pendiente: todavía no hay ningún valor");
    expect(html).toContain("Sin regla vigente");
    expect(html).not.toContain("S/ 0,00");
  });

  it.each([
    ["el Administrador del sistema", { id: "a", rol: "administrador" }],
    ["Recursos Humanos", { id: "r", rol: "recursos_humanos" }],
    ["un gerente de área", { id: "g", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ])("niega el acceso a %s", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);

    const html = await render();

    expect(html).toContain("Sin permiso");
    expect(html).not.toContain("Fuente de 2025");
  });

  it("sin sesión lleva a iniciar sesión", async () => {
    simulacro.actor.mockRejectedValue(new Error("La sesión no es válida."));
    await expect(render()).rejects.toThrow("REDIRECT /iniciar-sesion");
  });
});
