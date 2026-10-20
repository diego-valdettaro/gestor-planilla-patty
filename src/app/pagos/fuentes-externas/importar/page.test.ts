import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), redirigir: vi.fn(), repositorio: undefined as unknown }));

simulacro.redirigir.mockImplementation((ruta: string) => { throw new Error(`REDIRECT ${ruta}`); });
vi.mock("next/navigation", () => ({ redirect: simulacro.redirigir }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/fuentes-externas/servicio", () => ({
  get repositorioDeFuentesExternas() { return simulacro.repositorio; },
}));
// La acción de servidor trae el módulo de base de datos; la página solo la pasa al formulario.
vi.mock("./actions", () => ({ procesarArchivoDeFuente: vi.fn() }));

import { crearRepositorioEnMemoria } from "@/fuentes-externas/repositorio-en-memoria";

const finanzas = { id: "fin-1", rol: "finanzas", nombreUsuario: "finanzas" };

async function render(parametros: { mes?: string; tipo?: string } = {}) {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(parametros) }));
}

describe("página de importación de fuentes externas (/pagos/fuentes-externas/importar)", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T15:00:00Z"));
    simulacro.redirigir.mockClear();
    contexto = crearRepositorioEnMemoria({});
    simulacro.repositorio = contexto.repositorio;
    simulacro.actor.mockResolvedValue(finanzas);
  });

  afterEach(() => vi.useRealTimers());

  it("muestra el formulario del diseño: archivo, tipo preseleccionado, plantilla y «Validar archivo» como única acción principal", async () => {
    const html = await render({ mes: "2026-10", tipo: "adelantos" });

    expect(html).toContain("Importar fuente externa · mes de pago 10/2026");
    expect(html).toContain("Archivo XLSX normalizado");
    expect(html).toContain('<option value="adelantos" selected="">Adelantos</option>');
    expect(html).toContain('href="/pagos/fuentes-externas/plantilla?tipo=adelantos"');
    expect(html).toContain("Descargar plantilla normalizada");
    expect(html).toMatch(/<button class="boton-principal" type="submit"[^>]*>Validar archivo<\/button>/);
    expect(html).toContain('href="/pagos/fuentes-externas?mes=2026-10"');
    // Sin archivo validado no hay vista previa ni «Importar».
    expect(html).not.toContain("Resultado de la validación");
    expect(html).not.toContain("Importar 0");
    expect(html.match(/boton-principal/g)).toHaveLength(1);
  });

  it("sin tipo o con un tipo inexistente preselecciona el primero, y un mes mal escrito se dice con role=alert", async () => {
    const html = await render({ mes: "octubre", tipo: "nada" });

    expect(html).toContain('<option value="comisiones_de_ventas" selected="">Comisiones de ventas</option>');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Se muestra el mes 10/2026.");
  });

  it.each([
    ["el Administrador del sistema", { id: "a", rol: "administrador" }],
    ["Recursos Humanos", { id: "r", rol: "recursos_humanos" }],
    ["un gerente de área", { id: "g", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ])("niega el acceso a %s", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);

    const html = await render();

    expect(html).toContain("Sin permiso");
    expect(html).not.toContain("Archivo XLSX normalizado");
  });

  it("sin sesión lleva a iniciar sesión", async () => {
    simulacro.actor.mockRejectedValue(new Error("La sesión no es válida."));
    await expect(render()).rejects.toThrow("REDIRECT /iniciar-sesion");
  });

  // G31 · Un mes con el pago realizado confirmado es solo consulta: la importación no ofrece el formulario y lo explica (diseño §4.2 y §4.4, R3-SPEC-01).
  it("G31 S11 un mes con pago confirmado explica que es solo consulta y no ofrece el formulario de importación; un mes sin pago sí", async () => {
    contexto.mesesConPagoConfirmado.add("2026-10");

    const pagado = await render({ mes: "2026-10", tipo: "adelantos" });
    const libre = await render({ mes: "2026-11", tipo: "adelantos" });

    expect(pagado).toContain("tiene el pago realizado confirmado");
    for (const control of ["Validar archivo", "Archivo XLSX normalizado", 'type="file"', "Descargar plantilla normalizada"]) expect(pagado).not.toContain(control);
    expect(pagado).toContain('href="/pagos/fuentes-externas?mes=2026-10"');
    expect(libre).not.toContain("tiene el pago realizado confirmado");
    expect(libre).toContain("Validar archivo");
  });
});
