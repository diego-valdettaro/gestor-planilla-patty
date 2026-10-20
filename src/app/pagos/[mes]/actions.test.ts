import { conIndicadorDePago } from "@/pagos/constancias-en-memoria";
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
import { ErrorDePeriodoFuenteReabierto } from "@/pagos/constancias-de-pago";
import { crearRepositorioDeConstanciasEnMemoria } from "@/pagos/constancias-en-memoria";
import { evaluarFinalizacion, type DependenciasDeFinalizacion, type RepositorioDeVersiones } from "@/pagos/finalizar-mes";
import type { FuentesDelBorrador } from "@/pagos/preparar-borrador";
import { crearRepositorioDeVersionesEnMemoria } from "@/pagos/versiones-en-memoria";
import type { ReglaLegal } from "@/reglas-legales/vigencia";

import { confirmarPagoDesdeFormulario, finalizarMesDesdeFormulario, verificarFinalizacionDesdeFormulario } from "./actions";

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
  const dependencias: DependenciasDeFinalizacion = { fuentes, versiones: opciones.versiones ?? almacenDeVersiones.repositorio, pago: conIndicadorDePago(contexto.repositorio.mesConPagoConfirmado), ahora: () => AHORA };
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

// Acción «Confirmar pago realizado» (#130, ADR 0013; interacción §4.7 y §6.2). Se simulan la sesión y el refresco; los casos de uso y los repositorios
// en memoria (versiones y constancias) son los reales. Ejemplos E1–E4: mes 2019-11, versión 1 de tres personas (S/ 4.500,00), Finanzas confirma el
// 2019-12-02 con reloj 2019-12-02T15:00:00Z.
describe("acción de confirmación del pago realizado de /pagos/[mes] (borde del servidor)", () => {
  const MES_PAGADO = "2019-11";
  const RELOJ = new Date("2019-12-02T15:00:00Z");
  const E1 = { mesDePago: MES_PAGADO, numeroDeVersion: 1, fechaDelPago: "2019-12-02", confirmadaPorId: finanzas.id, confirmadaPor: "finanzas", confirmadaEn: RELOJ };
  let versiones: ReturnType<typeof crearRepositorioDeVersionesEnMemoria>;
  let constancias: ReturnType<typeof crearRepositorioDeConstanciasEnMemoria>;
  let dependencias: DependenciasDeFinalizacion;

  const prepararMundo = (cambios: Partial<DependenciasDeFinalizacion> = {}) => {
    versiones = crearRepositorioDeVersionesEnMemoria();
    constancias = crearRepositorioDeConstanciasEnMemoria({ nombreDe: (id) => (id === finanzas.id ? "finanzas" : id) });
    const prohibido = (): never => { throw new Error("la acción de confirmar no recalcula el borrador"); };
    dependencias = { fuentes: new Proxy({}, { get: prohibido }) as FuentesDelBorrador, versiones: versiones.repositorio, pago: constancias.repositorio, ahora: () => RELOJ, ...cambios };
    simulacro.dependencias = dependencias;
  };
  const finalizarVersion = (mes = MES_PAGADO) => dependencias.versiones.guardarVersion({
    mesDePago: mes, finalizadaPorId: finanzas.id, finalizadaPor: "finanzas", finalizadaEn: new Date("2019-11-26T15:00:00Z"), reglas: [], revisiones: [], fuentes: [],
    personas: [["r-ana", "10000001", "Ana", 200000], ["r-beto", "10000002", "Beto", 150000], ["r-carla", "10000003", "Carla", 100000]]
      .map(([relacionId, dni, nombre, subtotalCentimos]) => ({ relacionId: relacionId as string, dni: dni as string, nombre: nombre as string, subtotalCentimos: subtotalCentimos as number, lineas: [], bases: [] })),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prepararMundo();
    simulacro.actor.mockResolvedValue(finanzas);
  });

  // G14 · La acción registra la constancia, responde con el mensaje de éxito y refresca el mes y /periodos (D10).
  const casosG14: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "A1", descripcion: "Finanzas con la versión 1 de 2019-11 y fecha 2019-12-02: guarda E1, responde el éxito y refresca /pagos/2019-11 y /periodos",
      comprobar: async () => {
        await finalizarVersion();

        const estado = await confirmarPagoDesdeFormulario({}, formulario({ mes: MES_PAGADO, version: "1", fecha: "2019-12-02" }));

        expect(estado).toEqual({ listo: 1, mensaje: "Pago realizado confirmado." });
        expect(constancias.guardadas()).toEqual([E1]);
        expect(simulacro.revalidar).toHaveBeenCalledWith("/pagos/2019-11");
        expect(simulacro.revalidar).toHaveBeenCalledWith("/periodos");
      },
    },
  ];
  it.each(casosG14)("G14 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G15 · Los rechazos del dominio vuelven como estado con el mensaje para Finanzas, sin escribir ni refrescar (contrato C1 y C4, §4.7).
  const confirmar = (campos: Record<string, string> = {}) => confirmarPagoDesdeFormulario({}, formulario({ mes: MES_PAGADO, version: "1", fecha: "2019-12-02", ...campos }));
  const casosG15: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "A2", descripcion: "administrador, gerente de área, Recursos Humanos y sin sesión reciben «No tiene permiso…», sin constancia ni refresco",
      comprobar: async () => {
        await finalizarVersion();
        const sinPermiso: Array<Actor | undefined> = [
          { id: "22222222-2222-4222-8222-222222222222", rol: "administrador", nombreUsuario: "admin" },
          { id: "33333333-3333-4333-8333-333333333333", rol: "gerente_de_area", nombreUsuario: "gerente", grupos: [{ nombre: "Taller", gestionaAsistencia: true }] },
          { id: "44444444-4444-4444-8444-444444444444", rol: "recursos_humanos", nombreUsuario: "rrhh" },
          undefined,
        ];
        for (const actor of sinPermiso) {
          if (actor) simulacro.actor.mockResolvedValue(actor); else simulacro.actor.mockRejectedValue(new Error("La sesión no es válida."));

          expect(await confirmar()).toEqual({ error: "No tiene permiso para consultar ni editar Pagos." });
        }
        expect(constancias.guardadas()).toEqual([]);
        expect(simulacro.revalidar).not.toHaveBeenCalled();
      },
    },
    {
      fila: "A3", descripcion: "una fecha futura (2019-12-03) responde el mensaje de fecha futura, sin constancia ni refresco",
      comprobar: async () => {
        await finalizarVersion();

        expect(await confirmar({ fecha: "2019-12-03" })).toEqual({ error: "La fecha del pago no puede ser futura." });

        expect(constancias.guardadas()).toEqual([]);
        expect(simulacro.revalidar).not.toHaveBeenCalled();
      },
    },
    {
      fila: "A4", descripcion: "la segunda confirmación del mes responde «ya tiene su pago realizado confirmado» y la constancia sigue siendo E1",
      comprobar: async () => {
        await finalizarVersion();
        await confirmar();
        simulacro.revalidar.mockClear();

        expect(await confirmar({ fecha: "2019-12-01" })).toEqual({ error: "Este mes ya tiene su pago realizado confirmado." });

        expect(constancias.guardadas()).toEqual([E1]);
        expect(simulacro.revalidar).not.toHaveBeenCalled();
      },
    },
    {
      fila: "A5", descripcion: "un mes sin versión finalizada responde «Finalice el mes para poder confirmar el pago» y no guarda nada",
      comprobar: async () => {
        expect(await confirmar()).toEqual({ error: "Finalice el mes para poder confirmar el pago" });

        expect(constancias.guardadas()).toEqual([]);
        expect(simulacro.revalidar).not.toHaveBeenCalled();
      },
    },
  ];
  it.each(casosG15)("G15 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G16 · Un fallo técnico o un formulario incompleto responden «No se registró el pago» sin filtrar detalle ni lanzar (§4.7 «Error», §3).
  const casosG16: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "A6", descripcion: "si el repositorio falla con un detalle de SQL la acción responde «No se registró el pago» sin ese detalle y sin refrescar",
      comprobar: async () => {
        const detalle = 'insert into "constancias_de_pago" failed: connect ECONNREFUSED 10.0.0.5:5432 (password authentication failed for user planilla)';
        prepararMundo({ pago: { ...constancias.repositorio, confirmar: async () => { throw new Error(detalle); } } });
        await finalizarVersion();

        const estado = await confirmar();

        expect(estado).toEqual({ error: "No se registró el pago" });
        expect(JSON.stringify(estado)).not.toContain("constancias_de_pago");
        expect(simulacro.revalidar).not.toHaveBeenCalled();
      },
    },
    {
      fila: "A7", descripcion: "un formulario sin mes, sin versión o con la versión ilegible responde «No se registró el pago» sin lanzar y sin guardar",
      comprobar: async () => {
        await finalizarVersion();
        const incompletos: Array<Record<string, string>> = [
          { version: "1", fecha: "2019-12-02" }, { mes: MES_PAGADO, fecha: "2019-12-02" },
          { mes: MES_PAGADO, version: "uno", fecha: "2019-12-02" },
        ];
        for (const campos of incompletos) expect(await confirmarPagoDesdeFormulario({}, formulario(campos))).toEqual({ error: "No se registró el pago" });

        expect(constancias.guardadas()).toEqual([]);
        expect(simulacro.revalidar).not.toHaveBeenCalled();
      },
    },
  ];
  it.each(casosG16)("G16 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G25 · Los rechazos del dominio que ocurren entre el diálogo y la confirmación también llegan a Finanzas con su causa (decisión P9, ADR 0013 y §4.7).
  const casosG25: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "A10", descripcion: "si el mes ya tiene la versión 2, confirmar la versión 1 mostrada responde que ya no es la vigente y no guarda nada",
      comprobar: async () => {
        await finalizarVersion();
        await finalizarVersion();

        expect(await confirmar()).toEqual({ error: "La versión mostrada ya no es la vigente; revise y vuelva a confirmar." });

        expect(constancias.guardadas()).toEqual([]);
        expect(simulacro.revalidar).not.toHaveBeenCalled();
      },
    },
    {
      fila: "A11", descripcion: "si un período fuente se reabrió entre el diálogo y la confirmación responde el texto de ese error y no guarda nada",
      comprobar: async () => {
        prepararMundo({ pago: { ...constancias.repositorio, confirmar: async () => { throw new ErrorDePeriodoFuenteReabierto(); } } });
        await finalizarVersion();

        expect(await confirmar()).toEqual({ error: "Un período que sustenta esta versión se reabrió; finalice el mes otra vez antes de confirmar el pago." });

        expect(constancias.guardadas()).toEqual([]);
        expect(simulacro.revalidar).not.toHaveBeenCalled();
      },
    },
  ];
  it.each(casosG25)("G25 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G28 · Sin fecha en el formulario (ausente o vacía) la acción responde el texto de la fecha inválida, no el genérico, y no guarda nada (QA-F01, §4.7).
  const casosG28: Array<{ fila: string; descripcion: string; campos: Record<string, string> }> = [
    { fila: "A12", descripcion: "una fecha vacía responde «Indique una fecha de pago válida.»", campos: { mes: MES_PAGADO, version: "1", fecha: "" } },
    { fila: "A13", descripcion: "una fecha ausente responde «Indique una fecha de pago válida.»", campos: { mes: MES_PAGADO, version: "1" } },
  ];
  it.each(casosG28)("G28 $fila $descripcion y no guarda nada", async ({ campos }) => {
    await finalizarVersion();

    expect(await confirmarPagoDesdeFormulario({}, formulario(campos))).toEqual({ error: "Indique una fecha de pago válida." });

    expect(constancias.guardadas()).toEqual([]);
    expect(simulacro.revalidar).not.toHaveBeenCalled();
  });
});
