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
    borrarCelda: async () => undefined,
    colaboradorPerteneceAEquipo: async (id) => id === "HU-1" || id === "HU-2",
    buscarPublicado: async (id, fecha) => publicados.find((turno) => turno.idHuellero === id && turno.fecha === fecha),
    publicar: async (turno) => { publicados.push(turno); },
    publicarEnLote: async (turnos) => { publicados.push(...turnos); },
    perteneceAPeriodoAbierto: async (fecha) => fecha <= "2026-09-06",
  };
  return { publicados, repositorio };
}

function celdasDeSemana(idHuellero: string): CeldaDePlanSemanalEnBorrador[] {
  return Array.from({ length: 7 }, (_, indice) => ({
    planId: "plan-1", idHuellero, fecha: new Date(Date.UTC(2026, 7, 31 + indice)).toISOString().slice(0, 10),
    sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", minutosDeAlmuerzo: 60, descanso: false,
  }));
}

describe("publicar plan semanal", () => {
  it("publica solamente personas completas y crea todos sus horarios, historial y asistencias esperadas", async () => {
    const plan = { id: "plan-1", semana: "2026-08-31", equipo: "tiendas" as const, celdas: [...celdasDeSemana("HU-1"), ...celdasDeSemana("HU-2").slice(0, 6)] };
    const { publicados, repositorio } = crearRepositorio(plan);

    const resultado = await publicarPlanSemanal(repositorio, { id: "operaciones-1", rol: "operaciones" }, plan.id, ["HU-1"]);

    expect(resultado).toEqual({ publicados: 1, errores: [] });
    expect(publicados).toHaveLength(7);
    expect(publicados.every((turno) => turno.idHuellero === "HU-1")).toBe(true);
  });

  it("no publica ninguna persona seleccionada y devuelve el error por celda si una es inválida o queda fuera de un período abierto", async () => {
    const celdas = celdasDeSemana("HU-1");
    const plan = { id: "plan-1", semana: "2026-08-31", equipo: "tiendas" as const, celdas };
    const { publicados, repositorio } = crearRepositorio(plan);
    repositorio.perteneceAPeriodoAbierto = async (fecha) => fecha <= "2026-09-05";

    const resultado = await publicarPlanSemanal(repositorio, { id: "administracion-1", rol: "administracion" }, plan.id, ["HU-1"]);

    expect(resultado.publicados).toBe(0);
    expect(resultado.errores).toContainEqual({ idHuellero: "HU-1", fecha: "2026-09-06", mensaje: "La fecha no pertenece a un período de planilla abierto." });
    expect(publicados).toEqual([]);
  });

  it("rechaza a Finanzas antes de publicar", async () => {
    const plan = { id: "plan-1", semana: "2026-08-31", equipo: "tiendas" as const, celdas: celdasDeSemana("HU-1") };
    const { repositorio } = crearRepositorio(plan);

    await expect(publicarPlanSemanal(repositorio, { id: "finanzas-1", rol: "finanzas" }, plan.id, ["HU-1"])).rejects.toThrow("No tiene permiso para publicar planes semanales.");
  });
});
