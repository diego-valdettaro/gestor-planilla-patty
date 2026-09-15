import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const obtenerActorActual = vi.fn();
const listar = vi.fn();
const listarResumen = vi.fn();
const listarSedesConColaboradoresActivos = vi.fn();
const listarColaboradoresActivos = vi.fn();

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual }));
vi.mock("@/periodos/servicio", () => ({ repositorioDePeriodos: { listar, listarResumen } }));
vi.mock("@/turnos/servicio", () => ({
  repositorioDeTurnos: { listarSedesConColaboradoresActivos, listarColaboradoresActivos },
}));
vi.mock("@/app/boton-de-accion-confirmada", () => ({
  BotonDeAccionConfirmada: ({ etiqueta }: { etiqueta: string }) => createElement("button", undefined, etiqueta),
}));
vi.mock("./actions", () => ({
  cerrarPeriodoDesdeFormulario: vi.fn(),
  reabrirPeriodoDesdeFormulario: vi.fn(),
  crearPeriodoDesdeFormulario: vi.fn(),
}));
vi.mock("./creador-de-periodo", () => ({
  CreadorDePeriodo: ({ sugerencia }: { sugerencia: { inicio: string; fin: string } }) =>
    createElement("p", { "data-testid": "creador-de-periodo" }, `${sugerencia.inicio} a ${sugerencia.fin}`),
}));

async function render(searchParams: Record<string, string> = {}) {
  const { default: PaginaDePeriodos } = await import("./page");
  return renderToStaticMarkup(await PaginaDePeriodos({ searchParams: Promise.resolve(searchParams) }));
}

describe("página de Liquidaciones (/periodos)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerActorActual.mockResolvedValue({ rol: "finanzas" });
    listarSedesConColaboradoresActivos.mockResolvedValue(["Centro"]);
    listarColaboradoresActivos.mockResolvedValue([{ idHuellero: "H-1", nombre: "Ana" }]);
    listarResumen.mockResolvedValue({ filas: [], bloqueos: [], totales: { jornadasTrabajadas: 0, minutosTrabajados: 0, noAsistencias: { falta: 0, descanso: 0, feriado: 0, vacaciones: 0, permiso: 0, suspension: 0 }, cantidadTardanzas: 0, minutosPenalizados: 0, horasExtra: { pendiente: { minutosAl25: 0, minutosAl35: 0 }, aprobada: { minutosAl25: 0, minutosAl35: 0 }, rechazada: { minutosAl25: 0, minutosAl35: 0 } } } });
  });

  it("usa el encabezado de página compartido con el h1 'Liquidaciones'", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);

    const html = await render();

    expect(html).toContain('class="encabezado encabezado-pagina"');
    expect(html).toContain('class="eyebrow"');
    expect(html).toContain("<h1>Liquidaciones</h1>");
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

  it("muestra el formulario de reapertura y la insignia neutra cuando el período está cerrado", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "cerrado" }]);

    const html = await render();

    expect(html).toContain("Motivo de reapertura");
    expect(html).toContain("Reabrir período</button>");
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

  it("oculta los controles de cierre y reapertura para Administración", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "administracion" });
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);

    const html = await render();

    expect(html).not.toContain("Cerrar período");
  });

  it("oculta el formulario de reapertura para Administración cuando el período está cerrado", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "administracion" });
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "cerrado" }]);

    const html = await render();

    expect(html).not.toContain("Motivo de reapertura");
    expect(html).not.toContain("Reabrir período");
  });

  it("niega el acceso a Operaciones", async () => {
    obtenerActorActual.mockResolvedValue({ rol: "operaciones" });

    const html = await render();

    expect(html).toContain("Sin permiso");
  });

  it("agrupa por grupo y muestra totales, motivos y horas extra por estado", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);
    listarResumen.mockResolvedValue({
      filas: [{
        idHuellero: "H-1", nombre: "Ana", grupo: "Tiendas", jornadasTrabajadas: 2, minutosTrabajados: 960,
        noAsistencias: { falta: 1, descanso: 1, feriado: 1, vacaciones: 1, permiso: 1, suspension: 1 },
        cantidadTardanzas: 2, minutosPenalizados: 60,
        horasExtra: {
          pendiente: { minutosAl25: 30, minutosAl35: 0 },
          aprobada: { minutosAl25: 60, minutosAl35: 30 },
          rechazada: { minutosAl25: 0, minutosAl35: 60 },
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
          rechazada: { minutosAl25: 0, minutosAl35: 60 },
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
    expect(html).toContain("Rechazadas 35%");
    expect(html).toContain("16 h");
  });

  it("muestra bloqueos navegables y el detalle diario con sede y resultado real", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);
    const totales = { jornadasTrabajadas: 1, minutosTrabajados: 480, noAsistencias: { falta: 0, descanso: 0, feriado: 0, vacaciones: 0, permiso: 0, suspension: 0 }, cantidadTardanzas: 0, minutosPenalizados: 0, horasExtra: { pendiente: { minutosAl25: 30, minutosAl35: 0 }, aprobada: { minutosAl25: 0, minutosAl35: 0 }, rechazada: { minutosAl25: 0, minutosAl35: 0 } } };
    listarResumen.mockResolvedValue({
      filas: [{ idHuellero: "H-1", nombre: "Ana", grupo: "Tiendas", ...totales, jornadas: [
        { fecha: "2026-01-02", sede: "Centro", resultado: "trabajada", entradaReal: "2026-01-02T09:00:00.000Z", salidaReal: "2026-01-02T17:00:00.000Z", minutosTrabajados: 480, tardanzaEnMinutos: 0, minutosPenalizados: 0, horaExtra: { estado: "pendiente", minutosAl25: 30, minutosAl35: 0 } },
        { fecha: "2026-01-03", sede: null, resultado: "pendiente", entradaReal: null, salidaReal: null, minutosTrabajados: 0, tardanzaEnMinutos: 0, minutosPenalizados: 0 },
      ] }],
      totales,
      bloqueos: [
        { tipo: "asistencia", idHuellero: "H-1", nombre: "Ana", grupo: "Tiendas", fecha: "2026-01-03" },
        { tipo: "hora-extra", idHuellero: "H-1", nombre: "Ana", grupo: "Tiendas", fecha: "2026-01-02" },
      ],
    });

    const html = await render();

    expect(html).toContain("Asistencia pendiente");
    expect(html).toContain("Hora extra pendiente");
    expect(html).toContain('href="/asistencias?vista=mensual&amp;grupo=Tiendas&amp;fecha=2026-01-03&amp;colaborador=H-1"');
    expect(html).toContain('href="#jornada-H-1-2026-01-02"');
    expect(html).toContain('id="jornada-H-1-2026-01-02"');
    expect(html).toContain("Centro");
    expect(html).toContain("Trabajada");
    expect(html).toContain("Pendiente de revisión");
  });

  it("mantiene los totales globales al aplicar filtros de presentación", async () => {
    listar.mockResolvedValue([{ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" }]);

    await render({ sede: "Centro", idHuellero: "H-1" });

    expect(listarResumen).toHaveBeenCalledWith({ periodoId: "p1", sede: "Centro", idHuellero: "H-1" });
  });
});
