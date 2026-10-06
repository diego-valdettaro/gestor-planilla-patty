import { describe, expect, it } from "vitest";

import { publicarPlanSemanal } from "./publicar-plan-semanal";
import type { CeldaDePlanSemanalEnBorrador, PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";
import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";

function crearRepositorio(plan: PlanSemanalEnBorrador) {
  const publicados: TurnoPublicado[] = [];
  const repositorio: RepositorioDePlanesSemanales & RepositorioDeTurnos = {
    buscarPorId: async () => plan,
    obtenerOCrear: async () => plan,
    guardarCelda: async () => undefined,
    guardarCeldas: async () => undefined,
    reemplazarCeldasDelPlan: async () => undefined,
    borrarCelda: async () => undefined,
    colaboradorPerteneceAEquipo: async (id) => id === "00000011" || id === "00000012",
    obtenerGrupoDelColaborador: async () => "tiendas",
    sedeActivaPerteneceAlGrupo: async (sede, grupo) => sede === "Lima" && grupo === "tiendas",
    buscarModeloDeHorario: async () => undefined,
    listarColaboradoresActivosPorEquipo: async () => [
      { dni: "00000011", nombre: "Ana", sede: "Lima" },
      { dni: "00000012", nombre: "Bea", sede: "Lima" },
    ],
    listarHorariosPublicadosDelEquipoEnSemana: async () => [],
    buscarPublicado: async (id, fecha) => publicados.find((turno) => turno.dni === id && turno.fecha === fecha),
    publicar: async (turno) => { publicados.push(turno); },
    publicarEnLote: async (turnos) => { publicados.push(...turnos); },
    perteneceAPeriodoAbierto: async (fecha) => fecha <= "2026-09-06",
    asistenciaEstaProcesada: async () => false,
    reemplazarSemanaPublicada: async () => undefined,
  };
  return { publicados, repositorio };
}

function celdasDeSemana(dni: string): CeldaDePlanSemanalEnBorrador[] {
  return Array.from({ length: 7 }, (_, indice) => ({
    planId: "plan-1", dni, fecha: new Date(Date.UTC(2026, 7, 31 + indice)).toISOString().slice(0, 10),
    sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
  }));
}

describe("publicar plan semanal", () => {
  it("publica todas las personas seleccionadas que tienen sus siete días definidos, incluido un descanso", async () => {
    const celdasDeHu1 = celdasDeSemana("00000011");
    celdasDeHu1[6] = { ...celdasDeHu1[6], sede: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "descanso" };
    const plan = { id: "plan-1", semana: "2026-08-31", equipo: "tiendas" as const, celdas: [...celdasDeHu1, ...celdasDeSemana("00000012")] };
    const { publicados, repositorio } = crearRepositorio(plan);

    const resultado = await publicarPlanSemanal(repositorio, { id: "operaciones-1", rol: "administrador" }, plan.id, ["00000011", "00000012"]);

    expect(resultado).toEqual({ publicados: 2, errores: [] });
    expect(publicados).toHaveLength(14);
    expect(publicados.filter((turno) => turno.dni === "00000011")).toHaveLength(7);
    expect(publicados.find((turno) => turno.dni === "00000011" && turno.fecha === "2026-09-06")).toMatchObject({ descanso: true });
  });

  it("no publica ninguna persona seleccionada y devuelve el error por celda si una es inválida o queda fuera de un período abierto", async () => {
    const celdas = celdasDeSemana("00000011");
    const plan = { id: "plan-1", semana: "2026-08-31", equipo: "tiendas" as const, celdas };
    const { publicados, repositorio } = crearRepositorio(plan);
    repositorio.perteneceAPeriodoAbierto = async (fecha) => fecha <= "2026-09-05";

    const resultado = await publicarPlanSemanal(repositorio, { id: "administracion-1", rol: "administrador" }, plan.id, ["00000011"]);

    expect(resultado.publicados).toBe(0);
    expect(resultado.errores).toContainEqual({ dni: "00000011", fecha: "2026-09-06", mensaje: "La fecha no pertenece a un período de planilla abierto." });
    expect(publicados).toEqual([]);
  });

  it("no publica ninguna persona seleccionada si a otra de la selección le falta una jornada", async () => {
    const plan = { id: "plan-1", semana: "2026-08-31", equipo: "tiendas" as const, celdas: celdasDeSemana("00000011") };
    const { publicados, repositorio } = crearRepositorio(plan);

    const resultado = await publicarPlanSemanal(
      repositorio,
      { id: "administracion-1", rol: "administrador" },
      plan.id,
      ["00000011", "00000012"],
    );

    expect(resultado).toMatchObject({ publicados: 0 });
    expect(resultado.errores).toContainEqual(expect.objectContaining({ dni: "00000012", mensaje: "La celda está sin definir." }));
    expect(publicados).toEqual([]);
  });

  it("permite al gerente de área del grupo publicar y rechaza a otros roles y grupos", async () => {
    const plan = { id: "plan-1", semana: "2026-08-31", equipo: "tiendas" as const, celdas: celdasDeSemana("00000011") };
    const { publicados, repositorio } = crearRepositorio(plan);
    const gerente = { id: "gerente-1", rol: "gerente_de_area" as const, grupos: [{ nombre: "tiendas", gestionaAsistencia: true }] };

    const resultado = await publicarPlanSemanal(repositorio, gerente, plan.id, ["00000011"]);

    expect(resultado).toEqual({ publicados: 1, errores: [] });
    expect(publicados).toHaveLength(7);
    await expect(publicarPlanSemanal(repositorio, { id: "finanzas-1", rol: "finanzas" }, plan.id, ["00000011"])).rejects.toThrow("No tiene permiso para publicar planes semanales.");
    await expect(publicarPlanSemanal(repositorio, { id: "rrhh-1", rol: "recursos_humanos" }, plan.id, ["00000011"])).rejects.toThrow("No tiene permiso para publicar planes semanales.");
    await expect(publicarPlanSemanal(repositorio, { ...gerente, grupos: [{ nombre: "taller", gestionaAsistencia: true }] }, plan.id, ["00000011"])).rejects.toThrow("No tiene permiso para publicar planes semanales de este grupo.");
    expect(publicados).toHaveLength(7);
  });
});
