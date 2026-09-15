import { beforeEach, describe, expect, it, vi } from "vitest";

const { conservarArchivoFuente, descartarArchivoFuente, previsualizar, aplicar } = vi.hoisted(() => ({
  conservarArchivoFuente: vi.fn(),
  descartarArchivoFuente: vi.fn(),
  previsualizar: vi.fn(),
  aplicar: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: vi.fn() }));
vi.mock("@/asistencias/casos-de-uso-servidor", () => ({ crearCasosDeUsoDeAsistencias: vi.fn() }));
vi.mock("@/asistencias/servicio", () => ({ repositorioDeAsistencias: {} }));
vi.mock("@/turnos/casos-de-uso-servidor", () => ({ crearCasosDeUsoDeTurnos: vi.fn() }));
vi.mock("@/turnos/servicio", () => ({ repositorioDeTurnos: {} }));
vi.mock("@/importaciones/almacenamiento-local", () => ({ conservarArchivoFuente, descartarArchivoFuente }));
vi.mock("@/importaciones/casos-de-uso-servidor", () => ({
  crearCasosDeUsoDeImportaciones: vi.fn(() => ({ previsualizar, aplicar })),
}));
vi.mock("@/importaciones/parsear-archivo-huellero", () => ({
  parsearArchivoHuellero: vi.fn(async () => ({
    filas: [{ fila: 2, idHuellero: "HU-1024", sede: "Centro", fecha: "2026-09-01", entrada: "09:00", salida: "18:00" }],
    errores: [],
  })),
}));
vi.mock("@/importaciones/servicio", () => ({ repositorioDeImportaciones: {} }));

const conteosSinConfirmadas = { nuevo: 1, igual: 0, pendiente: 0, confirmado: 0 };
const conteosConConfirmadas = { nuevo: 0, igual: 0, pendiente: 0, confirmado: 2 };

describe("importarAsistencia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conservarArchivoFuente.mockResolvedValue({ nombre: "asistencias.xlsx", ubicacion: "importaciones/asistencias.xlsx", hashSha256: "abc" });
    descartarArchivoFuente.mockResolvedValue(undefined);
  });

  it("no conserva el archivo cuando la vista previa rechaza la carga", async () => {
    previsualizar.mockResolvedValue({ errores: [
      { fila: 2, idHuellero: "HU-1024", fecha: "2026-09-01", motivo: "No tiene horario publicado." },
    ] });
    const { importarAsistencia } = await import("./actions");
    const formData = new FormData();
    formData.set("archivo", new File(["contenido"], "asistencias.xlsx"));

    await expect(importarAsistencia({}, formData)).resolves.toEqual({ errores: [
      { fila: 2, idHuellero: "HU-1024", fecha: "2026-09-01", motivo: "No tiene horario publicado." },
    ] });
    expect(conservarArchivoFuente).not.toHaveBeenCalled();
    expect(descartarArchivoFuente).not.toHaveBeenCalled();
    expect(aplicar).not.toHaveBeenCalled();
  });

  it("muestra la vista previa y no aplica nada cuando hay confirmadas y falta la confirmación explícita", async () => {
    previsualizar.mockResolvedValue({ errores: [], vistaPrevia: { conteos: conteosConConfirmadas, filas: [] } });
    const { importarAsistencia } = await import("./actions");
    const formData = new FormData();
    formData.set("archivo", new File(["contenido"], "asistencias.xlsx"));

    await expect(importarAsistencia({}, formData)).resolves.toEqual({ vistaPrevia: { conteos: conteosConConfirmadas, filas: [] } });
    expect(conservarArchivoFuente).not.toHaveBeenCalled();
    expect(aplicar).not.toHaveBeenCalled();
  });

  it("conserva el archivo y aplica directo cuando no hay confirmadas que reemplazar", async () => {
    previsualizar.mockResolvedValue({ errores: [], vistaPrevia: { conteos: conteosSinConfirmadas, filas: [] } });
    aplicar.mockResolvedValue({ requiereConfirmacion: false, jornadas: 1 });
    const { importarAsistencia } = await import("./actions");
    const formData = new FormData();
    formData.set("archivo", new File(["contenido"], "asistencias.xlsx"));

    await expect(importarAsistencia({}, formData)).resolves.toEqual({
      resultado: { jornadas: 1 }, vistaPrevia: { conteos: conteosSinConfirmadas, filas: [] },
    });
    expect(conservarArchivoFuente).toHaveBeenCalledTimes(1);
    expect(aplicar).toHaveBeenCalledWith(expect.objectContaining({ confirmarReemplazoDeConfirmadas: false }));
  });

  it("aplica el reemplazo tras la confirmación explícita del usuario", async () => {
    previsualizar.mockResolvedValue({ errores: [], vistaPrevia: { conteos: conteosConConfirmadas, filas: [] } });
    aplicar.mockResolvedValue({ requiereConfirmacion: false, jornadas: 2 });
    const { importarAsistencia } = await import("./actions");
    const formData = new FormData();
    formData.set("archivo", new File(["contenido"], "asistencias.xlsx"));
    formData.set("confirmarReemplazoDeConfirmadas", "true");

    await expect(importarAsistencia({}, formData)).resolves.toEqual({
      resultado: { jornadas: 2 }, vistaPrevia: { conteos: conteosConConfirmadas, filas: [] },
    });
    expect(conservarArchivoFuente).toHaveBeenCalledTimes(1);
    expect(aplicar).toHaveBeenCalledWith(expect.objectContaining({ confirmarReemplazoDeConfirmadas: true }));
  });

  it("descarta el archivo conservado cuando la clasificación cambió concurrentemente y aplicar exige confirmación", async () => {
    previsualizar.mockResolvedValue({ errores: [], vistaPrevia: { conteos: conteosSinConfirmadas, filas: [] } });
    aplicar.mockResolvedValue({ requiereConfirmacion: true, conteos: conteosConConfirmadas });
    const { importarAsistencia } = await import("./actions");
    const formData = new FormData();
    formData.set("archivo", new File(["contenido"], "asistencias.xlsx"));

    await expect(importarAsistencia({}, formData)).resolves.toEqual({ vistaPrevia: { conteos: conteosConConfirmadas, filas: [] } });
    expect(conservarArchivoFuente).toHaveBeenCalledTimes(1);
    expect(descartarArchivoFuente).toHaveBeenCalledTimes(1);
  });

  it("descarta el archivo conservado cuando aplicar lanza errores de importación", async () => {
    previsualizar.mockResolvedValue({ errores: [], vistaPrevia: { conteos: conteosSinConfirmadas, filas: [] } });
    const { ErroresDeImportacion } = await import("@/importaciones/importar-semana-por-sede");
    aplicar.mockRejectedValue(new ErroresDeImportacion([{ fila: 2, idHuellero: "HU-1024", fecha: "2026-09-01", motivo: "El período de planilla está cerrado. Pida a Finanzas que lo reabra." }]));
    const { importarAsistencia } = await import("./actions");
    const formData = new FormData();
    formData.set("archivo", new File(["contenido"], "asistencias.xlsx"));

    await expect(importarAsistencia({}, formData)).resolves.toEqual({ errores: [
      { fila: 2, idHuellero: "HU-1024", fecha: "2026-09-01", motivo: "El período de planilla está cerrado. Pida a Finanzas que lo reabra." },
    ] });
    expect(descartarArchivoFuente).toHaveBeenCalledTimes(1);
  });
});
