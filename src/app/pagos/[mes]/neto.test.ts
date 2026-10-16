import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Neto en /pagos/[mes] (#127). Valores de ejemplos-sinteticos.md (E1, E2, E4, E8) escritos como el borrador que entregaría el cálculo.
const simulacro = vi.hoisted(() => ({ actor: vi.fn(), preparar: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/pagos/preparar-borrador", () => ({ prepararBorrador: simulacro.preparar }));

const ROTULO = "Neto antes de aportes del trabajador";
const corte = { inicio: "2026-09-26", fin: "2026-10-25" };
const relacion = (id: string, dni: string, nombre: string) => ({ id, dni, nombre, grupo: "Taller" });
const calculada = { relacion: relacion("r1", "12345678", "Ana"), sedeDeAdscripcion: "Taller", sueldoCalculadoCentimos: 200000, netoCentimos: 177000, bloqueos: [], lineas: [] };
const benavides = { relacion: relacion("r2", "87654321", "Beto"), sedeDeAdscripcion: "Tiendas Benavides", sueldoCalculadoCentimos: 100000, netoCentimos: 100000, bloqueos: [], lineas: [] };
const negativa = { relacion: relacion("r3", "11112222", "Carla"), sedeDeAdscripcion: "Taller", sueldoCalculadoCentimos: 100000, netoCentimos: null, lineas: [],
  bloqueos: ["Neto negativo: S/ −200,00. Revise deducciones y adelantos, o registre un ajuste de preliquidación. No se arrastra al mes siguiente."] };

function borrador(parcial: Record<string, unknown> = {}) {
  return { mesDePago: "2026-10", corte, revisiones: [], bloqueosDelMes: [], sueldoCalculadoCentimos: 400000, vacacionesProvisionales: false, fuentes: [],
    personas: [calculada, benavides, negativa],
    totalesPorSede: [{ sede: "Taller", personas: 2, calculadas: 1, netoCentimos: 177000 }, { sede: "Tiendas Benavides", personas: 1, calculadas: 1, netoCentimos: 100000 }],
    netoCalculadoCentimos: 277000, personasBloqueadas: 1, ...parcial };
}

async function render() {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ mes: "2026-10" }), searchParams: Promise.resolve({}) }));
}
const seccion = (html: string, region: string) => html.split(`aria-label="${region}"`)[1]?.split("</table>")[0] ?? "";
const filaDe = (html: string, nombre: string) => html.split("<tr>").find((fila) => fila.startsWith('<th scope="row"><a') && fila.includes(`>${nombre}</a>`)) ?? "";

describe("neto en el mes de pago", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    simulacro.actor.mockResolvedValue({ id: "f", rol: "finanzas" });
    simulacro.preparar.mockReset();
    simulacro.preparar.mockResolvedValue(borrador());
  });

  it("P01 la persona calculada muestra su neto y el estado Calculada", async () => {
    const fila = filaDe(await render(), "Ana");
    expect(fila).toContain("S/ 1.770,00");
    expect(fila).toContain("Calculada");
  });

  it("P02 la persona con neto negativo aparece Bloqueada con el motivo y sin neto válido", async () => {
    const html = await render();
    const fila = filaDe(html, "Carla");
    expect(fila).toContain("Bloqueada");
    expect(fila).toContain("Neto negativo");
    expect(fila).toContain("Incompleto");
    expect(fila).not.toContain("S/ −200,00");
    expect(fila).not.toContain("S/ 0,00");
    expect(html).toContain('href="/pagos/2026-10/11112222"');
    expect(html).toContain("Neto negativo: S/ −200,00");
    expect(html).not.toContain('href="/periodos">Revise el período');
  });

  it("P03 Por sede de adscripción muestra el neto de cada sede", async () => {
    const tabla = seccion(await render(), "Sueldo por sede de adscripción");
    expect(tabla).toMatch(/Taller<\/th>.*S\/ 1\.770,00/);
    expect(tabla).toMatch(/Tiendas Benavides<\/th>.*S\/ 1\.000,00/);
  });

  it("P04 Totales del mes completo suma las calculadas y rotula Incompleto con el conteo excluido", async () => {
    const html = await render();
    const tabla = seccion(html, "Totales del mes completo");
    expect(tabla).toContain("S/ 2.770,00");
    expect(html).toContain("Incompleto");
    expect(html).toContain("1 persona con bloqueo");
  });

  it("P05 con una fuente pendiente ninguna persona muestra neto y el mes nombra la fuente", async () => {
    simulacro.preparar.mockResolvedValue(borrador({ bloqueosDelMes: ["Fuente externa pendiente: Préstamos (cuotas)."], personas: [{ ...calculada, netoCentimos: null }],
      totalesPorSede: [{ sede: "Taller", personas: 1, calculadas: 0, netoCentimos: 0 }], netoCalculadoCentimos: 0, personasBloqueadas: 0 }));
    const html = await render();
    expect(html).toContain("Fuente externa pendiente: Préstamos (cuotas).");
    const fila = filaDe(html, "Ana");
    expect(fila).toContain("Incompleto");
    expect(fila).not.toContain("Calculada");
    expect(fila).not.toContain("S/ 1.770,00");
  });

  it("P09 el neto lleva el rótulo obligatorio en las tres tablas", async () => {
    const html = await render();
    for (const region of ["Totales del mes completo", "Sueldo por sede de adscripción", "Personas del mes"]) expect(seccion(html, region)).toContain(ROTULO);
  });
});
