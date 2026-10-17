import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { registrarConciliacionDeCese } from "@/fuentes-externas/conciliacion-de-cese";
import { confirmarFuente } from "@/fuentes-externas/gestionar-fuentes-externas";
import { crearRepositorioEnMemoria } from "@/fuentes-externas/repositorio-en-memoria";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";
import type { FuentesDelBorrador } from "@/pagos/preparar-borrador";

// /pagos/[mes]/[dni] con la conciliación por cese (#128): borrador real (prepararBorrador) con lectores sintéticos y repositorio en memoria.
// Esperados de ejemplos-sinteticos.md (C-E2: 400 + 900 = 1.300,00; C-E6: abono de 700,00), criterio C3 y aritmética del sueldo (200000 céntimos; 12 días de 30 = 80000).
const simulacro = vi.hoisted(() => ({ actor: vi.fn(), preparar: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/pagos/preparar-borrador", () => ({ prepararBorrador: simulacro.preparar }));

const MES = "2026-10";
const TIPO = "conciliacion_de_liquidacion_por_cese";
const ANA = "11111111";
const CARLA = "22222222";
const finanzas: Actor = { id: "11111111-1111-4111-8111-111111111111", rol: "finanzas", nombreUsuario: "finanzas" };

const persona = (id: string, dni: string, nombre: string, cese: string | null) =>
  ({ id, dni, nombre, grupo: "Taller", ingreso: "2026-01-01", cese, ingresoConfirmado: true, ceseConfirmado: cese !== null });
const condiciones = (relacionId: string) => ([
  ["sueldo", 200000], ["jornada_ordinaria_diaria", 480], ["regimen_laboral", "general"], ["afiliacion_pensionaria", "onp"], ["elegibilidad_familiar", false], ["sede_de_adscripcion", "Taller"],
] as const).map(([dato, valor]) => ({ id: `${relacionId}-${dato}`, relacionId, dato, valor, vigenteDesde: "2026-01-01", registradaPorId: "f-1", registradaPor: "finanzas", registradaEn: new Date("2026-01-01T00:00:00Z"), reemplazadaEn: null, motivoDeReemplazo: null }));
const reglas = ([["onp_tasa", 1300], ["essalud_tasa", 900], ["essalud_base_minima", 100000]] as const).map(([codigo, valor]) => ({
  id: codigo, codigo, valor, vigenteDesde: "2026-01-01", fuenteOficial: "DEMO sintética; no usar en producción", activadaPorId: "f-1", activadaPor: "finanzas", activadaEn: new Date("2026-01-01T00:00:00Z"), reemplazadaEn: null, motivoDeReemplazo: null,
}));

function escenario() {
  const { repositorio } = crearRepositorioEnMemoria({ [ANA]: "Ana", [CARLA]: "Carla" });
  const fuentes: FuentesDelBorrador = {
    relaciones: { listarConPersona: async () => [persona("r1", ANA, "Ana", "2026-10-12"), persona("r2", CARLA, "Carla", null)] },
    condiciones: { listarTodas: async () => [...condiciones("r1"), ...condiciones("r2")] },
    reglas: { listarTodas: async () => reglas },
    asistencia: {
      listar: async () => [{ id: "p1", inicio: "2026-09-26", fin: "2026-10-25", estado: "cerrado" }],
      leerHechosDelPeriodo: async () => ({ periodoId: "p1", revisionId: "v1", numero: 1, inicio: "2026-09-26", fin: "2026-10-25", provisional: false, hechos: [] }),
    },
    externas: repositorio,
    descansos: { listarSustitutoriosParaPagos: async () => [] },
  };
  return { repositorio, fuentes };
}

async function render() {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ mes: MES, dni: ANA }) }));
}
const region = (html: string, etiqueta: string) => html.split(`aria-label="${etiqueta}"`)[1]?.split("</table>")[0] ?? "";
const panel = (html: string) => html.split('aria-labelledby="titulo-conciliacion"')[1]?.split("</section>")[0] ?? "";

describe("detalle de la persona con la conciliación de la liquidación por cese", () => {
  let contexto: ReturnType<typeof escenario>;

  beforeEach(async () => {
    vi.stubGlobal("React", React);
    simulacro.actor.mockResolvedValue({ id: "f", rol: "finanzas" });
    contexto = escenario();
    const { prepararBorrador } = await vi.importActual<typeof import("@/pagos/preparar-borrador")>("@/pagos/preparar-borrador");
    simulacro.preparar.mockReset();
    simulacro.preparar.mockImplementation((_fuentes: unknown, mes: string) => prepararBorrador(contexto.fuentes, mes));
    for (const tipo of TIPOS_DE_FUENTE) await confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente: tipo.codigo, mes: MES });
  });

  it("PA-08 muestra el total de la conciliación aparte, sin sumarlo al neto ni a los conceptos", async () => {
    const base = { dni: ANA, fechaDelHecho: "2026-10-12", mesDeDevengue: MES, mesDeAplicacion: MES };
    await registrarConciliacionDeCese(contexto.repositorio, finanzas, { ...base, concepto: "vacaciones_truncas", monto: "400,00" });
    await registrarConciliacionDeCese(contexto.repositorio, finanzas, { ...base, concepto: "cts_trunca", monto: "900,00" });
    await registrarConciliacionDeCese(contexto.repositorio, finanzas, { ...base, fechaDelHecho: "2026-10-13", concepto: "abono_de_liquidacion", monto: "700,00" });
    await confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente: TIPO, mes: MES });

    const html = await render();

    expect(html).toContain("Neto antes de aportes del trabajador: S/ 800,00");
    const conciliacion = panel(html);
    expect(conciliacion).toContain("Conciliación de liquidación por cese");
    expect(conciliacion).toContain("Total de la conciliación");
    expect(conciliacion).toContain("S/ 1.300,00");
    expect(conciliacion).toContain("no entra al neto");
    expect(conciliacion).toContain("Abonos de la liquidación");
    expect(conciliacion).toContain("S/ 700,00");
    const conceptos = region(html, "Conceptos de la persona");
    expect(conceptos).not.toContain("Vacaciones truncas");
    expect(conceptos).not.toContain("CTS trunca");
    expect(conceptos).not.toContain("Abono de liquidación");
  });
});
