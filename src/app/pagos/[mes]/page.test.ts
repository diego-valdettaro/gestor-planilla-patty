import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import type { DependenciasDeFinalizacion, HuellaDeRevision, NuevaVersionDePago } from "@/pagos/finalizar-mes";
import type { FuentesDelBorrador } from "@/pagos/preparar-borrador";
import { crearRepositorioDeVersionesEnMemoria } from "@/pagos/versiones-en-memoria";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), preparar: vi.fn(), redirigir: vi.fn(), noEncontrado: vi.fn(), dependencias: undefined as unknown, pagoConfirmado: vi.fn(), leerVersiones: vi.fn() }));
simulacro.redirigir.mockImplementation((ruta: string) => { throw new Error(`REDIRECT ${ruta}`); });
simulacro.noEncontrado.mockImplementation(() => { throw new Error("NOT FOUND"); });
vi.mock("next/navigation", () => ({ redirect: simulacro.redirigir, notFound: simulacro.noEncontrado, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/pagos/preparar-borrador", () => ({ prepararBorrador: simulacro.preparar }));
// `dependenciasDeFinalizacion` lo crea F-60 (cableado) en `servicio.ts`; aquí se simula con el repositorio de versiones en memoria y un indicador de pago.
vi.mock("@/pagos/servicio", () => ({ fuentesDelBorrador: {}, get dependenciasDeFinalizacion() { return simulacro.dependencias; } }));

/** Repositorio de versiones en memoria real, indicador de pago simulado y reloj fijo (2026-10-26T15:00:00Z). */
function prepararDependencias() {
  const { repositorio } = crearRepositorioDeVersionesEnMemoria();
  simulacro.leerVersiones.mockReset();
  simulacro.pagoConfirmado.mockReset();
  simulacro.pagoConfirmado.mockResolvedValue(false);
  const versiones: DependenciasDeFinalizacion["versiones"] = {
    ...repositorio,
    listarVersiones: (mes) => { simulacro.leerVersiones(mes); return repositorio.listarVersiones(mes); },
    buscarVersion: (mes, numero) => { simulacro.leerVersiones(mes); return repositorio.buscarVersion(mes, numero); },
  };
  simulacro.dependencias = { fuentes: {} as FuentesDelBorrador, versiones, pago: { mesConPagoConfirmado: simulacro.pagoConfirmado }, ahora: () => new Date("2026-10-26T15:00:00Z") } satisfies DependenciasDeFinalizacion;
  return repositorio;
}

async function render(mes = "2026-10", searchParams = {}) {
  const { default: Pagina } = await import("./page");
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ mes }), searchParams: Promise.resolve(searchParams) }));
}

describe("mes de pago", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    simulacro.actor.mockResolvedValue({ id: "f", rol: "finanzas" });
    simulacro.preparar.mockClear();
    prepararDependencias();
    simulacro.preparar.mockResolvedValue({ mesDePago: "2026-10", corte: { inicio: "2026-09-26", fin: "2026-10-25" }, revisiones: [],
      bloqueosDelMes: ["Falta cobertura del corte."], sueldoCalculadoCentimos: 100000, personas: [
        { relacion: { id: "r1", dni: "12345678", nombre: "Ana", grupo: "Taller" }, sedeDeAdscripcion: "Taller", sueldoCalculadoCentimos: 100000, netoCentimos: null, bloqueos: [], lineas: [] },
      ] });
  });

  it("muestra bloqueos, población, importe calculado y neto incompleto", async () => {
    const html = await render();
    expect(html).toContain("Falta cobertura del corte");
    expect(html).toContain("Ana");
    expect(html).toContain("S/ 1.000,00");
    expect(html).toContain("Incompleto");
    expect(html).toContain("Sede de adscripción");
    expect(html).toContain("Totales del mes completo");
    expect(html).toContain("Por sede de adscripción");
  });

  it("filtra por sede sin cambiar el total del mes", async () => {
    const html = await render("2026-10", { sede: "Otra" });
    expect(html).not.toContain('href="/pagos/2026-10/12345678"');
    expect(html).toContain("S/ 1.000,00");
  });

  it("excluye horas extra de personas bloqueadas del total calculado", async () => {
    simulacro.preparar.mockResolvedValueOnce({ mesDePago: "2026-10", corte: { inicio: "2026-09-26", fin: "2026-10-25" }, revisiones: [],
      bloqueosDelMes: [], sueldoCalculadoCentimos: 200000, personas: [
        { relacion: { id: "r1", dni: "12345678", nombre: "Ana", grupo: "Taller" }, sedeDeAdscripcion: "Taller", sueldoCalculadoCentimos: 100000,
          netoCentimos: null, bloqueos: [], lineas: [{ concepto: "horas_extra_25", importeCentimos: 1000 }] },
        { relacion: { id: "r2", dni: "87654321", nombre: "Beto", grupo: "Taller" }, sedeDeAdscripcion: "Taller", sueldoCalculadoCentimos: 100000,
          netoCentimos: null, bloqueos: ["Sin sueldo vigente."], lineas: [{ concepto: "horas_extra_25", importeCentimos: 9000 }] },
      ] });
    const html = await render();
    expect(html).toContain("Horas extra S/ 10,00");
    expect(html).not.toContain("Horas extra S/ 100,00");
  });

  it("rechaza otros roles antes de consultar importes", async () => {
    simulacro.actor.mockResolvedValue({ id: "a", rol: "administrador" });
    expect(await render()).toContain("Sin permiso");
    expect(simulacro.preparar).not.toHaveBeenCalled();
  });

  it("rechaza un mes inválido", async () => {
    await expect(render("2026-13")).rejects.toThrow("NOT FOUND");
  });
});

// Finalización del mes en la pantalla (#129, ADR 0007/0013/0014; interacción §3, §4.2, §4.6, §6.1, D15, D19, V3). Personas y cifras del plan (mes 2026-10):
// Ana S/ 2.000,00, Beto S/ 1.500,00 y Carla S/ 1.000,00; subtotal «Neto antes de aportes del trabajador» S/ 4.500,00 (aritmética manual de #96, historia 5).
// El borrador se simula (prepararBorrador); los casos de uso evaluarFinalizacion, listarVersiones y consultarVersion y el repositorio de versiones en memoria son los reales.
const ROTULO = "Neto antes de aportes del trabajador";
const corteDelMes = { inicio: "2026-09-26", fin: "2026-10-25" };
const personaDelPlan = (id: string, dni: string, nombre: string, sueldoCentimos: number, bloqueos: string[] = []) =>
  ({ relacion: { id, dni, nombre, grupo: "Taller" }, sedeDeAdscripcion: "Taller", sueldoCalculadoCentimos: sueldoCentimos, netoCentimos: bloqueos.length ? null : sueldoCentimos, bloqueos, lineas: [] });
const ANA = personaDelPlan("r-ana", "10000001", "Ana", 200000);
const BETO = personaDelPlan("r-beto", "10000002", "Beto", 150000);
const CARLA = personaDelPlan("r-carla", "10000003", "Carla", 100000);
function borradorDelPlan(parcial: Record<string, unknown> = {}) {
  return { mesDePago: "2026-10", corte: corteDelMes, revisiones: [{ periodoId: "p1", revisionId: "v1", numero: 1, inicio: "2026-09-26", fin: "2026-10-25" }],
    bloqueosDelMes: [] as string[], sueldoCalculadoCentimos: 450000, netoCalculadoCentimos: 450000, entrada: {}, fuentes: [], personas: [ANA, BETO, CARLA], ...parcial };
}
const BLOQUEADO = () => borradorDelPlan({ bloqueosDelMes: ["Fuente externa pendiente: Adelantos."], netoCalculadoCentimos: 100000,
  personas: [ANA, personaDelPlan("r-beto", "10000002", "Beto", 150000, ["Sin sueldo vigente."]), personaDelPlan("r-carla", "10000003", "Carla", 100000, ["Neto negativo: S/ −200,00. Revise deducciones y adelantos."])] });

const versionDelPlan = (anaCentimos: number, fecha: string, actor = "finanzas"): NuevaVersionDePago => ({
  mesDePago: "2026-10", finalizadaPorId: "u-1", finalizadaPor: actor, finalizadaEn: new Date(fecha),
  reglas: [
    { codigo: "onp_tasa", valor: 1300, vigenteDesde: "2026-01-01", fuenteOficial: "DEMO sintética; no usar en producción", activadaPorId: "u-1", activadaPor: "finanzas" },
    { codigo: "essalud_tasa", valor: 900, vigenteDesde: "2026-01-01", fuenteOficial: "DEMO sintética; no usar en producción", activadaPorId: "u-1", activadaPor: "finanzas" },
  ],
  revisiones: [{ periodoId: "p1", revisionId: "v1", numero: 1, inicio: "2026-09-26", fin: "2026-10-25" }],
  fuentes: [{ tipoDeFuente: "adelantos", nombre: "Adelantos", estado: "Confirmada", filas: 0, totalCentimos: 0 }],
  personas: [["r-ana", "10000001", "Ana", anaCentimos], ["r-beto", "10000002", "Beto", 150000], ["r-carla", "10000003", "Carla", 100000]].map(([relacionId, dni, nombre, subtotalCentimos]) => ({
    relacionId: relacionId as string, dni: dni as string, nombre: nombre as string, subtotalCentimos: subtotalCentimos as number,
    lineas: [{ concepto: "sueldo_basico" as const, importeCentimos: subtotalCentimos as number, dias: 30, sueldoMensualCentimos: subtotalCentimos as number, desde: "2026-09-26", hasta: "2026-10-25",
      mesDePago: "2026-10", corte: corteDelMes, mesDeDevengue: "2026-10", origen: "Condición laboral" as const }],
    bases: [{ mesDeDevengue: "2026-10", pensionariaCentimos: subtotalCentimos as number, essaludRemunerativaCentimos: subtotalCentimos as number, essaludAplicableCentimos: 100000, quintaCentimos: null }],
  })),
});

/** La cabecera del objeto (primer `<header>`), sin el diálogo: lo que ve Finanzas antes de abrir nada. */
const cabecera = (html: string) => html.slice(html.indexOf("<header"), html.indexOf("</header>")).replace(/<dialog[\s\S]*?<\/dialog>/g, "");
const dialogoDe = (html: string) => /<dialog[\s\S]*?<\/dialog>/.exec(html)?.[0] ?? "";
const seccionDelHistorial = (html: string) => html.split("<section").find((seccion) => seccion.includes('id="titulo-historial"')) ?? "";
const contar = (html: string, patron: RegExp) => (html.match(patron) ?? []).length;

describe("finalización del mes en la pantalla", () => {
  let versiones: ReturnType<typeof prepararDependencias>;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    simulacro.actor.mockResolvedValue({ id: "f", rol: "finanzas" });
    simulacro.preparar.mockReset();
    versiones = prepararDependencias();
    simulacro.preparar.mockResolvedValue(borradorDelPlan());
  });

  it("F-43 con bloqueos «Finalizar mes» está deshabilitado y al lado dice cuántos bloqueos resolver, con el mismo N del panel", async () => {
    simulacro.preparar.mockResolvedValue(BLOQUEADO());

    const html = await render();

    expect(html).toContain("Bloqueos del mes (3)");
    expect(cabecera(html)).toMatch(/<button[^>]*disabled=""[^>]*>Finalizar mes<\/button><small[^>]*>Resuelva los 3 bloqueos para finalizar<\/small>/);
    expect(dialogoDe(html)).toBe("");
  });

  it("F-44 sin bloqueos el panel lo dice y «Finalizar mes» es la única acción principal; la cabecera sigue en Borrador", async () => {
    const html = await render();

    expect(html).toContain("Bloqueos del mes (0)");
    expect(html).toContain("El mes no tiene bloqueos. Puede finalizarlo.");
    expect(cabecera(html)).toContain('<span class="insignia advertencia">Borrador</span>');
    expect(cabecera(html)).toMatch(/<button[^>]*>Finalizar mes<\/button>/);
    expect(cabecera(html)).not.toMatch(/<button[^>]*disabled/);
    expect(contar(cabecera(html), /boton-principal/g)).toBe(1);
  });

  it("F-45 un mes sin personas deja «Finalizar mes» deshabilitado y dice por qué", async () => {
    simulacro.preparar.mockResolvedValue(borradorDelPlan({ personas: [], sueldoCalculadoCentimos: 0, netoCalculadoCentimos: 0 }));

    const html = await render();

    expect(cabecera(html)).toMatch(/<button[^>]*disabled=""[^>]*>Finalizar mes<\/button><small[^>]*>Este mes no incluye personas<\/small>/);
    expect(dialogoDe(html)).toBe("");
  });

  it("F-51 un mes con versión muestra «Finalizada, versión N» (la más reciente) en lugar de Borrador y ya no ofrece «Finalizar mes»", async () => {
    await versiones.guardarVersion(versionDelPlan(200000, "2026-10-20T15:00:00Z"));
    await versiones.guardarVersion(versionDelPlan(210000, "2026-10-26T15:00:00Z"));

    const html = await render();

    expect(cabecera(html)).toContain("Finalizada, versión 2");
    expect(html).not.toContain(">Borrador<");
    expect(cabecera(html)).not.toContain("Finalizar mes");
  });

  it("F-52 un mes con pago confirmado no ofrece finalizar ni crear otra versión y lo explica", async () => {
    await versiones.guardarVersion(versionDelPlan(200000, "2026-10-20T15:00:00Z"));
    simulacro.pagoConfirmado.mockResolvedValue(true);

    const html = await render();

    expect(html).toContain("Este mes ya tiene su pago realizado confirmado; no admite una nueva versión.");
    expect(cabecera(html)).toContain("Pago realizado confirmado");
    expect(html).not.toContain("Finalizar mes");
    expect(html).not.toContain("Crear otra versión");
    expect(dialogoDe(html)).toBe("");
  });

  it("F-59 en un mes finalizado sin pago la cabecera ofrece «Crear otra versión» con el mismo diálogo y sin «Confirmar pago realizado»", async () => {
    await versiones.guardarVersion(versionDelPlan(200000, "2026-10-20T15:00:00Z"));

    const html = await render();
    const dialogo = dialogoDe(html);

    expect(cabecera(html)).toMatch(/<button[^>]*boton-principal[^>]*>Crear otra versión<\/button>/);
    expect(contar(cabecera(html), /boton-principal/g)).toBe(1);
    expect(dialogo).toContain("La versión 2 no se podrá editar.");
    expect(dialogo).toContain("3 personas del mes");
    expect(dialogo).toContain("S/ 4.500,00");
    expect(dialogo).toContain("Cancelar");
    expect(dialogo).toMatch(/<button[^>]*>Finalizar mes<\/button>/);
    expect(html).not.toContain("Confirmar pago realizado");
    // El formulario envía lo que la acción del servidor lee: el mes y la huella de lo revisado.
    expect(dialogo).toContain('name="mes" value="2026-10"');
    const huella = JSON.parse(/name="huella" value="([^"]*)"/.exec(dialogo)![1].replaceAll("&quot;", '"')) as { entrada: string; subtotalCentimos: number };
    expect(huella.entrada).toMatch(/^[0-9a-f]{64}$/);
    expect(huella.subtotalCentimos).toBe(450000);
  });

  it.each([
    ["con bloqueos", () => BLOQUEADO(), "Resuelva los 3 bloqueos para finalizar"],
    ["sin personas", () => borradorDelPlan({ personas: [], sueldoCalculadoCentimos: 0, netoCalculadoCentimos: 0 }), "Este mes no incluye personas"],
  ])("F-59 «Crear otra versión» %s queda deshabilitado con la misma causa que «Finalizar mes»", async (_caso, borrador, causa) => {
    await versiones.guardarVersion(versionDelPlan(200000, "2026-10-20T15:00:00Z"));
    simulacro.preparar.mockResolvedValue(borrador());

    const html = await render();

    expect(cabecera(html)).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>Crear otra versión</button><small[^>]*>${causa}</small>`));
    expect(dialogoDe(html)).toBe("");
  });

  // F-69 (adenda 3): la huella del diálogo es la del borrador que la página pintó; si los datos cambian después, confirmar avisa «cambió» y no guarda.
  it("F-69 si los datos cambian tras pintar la pantalla, la huella del formulario es la de lo mostrado y finalizar responde «cambió» sin guardar", async () => {
    const entradaCon = (sueldoDeAna: number) => ({ reglas: [], condiciones: [{ relacionId: "r-ana", sueldoMensualCentimos: sueldoDeAna }] });
    const datosA = borradorDelPlan({ entrada: entradaCon(200000) });
    const datosAPrima = borradorDelPlan({ entrada: entradaCon(210000), netoCalculadoCentimos: 460000, sueldoCalculadoCentimos: 460000, personas: [personaDelPlan("r-ana", "10000001", "Ana", 210000), BETO, CARLA] });
    // Primera lectura (la que pinta la página): A. Cualquier lectura posterior: A' (Ana pasó de S/ 2.000,00 a S/ 2.100,00).
    simulacro.preparar.mockReset();
    simulacro.preparar.mockResolvedValueOnce(datosA);
    simulacro.preparar.mockResolvedValue(datosAPrima);

    const html = await render();
    const dialogo = dialogoDe(html);
    const huellaDelFormulario = JSON.parse(/name="huella" value="([^"]*)"/.exec(dialogo)![1].replaceAll("&quot;", '"')) as HuellaDeRevision;
    const { finalizarMes } = await import("@/pagos/finalizar-mes");
    const resultado = await finalizarMes(simulacro.dependencias as DependenciasDeFinalizacion, { id: "f", rol: "finanzas" } as Actor, { mes: "2026-10", huella: huellaDelFormulario });

    // La pantalla mostró A y el formulario lleva la huella de A.
    expect(dialogo).toContain("S/ 4.500,00");
    expect(huellaDelFormulario.subtotalCentimos).toBe(450000);
    expect(huellaDelFormulario.personas.find(({ dni }) => dni === "10000001")?.subtotalCentimos).toBe(200000);
    // Confirmar con esa huella: el cálculo cambió, se explica qué cambió y no se guarda ninguna versión.
    expect(resultado.estado).toBe("cambio");
    if (resultado.estado !== "cambio") return;
    expect(resultado.resumen.subtotalAnteriorCentimos).toBe(450000);
    expect(resultado.resumen.subtotalActualCentimos).toBe(460000);
    expect(resultado.resumen.personas).toEqual([{ dni: "10000001", nombre: "Ana", anteriorCentimos: 200000, actualCentimos: 210000 }]);
    expect(resultado.resumen.datosCambiados).toContain("Condiciones laborales");
    expect(await versiones.listarVersiones("2026-10")).toHaveLength(0);
  });

  it("F-53 el historial lista una fila por versión con número, fecha, responsable, estado y enlace", async () => {
    await versiones.guardarVersion(versionDelPlan(200000, "2026-10-20T15:00:00Z", "usuario-fin-1"));
    await versiones.guardarVersion(versionDelPlan(210000, "2026-10-26T15:00:00Z", "usuario-fin-2"));

    const historial = seccionDelHistorial(await render());
    const filas = historial.split("<tr>").filter((fila) => /Versión \d/.test(fila));

    expect(filas).toHaveLength(2);
    const v2 = filas.find((fila) => fila.includes("Versión 2")) ?? "";
    const v1 = filas.find((fila) => fila.includes("Versión 1")) ?? "";
    expect(v2).toContain("Vigente");
    expect(v2).toContain("usuario-fin-2");
    expect(v2).toContain("26/10/2026");
    expect(v2).toContain('href="/pagos/2026-10?version=2"');
    expect(v1).toContain("Reemplazada");
    expect(v1).toContain("usuario-fin-1");
    expect(v1).toContain("20/10/2026");
    expect(v1).toContain('href="/pagos/2026-10?version=1"');
  });

  it("F-54 sin versiones no hay bloque «Historial de versiones»", async () => {
    expect(await render()).not.toContain("Historial de versiones");
  });

  it("F-55 una versión abierta se muestra completa y en solo lectura, con sus valores originales aunque exista una más reciente", async () => {
    await versiones.guardarVersion(versionDelPlan(200000, "2026-10-20T15:00:00Z", "usuario-fin-1"));
    await versiones.guardarVersion(versionDelPlan(210000, "2026-10-26T15:00:00Z", "usuario-fin-2"));

    const html = await render("2026-10", { version: "1" });

    // Qué versión es, de quién y de cuándo, y que no se puede cambiar.
    expect(html).toContain("Versión 1");
    expect(html).toContain("Solo lectura");
    expect(html).toContain("usuario-fin-1");
    expect(html).toContain("20/10/2026");
    // Con qué reglas, revisiones de asistencia y fuentes externas se calculó.
    expect(html).toContain("Tasa de ONP");
    expect(html).toContain("13,00 %");
    expect(html).toContain("DEMO sintética; no usar en producción");
    expect(html).toContain("26/09/2026 al 25/10/2026");
    expect(html).toMatch(/revisión n\.º 1/i);
    expect(html).toContain("Adelantos");
    expect(html).toContain("Confirmada");
    // Importes y bases por persona, y el subtotal total rotulado, tal como se guardaron.
    expect(html).toContain("Ana");
    expect(html).toContain("Sueldo básico");
    expect(html).toContain("S/ 2.000,00");
    expect(html).toContain("S/ 1.000,00");
    expect(html).toContain("Pendiente");
    expect(html).toContain(ROTULO);
    expect(html).toContain("S/ 4.500,00");
    expect(html).not.toContain("S/ 2.100,00");
    expect(html).not.toContain("S/ 4.600,00");
    // Sin controles que guarden o editen, y sin recalcular el borrador.
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Finalizar mes");
    expect(html).not.toContain("Crear otra versión");
    expect(simulacro.preparar).not.toHaveBeenCalled();
  });

  it("F-56 abrir una versión que no existe responde «no encontrada»", async () => {
    await versiones.guardarVersion(versionDelPlan(200000, "2026-10-20T15:00:00Z"));

    await expect(render("2026-10", { version: "2" })).rejects.toThrow("NOT FOUND");
    await expect(render("2026-11", { version: "1" })).rejects.toThrow("NOT FOUND");
  });

  it.each(["0", "-1", "1.5", "abc", ""])("F-56 un número de versión inválido (%j) responde «no encontrada» sin consultar versiones", async (version) => {
    await expect(render("2026-10", { version })).rejects.toThrow("NOT FOUND");
    expect(simulacro.leerVersiones).not.toHaveBeenCalled();
  });

  // Caso añadido a F-56 tras la 4a: la columna `numero` es un entero de PostgreSQL (hasta 2147483647); un número mayor no debe llegar a la consulta.
  it.each(["99999999999999999999", "2147483648"])("F-56 un número de versión fuera de rango (%s) responde «no encontrada» sin consultar versiones", async (version) => {
    await expect(render("2026-10", { version })).rejects.toThrow("NOT FOUND");
    expect(simulacro.leerVersiones).not.toHaveBeenCalled();
  });

  it("F-56 el mayor número de versión posible (2147483647) sí se consulta y, si no existe, responde «no encontrada»", async () => {
    await expect(render("2026-10", { version: "2147483647" })).rejects.toThrow("NOT FOUND");
    expect(simulacro.leerVersiones).toHaveBeenCalledWith("2026-10");
  });

  it.each([
    ["el Administrador del sistema", { id: "a", rol: "administrador" }],
    ["un gerente de área", { id: "g", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ])("F-57 %s ve «Sin permiso» en el mes y en una versión, sin acción, importes ni consulta de versiones", async (_nombre, actor) => {
    await versiones.guardarVersion(versionDelPlan(200000, "2026-10-20T15:00:00Z"));
    simulacro.leerVersiones.mockClear();
    simulacro.actor.mockResolvedValue(actor);

    for (const consulta of [{}, { version: "1" }]) {
      const html = await render("2026-10", consulta);

      expect(html).toContain("Sin permiso");
      expect(html).not.toContain("S/ ");
      expect(html).not.toContain("Finalizar mes");
      expect(html).not.toContain("Crear otra versión");
      expect(html).not.toContain("Historial de versiones");
    }
    expect(simulacro.preparar).not.toHaveBeenCalled();
    expect(simulacro.leerVersiones).not.toHaveBeenCalled();
    expect(simulacro.pagoConfirmado).not.toHaveBeenCalled();
  });

  // Ancho estrecho (interacción §3, §7, V3): solo el marcado; lo visual a 375 px es QA en navegador (prueba posterior).
  const regionesConAviso = (html: string) => ({
    tablas: contar(html, /<table/g),
    regiones: contar(html, /class="panel-tabla[^"]*" role="region" aria-label="[^"]+" tabindex="0"/g),
    avisos: contar(html, /class="aviso-desplazamiento"/g),
  });

  it("F-58 el diálogo de finalizar usa el contenedor de Pagos que apila los botones", async () => {
    const dialogo = dialogoDe(await render());

    expect(dialogo).toMatch(/^<dialog[^>]*class="[^"]*\bdialogo-de-pagos\b[^"]*"/);
    expect(dialogo).toContain('class="acciones-dialogo"');
  });

  it("F-58 el historial de versiones va en una región con desplazamiento propio y su aviso", async () => {
    await versiones.guardarVersion(versionDelPlan(200000, "2026-10-20T15:00:00Z"));
    const historial = seccionDelHistorial(await render());

    const { tablas, regiones, avisos } = regionesConAviso(historial);
    expect(tablas).toBe(1);
    expect(regiones).toBe(tablas);
    expect(avisos).toBe(tablas);
  });

  it("F-58 cada tabla de la versión abierta va en una región con desplazamiento propio y su aviso", async () => {
    await versiones.guardarVersion(versionDelPlan(200000, "2026-10-20T15:00:00Z"));
    const html = await render("2026-10", { version: "1" });

    const { tablas, regiones, avisos } = regionesConAviso(html);
    for (const region of ["Reglas legales usadas", "Revisiones de asistencia de origen", "Fuentes externas de la versión", "Personas de la versión", "Conceptos de Ana", "Bases de Ana"]) {
      expect(html).toContain(`aria-label="${region}"`);
    }
    expect(regiones).toBe(tablas);
    expect(avisos).toBe(tablas);
  });
});
