import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { registrarConciliacionDeCese } from "@/fuentes-externas/conciliacion-de-cese";
import { confirmarFuente } from "@/fuentes-externas/gestionar-fuentes-externas";
import { crearRepositorioEnMemoria } from "@/fuentes-externas/repositorio-en-memoria";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";
import type { FuentesDelBorrador } from "@/pagos/preparar-borrador";

// /pagos/[mes] con la conciliación por cese (#128): borrador real (prepararBorrador) con lectores sintéticos y repositorio en memoria.
// Esperados de ejemplos-sinteticos.md (C-E1, C-E2), diseño 5.1/5.2 y aritmética del sueldo (200000 céntimos; 12 días de 30 = 80000).
const simulacro = vi.hoisted(() => ({ actor: vi.fn(), preparar: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/pagos/preparar-borrador", () => ({ prepararBorrador: simulacro.preparar }));

const MES = "2026-10";
const TIPO = "conciliacion_de_liquidacion_por_cese";
const ANA = "11111111";
const CARLA = "22222222";
const FUENTE = `href="/pagos/fuentes-externas/${TIPO}?mes=${MES}"`;
const CESE = "El cese de Ana no tiene su liquidación conciliada.";
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
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ mes: MES }), searchParams: Promise.resolve({}) }));
}
const fila = (html: string, nombre: string) => html.split("<tr>").find((candidata) => candidata.startsWith('<th scope="row"><a') && candidata.includes(`>${nombre}</a>`)) ?? "";
const panelDeBloqueos = (html: string) => html.split('id="titulo-bloqueos"')[1]?.split("</section>")[0] ?? "";

describe("mes de pago con la conciliación de la liquidación por cese", () => {
  let contexto: ReturnType<typeof escenario>;

  beforeEach(async () => {
    vi.stubGlobal("React", React);
    simulacro.actor.mockResolvedValue({ id: "f", rol: "finanzas" });
    contexto = escenario();
    const { prepararBorrador } = await vi.importActual<typeof import("@/pagos/preparar-borrador")>("@/pagos/preparar-borrador");
    simulacro.preparar.mockReset();
    simulacro.preparar.mockImplementation((_fuentes: unknown, mes: string) => prepararBorrador(contexto.fuentes, mes));
    for (const tipo of TIPOS_DE_FUENTE.filter(({ codigo }) => codigo !== TIPO)) await confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente: tipo.codigo, mes: MES });
  });

  it("PA-06 el cese sin conciliar se muestra en el mes y en la persona, con enlace a la fuente, sin quitar el neto de Carla", async () => {
    const html = await render();
    const bloqueos = panelDeBloqueos(html);

    expect(bloqueos).toContain("Bloqueos del mes (2)");
    expect(bloqueos.split(CESE)).toHaveLength(3);
    expect(bloqueos).toContain("Afecta al mes completo");
    expect(bloqueos).toContain(`href="/pagos/${MES}/${ANA}">Ana</a>`);
    expect(bloqueos).toContain("Afecta a esta persona");
    expect(bloqueos).toContain(FUENTE);
    expect(bloqueos).toContain("Cargar la conciliación en la fuente correspondiente.");
    expect(fila(html, "Carla")).toContain("Calculada");
    expect(fila(html, "Carla")).toContain("S/ 2.000,00");
    expect(fila(html, "Ana")).toContain("Bloqueada");
    expect(fila(html, "Ana")).toContain("Incompleto");
  });

  it("PA-07 tras cargar y confirmar la conciliación, la página del mes ya no bloquea a Ana", async () => {
    const base = { dni: ANA, fechaDelHecho: "2026-10-12", mesDeDevengue: MES, mesDeAplicacion: MES };
    await registrarConciliacionDeCese(contexto.repositorio, finanzas, { ...base, concepto: "vacaciones_truncas", monto: "400,00" });
    await registrarConciliacionDeCese(contexto.repositorio, finanzas, { ...base, concepto: "cts_trunca", monto: "900,00" });
    await confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente: TIPO, mes: MES });

    const html = await render();

    expect(html).not.toContain("no tiene su liquidación conciliada");
    expect(html).toContain("No hay bloqueos del mes ni de las personas.");
    expect(fila(html, "Ana")).toContain("Calculada");
    expect(fila(html, "Ana")).toContain("S/ 800,00");
  });

  it.each([
    ["el Administrador del sistema", { id: "a", rol: "administrador" }],
    ["un gerente de área", { id: "g", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ])("RG-02 niega el mes a %s sin preparar el borrador ni mostrar la conciliación", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);

    const html = await render();

    expect(simulacro.preparar).not.toHaveBeenCalled();
    expect(html).toContain("Sin permiso");
    expect(html).not.toContain("liquidación conciliada");
    expect(html).not.toContain("S/ ");
  });
});
