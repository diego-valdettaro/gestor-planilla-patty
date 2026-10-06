import { describe, expect, it } from "vitest";

import { publicarPlanSemanal } from "./publicar-plan-semanal";
import type { CeldaDePlanSemanalEnBorrador, PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";
import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";
import type { Vigencia } from "@/relaciones-laborales/vigencia";

function crearRepositorio(plan: PlanSemanalEnBorrador, vigencias: Record<string, Vigencia[]> | undefined = undefined) {
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
    listarVigenciasConfirmadas: async (dni) => vigencias?.[dni] ?? [{ ingreso: "2026-01-01", cese: null }],
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

  describe("relación laboral confirmada (ADR 0012)", () => {
    const gerente = { id: "gerente-1", rol: "gerente_de_area" as const, grupos: [{ nombre: "tiendas", gestionaAsistencia: true }] };
    // Semana del lunes 31/08 al domingo 06/09.

    it("una persona que ingresa a mitad de semana se publica con «Sin relación laboral» antes del ingreso, aunque el borrador no tenga esas celdas", async () => {
      const celdas = celdasDeSemana("00000011").slice(2);
      const plan = { id: "plan-1", semana: "2026-08-31", equipo: "tiendas" as const, celdas };
      const { publicados, repositorio } = crearRepositorio(plan, { "00000011": [{ ingreso: "2026-09-02", cese: null }] });

      const resultado = await publicarPlanSemanal(repositorio, gerente, plan.id, ["00000011"]);

      expect(resultado).toEqual({ publicados: 1, errores: [] });
      expect(publicados).toHaveLength(7);
      expect(publicados.filter((turno) => turno.motivoNoAsistencia === "sin_relacion_laboral").map((turno) => turno.fecha)).toEqual(["2026-08-31", "2026-09-01"]);
      expect(publicados.find((turno) => turno.fecha === "2026-09-01")).toMatchObject({ descanso: true, sede: null, entradaProgramada: null });
      expect(publicados.find((turno) => turno.fecha === "2026-09-02")).toMatchObject({ descanso: false, sede: "Lima" });
    });

    it("los días posteriores al cese confirmado quedan «Sin relación laboral»", async () => {
      const plan = { id: "plan-1", semana: "2026-08-31", equipo: "tiendas" as const, celdas: celdasDeSemana("00000011").slice(0, 4) };
      const { publicados, repositorio } = crearRepositorio(plan, { "00000011": [{ ingreso: "2026-01-01", cese: "2026-09-03" }] });

      await publicarPlanSemanal(repositorio, gerente, plan.id, ["00000011"]);

      expect(publicados.filter((turno) => turno.motivoNoAsistencia === "sin_relacion_laboral").map((turno) => turno.fecha)).toEqual(["2026-09-04", "2026-09-05", "2026-09-06"]);
    });

    it("no publica una semana sin ningún día dentro de una relación confirmada y explica el siguiente paso", async () => {
      const plan = { id: "plan-1", semana: "2026-08-31", equipo: "tiendas" as const, celdas: celdasDeSemana("00000011") };
      const { publicados, repositorio } = crearRepositorio(plan, { "00000011": [] });

      const resultado = await publicarPlanSemanal(repositorio, gerente, plan.id, ["00000011"]);

      expect(resultado.publicados).toBe(0);
      expect(resultado.errores).toHaveLength(7);
      expect(resultado.errores[0].mensaje).toMatch(/relación laboral confirmada por Recursos Humanos.*registre y confirme/);
      expect(publicados).toEqual([]);
    });

    it("rechaza una jornada laboral en un día anterior al ingreso, sin publicar a nadie de la selección", async () => {
      const plan = { id: "plan-1", semana: "2026-08-31", equipo: "tiendas" as const, celdas: [...celdasDeSemana("00000011"), ...celdasDeSemana("00000012")] };
      const { publicados, repositorio } = crearRepositorio(plan, { "00000011": [{ ingreso: "2026-09-02", cese: null }] });

      const resultado = await publicarPlanSemanal(repositorio, gerente, plan.id, ["00000011", "00000012"]);

      expect(resultado.publicados).toBe(0);
      expect(resultado.errores).toContainEqual({ dni: "00000011", fecha: "2026-08-31", mensaje: expect.stringContaining("fuera de la relación laboral confirmada") });
      expect(publicados).toEqual([]);
    });

    it("descarta un «Sin relación laboral» guardado antes de que Recursos Humanos confirmara el ingreso y exige definir ese día", async () => {
      const obsoletas = celdasDeSemana("00000011").slice(0, 2).map((celda) => ({ ...celda, sede: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "sin_relacion_laboral" as const }));
      const plan = { id: "plan-1", semana: "2026-08-31", equipo: "tiendas" as const, celdas: [...obsoletas, ...celdasDeSemana("00000011").slice(2)] };
      const { publicados, repositorio } = crearRepositorio(plan);

      const resultado = await publicarPlanSemanal(repositorio, gerente, plan.id, ["00000011"]);

      expect(resultado.publicados).toBe(0);
      expect(resultado.errores).toEqual([
        { dni: "00000011", fecha: "2026-08-31", mensaje: "La celda está sin definir." },
        { dni: "00000011", fecha: "2026-09-01", mensaje: "La celda está sin definir." },
      ]);
      expect(publicados).toEqual([]);
    });
  });
});
