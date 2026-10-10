import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), preparar: vi.fn(), redirigir: vi.fn(), noEncontrado: vi.fn() }));
simulacro.redirigir.mockImplementation((ruta: string) => { throw new Error(`REDIRECT ${ruta}`); });
simulacro.noEncontrado.mockImplementation(() => { throw new Error("NOT FOUND"); });
vi.mock("next/navigation", () => ({ redirect: simulacro.redirigir, notFound: simulacro.noEncontrado }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/pagos/preparar-borrador", () => ({ prepararBorrador: simulacro.preparar }));

async function render(dni = "12345678") {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ mes: "2026-10", dni }) }));
}

describe("desglose de una persona", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    simulacro.actor.mockResolvedValue({ id: "f", rol: "finanzas" });
    simulacro.preparar.mockClear();
    simulacro.preparar.mockResolvedValue({ corte: { inicio: "2026-09-26", fin: "2026-10-25" }, vacacionesProvisionales: false, personas: [
      { vacaciones: [], relacion: { id: "r1", dni: "12345678", nombre: "Ana", grupo: "Taller", ingreso: "2026-10-01", cese: null, ceseConfirmado: false },
        sueldoCalculadoCentimos: 100000, netoCentimos: null, bloqueos: ["Sin jornada ordinaria diaria vigente el 2026-10-25."],
        lineas: [{ concepto: "sueldo_basico", importeCentimos: 100000, dias: 30, sueldoMensualCentimos: 100000,
          desde: "2026-10-01", hasta: "2026-10-31", mesDeDevengue: "2026-10", mesDePago: "2026-10",
          corte: { inicio: "2026-09-26", fin: "2026-10-25" }, origen: "Condición laboral" }] },
    ] });
  });

  it("muestra los tres tiempos y la base de la línea, con bloqueo enlazado", async () => {
    const html = await render();
    expect(html).toContain("Mes de devengue");
    expect(html).toContain("Mes de pago");
    expect(html).toContain("Corte de incidencias");
    expect(html).toContain("divisor 30");
    expect(html).toContain("role=\"status\"");
    expect(html).toContain("/pagos/condiciones-laborales/r1");
    expect(html).toContain("Incompleto");
  });

  it("niega el detalle monetario a Recursos Humanos", async () => {
    simulacro.actor.mockResolvedValue({ id: "r", rol: "recursos_humanos" });
    expect(await render()).toContain("Sin permiso");
    expect(simulacro.preparar).not.toHaveBeenCalled();
  });

  it("enlaza la jornada que originó la hora extra", async () => {
    const borrador = await simulacro.preparar.getMockImplementation()?.();
    const persona = borrador.personas[0];
    persona.lineas.push({ concepto: "horas_extra_25", importeCentimos: 1000, minutos: 30.5, fecha: "2026-10-02", grupo: "Taller",
      mesDeDevengue: "2026-10", mesDePago: "2026-10", corte: borrador.corte, origen: "Asistencia",
      remuneracionOrdinariaComputableCentimos: 300000, jornadaOrdinariaDiariaMinutos: 360, sobretasaEnCentesimasDePunto: 2500,
      evidencia: { asistenciaId: "a-1", turnoPublicadoId: "t-1" } });
    simulacro.preparar.mockResolvedValueOnce(borrador);
    const html = await render();
    expect(html).toContain("Hora extra 25 %");
    expect(html).toContain("Ver jornada");
    expect(html).toContain("/asistencias?vista=mensual&amp;grupo=Taller&amp;fecha=2026-10-02&amp;colaborador=12345678");
  });

  it("desglosa por mes las vacaciones, el abono asignado y el saldo, y explica las líneas de remuneración vacacional y su ajuste", async () => {
    const borrador = await simulacro.preparar.getMockImplementation()?.();
    const persona = borrador.personas[0];
    const comunes = { mesDeDevengue: "2026-10", mesDePago: "2026-10", corte: borrador.corte, inicioDelDescanso: "2026-09-29", finDelDescanso: "2026-10-04", baseSueldoCentimos: 300000 };
    persona.lineas.push(
      { concepto: "remuneracion_vacacional", importeCentimos: 40000, dias: 4, diasCalendario: 4, desde: "2026-10-01", hasta: "2026-10-04", origen: "Vacaciones aprobadas en Asistencia", ...comunes },
      { concepto: "ajuste_por_variacion_de_sueldo_en_vacaciones", importeCentimos: 2000, dias: 2, desde: "2026-10-03", hasta: "2026-10-04", sueldoVigenteCentimos: 330000, origen: "Variación de sueldo durante el descanso", ...comunes },
    );
    persona.vacaciones = [{ inicio: "2026-09-29", fin: "2026-10-04", dias: 6, baseSueldoCentimos: 300000, abonos: [
      { id: "a1", fechaDelAbono: "2026-09-28", importeCentimos: 30000, mesDeAplicacion: "2026-09", asignaciones: [{ mes: "2026-09", centimos: 10000 }, { mes: "2026-10", centimos: 20000 }] },
    ], meses: [
      { mes: "2026-09", diasDeDescanso: 2, diasConvencionales: 2, remuneracionCentimos: 20000, abonosAsignadosCentimos: 10000, saldoCentimos: 10000 },
      { mes: "2026-10", diasDeDescanso: 4, diasConvencionales: 4, remuneracionCentimos: 40000, abonosAsignadosCentimos: 20000, saldoCentimos: 20000 },
    ] }];
    borrador.vacacionesProvisionales = true;
    simulacro.preparar.mockResolvedValueOnce(borrador);
    const html = await render();
    expect(html).toContain("Vacaciones del mes");
    expect(html).toContain("Descanso del 29/09/2026 al 04/10/2026 (6 días)");
    expect(html).toContain("Mes de origen");
    expect(html).toContain("Mes de pago");
    expect(html).toContain("Abonos anticipados asignados");
    expect(html).toContain("Saldo a entregar");
    expect(html).toContain("4 días");
    expect(html).toContain("Abono del 28/09/2026 por");
    expect(html).toContain("a 09/2026 y");
    expect(html).toContain("Remuneración vacacional");
    expect(html).toContain("Ajuste por variación de sueldo en vacaciones");
    expect(html).toContain("no suma un sueldo adicional");
    expect(html).toContain("La app la calcula");
    expect(html).toContain("pueden cambiar hasta que el período se cierre");
    expect(html).toContain("no es el saldo ni la adquisición del derecho vacacional");
  });

  it("no muestra la sección de vacaciones si la persona no tiene descanso en el mes", async () => {
    expect(await render()).not.toContain("Vacaciones del mes");
  });

  it("no expone una persona fuera del mes", async () => {
    await expect(render("87654321")).rejects.toThrow("NOT FOUND");
  });
});
