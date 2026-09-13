import { beforeEach, describe, expect, it, vi } from "vitest";

const { conservarArchivoFuente, descartarArchivoFuente, prevalidar, importar } = vi.hoisted(() => ({
  conservarArchivoFuente: vi.fn(),
  descartarArchivoFuente: vi.fn(),
  prevalidar: vi.fn(),
  importar: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: vi.fn() }));
vi.mock("@/asistencias/casos-de-uso-servidor", () => ({ crearCasosDeUsoDeAsistencias: vi.fn() }));
vi.mock("@/asistencias/servicio", () => ({ repositorioDeAsistencias: {} }));
vi.mock("@/turnos/casos-de-uso-servidor", () => ({ crearCasosDeUsoDeTurnos: vi.fn() }));
vi.mock("@/turnos/servicio", () => ({ repositorioDeTurnos: {} }));
vi.mock("@/importaciones/almacenamiento-local", () => ({ conservarArchivoFuente, descartarArchivoFuente }));
vi.mock("@/importaciones/casos-de-uso-servidor", () => ({
  crearCasosDeUsoDeImportaciones: vi.fn(() => ({ prevalidar, importar })),
}));
vi.mock("@/importaciones/parsear-archivo-huellero", () => ({
  parsearArchivoHuellero: vi.fn(async () => ({
    filas: [{ fila: 2, idHuellero: "HU-1024", sede: "Centro", fecha: "2026-09-01", entrada: "09:00", salida: "18:00" }],
    errores: [],
  })),
}));
vi.mock("@/importaciones/servicio", () => ({ repositorioDeImportaciones: {} }));

describe("importarAsistencia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prevalidar.mockResolvedValue([{ fila: 2, idHuellero: "HU-1024", fecha: "2026-09-01", motivo: "No tiene horario publicado." }]);
  });

  it("no conserva el archivo cuando la prevalidación rechaza la carga", async () => {
    const { importarAsistencia } = await import("./actions");
    const formData = new FormData();
    formData.set("archivo", new File(["contenido"], "asistencias.xlsx"));

    await expect(importarAsistencia({}, formData)).resolves.toEqual({ errores: [
      { fila: 2, idHuellero: "HU-1024", fecha: "2026-09-01", motivo: "No tiene horario publicado." },
    ] });
    expect(conservarArchivoFuente).not.toHaveBeenCalled();
    expect(descartarArchivoFuente).not.toHaveBeenCalled();
    expect(importar).not.toHaveBeenCalled();
  });
});
