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
// Las acciones de servidor traen el módulo de base de datos; las pruebas de la página no las ejecutan.
vi.mock("./actions", () => ({
  registrarImporteDesdeFormulario: vi.fn(), anularImporteDesdeFormulario: vi.fn(), confirmarFuenteDesdeFormulario: vi.fn(), volverAPendienteDesdeFormulario: vi.fn(),
}));

import type { Actor } from "@/autenticacion/permisos";
import { anularImporte, confirmarFuente, registrarImporte } from "@/fuentes-externas/gestionar-fuentes-externas";
import { crearRepositorioEnMemoria } from "@/fuentes-externas/repositorio-en-memoria";

const finanzas: Actor = { id: "fin-1", rol: "finanzas", nombreUsuario: "finanzas" };
const ANA = "11111111";

async function render(mes?: string) {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({ mes }) }));
}

describe("página de Fuentes externas (/pagos/fuentes-externas)", () => {
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

  it("muestra el mes actual de Lima, el recordatorio y una fila por tipo de fuente, todas pendientes al comienzo", async () => {
    const html = await render();

    expect(html).toContain("Fuentes externas del mes de pago 10/2026");
    expect(html).toContain("Una persona sin fila cuenta como cero solo cuando confirma el tipo de fuente.");
    expect(html).toContain("(sección actual)");
    for (const nombre of ["Comisiones de ventas", "Movilidad supeditada a asistencia", "Adelantos", "Préstamos (cuotas)", "Retención de quinta categoría", "Gratificación legal y bonificación extraordinaria"]) {
      expect(html).toContain(nombre);
    }
    expect(html).toContain("6 pendientes");
    expect(html.match(/>Pendiente</g)).toHaveLength(6);
    expect(html).toContain('href="/pagos/fuentes-externas/comisiones_de_ventas?mes=2026-10"');
    expect(html).toContain("Confirmar sin importes");
    expect(html).toContain('href="/pagos/fuentes-externas/importar?mes=2026-10&amp;tipo=comisiones_de_ventas"');
    expect(html.match(/>Importar XLSX</g)).toHaveLength(6);
    expect(html).toContain("Sin filas");
    // Una fuente pendiente sin filas no muestra S/ 0,00: el faltante no es cero.
    expect(html.match(/<td class="numerico">—<\/td>/g)).toHaveLength(6);
  });

  it("distingue Pendiente, Confirmada con importes y Confirmada sin importes con texto, filas e importe total", async () => {
    await registrar({ monto: "100" });
    await registrar({ fechaDelHecho: "2026-09-29", monto: "20,25" });
    await confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente: "comisiones_de_ventas", mes: "2026-10" });
    await confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente: "adelantos", mes: "2026-10" });

    const html = await render("2026-10");

    expect(html).toContain("Confirmada con importes");
    expect(html).toContain("Confirmada sin importes");
    expect(html).toContain("S/ 120,25");
    expect(html).toContain("Confirmada por usuario-fin-1");
    expect(html).toContain("Carga manual");
    expect(html).toContain("Volver a pendiente");
    expect(html).toContain("4 pendientes");
    expect(html).toContain("Confirmar sin importes");
  });

  it("el diálogo de confirmar trae el alcance, la consecuencia y la cancelación del diseño", async () => {
    const html = await render("2026-10");

    expect(html).toContain("¿Confirmar sin importes Comisiones de ventas de 10/2026?");
    expect(html).toContain("A partir de ahora, las personas sin fila cuentan como S/ 0,00 en esta fuente.");
    expect(html).toContain("Cancelar deja la fuente pendiente.");
  });

  it("otro mes de pago empieza pendiente aunque el mes anterior esté confirmado", async () => {
    await confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente: "adelantos", mes: "2026-10" });

    const html = await render("2026-11");

    expect(html).toContain("Fuentes externas del mes de pago 11/2026");
    expect(html).toContain("6 pendientes");
    expect(html).not.toContain("Confirmada sin importes");
  });

  it("un mes mal escrito se dice junto al campo y se muestra el mes actual", async () => {
    const html = await render("octubre");

    expect(html).toContain('role="alert"');
    expect(html).toContain("El mes de pago no es válido");
    expect(html).toContain("Se muestra el mes 10/2026.");
  });

  it.each([
    ["el Administrador del sistema", { id: "a", rol: "administrador" }],
    ["Recursos Humanos", { id: "r", rol: "recursos_humanos" }],
    ["un gerente de área", { id: "g", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ])("niega el acceso a %s y no consulta ninguna fuente", async (_nombre, actor) => {
    await registrar();
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

  it("una fila anulada no cuenta en el resumen", async () => {
    const { importe } = await registrar();
    await anularImporte(contexto.repositorio, finanzas, { importeId: importe.id, motivo: "Error" });

    const html = await render("2026-10");

    expect(html).not.toContain("S/ 250,50");
    expect(html).toContain("6 pendientes");
  });
});
