import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), revalidar: vi.fn(), dependencias: undefined as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: simulacro.revalidar }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/pagos/servicio", () => ({
  get dependenciasDeFinalizacion() { return simulacro.dependencias; },
}));

import type { Actor } from "@/autenticacion/permisos";
import type { CondicionLaboral } from "@/condiciones-laborales/vigencia";
import { confirmarFuente } from "@/fuentes-externas/gestionar-fuentes-externas";
import { crearRepositorioEnMemoria } from "@/fuentes-externas/repositorio-en-memoria";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";
import { evaluarFinalizacion, type DependenciasDeFinalizacion, type RepositorioDeVersiones } from "@/pagos/finalizar-mes";
import type { FuentesDelBorrador } from "@/pagos/preparar-borrador";
import { crearRepositorioDeVersionesEnMemoria } from "@/pagos/versiones-en-memoria";
import type { ReglaLegal } from "@/reglas-legales/vigencia";

import { finalizarMesDesdeFormulario, verificarFinalizacionDesdeFormulario } from "./actions";

// Acciones del servidor de /pagos/[mes] (#129, ADR 0007 y 0014; interacción §4.6 y §6.1). Se simulan la sesión, el refresco de la página y los
// lectores; los casos de uso y el repositorio de fuentes en memoria son los reales. Personas del plan (mes 2026-10): Ana S/ 2.000,00,
// Beto S/ 1.500,00 y Carla S/ 1.000,00; subtotal «Neto antes de aportes del trabajador» 450000 céntimos (aritmética manual de #96, historia 5).
const MES = "2026-10";
const AHORA = new Date("2026-10-26T15:00:00Z");
const finanzas: Actor = { id: "11111111-1111-4111-8111-111111111111", rol: "finanzas", nombreUsuario: "finanzas" };

const PERSONAS = [
  { id: "r-ana", dni: "10000001", nombre: "Ana", sueldo: 200000 },
  { id: "r-beto", dni: "10000002", nombre: "Beto", sueldo: 150000 },
  { id: "r-carla", dni: "10000003", nombre: "Carla", sueldo: 100000 },
];

function crearEscenario(opciones: { versiones?: RepositorioDeVersiones } = {}) {
  const condiciones: CondicionLaboral[] = [];
  const agregarCondicion = (relacionId: string, dato: CondicionLaboral["dato"], valor: CondicionLaboral["valor"], vigenteDesde = "2026-01-01") => {
    condiciones.push({ id: `c-${relacionId}-${dato}-${condiciones.length}`, relacionId, dato, valor, vigenteDesde, registradaPorId: finanzas.id,
      registradaPor: "finanzas", registradaEn: new Date("2026-01-01T00:00:00Z"), reemplazadaEn: null, motivoDeReemplazo: null });
  };
  for (const { id, sueldo } of PERSONAS) {
    agregarCondicion(id, "sueldo", sueldo); agregarCondicion(id, "jornada_ordinaria_diaria", 480); agregarCondicion(id, "regimen_laboral", "general");
    agregarCondicion(id, "afiliacion_pensionaria", "onp"); agregarCondicion(id, "elegibilidad_familiar", false); agregarCondicion(id, "sede_de_adscripcion", "Taller");
  }
  const reglas: ReglaLegal[] = ([["onp_tasa", 1300], ["essalud_tasa", 900], ["essalud_base_minima", 100000]] as const).map(([codigo, valor]) => ({
    id: `demo-${codigo}`, codigo, valor, vigenteDesde: "2026-01-01", fuenteOficial: "DEMO sintética; no usar en producción", activadaPorId: finanzas.id,
    activadaPor: "finanzas", activadaEn: new Date("2026-01-01T00:00:00Z"), reemplazadaEn: null, motivoDeReemplazo: null }));
  const relaciones = PERSONAS.map(({ id, dni, nombre }) => ({ id, dni, nombre, grupo: "Taller", ingreso: "2026-01-01", cese: null as string | null, ingresoConfirmado: true, ceseConfirmado: false }));
  const periodos = [{ id: "p1", inicio: "2026-09-26", fin: "2026-10-25", estado: "cerrado" as const }];
  const contexto = crearRepositorioEnMemoria(Object.fromEntries(PERSONAS.map(({ dni, nombre }) => [dni, nombre])));
  const almacenDeVersiones = crearRepositorioDeVersionesEnMemoria();
  const fuentes: FuentesDelBorrador = {
    relaciones: { listarConPersona: async () => relaciones },
    condiciones: { listarTodas: async () => condiciones },
    reglas: { listarTodas: async () => reglas },
    asistencia: {
      listar: async () => periodos,
      leerHechosDelPeriodo: async (periodoId) => {
        const periodo = periodos.find(({ id }) => id === periodoId)!;
        return { periodoId, revisionId: `rev-${periodoId}`, numero: 1, inicio: periodo.inicio, fin: periodo.fin, provisional: false, hechos: [] };
      },
    },
    externas: contexto.repositorio,
    descansos: { listarSustitutoriosParaPagos: async () => [] },
  };
  const dependencias: DependenciasDeFinalizacion = { fuentes, versiones: opciones.versiones ?? almacenDeVersiones.repositorio, pago: contexto.repositorio, ahora: () => AHORA };
  const confirmarTodas = () => Promise.all(TIPOS_DE_FUENTE.map(({ codigo }) => confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente: codigo, mes: MES })));
  const corregirSueldo = (relacionId: string, valor: number) => {
    const anterior = condiciones.find((candidata) => candidata.relacionId === relacionId && candidata.dato === "sueldo" && candidata.reemplazadaEn === null)!;
    anterior.reemplazadaEn = new Date("2026-10-20T00:00:00Z");
    agregarCondicion(relacionId, "sueldo", valor, anterior.vigenteDesde);
  };
  const retirarRegla = (codigo: ReglaLegal["codigo"]) => { reglas.splice(reglas.findIndex((regla) => regla.codigo === codigo), 1); };
  return { dependencias, contexto, almacenDeVersiones, confirmarTodas, corregirSueldo, retirarRegla };
}

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.set(campo, valor);
  return datos;
}

describe("acciones de finalización de /pagos/[mes] (borde del servidor)", () => {
  let escenario: ReturnType<typeof crearEscenario>;

  beforeEach(async () => {
    vi.clearAllMocks();
    escenario = crearEscenario();
    simulacro.dependencias = escenario.dependencias;
    simulacro.actor.mockResolvedValue(finanzas);
    await escenario.confirmarTodas();
  });

  /** Como en la pantalla: Finanzas revisó el borrador y el formulario trae la huella de lo que revisó. */
  const formularioDeLoRevisado = async (mes = MES) => {
    const revision = await evaluarFinalizacion(escenario.dependencias, finanzas, { mes });
    return formulario({ mes, huella: JSON.stringify(revision.huella) });
  };

  it("F-37 al confirmar «Finalizar mes» la acción guarda la versión 1, responde «Versión 1 guardada. Ya no se puede editar.» y refresca la página del mes", async () => {
    const estado = await finalizarMesDesdeFormulario({}, await formularioDeLoRevisado());

    expect(estado).toEqual({ listo: 1, version: 1, mensaje: "Versión 1 guardada. Ya no se puede editar." });
    expect(escenario.almacenDeVersiones.guardadas()).toMatchObject([{ mesDePago: MES, numero: 1, subtotalCentimos: 450000, finalizadaPorId: finanzas.id }]);
    expect(simulacro.revalidar).toHaveBeenCalledWith("/pagos/2026-10");
  });

  it("F-39 si el cálculo cambió desde lo revisado la acción devuelve «cambió» con su resumen y no guarda", async () => {
    const revisado = await formularioDeLoRevisado();
    escenario.corregirSueldo("r-ana", 210000);

    const estado = await finalizarMesDesdeFormulario({}, revisado);

    expect(estado).toMatchObject({ cambio: { subtotalAnteriorCentimos: 450000, subtotalActualCentimos: 460000,
      personas: [{ dni: "10000001", nombre: "Ana", anteriorCentimos: 200000, actualCentimos: 210000 }] } });
    expect(estado).not.toHaveProperty("listo");
    expect(estado).not.toHaveProperty("error");
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
  });

  it("F-38 la acción rechaza a quien no es Finanzas (Administrador, gerente, RR. HH., sin sesión): no guarda ni refresca", async () => {
    const revisado = await formularioDeLoRevisado();
    const sinPermiso: Array<Actor | undefined> = [
      { id: "22222222-2222-4222-8222-222222222222", rol: "administrador", nombreUsuario: "admin" },
      { id: "33333333-3333-4333-8333-333333333333", rol: "gerente_de_area", nombreUsuario: "gerente", grupos: [{ nombre: "Taller", gestionaAsistencia: true }] },
      { id: "44444444-4444-4444-8444-444444444444", rol: "recursos_humanos", nombreUsuario: "rrhh" },
      undefined,
    ];

    for (const actor of sinPermiso) {
      if (actor) simulacro.actor.mockResolvedValue(actor); else simulacro.actor.mockRejectedValue(new Error("La sesión no es válida."));

      expect(await finalizarMesDesdeFormulario({}, revisado)).toEqual({ error: "No tiene permiso para consultar ni editar Pagos." });
    }
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it("F-41 ante un fallo inesperado la acción responde «No se guardó ninguna versión» sin filtrar el detalle técnico y no guarda", async () => {
    const detalle = "connect ECONNREFUSED 10.0.0.5:5432 (password authentication failed for user planilla)";
    const base = crearRepositorioDeVersionesEnMemoria();
    escenario = crearEscenario({ versiones: { ...base.repositorio, guardarVersion: async () => { throw new Error(detalle); } } });
    simulacro.dependencias = escenario.dependencias;
    await escenario.confirmarTodas();
    const revisado = await formularioDeLoRevisado();

    expect(await finalizarMesDesdeFormulario({}, revisado)).toEqual({ error: "No se guardó ninguna versión" });

    escenario.dependencias.fuentes.reglas.listarTodas = async () => { throw new Error(detalle); };
    expect(await finalizarMesDesdeFormulario({}, revisado)).toEqual({ error: "No se guardó ninguna versión" });
    expect(base.guardadas()).toEqual([]);
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it("F-42 en un mes con pago realizado confirmado la acción informa que no admite una nueva versión y no guarda", async () => {
    await finalizarMesDesdeFormulario({}, await formularioDeLoRevisado());
    escenario.contexto.mesesConPagoConfirmado.add(MES);
    escenario.corregirSueldo("r-ana", 210000);
    const revisadoDespues = await formularioDeLoRevisado();
    simulacro.revalidar.mockClear();

    const estado = await finalizarMesDesdeFormulario({}, revisadoDespues);

    expect(estado).toEqual({ error: "Este mes ya tiene su pago realizado confirmado; no admite una nueva versión." });
    expect(escenario.almacenDeVersiones.guardadas()).toHaveLength(1);
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it("F-40 al pulsar «Finalizar mes» con bloqueos nuevos la verificación los devuelve, refresca el panel y no guarda", async () => {
    const revisado = await formularioDeLoRevisado();
    escenario.retirarRegla("essalud_tasa");

    const estado = await verificarFinalizacionDesdeFormulario({}, revisado);

    expect(estado).toEqual({ bloqueado: expect.arrayContaining([expect.stringMatching(/^No hay .*EsSalud.* vigente/)]) });
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
    expect(simulacro.revalidar).toHaveBeenCalledWith("/pagos/2026-10");
  });

  // Pruebas posteriores (adenda 2 del plan, F-66 a F-68): cubren comportamiento de `actions.ts` que ya existía sin prueba; no son TDD.
  it("F-66 si al confirmar aparece un bloqueo nuevo la acción devuelve los mismos bloqueos que la verificación, refresca el mes y no guarda", async () => {
    const revisado = await formularioDeLoRevisado();
    escenario.retirarRegla("essalud_tasa");
    const verificacion = await verificarFinalizacionDesdeFormulario({}, revisado);
    simulacro.revalidar.mockClear();

    const estado = await finalizarMesDesdeFormulario({}, revisado);

    expect(estado).toEqual({ bloqueado: expect.arrayContaining([expect.stringMatching(/^No hay .*EsSalud.* vigente/)]) });
    expect(estado).toEqual(verificacion);
    expect(estado).not.toHaveProperty("listo");
    expect(estado).not.toHaveProperty("cambio");
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
    expect(simulacro.revalidar).toHaveBeenCalledWith("/pagos/2026-10");
  });

  it("F-67 en un mes sin personas ambas acciones responden «Este mes no incluye personas» y no guardan", async () => {
    const revisado = await formularioDeLoRevisado();
    escenario.dependencias.fuentes.relaciones.listarConPersona = async () => [];

    expect(await verificarFinalizacionDesdeFormulario({}, revisado)).toEqual({ error: "Este mes no incluye personas" });
    expect(await finalizarMesDesdeFormulario({}, revisado)).toEqual({ error: "Este mes no incluye personas" });
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });

  it.each([
    ["una huella ilegible", { mes: MES, huella: "esto no es una huella" }],
    ["sin huella", { mes: MES }],
    ["sin mes", { huella: "{}" }],
  ])("F-68 un formulario inválido (%s) responde «No se guardó ninguna versión», sin texto técnico, y no guarda", async (_caso, campos) => {
    const estado = await finalizarMesDesdeFormulario({}, formulario(campos));

    expect(estado).toEqual({ error: "No se guardó ninguna versión" });
    expect(escenario.almacenDeVersiones.guardadas()).toEqual([]);
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });
});
