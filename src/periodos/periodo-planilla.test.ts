import { describe, expect, it, vi } from "vitest";
import { cerrarPeriodo, reabrirPeriodo, type RepositorioDePeriodos } from "./periodo-planilla";

const actor = (rol: "administracion" | "finanzas" | "operaciones") => ({ id: "cuenta-1", nombreUsuario: "usuario", rol });
function repositorio(): RepositorioDePeriodos {
  return { listar: vi.fn(), buscar: vi.fn(), listarResumen: vi.fn(), cerrar: vi.fn(), reabrir: vi.fn() } as unknown as RepositorioDePeriodos;
}

describe("gestión de períodos de planilla", () => {
  it("permite cerrar a Administración y Finanzas", async () => {
    const repo = repositorio();
    await cerrarPeriodo(repo, actor("administracion"), "periodo-1");
    expect(repo.cerrar).toHaveBeenCalledWith("periodo-1", "cuenta-1", expect.any(Date));
  });

  it("rechaza el cierre de Operaciones", async () => {
    await expect(cerrarPeriodo(repositorio(), actor("operaciones"), "periodo-1")).rejects.toThrow("No tiene permiso");
  });

  it("exige motivo para reabrir y lo entrega al repositorio", async () => {
    const repo = repositorio();
    await expect(reabrirPeriodo(repo, actor("finanzas"), "periodo-1", "  Corrección de auditoría  ")).resolves.toBeUndefined();
    expect(repo.reabrir).toHaveBeenCalledWith("periodo-1", "cuenta-1", "Corrección de auditoría", expect.any(Date));
    await expect(reabrirPeriodo(repo, actor("finanzas"), "periodo-1", " ")).rejects.toThrow("requiere un motivo");
  });
});
