import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Solo se simulan los límites del sistema: la sesión, la navegación, las cuentas y las fuentes de lectura (la base de datos).
// `prepararBorrador` y el cálculo corren reales. Importes esperados: ejemplos de #123 (sueldo S/ 1.800,00, jornada de 480 min).
const simulacro = vi.hoisted(() => ({ actor: vi.fn(), fuentes: { current: undefined as unknown } }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("REDIRECT"); }, notFound: () => { throw new Error("NOT FOUND"); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/autenticacion/servicio", () => ({ repositorioDeCuentas: { buscarCuentaPorId: async (id: string) => ({ id, nombreUsuario: "finanzas-demo", rol: "finanzas" }) } }));
vi.mock("@/pagos/servicio", () => ({ get fuentesDelBorrador() { return simulacro.fuentes.current; } }));

const dni = "12345678";
const relacion = { id: "r1", dni, nombre: "Gloria", grupo: "Taller", ingreso: "2020-01-06", cese: null, ingresoConfirmado: true, ceseConfirmado: false };
const condiciones = [
  { dato: "sueldo", valor: 180000 }, { dato: "jornada_ordinaria_diaria", valor: 480 }, { dato: "elegibilidad_familiar", valor: false },
  { dato: "regimen_laboral", valor: "general" }, { dato: "afiliacion_pensionaria", valor: "onp" }, { dato: "sede_de_adscripcion", valor: "Taller" },
].map((condicion) => ({ relacionId: "r1", vigenteDesde: "2020-01-06", reemplazadaEn: null, ...condicion }));

function hecho(fecha: string, parcial: Record<string, unknown> = {}) {
  return { dni, fecha, grupo: "Taller", sede: "Lima", horarioAplicado: { entradaProgramada: "09:00", salidaProgramada: "17:00" }, resultado: "trabajada", minutosTrabajados: 480,
    tardanza: null, horaExtra: null, diaEspecial: null, evidencia: { asistenciaId: `a-${fecha}`, turnoPublicadoId: `t-${fecha}` }, ...parcial };
}

function fuentes(hechos: unknown[], clasificaciones: unknown[] = []) {
  return {
    relaciones: { listarConPersona: async () => [relacion] }, condiciones: { listarTodas: async () => condiciones }, reglas: { listarTodas: async () => [] },
    asistencia: {
      listar: async () => [{ id: "p1", inicio: "2026-09-26", fin: "2026-10-25", estado: "abierto" }],
      leerHechosDelPeriodo: async () => ({ periodoId: "p1", revisionId: null, numero: null, inicio: "2026-09-26", fin: "2026-10-25", provisional: true, hechos }),
    },
    externas: { listarImportesDelMes: async () => [], listarConfirmacionesDelMes: async () => [], listarAbonosVacacionales: async () => [] },
    descansos: { listarSustitutoriosParaPagos: async () => [] },
    clasificaciones: { listarEntre: async () => clasificaciones },
  };
}

async function render() {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ mes: "2026-10", dni }) }));
}

const filaDe = (html: string, concepto: string) => html.split("<tr>").find((fila) => fila.includes(`${concepto}<`)) ?? "";
const tarde = hecho("2026-10-05", { tardanza: { minutos: 15, minutosPenalizados: 60, politicaVersion: 1 } });
const falta = hecho("2026-10-06", { resultado: "falta", minutosTrabajados: 0 });

describe("reducciones en el desglose de una persona", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    simulacro.actor.mockResolvedValue({ id: "f", rol: "finanzas" });
    simulacro.fuentes.current = fuentes([tarde, falta]);
  });

  it("PA-01 muestra tardanza, falta y descanso semanal como conceptos separados con su importe", async () => {
    const html = await render();
    expect(filaDe(html, "Tardanza real")).toContain("S/ 1,88");
    expect(filaDe(html, "Reducción por falta")).toContain("S/ 60,00");
    expect(filaDe(html, "Reducción por descanso semanal")).toContain("S/ 2,00");
  });

  it("PA-02 expresa la cantidad de cada reducción en su unidad", async () => {
    const html = await render();
    expect(filaDe(html, "Tardanza real")).toContain("<td>15 min</td>");
    expect(filaDe(html, "Reducción por falta")).toContain("<td>1 día</td>");
    expect(filaDe(html, "Reducción por descanso semanal")).toContain("<td>1 día</td>");
    expect(html).not.toMatch(/undefined|NaN/);
  });

  it("PA-03 «Ver base» explica el cálculo y enlaza a la jornada de origen", async () => {
    const html = await render();
    const falta = filaDe(html, "Reducción por falta");
    expect(falta).toContain("2026-10-06");
    expect(falta).toContain("S/ 1.800,00");
    expect(falta).toContain("/asistencias?vista=mensual&amp;grupo=Taller&amp;fecha=2026-10-06&amp;colaborador=12345678");
    expect(filaDe(html, "Reducción por descanso semanal")).toContain("treintavo");
    expect(filaDe(html, "Tardanza real")).toContain("/asistencias?vista=mensual&amp;grupo=Taller&amp;fecha=2026-10-05&amp;colaborador=12345678");
  });

  it("PA-04 un permiso sin goce muestra en su base la decisión, quién la tomó y cuándo", async () => {
    simulacro.fuentes.current = fuentes([hecho("2026-10-07", { resultado: "permiso", minutosTrabajados: 0 })],
      [{ dni, fecha: "2026-10-07", conGoce: false, clasificadoPorId: "cuenta-1", clasificadoEn: new Date("2026-10-10T15:00:00Z") }]);
    const html = await render();
    const ausencia = filaDe(html, "Ausencia sin goce");
    expect(ausencia).toContain("S/ 60,00");
    expect(ausencia).toContain("Sin goce");
    expect(ausencia).toContain("finanzas-demo");
    expect(ausencia).toContain("2026-10-10");
  });
});

describe("clasificación de goce en el desglose de una persona", () => {
  const permiso = (fecha: string) => hecho(fecha, { resultado: "permiso", minutosTrabajados: 0 });
  const suspension = (fecha: string) => hecho(fecha, { resultado: "suspension", minutosTrabajados: 0 });
  const clasificacion = (fecha: string, conGoce: boolean) => ({ dni, fecha, conGoce, clasificadoPorId: "cuenta-1", clasificadoEn: new Date("2026-10-10T15:00:00Z") });
  const panelDe = (html: string) => html.slice(html.indexOf('id="permisos-y-suspensiones"'));

  beforeEach(() => {
    vi.stubGlobal("React", React);
    simulacro.actor.mockResolvedValue({ id: "f", rol: "finanzas" });
    simulacro.fuentes.current = fuentes([permiso("2026-10-07"), suspension("2026-10-08"), permiso("2026-10-09")], [clasificacion("2026-10-08", true), clasificacion("2026-10-09", false)]);
  });

  it("PA-05 un panel lista cada permiso o suspensión con su estado de clasificación", async () => {
    const html = await render();
    const panel = panelDe(html);
    expect(panel).toMatch(/Permiso del 2026-10-07[\s\S]*Pendiente de clasificar/);
    expect(panel).toMatch(/Suspensión del 2026-10-08[\s\S]*Con goce/);
    expect(panel).toMatch(/Permiso del 2026-10-09[\s\S]*Sin goce/);
    // Solo la jornada sin goce reduce: la suspensión con goce no genera línea.
    expect(html.split("<tr>").filter((fila) => fila.includes("Ausencia sin goce<"))).toHaveLength(1);
  });

  it("PA-06 con una clasificación pendiente la persona queda bloqueada y el aviso enlaza al panel", async () => {
    const html = await render();
    expect(html).toContain("Bloqueada");
    const aviso = html.slice(html.indexOf("no tiene clasificación de goce") - 120, html.indexOf("no tiene clasificación de goce") + 400);
    expect(aviso).toContain('role="status"');
    expect(aviso).toContain("2026-10-07");
    expect(aviso).toContain('href="/pagos/2026-10/12345678#permisos-y-suspensiones"');
  });

  it("PA-07 Finanzas ve, solo en la jornada pendiente, el control para elegir con o sin goce y guardar", async () => {
    const panel = panelDe(await render());
    expect(panel.match(/<input[^>]*type="radio"[^>]*name="goce"[^>]*value="con_goce"/g)).toHaveLength(1);
    expect(panel.match(/<input[^>]*type="radio"[^>]*name="goce"[^>]*value="sin_goce"/g)).toHaveLength(1);
    expect(panel).toMatch(/<label[^>]*>[^<]*<input[^>]*value="con_goce"[^>]*>\s*Con goce/);
    expect(panel.match(/Guardar clasificación/g)).toHaveLength(1);
  });
});
