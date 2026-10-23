import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({ actor: vi.fn(), exportar: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/pagos/servicio", () => ({ dependenciasDeFinalizacion: { id: "dependencias" } }));
vi.mock("@/pagos/exportar-mes", async (importarOriginal) => ({ ...(await importarOriginal<typeof import("@/pagos/exportar-mes")>()), exportarPreliquidacion: simulacro.exportar }));

import { GET } from "./route";

const pedir = (mes: string, consulta = "") => GET(new NextRequest(`http://localhost/pagos/${mes}/exportar${consulta}`), { params: Promise.resolve({ mes }) });
const archivo = (nombre: string) => ({ estado: "lista", archivo: { nombre, contenido: new Uint8Array([80, 75, 3, 4]) } });

beforeEach(() => {
  vi.clearAllMocks();
  simulacro.actor.mockResolvedValue({ id: "f1", rol: "finanzas", nombreUsuario: "finanzas" });
  simulacro.exportar.mockResolvedValue(archivo("preliquidacion-2026-10-borrador.xlsx"));
});

describe("G7 permiso en el borde HTTP", () => {
  it.each([
    ["el Administrador", { id: "a", rol: "administrador" }],
    ["Recursos Humanos", { id: "r", rol: "recursos_humanos" }],
    ["un gerente de área", { id: "g", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ])("F-16 responde 403 a %s sin exportar nada", async (_quien, actor) => {
    simulacro.actor.mockResolvedValue(actor);
    expect((await pedir("2026-10")).status).toBe(403);
    expect(simulacro.exportar).not.toHaveBeenCalled();
  });

  it("F-16 responde 403 sin sesión", async () => {
    simulacro.actor.mockRejectedValue(new Error("La sesión no es válida."));
    expect((await pedir("2026-10")).status).toBe(403);
    expect(simulacro.exportar).not.toHaveBeenCalled();
  });
});

describe("G8 respuesta de la descarga", () => {
  it("F-17 Finanzas descarga el borrador como XLSX con el nombre de borrador y sin caché", async () => {
    const respuesta = await pedir("2026-10");
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(respuesta.headers.get("content-disposition")).toBe('attachment; filename="preliquidacion-2026-10-borrador.xlsx"');
    expect(respuesta.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await respuesta.arrayBuffer())).toEqual(new Uint8Array([80, 75, 3, 4]));
    expect(simulacro.exportar).toHaveBeenCalledWith({ id: "dependencias" }, expect.objectContaining({ rol: "finanzas" }), { mes: "2026-10", version: undefined });
  });

  it("F-18 con ?version=2 pide esa versión y usa su nombre", async () => {
    simulacro.exportar.mockResolvedValue(archivo("preliquidacion-2026-10-version-2.xlsx"));
    const respuesta = await pedir("2026-10", "?version=2");
    expect(respuesta.headers.get("content-disposition")).toBe('attachment; filename="preliquidacion-2026-10-version-2.xlsx"');
    expect(simulacro.exportar).toHaveBeenCalledWith({ id: "dependencias" }, expect.anything(), { mes: "2026-10", version: 2 });
  });

  it.each([
    ["mes mal formado", "2026-13", "", 400],
    ["versión no numérica", "2026-10", "?version=dos", 400],
    ["versión cero", "2026-10", "?version=0", 400],
    ["versión mayor que un entero de PostgreSQL", "2026-10", "?version=2147483648", 400],
  ])("F-19 %s responde %i sin consultar datos", async (_caso, mes, consulta, estado) => {
    expect((await pedir(mes, consulta)).status).toBe(estado);
    expect(simulacro.exportar).not.toHaveBeenCalled();
  });

  it("F-19 si la exportación falla responde 500 con un mensaje general, sin detalles técnicos (prueba posterior)", async () => {
    simulacro.exportar.mockRejectedValue(new Error("connection refused 10.0.0.5"));
    const respuesta = await pedir("2026-10");
    expect(respuesta.status).toBe(500);
    expect(await respuesta.text()).toBe("No se pudo generar el archivo");
  });

  it("F-19 una versión inexistente responde 404 y un mes sin personas 422 con su mensaje", async () => {
    simulacro.exportar.mockResolvedValueOnce({ estado: "sin_version" });
    expect((await pedir("2026-10", "?version=9")).status).toBe(404);
    simulacro.exportar.mockResolvedValueOnce({ estado: "sin_personas", mensaje: "No hay datos para exportar: revise" });
    const sinPersonas = await pedir("2026-10");
    expect(sinPersonas.status).toBe(422);
    expect(await sinPersonas.text()).toBe("No hay datos para exportar: revise");
  });
});
