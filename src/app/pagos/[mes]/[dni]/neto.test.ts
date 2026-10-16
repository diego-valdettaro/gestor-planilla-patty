import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import type { CondicionLaboral } from "@/condiciones-laborales/vigencia";
import type { FuentesDelBorrador } from "@/pagos/preparar-borrador";
import { crearRepositorioEnMemoria } from "@/fuentes-externas/repositorio-en-memoria";
import { registrarImporte, confirmarFuente, volverAPendiente } from "@/fuentes-externas/gestionar-fuentes-externas";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";

// Neto y fuentes externas en el detalle de la persona (#127). Valores de ejemplos-sinteticos.md (E1, E4, E5).
const simulacro = vi.hoisted(() => ({ actor: vi.fn(), preparar: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/pagos/preparar-borrador", () => ({ prepararBorrador: simulacro.preparar }));

// Lectores externos sintéticos; casos de uso, cálculo y repositorio en memoria reales.
const MES = "2026-10";
const DNI = "12345678";
const finanzas: Actor = { id: "11111111-1111-4111-8111-111111111111", rol: "finanzas", nombreUsuario: "finanzas" };

const condicion = (dato: CondicionLaboral["dato"], valor: CondicionLaboral["valor"]): CondicionLaboral => ({
  id: `c-${dato}`, relacionId: "r1", dato, valor, vigenteDesde: "2026-01-01", registradaPorId: finanzas.id, registradaPor: "finanzas",
  registradaEn: new Date("2026-01-01T00:00:00Z"), reemplazadaEn: null, motivoDeReemplazo: null,
});

function fuentesCon(repositorio: FuentesDelBorrador["externas"]): FuentesDelBorrador {
  return {
    relaciones: { listarConPersona: async () => [{ id: "r1", dni: DNI, nombre: "Ana", grupo: "Taller", ingreso: "2026-01-01", cese: null, ingresoConfirmado: true, ceseConfirmado: false }] },
    condiciones: { listarTodas: async () => [condicion("sueldo", 200000), condicion("jornada_ordinaria_diaria", 480), condicion("regimen_laboral", "general"),
      condicion("afiliacion_pensionaria", "onp"), condicion("elegibilidad_familiar", false), condicion("sede_de_adscripcion", "Taller")] },
    // Reglas DEMO sintéticas requeridas por #126; no son tasas legales actuales.
    reglas: { listarTodas: async () => ([
      ["onp_tasa", 1300], ["essalud_tasa", 900], ["essalud_base_minima", 100000],
    ] as const).map(([codigo, valor]) => ({ id: `demo-${codigo}`, codigo, valor, vigenteDesde: "2026-01-01",
      fuenteOficial: "DEMO sintética; no usar en producción", activadaPorId: finanzas.id, activadaPor: "finanzas",
      activadaEn: new Date("2026-01-01T00:00:00Z"), reemplazadaEn: null, motivoDeReemplazo: null })) },
    asistencia: {
      listar: async () => [{ id: "p1", inicio: "2026-09-26", fin: "2026-10-25", estado: "cerrado" as const }],
      leerHechosDelPeriodo: async () => ({ periodoId: "p1", revisionId: "rev-1", numero: 1, inicio: "2026-09-26", fin: "2026-10-25", provisional: false, hechos: [] }),
    },
    externas: repositorio,
    descansos: { listarSustitutoriosParaPagos: async () => [] },
  };
}

const ROTULO = "Neto antes de aportes del trabajador";
const corte = { inicio: "2026-09-26", fin: "2026-10-25" };
const comunes = { mesDeDevengue: "2026-10", mesDePago: "2026-10", corte };
const NINGUNA = { pensionaria: "no_afecta", essalud: "no_afecta", quinta: "no_afecta" };
const externa = (concepto: string, importeCentimos: number, efectoEnNeto: "suma" | "resta", efectosEnBases: Record<string, string>) =>
  ({ tipoDeFuente: ({ comision_de_ventas: "comisiones_de_ventas", movilidad_supeditada_a_asistencia: "movilidad_supeditada_a_asistencia", adelanto: "adelantos", cuota_de_prestamo: "prestamos", ajuste_de_preliquidacion: "ajustes_de_preliquidacion" } as Record<string, string>)[concepto], concepto, importeCentimos, efectoEnNeto, efectosEnBases, origen: "Fuente externa", procedencia: "carga_manual", fechaDelHecho: "2026-10-05", ...comunes });
const lineas = [
  { concepto: "sueldo_basico", importeCentimos: 200000, dias: 30, sueldoMensualCentimos: 200000, desde: "2026-10-01", hasta: "2026-10-31", origen: "Condición laboral", ...comunes },
  externa("comision_de_ventas", 15000, "suma", { pensionaria: "suma", essalud: "suma", quinta: "suma" }),
  externa("movilidad_supeditada_a_asistencia", 12000, "suma", { ...NINGUNA, quinta: "suma" }),
  externa("adelanto", 30000, "resta", NINGUNA),
  externa("cuota_de_prestamo", 20000, "resta", NINGUNA),
];

function borrador(persona: Record<string, unknown> = {}, parcial: Record<string, unknown> = {}) {
  return { mesDePago: "2026-10", corte, vacacionesProvisionales: false, bloqueosDelMes: [], fuentes: TIPOS_DE_FUENTE.map(tipo => ({ ...tipo, estado: "Confirmada" })), revisiones: [], personas: [
    { vacaciones: [], relacion: { id: "r1", dni: "12345678", nombre: "Ana", grupo: "Taller", ingreso: "2026-01-01", cese: null, ceseConfirmado: false },
      basesPorDevengue: [], sedeDeAdscripcion: "Taller", sueldoCalculadoCentimos: 200000, netoCentimos: 177000, bloqueos: [], lineas, ...persona },
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

  it.each(["pendiente", "confirmada", "devuelta"] as const)("RP1 P08 fila real de préstamo %s y comisión confirmada", async (fase) => {
    const contexto = crearRepositorioEnMemoria({ [DNI]: "Ana" });
    for (const [tipoDeFuente, concepto, monto] of [["prestamos", "cuota_de_prestamo", "200"], ["comisiones_de_ventas", "comision_de_ventas", "150"]]) {
      await registrarImporte(contexto.repositorio, finanzas, { tipoDeFuente, concepto, monto, dni: DNI,
        fechaDelHecho: "2026-10-05", mesDeDevengue: MES, mesDeAplicacion: MES });
    }
    for (const tipo of TIPOS_DE_FUENTE.filter(tipo => tipo.codigo !== "prestamos")) {
      await confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente: tipo.codigo, mes: MES });
    }
    if (fase !== "pendiente") await confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente: "prestamos", mes: MES });
    if (fase === "devuelta") await volverAPendiente(contexto.repositorio, finanzas, { tipoDeFuente: "prestamos", mes: MES });
    const { prepararBorrador } = await vi.importActual<typeof import("@/pagos/preparar-borrador")>("@/pagos/preparar-borrador");
    const real = await prepararBorrador(fuentesCon(contexto.repositorio), MES);
    const persona = real.personas[0];
    expect(persona.lineas).toContainEqual(expect.objectContaining({ concepto: "cuota_de_prestamo", tipoDeFuente: "prestamos", importeCentimos: 20000 }));
    expect(persona.netoCentimos).toBe(fase === "confirmada" ? 195000 : null);
    expect(persona.basesPorDevengue).toContainEqual(expect.objectContaining({ pensionariaCentimos: 215000, quintaCentimos: 215000 }));
    expect(persona.lineas).toContainEqual(expect.objectContaining({ concepto: "aporte_onp", importeCentimos: 27950 }));
    simulacro.preparar.mockResolvedValue(real);
    const html = await render();
    const fila = (nombre: string) => html.split("<tr>").find(fila => fila.startsWith('<th scope="row">') && fila.includes(nombre)) ?? "";
    const prestamo = fila("Cuota de préstamo");
    expect(prestamo).toContain("−S/ 200,00");
    const origen = prestamo.split("</details>")[1] ?? "";
    expect(origen).toContain(fase === "confirmada" ? "Confirmada" : "Pendiente — no incluida en el neto");
    if (fase === "confirmada") {
      expect(prestamo).toContain("fuente externa confirmada");
      expect(prestamo).not.toContain("Pendiente — no incluida en el neto");
      expect(html).toContain(`${ROTULO}: S/ 1.950,00`);
    } else {
      expect(html).toContain(`${ROTULO}: Incompleto`);
      expect(html).toContain("Fuente pendiente: Préstamos (cuotas)");
      expect(prestamo).toContain("Pendiente — no incluida en el neto");
      expect(prestamo).not.toContain("fuente externa confirmada");
    }
    expect(prestamo).toContain("Fuente externa: Préstamos (cuotas)");
    expect(fila("Comisión de ventas")).toContain("Fuente externa: Comisiones de ventas");
    expect(fila("Comisión de ventas")).toContain("fuente externa confirmada");
    expect(html).toContain("Bases por mes de devengue");
    expect(html).not.toContain("Descuento autorizado por incidencia");
  });

  it("RP2 explica el subtotal con ingresos, reducción y deducciones ya incluidos y conserva bases/aportes", async () => {
    simulacro.preparar.mockResolvedValue(borrador({ netoCentimos: 176000, lineas: [...lineas,
      { concepto: "reduccion_por_falta", importeCentimos: 1000, fecha: "2026-10-05", grupo: "Taller",
        remuneracionOrdinariaComputableCentimos: 30000, origen: "Asistencia", ...comunes },
      { concepto: "aporte_onp", importeCentimos: 27950, baseCentimos: 215000, tasaEnCentesimasDePunto: 1300,
        tipo: "deduccion_del_trabajador", efectoEnNeto: "resta", origen: "Reglas legales y condiciones laborales", ...comunes },
      { ...externa("ajuste_de_preliquidacion", 1000, "resta", NINGUNA), tipoDeFuente: "ajustes_de_preliquidacion", conceptoAjustado: "aporte_onp" },
    ] }));
    const html = await render();
    expect(html).toContain(`${ROTULO}: S/ 1.760,00`);
    for (const texto of ["Incluye el sueldo calculado", "ingresos, reducciones y deducciones calculables", "fuentes externas confirmadas",
      "Excluye ONP, aporte obligatorio AFP, prima de seguro AFP, comisión AFP y los ajustes sobre esos aportes",
      "retención de quinta", "gratificación", "bonificación extraordinaria", "abonos vacacionales", "EsSalud",
      "El desglose agregado por columnas está pendiente", "Bases y aportes"]) expect(html).toContain(texto);
    expect(html).not.toContain("los demás conceptos están pendientes de valoración");
    expect(html).toContain("Se descuenta a la persona");
    expect(html).toContain("no se resta de este subtotal");
    const ajuste = html.split("<tr>").find(fila => fila.startsWith('<th scope="row">Ajuste de preliquidación')) ?? "";
    expect(ajuste).toContain("Ajuste pensionario — no incluido en este subtotal");
    expect(ajuste).not.toContain("En el neto resta");
  });

  it("P10 el resumen rotula el neto con el texto exacto", async () => {
    expect(await render()).toContain(`${ROTULO}: S/ 1.770,00`);
  });
});
