import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), repositorio: undefined as unknown }));

vi.mock("next/navigation", () => ({ redirect: (ruta: string) => { throw new Error(`REDIRECT ${ruta}`); } }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/condiciones-laborales/servicio", () => ({
  get repositorioDeCondicionesLaborales() { return simulacro.repositorio; },
}));
vi.mock("../actions", () => ({ registrarCondicionDesdeFormulario: vi.fn(), corregirCondicionDesdeFormulario: vi.fn() }));

import type { Actor } from "@/autenticacion/permisos";
import { corregirCondicionLaboral, registrarCondicionLaboral } from "@/condiciones-laborales/gestionar-condiciones-laborales";
import { BETO_RELACION, crearRepositorioEnMemoria } from "@/condiciones-laborales/repositorio-en-memoria";

const finanzas: Actor = { id: "fin-1", rol: "finanzas" };

async function render(relacionId: string) {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ relacionId }) }));
}

describe("página de detalle de Condiciones laborales (/pagos/condiciones-laborales/[relacionId])", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;
  const registrar = (dato: string, valor: string, vigenteDesde: string) => registrarCondicionLaboral(contexto.repositorio, finanzas, { relacionId: BETO_RELACION, dato, valor, vigenteDesde });

  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T15:00:00Z"));
    contexto = crearRepositorioEnMemoria();
    simulacro.repositorio = contexto.repositorio;
    simulacro.actor.mockResolvedValue(finanzas);
  });

  afterEach(() => vi.useRealTimers());

  it("muestra el objeto, una única acción principal y un panel por dato", async () => {
    const html = await render(BETO_RELACION);

    expect(html).toContain("Condiciones laborales de Beto Ruiz");
    expect(html).toContain("DNI 99900002 · Grupo Taller · Ingreso 08/01/2024 – vigente");
    expect(html).toContain("Volver a condiciones laborales");
    expect([...html.matchAll(/<button[^>]*>Registrar nuevo valor/g)]).toHaveLength(1);
    for (const titulo of ["Sueldo", "Banco de pago", "Movilidad fija mensual", "Jornada ordinaria diaria", "Régimen laboral", "Afiliación pensionaria", "Esquema de comisión AFP", "Asignación familiar otorgada", "Sede de adscripción"]) {
      expect(html).toContain(`>${titulo}</h2>`);
    }
    expect(html.match(/Pendiente: todavía no hay ningún valor/g)).toHaveLength(9);
    expect(html).not.toContain("S/ 0,00");
  });

  it("G24 permite elegir e ingresar banco y movilidad fija mensual", async () => {
    const { CampoDeValor } = await import("./formularios") as unknown as { CampoDeValor: (props: { dato: "banco_de_pago" | "movilidad_fija"; sedes: string[] }) => React.ReactElement };
    expect(typeof CampoDeValor).toBe("function");

    const banco = renderToStaticMarkup(createElement(CampoDeValor, { dato: "banco_de_pago", sedes: [] }));
    const movilidad = renderToStaticMarkup(createElement(CampoDeValor, { dato: "movilidad_fija", sedes: [] }));
    expect(banco).toContain("Banco de pago");
    expect(banco).toContain('name="valor"');
    expect(movilidad).toContain("Movilidad fija mensual");
    expect(movilidad).toContain('name="valor"');
  });

  it("G24 muestra banco y bono fijo con sus vigencias en la ficha", async () => {
    await registrar("banco_de_pago", "BCP", "2026-09-01");
    await registrar("movilidad_fija", "280", "2026-09-01");

    const html = await render(BETO_RELACION);

    expect(html).toContain("Banco de pago");
    expect(html).toContain("BCP");
    expect(html).toContain("Movilidad fija mensual");
    expect(html).toContain("S/ 280,00");
    expect(html).toContain("01/09/2026</td><td>Vigente");
  });

  it("G24 explica el tratamiento contable pendiente y el bloqueo del pago por movilidad fija", async () => {
    await registrar("movilidad_fija", "280", "2026-09-01");

    const html = await render(BETO_RELACION);

    expect(html).toContain("Clasificación contable pendiente");
    expect(html).toContain("La finalización del pago queda bloqueada hasta que se confirme su tratamiento.");
  });

  it("G32 no muestra bloqueo de clasificación cuando la movilidad fija vigente es cero", async () => {
    await registrar("movilidad_fija", "0", "2026-09-01");

    const html = await render(BETO_RELACION);

    expect(html).toContain("S/ 0,00");
    expect(html).not.toContain("Clasificación contable pendiente");
    expect(html).not.toContain("La finalización del pago queda bloqueada");
  });

  it("un cambio de sueldo dentro del mes aparece como dos filas con vigencias contiguas", async () => {
    await registrar("sueldo", "1500", "2026-09-01");
    await registrar("sueldo", "1800", "2026-09-16");

    const html = await render(BETO_RELACION);

    expect(html).toContain("S/ 1.500,00");
    expect(html).toContain("01/09/2026</td><td>15/09/2026");
    expect(html).toContain("16/09/2026</td><td>Vigente");
    expect(html).toContain("Anterior");
    expect(html).toContain("Vigente hoy (07/10/2026): <strong>S/ 1.800,00</strong>");
  });

  it("una corrección deja el valor anterior «Reemplazado» con su motivo y sin acción", async () => {
    const errada = await registrar("sueldo", "15000", "2026-09-01");
    await corregirCondicionLaboral(contexto.repositorio, finanzas, { condicionId: errada.id, valor: "1500", motivo: "Error de digitación" });

    const html = await render(BETO_RELACION);

    expect(html).toContain("Reemplazado");
    expect(html).toContain("Motivo: Error de digitación");
    expect([...html.matchAll(/<button[^>]*>Corregir<span class="sr-only"> sueldo/g)]).toHaveLength(1);
  });

  it("deshabilita Corregir con la causa visible cuando una versión finalizada usó el valor", async () => {
    const usada = await registrar("sueldo", "1500", "2026-08-01");
    contexto.versionesFinalizadas.set(usada.id, [{ mes: "2026-09", numero: 2 }]);

    const html = await render(BETO_RELACION);

    expect(html).toContain("disabled");
    expect(html).toContain("Lo usa la versión 2 de 09/2026; corríjalo con un ajuste de preliquidación.");
    expect(html).not.toContain("Corregir sueldo");
  });

  it("una relación inexistente o sin ingreso confirmado explica por qué no hay detalle", async () => {
    const html = await render("no-existe");

    expect(html).toContain("No existe esa relación laboral confirmada");
    expect(html).toContain("Volver a condiciones laborales");
  });

  it.each([
    ["el Administrador del sistema", { id: "a", rol: "administrador" }],
    ["Recursos Humanos", { id: "r", rol: "recursos_humanos" }],
    ["un gerente de área", { id: "g", rol: "gerente_de_area", grupos: [{ nombre: "Taller", gestionaAsistencia: true }] }],
  ])("niega el acceso a %s", async (_nombre, actor) => {
    await registrar("sueldo", "1500", "2026-09-01");
    simulacro.actor.mockResolvedValue(actor);

    const html = await render(BETO_RELACION);

    expect(html).toContain("Sin permiso");
    expect(html).not.toContain("S/ ");
    expect(html).not.toContain("Beto Ruiz");
  });
});
