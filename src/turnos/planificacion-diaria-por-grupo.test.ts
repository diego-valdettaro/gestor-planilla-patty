import { describe, expect, it } from "vitest";

import { crearCasosDeUsoDePlanesSemanales } from "./casos-de-uso-planes-semanales";
import type { PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";

const semana = "2026-09-07";
const plan: PlanSemanalEnBorrador = { id: "plan-1", semana, equipo: "Tiendas", celdas: [] };

function crearContexto() {
  const guardadas: PlanSemanalEnBorrador["celdas"] = [];
  const modelos = new Map([
    ["modelo-sur", { id: "modelo-sur", sede: "Sur", nombre: "Apertura", entrada: "09:00", salida: "18:00", activo: true }],
    ["modelo-norte", { id: "modelo-norte", sede: "Norte", nombre: "Cierre", entrada: "10:00", salida: "19:00", activo: true }],
    ["modelo-inactivo", { id: "modelo-inactivo", sede: "Sur", nombre: "Antiguo", entrada: "08:00", salida: "17:00", activo: false }],
  ]);
  const repositorio = {
    buscarPorId: async () => ({ ...plan, celdas: guardadas }),
    guardarCelda: async (celda) => { guardadas.push(celda); },
    colaboradorPerteneceAEquipo: async (idHuellero, grupo) => idHuellero === "HU-1" && grupo === "Tiendas",
    sedeActivaPerteneceAlGrupo: async (sede, grupo) => grupo === "Tiendas" && (sede === "Norte" || sede === "Sur"),
    buscarModeloDeHorario: async (id) => modelos.get(id),
    buscarPublicado: async () => undefined,
  } satisfies Partial<RepositorioDePlanesSemanales>;
  const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio as unknown as RepositorioDePlanesSemanales, {
    obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
  });
  return { casosDeUso, guardadas };
}

describe("planificacion diaria por grupo", () => {
  it("permite trabajar en una sede activa del grupo distinta de la sede heredada del colaborador", async () => {
    const { casosDeUso, guardadas } = crearContexto();

    await casosDeUso.guardarCelda(plan.id, {
      idHuellero: "HU-1",
      fecha: semana,
      sede: "Sur",
      modeloHorarioId: null,
      entradaProgramada: "09:00",
      salidaProgramada: "18:00",
      descanso: false,
      motivoNoAsistencia: null,
    });

    expect(guardadas).toEqual([expect.objectContaining({ sede: "Sur", entradaProgramada: "09:00" })]);
  });

  it("exige que el modelo esté activo, pertenezca a la sede elegida y defina sus horas", async () => {
    const { casosDeUso } = crearContexto();
    const jornada = {
      idHuellero: "HU-1",
      fecha: semana,
      sede: "Norte",
      entradaProgramada: "09:00",
      salidaProgramada: "18:00",
      descanso: false,
      motivoNoAsistencia: null,
    };

    await expect(casosDeUso.guardarCelda(plan.id, { ...jornada, modeloHorarioId: "modelo-sur" }))
      .rejects.toThrow("El modelo de horario no corresponde a la sede elegida.");
    await expect(casosDeUso.guardarCelda(plan.id, { ...jornada, sede: "Sur", modeloHorarioId: "modelo-inactivo", entradaProgramada: "08:00", salidaProgramada: "17:00" }))
      .rejects.toThrow("El modelo de horario seleccionado no está activo.");
  });

  it("permite los cinco motivos planificados de no asistencia y rechaza falta", async () => {
    const { casosDeUso, guardadas } = crearContexto();

    for (const [indice, motivo] of ["descanso", "feriado", "vacaciones", "permiso", "suspension"].entries()) {
      await casosDeUso.guardarCelda(plan.id, {
        idHuellero: "HU-1",
        fecha: `2026-09-${String(7 + indice).padStart(2, "0")}`,
        sede: null,
        modeloHorarioId: null,
        entradaProgramada: null,
        salidaProgramada: null,
        descanso: motivo === "descanso",
        motivoNoAsistencia: motivo,
      } as never);
    }

    expect(guardadas.map(({ motivoNoAsistencia }) => motivoNoAsistencia)).toEqual([
      "descanso", "feriado", "vacaciones", "permiso", "suspension",
    ]);
    await expect(casosDeUso.guardarCelda(plan.id, {
      idHuellero: "HU-1",
      fecha: "2026-09-12",
      sede: null,
      modeloHorarioId: null,
      entradaProgramada: null,
      salidaProgramada: null,
      descanso: false,
      motivoNoAsistencia: "falta",
    } as never)).rejects.toThrow("El motivo planificado de no asistencia no es válido.");
  });

  it("rechaza sede, modelo u horas en una no asistencia planificada", async () => {
    const { casosDeUso } = crearContexto();

    await expect(casosDeUso.guardarCelda(plan.id, {
      idHuellero: "HU-1",
      fecha: semana,
      sede: "Norte",
      modeloHorarioId: null,
      entradaProgramada: null,
      salidaProgramada: null,
      descanso: true,
      motivoNoAsistencia: "descanso",
    } as never)).rejects.toThrow("Una no asistencia planificada no tiene sede, modelo ni horas.");
  });
});
