import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { buscar, listarResumen, obtenerActorActual } = vi.hoisted(() => ({ buscar: vi.fn(), listarResumen: vi.fn(), obtenerActorActual: vi.fn() }));

vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual }));
vi.mock("@/periodos/servicio", () => ({ repositorioDePeriodos: { buscar, listarResumen } }));

describe("exportación del resumen del período", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerActorActual.mockResolvedValue({ id: "finanzas-1", rol: "finanzas" });
    buscar.mockResolvedValue({ id: "p1", inicio: "2026-01-01", fin: "2026-01-31", estado: "abierto" });
    listarResumen.mockResolvedValue({
      filas: [{
        idHuellero: "H-1", nombre: "Ana", grupo: "Tiendas", jornadasTrabajadas: 2, minutosTrabajados: 930,
        noAsistencias: { falta: 1, descanso: 0, feriado: 0, vacaciones: 0, permiso: 0, suspension: 0 },
        cantidadTardanzas: 1, minutosPenalizados: 60,
        horasExtra: {
          pendiente: { minutosAl25: 120, minutosAl35: 0 },
          aprobada: { minutosAl25: 60, minutosAl35: 30 },
          rechazada: { minutosAl25: 0, minutosAl35: 90 },
        },
        jornadas: [],
      }],
      bloqueos: [],
      totales: {},
    });
  });

  it("exporta el período completo y solo las horas extra aprobadas", async () => {
    const { GET } = await import("./route");
    const respuesta = await GET(new NextRequest("http://localhost/api/periodos/p1/exportar?sede=Centro&idHuellero=H-2"), { params: Promise.resolve({ periodoId: "p1" }) });
    const libro = XLSX.read(await respuesta.arrayBuffer());
    const [fila] = XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets.Resumen);

    expect(listarResumen).toHaveBeenCalledWith({ periodoId: "p1" });
    expect(fila).toMatchObject({ Grupo: "Tiendas", Colaborador: "Ana", "Jornadas trabajadas": 2, "Horas trabajadas (decimal)": 15.5, "Extras 25% aprobadas (horas decimales)": 1, "Extras 35% aprobadas (horas decimales)": 0.5 });
    expect(Object.keys(fila).some((columna) => columna.includes("pendientes") || columna.includes("rechazadas"))).toBe(false);
    expect(respuesta.headers.get("content-disposition")).toContain("resumen-2026-01-01.xlsx");
  });
});
