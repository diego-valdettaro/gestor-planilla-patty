import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calcularBorrador, type EntradaDeBorrador } from "@/pagos/calcular-borrador";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), preparar: vi.fn(), redirigir: vi.fn(), noEncontrado: vi.fn() }));
simulacro.redirigir.mockImplementation((ruta: string) => { throw new Error(`REDIRECT ${ruta}`); });
simulacro.noEncontrado.mockImplementation(() => { throw new Error("NOT FOUND"); });
vi.mock("next/navigation", () => ({ redirect: simulacro.redirigir, notFound: simulacro.noEncontrado }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/pagos/preparar-borrador", () => ({ prepararBorrador: simulacro.preparar }));

async function render(dni = "12345678", mes = "2026-10") {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ mes, dni }) }));
}

function calcularEscenarioMovilidad(ingreso: string, movilidades: Array<{ valor: number; vigenteDesde: string }>) {
  const relacion = { id: "r1", dni: "12345678", nombre: "Ana", grupo: "Taller", ingreso, cese: null, ingresoConfirmado: true, ceseConfirmado: false };
  const condiciones: EntradaDeBorrador["condiciones"] = [
    { relacionId: "r1", dato: "sueldo", valor: 200000, vigenteDesde: "2026-01-01" },
    { relacionId: "r1", dato: "jornada_ordinaria_diaria", valor: 480, vigenteDesde: "2026-01-01" },
    { relacionId: "r1", dato: "regimen_laboral", valor: "general", vigenteDesde: "2026-01-01" },
    { relacionId: "r1", dato: "afiliacion_pensionaria", valor: "onp", vigenteDesde: "2026-01-01" },
    { relacionId: "r1", dato: "elegibilidad_familiar", valor: false, vigenteDesde: "2026-01-01" },
    { relacionId: "r1", dato: "sede_de_adscripcion", valor: "Taller", vigenteDesde: "2026-01-01" },
    ...movilidades.map(({ valor, vigenteDesde }) => ({ relacionId: "r1", dato: "movilidad_fija" as const, valor, vigenteDesde })),
  ];
  const entrada: EntradaDeBorrador = { mesDePago: "2026-02", corte: { inicio: "2026-01-26", fin: "2026-02-25" }, relaciones: [relacion], condiciones,
    reglas: [{ codigo: "onp_tasa", valor: 1300, vigenteDesde: "2026-01-01" }, { codigo: "essalud_tasa", valor: 900, vigenteDesde: "2026-01-01" }, { codigo: "essalud_base_minima", valor: 100000, vigenteDesde: "2026-01-01" }],
    problemasDelCorte: [], revisiones: [], hechosPorDni: {}, sustitutorios: [], hechosDeOrigenPorDni: {}, fuentesPendientes: [], importes: [], diasDeVacaciones: {}, abonosVacacionales: [], vacacionesProvisionales: false };
  return calcularBorrador(entrada);
}

describe("desglose de una persona", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    simulacro.actor.mockResolvedValue({ id: "f", rol: "finanzas" });
    simulacro.preparar.mockClear();
    simulacro.preparar.mockResolvedValue({ corte: { inicio: "2026-09-26", fin: "2026-10-25" }, vacacionesProvisionales: false, personas: [
      { vacaciones: [], relacion: { id: "r1", dni: "12345678", nombre: "Ana", grupo: "Taller", ingreso: "2026-10-01", cese: null, ceseConfirmado: false },
        movilidadFijaPendiente: { tramos: [] }, sueldoCalculadoCentimos: 100000, netoCentimos: null, basesPorDevengue: [], bloqueos: ["Sin jornada ordinaria diaria vigente el 2026-10-25."],
        lineas: [{ concepto: "sueldo_basico", importeCentimos: 100000, dias: 30, sueldoMensualCentimos: 100000,
          desde: "2026-10-01", hasta: "2026-10-31", mesDeDevengue: "2026-10", mesDePago: "2026-10",
          corte: { inicio: "2026-09-26", fin: "2026-10-25" }, origen: "Condición laboral" }] },
    ] });
  });

  it("G33 presenta movilidad fija prorrateada pendiente aparte del neto y las bases", async () => {
    const borrador = calcularEscenarioMovilidad("2026-02-15", [{ valor: 28000, vigenteDesde: "2026-01-01" }]);
    const calculada = borrador.personas[0];
    expect(calculada.movilidadFijaPendiente.tramos).toEqual([{ desde: "2026-02-15", hasta: "2026-02-28", dias: 14,
      importeCentimos: 14000, montoMensualCentimos: 28000, mesDeDevengue: "2026-02" }]);
    expect(calculada.netoCentimos).toBeNull();
    expect(calculada.basesPorDevengue).toEqual([{ mesDeDevengue: "2026-02", pensionariaCentimos: null,
      essaludRemunerativaCentimos: null, essaludAplicableCentimos: null, quintaCentimos: null }]);
    expect(calculada.bloqueos).toEqual([expect.stringContaining("clasificación contable de movilidad fija")]);
    simulacro.preparar.mockResolvedValueOnce({ ...borrador, fuentes: [] });

    const html = await render("12345678", "2026-02");

    expect(html).toContain("Movilidad fija mensual pendiente de clasificación");
    expect(html).toContain("S/ 140,00");
    expect(html).toContain("14 días");
    expect(html).toContain("no se suma al neto ni a las bases");
    expect(html).toContain("Neto antes de aportes del trabajador: Incompleto");
    expect(html).toContain("2026-02-28");
    expect(html).toContain("Pendiente</td>");
    const conceptos = html.split('aria-label="Conceptos de la persona"')[1]?.split("</table>")[0] ?? "";
    const bases = html.split('aria-label="Bases por mes de devengue"')[1]?.split("</table>")[0] ?? "";
    expect(conceptos).not.toContain("S/ 140,00");
    expect(bases.match(/<td class="numerico">Pendiente<\/td>/g)).toHaveLength(4);
  });

  it("G32 el detalle mensual no anuncia clasificación para cero y conserva bloqueo con positivo y mezcla", async () => {
    const escenarios = [
      { valor: 0, ingreso: "2026-02-15", aviso: false, cambios: [] as Array<{ valor: number; vigenteDesde: string }> },
      { valor: 28000, ingreso: "2026-02-15", aviso: true, cambios: [] as Array<{ valor: number; vigenteDesde: string }> },
      { valor: 0, ingreso: "2026-02-01", aviso: true, cambios: [{ valor: 28000, vigenteDesde: "2026-02-15" }] },
    ];
    for (const escenario of escenarios) {
      const movilidades = [{ valor: escenario.valor, vigenteDesde: "2026-01-01" }, ...escenario.cambios];
      const borrador = calcularEscenarioMovilidad(escenario.ingreso, movilidades);
      simulacro.preparar.mockResolvedValueOnce({ ...borrador, fuentes: [] });
      const html = await render("12345678", "2026-02");
      expect(html.includes("Movilidad fija mensual pendiente de clasificación")).toBe(escenario.aviso);
      const persona = borrador.personas[0];
      expect(persona.netoCentimos === null).toBe(escenario.aviso);
      expect(persona.movilidadFijaPendiente.tramos.map(({ desde, hasta, montoMensualCentimos, importeCentimos }) => ({ desde, hasta, montoMensualCentimos, importeCentimos }))).toEqual(
        escenario.cambios.length
          ? [{ desde: "2026-02-01", hasta: "2026-02-14", montoMensualCentimos: 0, importeCentimos: 0 }, { desde: "2026-02-15", hasta: "2026-02-28", montoMensualCentimos: 28000, importeCentimos: 14000 }]
          : [{ desde: "2026-02-15", hasta: "2026-02-28", montoMensualCentimos: escenario.valor, importeCentimos: escenario.valor === 0 ? 0 : 14000 }]);
      expect(persona.basesPorDevengue).toHaveLength(1);
      if (escenario.aviso) {
        expect(persona.bloqueos).toEqual([expect.stringContaining("clasificación contable de movilidad fija")]);
        expect(persona.basesPorDevengue[0]).toEqual({ mesDeDevengue: "2026-02", pensionariaCentimos: null,
          essaludRemunerativaCentimos: null, essaludAplicableCentimos: null, quintaCentimos: null });
      } else {
        expect(persona.netoCentimos).toBe(106667);
        expect(persona.bloqueos).toEqual([]);
        expect(persona.basesPorDevengue[0]).toEqual({ mesDeDevengue: "2026-02", pensionariaCentimos: 106667,
          essaludRemunerativaCentimos: 106667, essaludAplicableCentimos: 106667, quintaCentimos: 106667 });
      }
    }
  });

  it("muestra las bases por mes de devengue, con «Pendiente» donde falta una decisión, y explica un aporte", async () => {
    const corte = { inicio: "2026-09-26", fin: "2026-10-25" };
    const resultado = await simulacro.preparar();
    const persona = resultado.personas[0];
    persona.basesPorDevengue = [
      { mesDeDevengue: "2026-09", pensionariaCentimos: null, essaludRemunerativaCentimos: null, essaludAplicableCentimos: null, quintaCentimos: null },
      { mesDeDevengue: "2026-10", pensionariaCentimos: 310000, essaludRemunerativaCentimos: 310000, essaludAplicableCentimos: 310000, quintaCentimos: 330000 },
    ];
    persona.lineas.push({ concepto: "aporte_onp", importeCentimos: 40300, baseCentimos: 310000, tasaEnCentesimasDePunto: 1300, tipo: "deduccion_del_trabajador",
      efectoEnNeto: "resta", mesDeDevengue: "2026-10", mesDePago: "2026-10", corte, origen: "Reglas legales y condiciones laborales" });
    persona.lineas.push({ concepto: "essalud_patronal", importeCentimos: 27900, baseCentimos: 310000, minimoCentimos: 100000, tasaEnCentesimasDePunto: 900, tipo: "aporte_patronal",
      efectoEnNeto: "ninguno", mesDeDevengue: "2026-10", mesDePago: "2026-10", corte, origen: "Reglas legales y condiciones laborales" });
    simulacro.preparar.mockResolvedValue(resultado);
    const html = await render();
    expect(html).toContain("Base pensionaria");
    expect(html).toContain("Base de quinta categoría");
    expect(html).toMatch(/<td[^>]*>Pendiente<\/td>/);
    expect(html).toMatch(/<td[^>]*>S\/\s*3\.100,00<\/td>/);
    expect(html).toContain("13,00 % sobre la base de devengue");
    expect(html).toContain("Se descuenta a la persona");
    expect(html).toContain("9,00 % sobre la base de devengue");
    expect(html).toContain("con base mínima de");
    expect(html).toContain("no resta del neto");
    expect(html).not.toContain("undefined");
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

  it("muestra el trabajo en descanso o feriado con su regularización y la marca de validación legal", async () => {
    const borrador = await simulacro.preparar.getMockImplementation()?.();
    borrador.personas[0].lineas.push({ concepto: "trabajo_en_descanso_o_feriado", importeCentimos: 20000, minutos: 360, fecha: "2026-09-30",
      grupo: "Taller", clase: "feriado", regularizacion: true, mesDeDevengue: "2026-09", mesDePago: "2026-10", corte: borrador.corte,
      origen: "Asistencia", remuneracionOrdinariaComputableCentimos: 300000, jornadaOrdinariaDiariaMinutos: 360, sobretasaEnCentesimasDePunto: 10000,
      evidencia: { asistenciaId: "a-2", turnoPublicadoId: "t-2" } });
    simulacro.preparar.mockResolvedValueOnce(borrador);
    const html = await render();
    expect(html).toContain("Trabajo en descanso o feriado sin sustitución");
    expect(html).toContain("Regularización de descanso sustitutorio no otorgado");
    expect(html).toContain("Devengue anterior");
    expect(html).toContain("sobretasa 100 %");
    expect(html).toContain("pendiente de validación con Finanzas o el contador");
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
