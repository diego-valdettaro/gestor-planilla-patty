import { describe, expect, it } from "vitest";

import type { PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";
import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";
import { republicarPlanSemanal } from "./republicar-plan-semanal";

// `diasSinRelacion`: los primeros días de la semana ya se publicaron «Sin relación laboral» (ingreso a mitad de semana).
function crearRepositorio(procesada = false, cambiaSoloMotivo = false, diasSinRelacion = 0) {
  const publicados = new Map<string, TurnoPublicado>();
  const celdas = Array.from({ length: 7 }, (_, indice) => {
    const fecha = new Date(Date.UTC(2026, 7, 31 + indice)).toISOString().slice(0, 10);
    if (indice < diasSinRelacion) {
      publicados.set(fecha, { dni: "00000011", fecha, sede: null, modeloHorarioId: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "sin_relacion_laboral" });
      return undefined;
    }
    const turno = cambiaSoloMotivo && indice === 0
      ? { dni: "00000011", fecha, sede: null, modeloHorarioId: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "descanso" as const }
      : { dni: "00000011", fecha, sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false };
    publicados.set(fecha, turno);
    return cambiaSoloMotivo && indice === 0
      ? { ...turno, planId: "plan-1", motivoNoAsistencia: "feriado" as const }
      : { ...turno, planId: "plan-1", entradaProgramada: indice === diasSinRelacion ? "10:00" : "09:00" };
  });
  const plan: PlanSemanalEnBorrador = { id: "plan-1", semana: "2026-08-31", equipo: "tiendas", celdas: celdas.filter((celda) => celda !== undefined) };
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
    listarVigenciasConfirmadas: async () => [{ ingreso: diasSinRelacion ? new Date(Date.UTC(2026, 7, 31 + diasSinRelacion)).toISOString().slice(0, 10) : "2026-01-01", cese: null }],
    sedeActivaPerteneceAlGrupo: async (sede, grupo) => sede === "Lima" && grupo === "tiendas",
    buscarModeloDeHorario: async () => undefined,
    listarColaboradoresActivosPorEquipo: async () => [],
    listarHorariosPublicadosDelEquipoEnSemana: async () => [],
    buscarPublicado: async (_dni, fecha) => publicados.get(fecha),
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

    await republicarPlanSemanal(repositorio, { id: "operaciones-1", rol: "administrador" }, "plan-1", "00000011", "  Corrige entrada pactada  ");

    expect(reemplazos).toEqual([expect.objectContaining({
      motivo: "Corrige entrada pactada",
      turnos: expect.arrayContaining([expect.objectContaining({ fecha: "2026-08-31", entradaProgramada: "10:00" })]),
    })]);
    expect(reemplazos[0].turnos).toHaveLength(7);
  });

  it("no permite corregir una semana cuya asistencia ya fue procesada", async () => {
    const { reemplazos, repositorio } = crearRepositorio(true);

    await expect(republicarPlanSemanal(repositorio, { id: "administracion-1", rol: "administrador" }, "plan-1", "00000011", "Corrige entrada pactada"))
      .rejects.toThrow("No se puede corregir un horario semanal que ya fue procesado.");
    expect(reemplazos).toEqual([]);
  });

  it("republica cuando el único cambio es el motivo planificado", async () => {
    const { reemplazos, repositorio } = crearRepositorio(false, true);

    await republicarPlanSemanal(repositorio, { id: "operaciones-1", rol: "administrador" }, "plan-1", "00000011", "Cambia descanso por feriado");

    expect(reemplazos[0].turnos[0]).toMatchObject({ motivoNoAsistencia: "feriado" });
  });

  it("permite al gerente de área del grupo republicar y rechaza a otros roles y grupos", async () => {
    const { reemplazos, repositorio } = crearRepositorio();
    const gerente = { id: "gerente-1", rol: "gerente_de_area" as const, grupos: [{ nombre: "tiendas", gestionaAsistencia: true }] };

    await republicarPlanSemanal(repositorio, gerente, "plan-1", "00000011", "Corrige entrada pactada");

    expect(reemplazos).toEqual([expect.objectContaining({ motivo: "Corrige entrada pactada" })]);
    expect(reemplazos[0].turnos).toHaveLength(7);
    await expect(republicarPlanSemanal(repositorio, { id: "finanzas-1", rol: "finanzas" }, "plan-1", "00000011", "x")).rejects.toThrow("No tiene permiso para republicar horarios semanales.");
    await expect(republicarPlanSemanal(repositorio, { ...gerente, grupos: [{ nombre: "taller", gestionaAsistencia: true }] }, "plan-1", "00000011", "x")).rejects.toThrow("No tiene permiso para republicar horarios semanales de este grupo.");
    await expect(republicarPlanSemanal(repositorio, { ...gerente, grupos: [{ nombre: "tiendas", gestionaAsistencia: false }] }, "plan-1", "00000011", "x")).rejects.toThrow("No tiene permiso para republicar horarios semanales.");
    expect(reemplazos).toHaveLength(1);
  });

  it("rechaza corregir un día laboral anterior al ingreso confirmado", async () => {
    const { reemplazos, repositorio } = crearRepositorio();
    repositorio.listarVigenciasConfirmadas = async () => [{ ingreso: "2026-09-02", cese: null }];

    await expect(republicarPlanSemanal(repositorio, { id: "operaciones-1", rol: "administrador" }, "plan-1", "00000011", "Corrige entrada pactada"))
      .rejects.toThrow("fuera de la relación laboral confirmada");
    expect(reemplazos).toEqual([]);
  });

  it("republica una semana parcial: los días fuera de la relación se conservan «Sin relación laboral» aunque el borrador no los tenga", async () => {
    const { reemplazos, repositorio } = crearRepositorio(false, false, 2);

    await republicarPlanSemanal(repositorio, { id: "operaciones-1", rol: "administrador" }, "plan-1", "00000011", "Corrige entrada pactada");

    expect(reemplazos[0].turnos).toHaveLength(7);
    expect(reemplazos[0].turnos.slice(0, 2).map((turno) => turno.motivoNoAsistencia)).toEqual(["sin_relacion_laboral", "sin_relacion_laboral"]);
    expect(reemplazos[0].turnos[2]).toMatchObject({ fecha: "2026-09-02", entradaProgramada: "10:00" });
  });
});
