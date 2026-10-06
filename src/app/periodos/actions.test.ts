import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({
  actor: vi.fn(),
  repositorio: { cerrar: vi.fn(), reabrir: vi.fn(), crear: vi.fn(), decidirHorasExtra: vi.fn(), listar: vi.fn() },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/periodos/servicio", () => ({ repositorioDePeriodos: simulacro.repositorio }));

import { cerrarPeriodoDesdeFormulario, crearPeriodoDesdeFormulario, decidirHorasExtraDesdeFormulario, reabrirPeriodoDesdeFormulario } from "./actions";

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.set(campo, valor);
  return datos;
}

describe("acciones de Períodos (borde del servidor)", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["un gerente de área", { id: "g1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
    ["Recursos Humanos", { id: "r1", rol: "recursos_humanos" }],
  ])("rechaza que %s cierre, reabra, cree períodos o decida horas extra", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);

    await expect(cerrarPeriodoDesdeFormulario(formulario({ periodoId: "p1" }))).rejects.toThrow("Solo Finanzas");
    await expect(reabrirPeriodoDesdeFormulario(formulario({ periodoId: "p1", motivo: "Corrección" }))).rejects.toThrow("Solo Finanzas");
    await expect(decidirHorasExtraDesdeFormulario(formulario({ periodoId: "p1", decision: "aprobada", horaExtraId: "h1" }))).rejects.toThrow("Solo Finanzas");
    expect((await crearPeriodoDesdeFormulario({}, formulario({ inicio: "2026-01-26", fin: "2026-02-25" }))).error).toBe("No tiene permiso para gestionar períodos de planilla.");

    expect(simulacro.repositorio.cerrar).not.toHaveBeenCalled();
    expect(simulacro.repositorio.reabrir).not.toHaveBeenCalled();
    expect(simulacro.repositorio.crear).not.toHaveBeenCalled();
    expect(simulacro.repositorio.decidirHorasExtra).not.toHaveBeenCalled();
  });

  it("permite a Finanzas cerrar un período", async () => {
    simulacro.actor.mockResolvedValue({ id: "f1", rol: "finanzas" });

    await cerrarPeriodoDesdeFormulario(formulario({ periodoId: "p1" }));

    expect(simulacro.repositorio.cerrar).toHaveBeenCalledWith("p1", "f1", expect.any(Date));
  });
});
