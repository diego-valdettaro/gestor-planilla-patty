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
vi.mock("../actions", () => ({
  registrarImporteDesdeFormulario: vi.fn(), anularImporteDesdeFormulario: vi.fn(), confirmarFuenteDesdeFormulario: vi.fn(), volverAPendienteDesdeFormulario: vi.fn(),
}));

import type { Actor } from "@/autenticacion/permisos";
import { confirmarFuente, registrarImporte } from "@/fuentes-externas/gestionar-fuentes-externas";
import { crearRepositorioEnMemoria } from "@/fuentes-externas/repositorio-en-memoria";

const finanzas: Actor = { id: "fin-1", rol: "finanzas", nombreUsuario: "finanzas" };
const ANA = "11111111";

async function render(tipo = "comisiones_de_ventas", mes?: string) {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ tipo }), searchParams: Promise.resolve({ mes }) }));
}

describe("página de un tipo de fuente (/pagos/fuentes-externas/[tipo])", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;
  const registrar = (cambios: Record<string, string> = {}) => registrarImporte(contexto.repositorio, finanzas, {
    tipoDeFuente: "comisiones_de_ventas", dni: ANA, concepto: "comision_de_ventas", fechaDelHecho: "2026-09-28", mesDeDevengue: "2026-09", mesDeAplicacion: "2026-10", monto: "250,50", ...cambios,
  });

  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T15:00:00Z"));
    simulacro.redirigir.mockClear();
    contexto = crearRepositorioEnMemoria({ [ANA]: "Ana Sintética" });
    simulacro.repositorio = contexto.repositorio;
    simulacro.actor.mockResolvedValue(finanzas);
  });

  afterEach(() => vi.useRealTimers());

  it("lista cada fila con persona, DNI, concepto, fecha del hecho, devengue, aplicación, importe y procedencia", async () => {
    await registrar();

    const html = await render();

    expect(html).toContain("<h1>Comisiones de ventas · mes de pago 10/2026</h1>");
    expect(html).toContain("Ana Sintética");
    expect(html).toContain("DNI 11111111");
    expect(html).toContain("Comisión de ventas");
    expect(html).toContain("Suma al neto");
    expect(html).toContain("28/09/2026");
    expect(html).toContain("09/2026");
    expect(html).toContain("Devengue anterior");
    expect(html).toContain("10/2026");
    expect(html).toContain("S/ 250,50");
    expect(html).toContain("Carga manual");
    expect(html).toContain("Anular");
    expect(html).toContain("Registrar importe");
    expect(html).toContain("Pendiente");
    expect(html).toContain('href="/pagos/fuentes-externas?mes=2026-10"');
  });

  it("un concepto que resta del neto lo dice con texto", async () => {
    await registrar({ tipoDeFuente: "adelantos", concepto: "adelanto", mesDeDevengue: "2026-10", fechaDelHecho: "2026-10-03" });

    const html = await render("adelantos", "2026-10");

    expect(html).toContain("Resta del neto");
    expect(html).not.toContain("Devengue anterior");
  });

  it("sin filas muestra el estado vacío con su siguiente paso y «Confirmar sin importes»", async () => {
    const html = await render("prestamos", "2026-10");

    expect(html).toContain("No hay filas de Préstamos (cuotas) para este mes");
    expect(html).toContain("Cargue un importe abajo o confirme el listado sin importes.");
    expect(html).toContain("Confirmar sin importes");
    expect(html).not.toContain("<table");
  });

  it("una fuente confirmada muestra quién la confirmó y ofrece volver a pendiente en lugar de confirmar", async () => {
    await confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente: "adelantos", mes: "2026-10" });

    const html = await render("adelantos", "2026-10");

    expect(html).toContain("Confirmada sin importes");
    expect(html).toContain("Confirmada por usuario-fin-1");
    expect(html).toContain("Volver a pendiente");
    expect(html).not.toContain("Confirmar sin importes");
  });

  it("el formulario de carga ofrece solo los conceptos de este tipo de fuente", async () => {
    const gratificacion = await render("gratificacion_y_bonificacion", "2026-10");
    expect(gratificacion).toContain("Gratificación legal");
    expect(gratificacion).toContain("Bonificación extraordinaria");
    expect(gratificacion).not.toContain(">Comisión de ventas<");

    const comisiones = await render();
    expect(comisiones).toContain('type="hidden" name="concepto" value="comision_de_ventas"');
    expect(comisiones).not.toContain("Hora extra");
  });

  it("un tipo de fuente inexistente dice que no existe y enlaza de vuelta", async () => {
    const html = await render("bonos_libres");

    expect(html).toContain("No existe ese tipo de fuente");
    expect(html).toContain('href="/pagos/fuentes-externas"');
  });

  it.each([
    ["el Administrador del sistema", { id: "a", rol: "administrador" }],
    ["Recursos Humanos", { id: "r", rol: "recursos_humanos" }],
    ["un gerente de área", { id: "g", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ])("niega el acceso a %s", async (_nombre, actor) => {
    await registrar();
    simulacro.actor.mockResolvedValue(actor);

    const html = await render();

    expect(html).toContain("Sin permiso");
    expect(html).not.toContain("Ana Sintética");
  });

  it("sin sesión lleva a iniciar sesión", async () => {
    simulacro.actor.mockRejectedValue(new Error("La sesión no es válida."));
    await expect(render()).rejects.toThrow("REDIRECT /iniciar-sesion");
  });
});
