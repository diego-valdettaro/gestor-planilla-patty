import { describe, expect, it } from "vitest";

import type { PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";
import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";
import { republicarPlanSemanal } from "./republicar-plan-semanal";

function crearRepositorio(procesada = false, cambiaSoloMotivo = false) {
  const publicados = new Map<string, TurnoPublicado>();
  const celdas = Array.from({ length: 7 }, (_, indice) => {
    const fecha = new Date(Date.UTC(2026, 7, 31 + indice)).toISOString().slice(0, 10);
    const turno = cambiaSoloMotivo && indice === 0
      ? { idHuellero: "HU-1", fecha, sede: null, modeloHorarioId: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "descanso" as const }
      : { idHuellero: "HU-1", fecha, sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false };
    publicados.set(fecha, turno);
    return cambiaSoloMotivo && indice === 0
      ? { ...turno, planId: "plan-1", motivoNoAsistencia: "feriado" as const }
      : { ...turno, planId: "plan-1", entradaProgramada: indice === 0 ? "10:00" : "09:00" };
  });
  const plan: PlanSemanalEnBorrador = { id: "plan-1", semana: "2026-08-31", equipo: "tiendas", celdas };
  const reemplazos: Array<{ turnos: TurnoPublicado[]; motivo: string }> = [];
  const repositorio: RepositorioDePlanesSemanales & RepositorioDeTurnos = {
    obtenerOCrear: async () => plan,
    buscarPorId: async () => plan,
    guardarCelda: async () => undefined,
    guardarCeldas: async () => undefined,
    reemplazarCeldasDelPlan: async () => undefined,
    borrarCelda: async () => undefined,
    colaboradorPerteneceAEquipo: async () => true,
    obtenerGrupoDelColaborador: async () => "tiendas",
    sedeActivaPerteneceAlGrupo: async (sede, grupo) => sede === "Lima" && grupo === "tiendas",
    buscarModeloDeHorario: async () => undefined,
    listarColaboradoresActivosPorEquipo: async () => [],
    listarHorariosPublicadosDelEquipoEnSemana: async () => [],
    buscarPublicado: async (_idHuellero, fecha) => publicados.get(fecha),
    publicar: async () => undefined,
    publicarEnLote: async () => undefined,
    perteneceAPeriodoAbierto: async () => true,
    asistenciaEstaProcesada: async () => procesada,
    reemplazarSemanaPublicada: async (turnos, _actor, motivo) => { reemplazos.push({ turnos, motivo }); },
  };
  return { reemplazos, repositorio };
}

describe("republicar plan semanal", () => {
  it("reemplaza los siete días corregidos con un motivo auditado", async () => {
    const { reemplazos, repositorio } = crearRepositorio();

    await republicarPlanSemanal(repositorio, { id: "operaciones-1", rol: "operaciones" }, "plan-1", "HU-1", "  Corrige entrada pactada  ");

    expect(reemplazos).toEqual([expect.objectContaining({
      motivo: "Corrige entrada pactada",
      turnos: expect.arrayContaining([expect.objectContaining({ fecha: "2026-08-31", entradaProgramada: "10:00" })]),
    })]);
    expect(reemplazos[0].turnos).toHaveLength(7);
  });

  it("no permite corregir una semana cuya asistencia ya fue procesada", async () => {
    const { reemplazos, repositorio } = crearRepositorio(true);

    await expect(republicarPlanSemanal(repositorio, { id: "administracion-1", rol: "administracion" }, "plan-1", "HU-1", "Corrige entrada pactada"))
      .rejects.toThrow("No se puede corregir un horario semanal que ya fue procesado.");
    expect(reemplazos).toEqual([]);
  });

  it("republica cuando el único cambio es el motivo planificado", async () => {
    const { reemplazos, repositorio } = crearRepositorio(false, true);

    await republicarPlanSemanal(repositorio, { id: "operaciones-1", rol: "operaciones" }, "plan-1", "HU-1", "Cambia descanso por feriado");

    expect(reemplazos[0].turnos[0]).toMatchObject({ motivoNoAsistencia: "feriado" });
  });
});
