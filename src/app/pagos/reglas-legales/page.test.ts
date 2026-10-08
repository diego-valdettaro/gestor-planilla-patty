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
import { activarReglaLegal } from "@/reglas-legales/gestionar-reglas-legales";
import { crearRepositorioEnMemoria } from "@/reglas-legales/repositorio-en-memoria";

const finanzas: Actor = { id: "fin-1", rol: "finanzas", nombreUsuario: "finanzas" };

async function render() {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina());
}

describe("página de Reglas legales (/pagos/reglas-legales)", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;
  const activar = (codigo: string, valor: string, vigenteDesde: string, fuenteOficial = "Norma sintética") => activarReglaLegal(contexto.repositorio, finanzas, { codigo, valor, vigenteDesde, fuenteOficial });

  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T15:00:00Z"));
    simulacro.redirigir.mockClear();
    contexto = crearRepositorioEnMemoria();
    simulacro.repositorio = contexto.repositorio;
    simulacro.actor.mockResolvedValue(finanzas);
  });

  afterEach(() => vi.useRealTimers());

  it("Finanzas ve una fila por valor legal con el valor vigente hoy, su vigencia, su fuente y quién lo activó", async () => {
    await activar("essalud_tasa", "8", "2024-01-01", "Fuente anterior");
    await activar("essalud_tasa", "9", "2025-01-01", "Ley sintética 123");
    await activar("rmv", "1130", "2026-02-01", "Decreto sintético 456");
    await activar("onp_tasa", "13", "2026-12-01");

    const html = await render();

    expect(html).toContain("<h1>Reglas legales</h1>");
    expect(html).toContain("Valor vigente hoy (07/10/2026)");
    expect(html).toContain("9,00 %");
    expect(html).not.toContain("8,00 %");
    expect(html).toContain("S/ 1.130,00");
    expect(html).toContain("01/01/2025");
    expect(html).toContain("Ley sintética 123");
    expect(html).toContain("Decreto sintético 456");
    expect(html).toContain("usuario-fin-1");
    expect(html).toContain('href="/pagos/reglas-legales/essalud_tasa"');
    expect(html).toContain("Programado: 13,00 % desde el 01/12/2026");
    expect(html).toContain("(sección actual)");
    expect(html).toContain("Activar nuevo valor");
  });

  it("un valor sin regla vigente dice «Pendiente» con texto y nunca se muestra como cero", async () => {
    await activar("essalud_tasa", "9", "2025-01-01");

    const html = await render();

    expect(html).toContain("Pendiente");
    expect(html).toContain("Sin regla vigente");
    expect(html).toContain("RMV (remuneración mínima vital)");
    expect(html).not.toContain("S/ 0,00");
    expect(html).not.toContain("0,00 %");
  });

  it("sin ninguna regla activa muestra el estado vacío del diseño con su siguiente paso", async () => {
    const html = await render();

    expect(html).toContain("No hay reglas legales activas");
    expect(html).toContain("Sin ellas el cálculo de aportes queda bloqueado.");
    expect(html).toContain("Activar nuevo valor");
    expect(html).not.toContain("<table");
  });

  it("el diálogo de activación trae el texto de consecuencia y a nombre de quién queda", async () => {
    await activar("essalud_tasa", "9", "2025-01-01");

    const html = await render();

    expect(html).toContain("Cancelar no activa nada.");
    expect(html).toContain("Quedará registrado a nombre de finanzas.");
    expect(html).toContain("Las versiones finalizadas conservan el valor que aplicaron.");
  });

  it.each([
    ["el Administrador del sistema", { id: "a", rol: "administrador" }],
    ["Recursos Humanos", { id: "r", rol: "recursos_humanos" }],
    ["un gerente de área", { id: "g", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ])("niega el acceso a %s y no consulta ningún valor", async (_nombre, actor) => {
    await activar("rmv", "1130", "2026-02-01");
    simulacro.actor.mockResolvedValue(actor);

    const html = await render();

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("Sin permiso");
    expect(html).not.toContain("S/ ");
  });

  it("sin sesión lleva a iniciar sesión", async () => {
    simulacro.actor.mockRejectedValue(new Error("La sesión no es válida."));
    await expect(render()).rejects.toThrow("REDIRECT /iniciar-sesion");
  });
});
