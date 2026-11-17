import { describe, expect, it } from "vitest";

import { publicarPlanSemanal } from "./publicar-plan-semanal";
import type { CeldaDePlanSemanalEnBorrador, PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";
import type { RepositorioDeTurnos, TurnoPublicado } from "./publicar-turno-semanal";
import type { Vigencia } from "@/relaciones-laborales/vigencia";

type EstadoDeFechas = { cerradas: string[]; sinPeriodo: string[] };

function crearRepositorio(
  plan: PlanSemanalEnBorrador,
  vigencias: Record<string, Vigencia[]> | undefined = undefined,
  estado: EstadoDeFechas = { cerradas: [], sinPeriodo: [] },
) {
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
    consultarEstadoDeFechas: async (inicio, fin) => ({
      cerradas: estado.cerradas.filter((fecha) => fecha >= inicio && fecha <= fin),
      sinPeriodo: estado.sinPeriodo.filter((fecha) => fecha >= inicio && fecha <= fin),
    }),
    asistenciaEstaProcesada: async () => false,
    reemplazarSemanaPublicada: async () => undefined,
  };
  return { publicados, repositorio };
}

function celdasDeSemana(dni: string, inicio = "2026-08-31"): CeldaDePlanSemanalEnBorrador[] {
  const [anio, mes, dia] = inicio.split("-").map(Number);
  return Array.from({ length: 7 }, (_, indice) => ({
    planId: "plan-1", dni, fecha: new Date(Date.UTC(anio, mes - 1, dia + indice)).toISOString().slice(0, 10),
    sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
  }));
}

const SEMANA_DEL_21_DE_SEPTIEMBRE = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"];

describe("publicar plan semanal", () => {
  // G1: publicar no exige un período abierto; la semana completa de la persona se publica igual (contrato C2; diseno-software §Horarios).
  describe("G1 · publicar no exige período abierto", () => {
    it.each([
      {
        fila: "F1.1 ninguna fecha de la semana pertenece a un período",
        sinPeriodo: SEMANA_DEL_21_DE_SEPTIEMBRE, ingreso: "2020-01-01", celdasDefinidas: 7, sinRelacionLaboral: [] as string[], laborales: 7,
      },
      {
        fila: "F1.2 semana que cruza el corte: 21-23 con período abierto y 24-27 sin período",
        sinPeriodo: SEMANA_DEL_21_DE_SEPTIEMBRE.slice(3), ingreso: "2020-01-01", celdasDefinidas: 7, sinRelacionLaboral: [] as string[], laborales: 7,
      },
      {
        fila: "F1.3 persona que ingresa el 23 en una semana sin período conserva los siete días",
        sinPeriodo: SEMANA_DEL_21_DE_SEPTIEMBRE, ingreso: "2026-09-23", celdasDefinidas: 5, sinRelacionLaboral: ["2026-09-21", "2026-09-22"], laborales: 5,
      },
    ])("$fila", async ({ sinPeriodo, ingreso, celdasDefinidas, sinRelacionLaboral, laborales }) => {
      const celdas = celdasDeSemana("00000011", "2026-09-21").slice(7 - celdasDefinidas);
      const plan = { id: "plan-1", semana: "2026-09-21", equipo: "tiendas" as const, celdas };
      const { publicados, repositorio } = crearRepositorio(plan, { "00000011": [{ ingreso, cese: null }] }, { cerradas: [], sinPeriodo });

      const resultado = await publicarPlanSemanal(repositorio, { id: "operaciones-1", rol: "administrador" }, plan.id, ["00000011"]);

      expect(resultado).toEqual({ publicados: 1, errores: [] });
      expect(publicados.map((turno) => turno.fecha)).toEqual(SEMANA_DEL_21_DE_SEPTIEMBRE);
      expect(publicados.filter((turno) => turno.motivoNoAsistencia === "sin_relacion_laboral").map((turno) => turno.fecha)).toEqual(sinRelacionLaboral);
      expect(publicados.filter((turno) => !turno.descanso)).toHaveLength(laborales);
    });
  });

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

  // G2: una fecha de período cerrado rechaza la publicación completa, con la(s) fecha(s) y la causa (reapertura) (contrato C3; Diego, Q2: se rechaza toda la operación).
  describe("G2 · una fecha cerrada rechaza la publicación completa", () => {
    const mensajeDeFechaCerrada: Record<string, string> = {
      "2026-09-24": "La fecha 24/09/2026 está cerrada y requiere reapertura. Reabrir el período para modificarla.",
      "2026-09-25": "La fecha 25/09/2026 está cerrada y requiere reapertura. Reabrir el período para modificarla.",
    };

    it.each([
      { fila: "F2.1 el 24 está cerrado, una persona", cerradas: ["2026-09-24"], seleccion: ["00000011"] },
      { fila: "F2.2 el 24 y el 25 están cerrados", cerradas: ["2026-09-24", "2026-09-25"], seleccion: ["00000011"] },
      { fila: "F2.3 el 24 está cerrado y se seleccionan dos personas: no se publica a ninguna", cerradas: ["2026-09-24"], seleccion: ["00000011", "00000012"] },
    ])("$fila", async ({ cerradas, seleccion }) => {
      const celdas = seleccion.flatMap((dni) => celdasDeSemana(dni, "2026-09-21"));
      const plan = { id: "plan-1", semana: "2026-09-21", equipo: "tiendas" as const, celdas };
      const { publicados, repositorio } = crearRepositorio(plan, undefined, { cerradas, sinPeriodo: [] });

      const resultado = await publicarPlanSemanal(repositorio, { id: "administracion-1", rol: "administrador" }, plan.id, seleccion);

      expect(resultado.publicados).toBe(0);
      expect(resultado.errores).toHaveLength(seleccion.length * cerradas.length);
      for (const dni of seleccion) {
        for (const fecha of cerradas) {
          expect(resultado.errores).toContainEqual({ dni, fecha, mensaje: mensajeDeFechaCerrada[fecha] });
        }
      }
      expect(publicados).toEqual([]);
    });
  });

  // G2b (F2.5, decisión Q3): un día «Sin relación laboral» en fecha cerrada lo fija el sistema, no es una modificación de la persona: no bloquea ni se escribe.
  describe("G2b · un día «Sin relación laboral» en fecha cerrada no bloquea ni se escribe", () => {
    it("F2.5 persona que ingresa el 25 con el 24 cerrado: se publica sin el 24 y sin error", async () => {
      const gerente = { id: "gerente-1", rol: "gerente_de_area" as const, grupos: [{ nombre: "tiendas", gestionaAsistencia: true }] };
      const plan = { id: "plan-1", semana: "2026-09-21", equipo: "tiendas" as const, celdas: celdasDeSemana("00000011", "2026-09-21").slice(4) };
      const { publicados, repositorio } = crearRepositorio(plan, { "00000011": [{ ingreso: "2026-09-25", cese: null }] }, { cerradas: ["2026-09-24"], sinPeriodo: [] });

      const resultado = await publicarPlanSemanal(repositorio, gerente, plan.id, ["00000011"]);

      expect(resultado).toEqual({ publicados: 1, errores: [] });
      expect(publicados.map((turno) => turno.fecha)).toEqual(["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-25", "2026-09-26", "2026-09-27"]);
      expect(publicados.filter((turno) => turno.motivoNoAsistencia === "sin_relacion_laboral")).toHaveLength(3);
    });
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
