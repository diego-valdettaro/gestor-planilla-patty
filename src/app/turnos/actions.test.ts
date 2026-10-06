import { beforeEach, describe, expect, it, vi } from "vitest";

const simulacro = vi.hoisted(() => ({
  actor: vi.fn(),
  buscarModelo: vi.fn(),
  repositorioDeTurnos: { buscarPorId: vi.fn(), obtenerOCrear: vi.fn(), colaboradorPerteneceAEquipo: vi.fn(), listarVigenciasConfirmadas: vi.fn() },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/autenticacion/sesion-del-servidor", () => ({ obtenerActorActual: simulacro.actor }));
vi.mock("@/turnos/servicio", () => ({
  repositorioDeTurnos: simulacro.repositorioDeTurnos,
  repositorioDeModelosDeHorario: { buscarPorId: simulacro.buscarModelo },
}));

import { borrarCeldaDelBorrador, guardarBorradorDesdeGrilla, guardarCeldaDelBorrador, publicarPlanSemanalDesdeGrilla, republicarPlanSemanalDesdeGrilla } from "./actions";

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.set(campo, valor);
  return datos;
}

describe("acciones de Horarios (borde del servidor)", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["Finanzas", { id: "f1", rol: "finanzas" }],
    ["Recursos Humanos", { id: "r1", rol: "recursos_humanos" }],
    ["un gerente sin grupos", { id: "g1", rol: "gerente_de_area", grupos: [] }],
    ["un gerente de un grupo que no gestiona asistencia", { id: "g2", rol: "gerente_de_area", grupos: [{ nombre: "Administración", gestionaAsistencia: false }] }],
  ])("rechaza a %s sin leer modelos ni planes", async (_nombre, actor) => {
    simulacro.actor.mockResolvedValue(actor);

    await expect(guardarCeldaDelBorrador(formulario({ sede: "Lima", horario: "modelo:m1", planId: "p1", dni: "00000001", fecha: "2026-09-01" }))).rejects.toThrow("No tiene permiso para editar planes semanales en borrador.");
    await expect(guardarBorradorDesdeGrilla("p1", "[]")).rejects.toThrow("No tiene permiso para editar planes semanales en borrador.");
    await expect(borrarCeldaDelBorrador(formulario({ planId: "p1", dni: "00000001", fecha: "2026-09-01" }))).rejects.toThrow("No tiene permiso para editar planes semanales en borrador.");
    await expect(publicarPlanSemanalDesdeGrilla(formulario({ planId: "p1", dni: "00000001" }))).rejects.toThrow("No tiene permiso para publicar planes semanales.");
    await expect(republicarPlanSemanalDesdeGrilla(formulario({ planId: "p1", dni: "00000001", motivo: "Corrección" }))).rejects.toThrow("No tiene permiso para republicar horarios semanales.");

    expect(simulacro.buscarModelo).not.toHaveBeenCalled();
  });

  it("un gerente no publica a una persona sin relación laboral confirmada: el error explica la causa y el siguiente paso", async () => {
    simulacro.actor.mockResolvedValue({ id: "g3", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] });
    simulacro.repositorioDeTurnos.buscarPorId.mockResolvedValue({ id: "p1", semana: "2026-09-07", equipo: "Tiendas", celdas: [] });
    simulacro.repositorioDeTurnos.colaboradorPerteneceAEquipo.mockResolvedValue(true);
    simulacro.repositorioDeTurnos.listarVigenciasConfirmadas.mockResolvedValue([]);

    await expect(publicarPlanSemanalDesdeGrilla(formulario({ planId: "p1", dni: "00000001" })))
      .rejects.toThrow(/relación laboral confirmada por Recursos Humanos.*registre y confirme/);
  });

  it("un gerente de Tiendas no edita, publica ni republica el plan semanal del grupo Taller", async () => {
    simulacro.actor.mockResolvedValue({ id: "g4", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] });
    simulacro.repositorioDeTurnos.buscarPorId.mockResolvedValue({ id: "p9", semana: "2026-09-07", equipo: "Taller", celdas: [] });

    await expect(guardarCeldaDelBorrador(formulario({ sede: "Lima", horario: "descanso", planId: "p9", dni: "00000001", fecha: "2026-09-07" }))).rejects.toThrow("No tiene permiso para editar planes semanales de este grupo.");
    await expect(guardarBorradorDesdeGrilla("p9", "[]")).rejects.toThrow("No tiene permiso para editar planes semanales de este grupo.");
    await expect(borrarCeldaDelBorrador(formulario({ planId: "p9", dni: "00000001", fecha: "2026-09-07" }))).rejects.toThrow("No tiene permiso para editar planes semanales de este grupo.");
    await expect(publicarPlanSemanalDesdeGrilla(formulario({ planId: "p9", dni: "00000001" }))).rejects.toThrow("No tiene permiso para publicar planes semanales de este grupo.");
    await expect(republicarPlanSemanalDesdeGrilla(formulario({ planId: "p9", dni: "00000001", motivo: "Corrección" }))).rejects.toThrow("No tiene permiso para republicar horarios semanales de este grupo.");
  });
});
