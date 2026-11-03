import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const obtenerActorActual = vi.fn();
const listar = vi.fn();
const listarResumen = vi.fn();
const listarAprobaciones = vi.fn();
const listarSedesConColaboradoresActivos = vi.fn();
const listarColaboradoresActivos = vi.fn();
const mesPagadoDelPeriodo = vi.fn();

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual }));
vi.mock("@/periodos/servicio", () => ({ repositorioDePeriodos: { listar, listarResumen, listarAprobaciones, mesPagadoDelPeriodo } }));
vi.mock("@/turnos/servicio", () => ({
  repositorioDeTurnos: { listarSedesConColaboradoresActivos, listarColaboradoresActivos },
}));
vi.mock("@/app/boton-de-accion-confirmada", () => ({
  BotonDeAccionConfirmada: ({ etiqueta, titulo, descripcion, children }: { etiqueta: string; titulo?: string; descripcion?: string; children?: ReactNode }) => createElement("div", undefined, createElement("button", undefined, etiqueta), createElement("dialog", undefined, createElement("h2", undefined, titulo), createElement("p", undefined, descripcion), children, createElement("button", undefined, "Cancelar"))),
}));
vi.mock("./actions", () => ({
  aprobarAsistenciaDesdeFormulario: vi.fn(),
  cerrarPeriodoDesdeFormulario: vi.fn(),
  decidirHorasExtraDesdeFormulario: vi.fn(),
  reabrirPeriodoDesdeFormulario: vi.fn(),
  crearPeriodoDesdeFormulario: vi.fn(),
}));
vi.mock("./aprobador-de-asistencia", () => ({
  AprobadorDeAsistencia: ({ grupo, periodoId, renovar }: { grupo: string; periodoId: string; renovar?: boolean }) =>
    createElement("button", { "data-aprobar": `${periodoId}:${grupo}` }, renovar ? "Aprobar de nuevo" : "Aprobar asistencia"),
}));
vi.mock("./creador-de-periodo", () => ({
  CreadorDePeriodo: ({ sugerencia }: { sugerencia: { inicio: string; fin: string } }) =>
    createElement("p", { "data-testid": "creador-de-periodo" }, `${sugerencia.inicio} a ${sugerencia.fin}`),
}));

async function render(searchParams: Record<string, string> = {}) {
  const { default: PaginaDePeriodos } = await import("./page");
  return renderToStaticMarkup(await PaginaDePeriodos({ searchParams: Promise.resolve(searchParams) }));
}

describe("página de Períodos de planilla (/periodos)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerActorActual.mockResolvedValue({ rol: "finanzas" });
    listarAprobaciones.mockResolvedValue([]);
    mesPagadoDelPeriodo.mockResolvedValue(undefined);
    listarSedesConColaboradoresActivos.mockResolvedValue(["Centro"]);
    listarColaboradoresActivos.mockResolvedValue([{ dni: "00000001", nombre: "Ana" }]);
    listarResumen.mockResolvedValue({ filas: [], bloqueos: [], totales: { jornadasTrabajadas: 0, minutosTrabajados: 0, noAsistencias: { falta: 0, descanso: 0, feriado: 0, vacaciones: 0, permiso: 0, suspension: 0 }, cantidadTardanzas: 0, minutosPenalizados: 0, horasExtra: { pendiente: { minutosAl25: 0, minutosAl35: 0 }, aprobada: { minutosAl25: 0, minutosAl35: 0 }, descartada: { minutosAl25: 0, minutosAl35: 0 } } } });
  });

  it("usa el encabezado de página compartido con el h1 'Períodos de planilla'", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);

    const html = await render();

    expect(html).toContain('class="encabezado encabezado-pagina"');
    expect(html).toContain('class="eyebrow"');
    expect(html).toContain("<h1>Períodos de planilla</h1>");
    expect(html).not.toContain("Liquidaciones");
    expect(html).not.toMatch(/preliquidaci/i);
    expect(html).not.toContain("Resumen del período");
  });

  it("conserva el filtro GET con botón Filtrar y el enlace de exportación XLSX", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);

    const html = await render({ sede: "Centro" });

    expect(html).toContain('method="get"');
    expect(html).toContain("Filtrar</button>");
    expect(html).toContain("/api/periodos/p1/exportar");
    expect(html).not.toContain("exportar?sede=");
    expect(html).toContain('class="insignia ok"');
    expect(html).toContain("Abierto");
  });

  it("muestra el diálogo de reapertura con motivo, período y consecuencia y la insignia neutra cuando el período está cerrado", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "cerrado" }]);

    const html = await render();

    expect(html).toContain("Motivo de reapertura");
    expect(html).toContain("Reabrir período</button>");
    expect(html).toContain("¿Reabrir este período de planilla?");
    expect(html).toContain("2026-01-01 al 2026-01-31");
    expect(html).toContain("volverá a estar abierto");
    expect(html).toContain(">Cancelar</button>");
    expect(html).toContain('class="insignia neutro"');
    expect(html).toContain("Cerrado");
  });

  it("mantiene el estado vacío cuando no hay períodos", async () => {
    listar.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain('class="estado-vacio"');
    expect(html).toContain("No hay períodos de planilla");
  });

  it("muestra el formulario para crear un período, incluso sin períodos previos", async () => {
    listar.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain('data-testid="creador-de-periodo"');
  });

  it("niega el acceso a Recursos Humanos y a un gerente sin grupos que gestionen asistencia", async () => {
    for (const actor of [{ rol: "recursos_humanos" }, { rol: "gerente_de_area", grupos: [{ nombre: "Administración", gestionaAsistencia: false }] }, { rol: "gerente_de_area", grupos: [] }]) {
      obtenerActorActual.mockResolvedValue(actor);
      listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);

      const html = await render();

      expect(html).toContain("Sin permiso");
      expect(html).not.toContain("Cerrar período");
      expect(html).not.toContain("Reabrir período");
    }
    expect(listarAprobaciones).not.toHaveBeenCalled();
  });

  describe("aprobación de asistencia por grupo", () => {
    const periodoAbierto = { id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" };
    const aprobada = { grupo: "Taller", gerente: "gerente-taller", estado: "aprobada", aprobadaPor: "gerente-taller", aprobadaEn: new Date("2026-01-20T15:30:00Z"), invalidadaEn: null, motivoDeInvalidacion: null, bloqueos: [] };
    const bloqueada = { grupo: "Tiendas", gerente: "gerente-tiendas", estado: "pendiente", aprobadaPor: null, aprobadaEn: null, invalidadaEn: null, motivoDeInvalidacion: null, bloqueos: [
      { dni: "00000001", nombre: "Ana", causa: "sin_horario", fechas: ["2026-01-29", "2026-01-30", "2026-01-31"] },
      { dni: "00000002", nombre: "Beto", causa: "asistencia_pendiente", fechas: ["2026-01-05"] },
    ] };
    const invalidada = { grupo: "Tiendas", gerente: "gerente-tiendas", estado: "invalidada", aprobadaPor: null, aprobadaEn: null, invalidadaEn: new Date("2026-01-22T10:00:00Z"), motivoDeInvalidacion: "Se ajustó la asistencia del 2026-01-05.", bloqueos: [] };

    it("muestra a Finanzas el estado de cada grupo y a quién bloquea, con enlace a Asistencias, sin ofrecerle aprobar", async () => {
      listar.mockResolvedValue([periodoAbierto]);
      listarAprobaciones.mockResolvedValue([aprobada, bloqueada]);

      const html = await render();

      expect(html).toContain("Aprobación de asistencia");
      expect(html).toContain("Aprobada por gerente-taller el 2026-01-20 15:30 UTC");
      expect(html).toContain("Pendiente de aprobación");
      expect(html).toContain("Personas que bloquean la aprobación de Tiendas");
      expect(html).toContain("Ana (00000001): Sin horario publicado, 3 días (entre el 2026-01-29 y el 2026-01-31)");
      expect(html).toContain("Beto (00000002): Asistencia pendiente de revisión, el 2026-01-05");
      expect(html).toContain('href="/asistencias?vista=mensual&amp;grupo=Tiendas&amp;fecha=2026-01-29&amp;colaborador=00000001"');
      expect(html).not.toContain("data-aprobar");
      expect(html).toContain("Solo el gerente gerente-tiendas puede aprobar");
    });

    it("explica a Finanzas por qué no puede cerrar y no ofrece cerrar mientras falte un grupo", async () => {
      listar.mockResolvedValue([periodoAbierto]);
      listarAprobaciones.mockResolvedValue([aprobada, bloqueada]);

      const html = await render();

      expect(html).toContain("No se puede cerrar: falta la aprobación de asistencia del grupo Tiendas");
      expect(html).toContain("Finanzas no aprueba en su nombre");
      expect(html).toMatch(/<button[^>]*disabled[^>]*>Cerrar período<\/button>/);
      expect(html).not.toContain("¿Cerrar este período de planilla?");
    });

    it("ofrece el cierre cuando todos los grupos están aprobados", async () => {
      listar.mockResolvedValue([periodoAbierto]);
      listarAprobaciones.mockResolvedValue([aprobada]);

      const html = await render();

      expect(html).toContain("¿Cerrar este período de planilla?");
      expect(html).not.toContain("No se puede cerrar");
    });

    it("muestra la aprobación invalidada con su motivo y pide aprobar de nuevo al gerente", async () => {
      obtenerActorActual.mockResolvedValue({ rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] });
      listar.mockResolvedValue([periodoAbierto]);
      listarAprobaciones.mockResolvedValue([invalidada]);

      const html = await render();

      expect(html).toContain("Invalidada por una corrección");
      expect(html).toContain("Se ajustó la asistencia del 2026-01-05.");
      expect(html).toContain('data-aprobar="p1:Tiendas"');
      expect(html).toContain("Aprobar de nuevo");
    });

    it("un gerente ve solo la aprobación de sus grupos, sin exportación, totales, cierre, reapertura ni horas extra", async () => {
      obtenerActorActual.mockResolvedValue({ rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] });
      listar.mockResolvedValue([periodoAbierto]);
      listarAprobaciones.mockResolvedValue([aprobada, { ...bloqueada, bloqueos: [] }]);

      const html = await render();

      expect(html).toContain("Aprobación de asistencia");
      expect(html).toContain("<th scope=\"row\">Tiendas</th>");
      expect(html).not.toContain("<th scope=\"row\">Taller</th>");
      expect(html).toContain('data-aprobar="p1:Tiendas"');
      expect(listarResumen).not.toHaveBeenCalled();
      expect(mesPagadoDelPeriodo).not.toHaveBeenCalled();
      for (const prohibido of ["Exportar XLSX", "/exportar", "Totales del período completo", "Cerrar período", "Reabrir período", "Aprobar horas extra", "Nuevo período"]) {
        expect(html).not.toContain(prohibido);
      }
    });

    it("a un gerente no le ofrece aprobar mientras su grupo tenga personas que bloquean, y le dice quiénes", async () => {
      obtenerActorActual.mockResolvedValue({ rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] });
      listar.mockResolvedValue([periodoAbierto]);
      listarAprobaciones.mockResolvedValue([bloqueada]);

      const html = await render();

      expect(html).toContain("Resuelva primero a quienes bloquean");
      expect(html).toContain("Ana (00000001)");
      expect(html).not.toContain("data-aprobar");
    });

    it("el Administrador del sistema, superusuario temporal, puede aprobar cualquier grupo y avisa si un grupo no tiene gerente", async () => {
      obtenerActorActual.mockResolvedValue({ rol: "administrador" });
      listar.mockResolvedValue([periodoAbierto]);
      listarAprobaciones.mockResolvedValue([{ ...bloqueada, gerente: null, bloqueos: [] }]);

      const html = await render();

      expect(html).toContain("Sin gerente asignado");
      expect(html).toContain('data-aprobar="p1:Tiendas"');
    });

    it("en un período cerrado no ofrece aprobar y mantiene el historial visible", async () => {
      obtenerActorActual.mockResolvedValue({ rol: "gerente_de_area", grupos: [{ nombre: "Taller", gestionaAsistencia: true }] });
      listar.mockResolvedValue([{ ...periodoAbierto, estado: "cerrado" }]);
      listarAprobaciones.mockResolvedValue([aprobada]);

      const html = await render();

      expect(html).toContain("Aprobada por gerente-taller");
      expect(html).not.toContain("data-aprobar");
    });

    it("indica que no hay grupos que aprobar cuando ninguno gestiona asistencia", async () => {
      listar.mockResolvedValue([periodoAbierto]);
      listarAprobaciones.mockResolvedValue([]);

      const html = await render();

      expect(html).toContain("Sin grupos que aprobar");
    });
  });

  it("ofrece el cierre y la reapertura al Administrador del sistema, superusuario temporal", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "administrador" });
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "cerrado" }]);

    const html = await render();

    expect(html).toContain("Reabrir período");
  });

  it("agrupa por grupo y muestra totales, motivos y horas extra por estado", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);
    listarResumen.mockResolvedValue({
      filas: [{
        dni: "00000001", nombre: "Ana", grupo: "Tiendas", jornadasTrabajadas: 2, minutosTrabajados: 960,
        noAsistencias: { falta: 1, descanso: 1, feriado: 1, vacaciones: 1, permiso: 1, suspension: 1 },
        cantidadTardanzas: 2, minutosPenalizados: 60,
        horasExtra: {
          pendiente: { minutosAl25: 30, minutosAl35: 0 },
          aprobada: { minutosAl25: 60, minutosAl35: 30 },
          descartada: { minutosAl25: 0, minutosAl35: 60 },
        },
        jornadas: [],
      }],
      bloqueos: [],
      totales: {
        jornadasTrabajadas: 2, minutosTrabajados: 960,
        noAsistencias: { falta: 1, descanso: 1, feriado: 1, vacaciones: 1, permiso: 1, suspension: 1 },
        cantidadTardanzas: 2, minutosPenalizados: 60,
        horasExtra: {
          pendiente: { minutosAl25: 30, minutosAl35: 0 },
          aprobada: { minutosAl25: 60, minutosAl35: 30 },
          descartada: { minutosAl25: 0, minutosAl35: 60 },
        },
      },
    });

    const html = await render();

    expect(html).toContain("Tiendas");
    expect(html).toContain("Jornadas trabajadas");
    expect(html).toContain("Faltas");
    expect(html).toContain("Suspensiones");
    expect(html).toContain("Pendientes 25%");
    expect(html).toContain("Aprobadas 35%");
    expect(html).toContain("Descartadas 35%");
    expect(html).toContain("16 h");
  });

  it("muestra bloqueos navegables y el detalle diario con sede y resultado real", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);
    const totales = { jornadasTrabajadas: 1, minutosTrabajados: 480, noAsistencias: { falta: 0, descanso: 0, feriado: 0, vacaciones: 0, permiso: 0, suspension: 0 }, cantidadTardanzas: 0, minutosPenalizados: 0, horasExtra: { pendiente: { minutosAl25: 30, minutosAl35: 0 }, aprobada: { minutosAl25: 0, minutosAl35: 0 }, descartada: { minutosAl25: 0, minutosAl35: 0 } } };
    listarResumen.mockResolvedValue({
      filas: [{ dni: "00000001", nombre: "Ana", grupo: "Tiendas", ...totales, jornadas: [
        { fecha: "2026-01-02", sede: "Centro", resultado: "trabajada", entradaReal: "2026-01-02T09:00:00.000Z", salidaReal: "2026-01-02T17:00:00.000Z", minutosTrabajados: 480, tardanzaEnMinutos: 0, minutosPenalizados: 0, politicaDeTardanzaVersion: null, horaExtra: { id: "extra-1", estado: "pendiente", minutosAl25: 30, minutosAl35: 0 } },
        { fecha: "2026-01-03", sede: null, resultado: "pendiente", entradaReal: null, salidaReal: null, minutosTrabajados: 0, tardanzaEnMinutos: 0, minutosPenalizados: 0 },
      ] }],
      totales,
      bloqueos: [
        { tipo: "asistencia", dni: "00000001", nombre: "Ana", grupo: "Tiendas", fecha: "2026-01-03" },
        { tipo: "hora-extra", dni: "00000001", nombre: "Ana", grupo: "Tiendas", fecha: "2026-01-02" },
      ],
    });

    const html = await render();

    expect(html).toContain("Asistencia pendiente");
    expect(html).toContain("Hora extra pendiente");
    expect(html).toContain('href="/asistencias?vista=mensual&amp;grupo=Tiendas&amp;fecha=2026-01-03&amp;colaborador=00000001"');
    expect(html).toContain('href="#jornada-00000001-2026-01-02"');
    expect(html).toContain('id="jornada-00000001-2026-01-02"');
    expect(html).toContain("Centro");
    expect(html).toContain("Trabajada");
    expect(html).toContain("Pendiente de revisión");
    expect(html).toContain("Aprobar horas extra");
    expect(html).toContain("Descartar horas extra");
    expect(html).toContain('name="horaExtraId"');
  });

  it("descarta con evidencia y motivo obligatorios y distingue la hora descartada de una hora no autorizada", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);
    const totales = { jornadasTrabajadas: 1, minutosTrabajados: 480, noAsistencias: { falta: 0, descanso: 0, feriado: 0, vacaciones: 0, permiso: 0, suspension: 0 }, cantidadTardanzas: 0, minutosPenalizados: 0, horasExtra: { pendiente: { minutosAl25: 30, minutosAl35: 0 }, aprobada: { minutosAl25: 0, minutosAl35: 0 }, descartada: { minutosAl25: 15, minutosAl35: 0 } } };
    listarResumen.mockResolvedValue({
      filas: [{ dni: "00000001", nombre: "Ana", grupo: "Tiendas", ...totales, jornadas: [
        { fecha: "2026-01-02", sede: "Centro", resultado: "trabajada", entradaReal: "2026-01-02T09:00:00.000Z", salidaReal: "2026-01-02T17:00:00.000Z", minutosTrabajados: 480, tardanzaEnMinutos: 0, minutosPenalizados: 0, politicaDeTardanzaVersion: null, horaExtra: { id: "extra-1", estado: "pendiente", minutosAl25: 30, minutosAl35: 0 } },
        { fecha: "2026-01-05", sede: "Centro", resultado: "trabajada", entradaReal: "2026-01-05T09:00:00.000Z", salidaReal: "2026-01-05T17:00:00.000Z", minutosTrabajados: 480, tardanzaEnMinutos: 0, minutosPenalizados: 0, politicaDeTardanzaVersion: null, horaExtra: { id: "extra-2", estado: "descartada", minutosAl25: 15, minutosAl35: 0 } },
      ] }],
      totales,
      bloqueos: [],
    });

    const html = await render();

    expect(html).toContain('value="descartada"');
    expect(html).toMatch(/<select[^>]*name="causa"[^>]*required/);
    expect(html).toContain("Marca errónea");
    expect(html).toContain("Permanencia sin trabajo");
    expect(html).toMatch(/<input[^>]*required[^>]*name="motivo"|<input[^>]*name="motivo"[^>]*required/);
    expect(html).toContain("No se descarta por falta de autorización previa");
    expect(html).toContain("Descartada: 25% 15 min");
    expect(html).not.toMatch(/rechaza|no autorizada/i);
  });

  it("no muestra decisiones de horas extra cuando el período no tiene filas", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "administrador" });
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);

    const html = await render();

    expect(html).not.toContain("Aprobar horas extra");
    expect(html).not.toContain("Descartar horas extra");
  });

  it("mantiene los totales globales al aplicar filtros de presentación", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);

    await render({ sede: "Centro", dni: "00000001" });

    expect(listarResumen).toHaveBeenCalledWith({ periodoId: "p1", sede: "Centro", dni: "00000001" });
  });
  it("indica el siguiente paso permitido cuando no hay períodos", async () => {
    listar.mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("Nuevo período");
    expect(html).toMatch(/estado-vacio[\s\S]*Cree un período/);
  });

  it("anuncia con la variante listo y role status que el período no tiene bloqueos", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);

    const html = await render();

    expect(html).toContain('class="mensaje-operacion listo" role="status"');
    expect(html).toContain("El período no tiene asistencias ni horas extra pendientes.");
    expect(html).not.toContain("mensaje-operacion exito");
  });

  describe("tablas comparables", () => {
    const totales = { jornadasTrabajadas: 2, minutosTrabajados: 960, noAsistencias: { falta: 1, descanso: 0, feriado: 0, vacaciones: 0, permiso: 0, suspension: 0 }, cantidadTardanzas: 1, minutosPenalizados: 60, horasExtra: { pendiente: { minutosAl25: 30, minutosAl35: 0 }, aprobada: { minutosAl25: 0, minutosAl35: 0 }, descartada: { minutosAl25: 0, minutosAl35: 0 } } };

    async function renderConDetalle() {
      listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);
      listarResumen.mockResolvedValue({
        filas: [{ dni: "00000001", nombre: "Ana", grupo: "Tiendas", ...totales, jornadas: [
          { fecha: "2026-01-02", sede: "Centro", resultado: "trabajada", entradaReal: "2026-01-02T09:00:00.000Z", salidaReal: "2026-01-02T17:00:00.000Z", minutosTrabajados: 480, tardanzaEnMinutos: 15, minutosPenalizados: 60, politicaDeTardanzaVersion: null, horaExtra: { id: "extra-1", estado: "pendiente", minutosAl25: 30, minutosAl35: 0 } },
        ] }],
        totales,
        bloqueos: [],
      });
      return render();
    }

    function tablas(html: string) {
      return [...html.matchAll(/<div class="panel-tabla"[^>]*>[\s\S]*?<\/table><\/div>/g)].map(([tabla]) => tabla);
    }

    function celdas(tabla: string, etiqueta: "th" | "td") {
      return [...tabla.matchAll(new RegExp(`<${etiqueta}((?:\\s[^>]*)?)>([\\s\\S]*?)</${etiqueta}>`, "g"))].map(([, atributos, contenido]) => ({ atributos, contenido }));
    }

    function cifras(html: string, titulo: string) {
      const region = html.match(new RegExp(`<div aria-label="${titulo.replace(/[()]/g, "\\$&")}" role="region">([\\s\\S]*?)</dl></div>`));
      expect(region, titulo).not.toBeNull();
      return [...region![1].matchAll(/<div class="(cifra[^"]*)"><dt>([^<]*)<\/dt><dd>([^<]*)<\/dd><\/div>/g)].map(([, clase, nombre, valor]) => ({ clase, nombre, valor }));
    }

    it("presenta totales y horas extra como cifras rotuladas en regiones con el título de su objeto y deja solo el detalle diario como tabla desplazable", async () => {
      const html = await renderConDetalle();

      expect(tablas(html)).toHaveLength(1);
      expect(tablas(html)[0]).toContain('role="region" aria-label="Detalle diario de Ana (00000001)" tabindex="0"');
      expect(tablas(html)[0]).toContain("<caption class=\"sr-only\">Detalle diario de Ana (00000001)</caption>");
      for (const titulo of ["Totales del período completo", "Horas extra del período completo", "Totales de Ana (00000001)", "Horas extra de Ana (00000001)"]) expect(html).toContain(`aria-label="${titulo}" role="region"`);
    });

    it("conserva cada cifra de totales y horas extra con su rótulo y unidad, y resalta solo las pendientes con tiempo por decidir", async () => {
      const html = await renderConDetalle();

      for (const titulo of ["Totales del período completo", "Totales de Ana (00000001)"]) {
        expect(cifras(html, titulo).map(({ nombre, valor }) => [nombre, valor])).toEqual([
          ["Jornadas trabajadas", "2"], ["Horas trabajadas", "16 h"], ["Faltas", "1"], ["Descansos", "0"], ["Feriados", "0"], ["Vacaciones", "0"], ["Permisos", "0"], ["Suspensiones", "0"], ["Tardanzas", "1"], ["Horas penalizadas", "1 h"],
        ]);
      }
      for (const titulo of ["Horas extra del período completo", "Horas extra de Ana (00000001)"]) {
        const extra = cifras(html, titulo);
        expect(extra.map(({ nombre, valor }) => [nombre, valor])).toEqual([["Pendientes 25%", "30 min"], ["Pendientes 35%", "0 min"], ["Aprobadas 25%", "0 min"], ["Aprobadas 35%", "0 min"], ["Descartadas 25%", "0 min"], ["Descartadas 35%", "0 min"]]);
        expect(extra.filter(({ clase }) => clase.includes("cifra-alerta")).map(({ nombre }) => nombre)).toEqual(["Pendientes 25%"]);
      }
    });

    it("declara las cabeceras de columna y la fecha como cabecera de fila del detalle diario", async () => {
      const html = await renderConDetalle();

      const detalle = tablas(html)[0];
      for (const cabecera of celdas(detalle, "th").filter(({ atributos }) => !atributos.includes('scope="row"'))) expect(cabecera.atributos).toContain('scope="col"');
      expect(celdas(detalle, "th").filter(({ atributos }) => atributos.includes('scope="col"')).map(({ contenido }) => contenido)).toEqual(["Fecha", "Sede de la jornada", "Resultado real", "Horario real", "Tiempo trabajado", "Tardanza", "Penalización", "Hora extra"]);
      expect(detalle).toMatch(/<th[^>]*scope="row"[^>]*>2026-01-02<\/th>/);
      expect(detalle).toContain('id="jornada-00000001-2026-01-02"');
    });

    it("alinea a la derecha solo las cifras del detalle diario y deja fecha, sede, resultado, horario y descripción a la izquierda", async () => {
      const html = await renderConDetalle();

      const detalle = tablas(html)[0];
      const porNombre = new Map(celdas(detalle, "th").filter(({ atributos }) => atributos.includes('scope="col"')).map(({ atributos, contenido }) => [contenido, atributos]));
      for (const numerica of ["Tiempo trabajado", "Tardanza", "Penalización"]) expect(porNombre.get(numerica)).toContain('class="numerico"');
      for (const textual of ["Fecha", "Sede de la jornada", "Resultado real", "Horario real", "Hora extra"]) expect(porNombre.get(textual)).not.toContain("numerico");

      const fila = celdas(detalle, "td");
      expect(fila.map(({ contenido }) => contenido)).toEqual(["Centro", "Trabajada", "09:00 a 17:00", "8 h", "15 min", "1 h", "Pendiente: 25% 30 min, 35% 0 min"]);
      expect(fila.map(({ atributos }) => atributos.includes("numerico"))).toEqual([false, false, false, true, true, true, false]);
    });
  });
});

// «Reabrir período» de un período fuente de un mes con pago realizado confirmado (#130, ADR 0013, D10, §4.7; contrato C2). Z2 y Z4 son guardas del
// comportamiento vigente (el mes no pagado y el período abierto no cambian); Z5 (el gerente no consulta el mes pagado) está arriba, en la prueba del gerente.
describe("«Reabrir período» y pago realizado confirmado en /periodos", () => {
  const periodoCerrado = { id: "p1", inicio: "2019-10-26", fin: "2019-11-25", estado: "cerrado" };
  const causa = "Sustenta la preliquidación con pago realizado confirmado de 11/2019";

  beforeEach(() => {
    vi.clearAllMocks();
    obtenerActorActual.mockResolvedValue({ rol: "finanzas" });
    listarAprobaciones.mockResolvedValue([]);
    mesPagadoDelPeriodo.mockResolvedValue(undefined);
    listarSedesConColaboradoresActivos.mockResolvedValue(["Centro"]);
    listarColaboradoresActivos.mockResolvedValue([]);
    listarResumen.mockResolvedValue({ filas: [], bloqueos: [], totales: { jornadasTrabajadas: 0, minutosTrabajados: 0, noAsistencias: { falta: 0, descanso: 0, feriado: 0, vacaciones: 0, permiso: 0, suspension: 0 }, cantidadTardanzas: 0, minutosPenalizados: 0, horasExtra: { pendiente: { minutosAl25: 0, minutosAl35: 0 }, aprobada: { minutosAl25: 0, minutosAl35: 0 }, descartada: { minutosAl25: 0, minutosAl35: 0 } } } });
  });

  const casosG22: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "Z1", descripcion: "un período cerrado que sustenta 11/2019 pagado muestra «Reabrir período» deshabilitado con la causa y sin el formulario de reapertura",
      comprobar: async () => {
        listar.mockResolvedValue([periodoCerrado]);
        mesPagadoDelPeriodo.mockResolvedValue("2019-11");

        const html = await render();

        expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>Reabrir período</button><small[^>]*>${causa}</small>`));
        expect(html).not.toContain("¿Reabrir este período de planilla?");
        expect(html).not.toContain("Motivo de reapertura");
        expect(mesPagadoDelPeriodo).toHaveBeenCalledWith("p1");
      },
    },
    {
      fila: "Z2", descripcion: "un período cerrado de un mes no pagado conserva «Reabrir período» habilitado con su diálogo y sin causa",
      comprobar: async () => {
        listar.mockResolvedValue([periodoCerrado]);

        const html = await render();

        expect(html).toContain("¿Reabrir este período de planilla?");
        expect(html).toContain("Motivo de reapertura");
        expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Reabrir período<\/button>/);
        expect(html).not.toContain("Sustenta la preliquidación");
      },
    },
    {
      fila: "Z3", descripcion: "el Administrador, que también reabre, lo ve igualmente deshabilitado con la causa",
      comprobar: async () => {
        obtenerActorActual.mockResolvedValue({ rol: "administrador" });
        listar.mockResolvedValue([periodoCerrado]);
        mesPagadoDelPeriodo.mockResolvedValue("2019-11");

        const html = await render();

        expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>Reabrir período</button><small[^>]*>${causa}</small>`));
        expect(html).not.toContain("Motivo de reapertura");
      },
    },
    {
      fila: "Z4", descripcion: "un período abierto no muestra «Reabrir período» ni la causa",
      comprobar: async () => {
        listar.mockResolvedValue([{ ...periodoCerrado, estado: "abierto" }]);
        mesPagadoDelPeriodo.mockResolvedValue("2019-11");

        const html = await render();

        expect(html).not.toContain("Reabrir período");
        expect(html).not.toContain("Sustenta la preliquidación");
      },
    },
  ];
  it.each(casosG22)("G22 $fila $descripcion", async ({ comprobar }) => comprobar());
});
