import { describe, expect, it } from "vitest";

import { procesarHorarioSemanal, type RepositorioParaProcesarHorarioSemanal } from "./procesar-horario-semanal";

function crearRepositorio(): {
  procesamientos: Array<{ idHuellero: string; semana: string; equipo: "tiendas" | "taller"; responsableId: string }>;
  repositorio: RepositorioParaProcesarHorarioSemanal;
} {
  const procesamientos: Array<{ idHuellero: string; semana: string; equipo: "tiendas" | "taller"; responsableId: string }> = [];
  return {
    procesamientos,
    repositorio: {
      listarSemanaPublicada: async () => ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"].map((fecha, indice) => ({
        fecha,
        descanso: indice === 6,
      })),
      asistenciasLaboralesEstanProcesadas: async () => true,
      obtenerEquipoOperativo: async () => "tiendas",
      registrarProcesamiento: async (procesamiento) => { procesamientos.push(procesamiento); },
    },
  };
}

describe("procesar horario semanal", () => {
  it("permite a Finanzas procesar siete días publicados con asistencias laborales resueltas", async () => {
    const { procesamientos, repositorio } = crearRepositorio();

    await procesarHorarioSemanal(repositorio, { id: "finanzas-1", rol: "finanzas" }, "HU-1024", "2026-08-31");

    expect(procesamientos).toEqual([{ idHuellero: "HU-1024", semana: "2026-08-31", equipo: "tiendas", responsableId: "finanzas-1" }]);
  });

  it("rechaza el procesamiento si falta un día publicado o una asistencia laboral sigue pendiente", async () => {
    const { repositorio } = crearRepositorio();
    repositorio.listarSemanaPublicada = async () => [];
    await expect(procesarHorarioSemanal(repositorio, { id: "finanzas-1", rol: "finanzas" }, "HU-1024", "2026-08-31"))
      .rejects.toThrow("El horario semanal debe tener los siete días publicados para procesarlo.");

    repositorio.listarSemanaPublicada = async () => ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"].map((fecha) => ({ fecha, descanso: false }));
    repositorio.asistenciasLaboralesEstanProcesadas = async () => false;
    await expect(procesarHorarioSemanal(repositorio, { id: "finanzas-1", rol: "finanzas" }, "HU-1024", "2026-08-31"))
      .rejects.toThrow("Todas las asistencias laborales de la semana deben estar confirmadas o tener un estado manual.");
  });

  it("rechaza a quien no pertenece a Finanzas", async () => {
    const { repositorio } = crearRepositorio();

    await expect(procesarHorarioSemanal(repositorio, { id: "administracion-1", rol: "administracion" }, "HU-1024", "2026-08-31"))
      .rejects.toThrow("No tiene permiso para procesar horarios semanales.");
  });
});
