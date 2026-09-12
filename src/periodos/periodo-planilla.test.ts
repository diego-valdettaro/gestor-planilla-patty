import { describe, expect, it, vi } from "vitest";
import {
  calcularSugerenciaDePeriodo,
  cerrarPeriodo,
  crearPeriodo,
  HuecoEntrePeriodosError,
  PeriodosSolapadosError,
  reabrirPeriodo,
  type PeriodoPlanilla,
  type RepositorioDePeriodos,
} from "./periodo-planilla";

const actor = (rol: "administracion" | "finanzas" | "operaciones") => ({ id: "cuenta-1", nombreUsuario: "usuario", rol });
function repositorio(periodos: PeriodoPlanilla[] = []): RepositorioDePeriodos {
  return {
    listar: vi.fn().mockResolvedValue(periodos),
    buscar: vi.fn(),
    listarResumen: vi.fn(),
    crear: vi.fn(),
    cerrar: vi.fn(),
    reabrir: vi.fn(),
  } as unknown as RepositorioDePeriodos;
}
function periodo(inicio: string, fin: string, estado: "abierto" | "cerrado" = "cerrado"): PeriodoPlanilla {
  return { id: `${inicio}-${fin}`, inicio, fin, estado };
}

describe("cierre y reapertura de períodos de planilla", () => {
  it("permite cerrar a Finanzas", async () => {
    const repo = repositorio();
    await cerrarPeriodo(repo, actor("finanzas"), "periodo-1");
    expect(repo.cerrar).toHaveBeenCalledWith("periodo-1", "cuenta-1", expect.any(Date));
  });

  it("rechaza el cierre de Administración", async () => {
    await expect(cerrarPeriodo(repositorio(), actor("administracion"), "periodo-1")).rejects.toThrow("Solo Finanzas");
  });

  it("rechaza el cierre de Operaciones", async () => {
    await expect(cerrarPeriodo(repositorio(), actor("operaciones"), "periodo-1")).rejects.toThrow("Solo Finanzas");
  });

  it("exige motivo para reabrir y lo entrega al repositorio", async () => {
    const repo = repositorio();
    await expect(reabrirPeriodo(repo, actor("finanzas"), "periodo-1", "  Corrección de auditoría  ")).resolves.toBeUndefined();
    expect(repo.reabrir).toHaveBeenCalledWith("periodo-1", "cuenta-1", "Corrección de auditoría", expect.any(Date));
    await expect(reabrirPeriodo(repo, actor("finanzas"), "periodo-1", " ")).rejects.toThrow("requiere un motivo");
  });

  it("rechaza la reapertura de Administración", async () => {
    await expect(reabrirPeriodo(repositorio(), actor("administracion"), "periodo-1", "Motivo")).rejects.toThrow("Solo Finanzas");
  });
});

describe("sugerencia de fechas para un nuevo período", () => {
  it("sin períodos previos sugiere el día 26 del mes actual y el 25 del mes siguiente", () => {
    const hoy = new Date(2026, 2, 10); // 10 de marzo de 2026
    expect(calcularSugerenciaDePeriodo([], hoy)).toEqual({ inicio: "2026-03-26", fin: "2026-04-25" });
  });

  it("con períodos previos sugiere continuar desde el día siguiente al último fin", () => {
    const previos = [periodo("2026-01-26", "2026-02-25"), periodo("2026-02-26", "2026-03-25")];
    const hoy = new Date(2026, 3, 1);
    expect(calcularSugerenciaDePeriodo(previos, hoy)).toEqual({ inicio: "2026-03-26", fin: "2026-04-25" });
  });

  it("resuelve correctamente el cruce de fin de año", () => {
    const previos = [periodo("2025-11-26", "2025-12-25")];
    expect(calcularSugerenciaDePeriodo(previos, new Date(2025, 11, 30))).toEqual({ inicio: "2025-12-26", fin: "2026-01-25" });
  });

  it("sin períodos previos y con el día 26 ya pasado, sugiere el 26 del mes siguiente", () => {
    const hoy = new Date(2026, 2, 27); // 27 de marzo de 2026, el 26 de marzo ya pasó
    expect(calcularSugerenciaDePeriodo([], hoy)).toEqual({ inicio: "2026-04-26", fin: "2026-05-25" });
  });
});

describe("creación de períodos de planilla", () => {
  it("rechaza la creación a Operaciones", async () => {
    await expect(crearPeriodo(repositorio(), actor("operaciones"), { inicio: "2026-01-26", fin: "2026-02-25" })).rejects.toThrow("No tiene permiso");
  });

  it("exige que el fin no sea anterior al inicio", async () => {
    await expect(crearPeriodo(repositorio(), actor("administracion"), { inicio: "2026-02-25", fin: "2026-01-26" })).rejects.toThrow("posterior");
  });

  it("crea sin advertencia cuando no hay períodos previos", async () => {
    const repo = repositorio([]);
    await crearPeriodo(repo, actor("administracion"), { inicio: "2026-01-26", fin: "2026-02-25" });
    expect(repo.crear).toHaveBeenCalledWith("2026-01-26", "2026-02-25");
  });

  it("crea sin advertencia cuando el período es contiguo a uno existente", async () => {
    const repo = repositorio([periodo("2025-12-26", "2026-01-25")]);
    await crearPeriodo(repo, actor("finanzas"), { inicio: "2026-01-26", fin: "2026-02-25" });
    expect(repo.crear).toHaveBeenCalledWith("2026-01-26", "2026-02-25");
  });

  it("advierte un hueco antes del nuevo período y bloquea sin confirmación", async () => {
    const repo = repositorio([periodo("2025-11-26", "2025-12-25")]);
    await expect(crearPeriodo(repo, actor("administracion"), { inicio: "2026-01-26", fin: "2026-02-25" })).rejects.toThrow(HuecoEntrePeriodosError);
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("advierte un hueco después del nuevo período y bloquea sin confirmación", async () => {
    const repo = repositorio([periodo("2026-03-26", "2026-04-25")]);
    await expect(crearPeriodo(repo, actor("administracion"), { inicio: "2026-01-26", fin: "2026-02-25" })).rejects.toThrow(HuecoEntrePeriodosError);
    expect(repo.crear).not.toHaveBeenCalled();
  });

  it("permite continuar con el hueco cuando se confirma explícitamente", async () => {
    const repo = repositorio([periodo("2025-11-26", "2025-12-25")]);
    await crearPeriodo(repo, actor("administracion"), { inicio: "2026-01-26", fin: "2026-02-25", confirmarHueco: true });
    expect(repo.crear).toHaveBeenCalledWith("2026-01-26", "2026-02-25");
  });

  it("propaga el rechazo por solapamiento del repositorio", async () => {
    const repo = repositorio([periodo("2026-01-26", "2026-02-25")]);
    repo.crear = vi.fn().mockRejectedValue(new PeriodosSolapadosError());
    await expect(crearPeriodo(repo, actor("finanzas"), { inicio: "2026-02-01", fin: "2026-02-28" })).rejects.toThrow(PeriodosSolapadosError);
  });

  it("rechaza por solapamiento antes que por hueco, aunque exista un período lejano en el futuro", async () => {
    const repo = repositorio([periodo("2026-01-26", "2026-02-25"), periodo("2030-01-01", "2030-01-31")]);
    await expect(crearPeriodo(repo, actor("finanzas"), { inicio: "2026-01-26", fin: "2026-02-25" })).rejects.toThrow(PeriodosSolapadosError);
    expect(repo.crear).not.toHaveBeenCalled();
  });
});
