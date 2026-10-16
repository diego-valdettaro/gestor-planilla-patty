import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Neto y fuentes externas en el detalle de la persona (#127). Valores de ejemplos-sinteticos.md (E1, E4, E5).
const simulacro = vi.hoisted(() => ({ actor: vi.fn(), preparar: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/pagos/preparar-borrador", () => ({ prepararBorrador: simulacro.preparar }));

const ROTULO = "Neto antes de aportes del trabajador";
const corte = { inicio: "2026-09-26", fin: "2026-10-25" };
const comunes = { mesDeDevengue: "2026-10", mesDePago: "2026-10", corte };
const NINGUNA = { pensionaria: "no_afecta", essalud: "no_afecta", quinta: "no_afecta" };
const externa = (concepto: string, importeCentimos: number, efectoEnNeto: "suma" | "resta", efectosEnBases: Record<string, string>) =>
  ({ concepto, importeCentimos, efectoEnNeto, efectosEnBases, origen: "Fuente externa", procedencia: "carga_manual", fechaDelHecho: "2026-10-05", ...comunes });
const lineas = [
  { concepto: "sueldo_basico", importeCentimos: 200000, dias: 30, sueldoMensualCentimos: 200000, desde: "2026-10-01", hasta: "2026-10-31", origen: "Condición laboral", ...comunes },
  externa("comision_de_ventas", 15000, "suma", { pensionaria: "suma", essalud: "suma", quinta: "suma" }),
  externa("movilidad_supeditada_a_asistencia", 12000, "suma", { ...NINGUNA, quinta: "suma" }),
  externa("adelanto", 30000, "resta", NINGUNA),
  externa("cuota_de_prestamo", 20000, "resta", NINGUNA),
];

function borrador(persona: Record<string, unknown> = {}, parcial: Record<string, unknown> = {}) {
  return { mesDePago: "2026-10", corte, vacacionesProvisionales: false, bloqueosDelMes: [], fuentes: [], revisiones: [], personas: [
    { vacaciones: [], relacion: { id: "r1", dni: "12345678", nombre: "Ana", grupo: "Taller", ingreso: "2026-01-01", cese: null, ceseConfirmado: false },
      sedeDeAdscripcion: "Taller", sueldoCalculadoCentimos: 200000, netoCentimos: 177000, bloqueos: [], lineas, ...persona },
  ], ...parcial };
}

async function render() {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ mes: "2026-10", dni: "12345678" }) }));
}

describe("neto en el detalle de la persona", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    simulacro.actor.mockResolvedValue({ id: "f", rol: "finanzas" });
    simulacro.preparar.mockReset();
    simulacro.preparar.mockResolvedValue(borrador());
  });

  it("P06 el resumen muestra el neto y la tabla lista las líneas externas con su efecto y procedencia", async () => {
    const html = await render();
    expect(html).toContain("S/ 1.770,00");
    const filas = html.split("<tr>").filter((fila) => fila.startsWith('<th scope="row">'));
    const de = (nombre: string) => filas.find((fila) => fila.includes(nombre)) ?? "";
    expect(de("Comisión de ventas")).toContain("S/ 150,00");
    expect(de("Comisión de ventas")).not.toContain("−S/ 150,00");
    expect(de("Movilidad supeditada a asistencia")).toContain("S/ 120,00");
    expect(de("Adelanto")).toContain("−S/ 300,00");
    expect(de("Cuota de préstamo")).toContain("−S/ 200,00");
    expect(de("Adelanto")).toContain("Fuente externa");
    expect(de("Adelanto")).toContain("Ver base");
    expect(de("Adelanto")).not.toContain("undefined");
  });

  it("P07 el detalle muestra la imputación a la sede de adscripción", async () => {
    expect(await render()).toContain("Imputado a la sede de adscripción Taller");
  });

  it("P08 con una fuente pendiente no hay neto numérico, se nombra la fuente y la incidencia en investigación no descuenta", async () => {
    simulacro.preparar.mockResolvedValue(borrador({ netoCentimos: null, lineas: lineas.filter(({ concepto }) => concepto !== "cuota_de_prestamo") },
      { bloqueosDelMes: ["Fuente externa pendiente: Préstamos (cuotas)."], fuentes: [{ codigo: "prestamos", nombre: "Préstamos (cuotas)", estado: "Pendiente", filas: 1 }] }));
    const html = await render();
    expect(html).toContain(`${ROTULO}: Incompleto`);
    expect(html).toContain("Fuente pendiente: Préstamos (cuotas)");
    expect(html).not.toContain("Descuento autorizado por incidencia");
  });

  it("P10 el resumen rotula el neto con el texto exacto", async () => {
    expect(await render()).toContain(`${ROTULO}: S/ 1.770,00`);
  });
});
