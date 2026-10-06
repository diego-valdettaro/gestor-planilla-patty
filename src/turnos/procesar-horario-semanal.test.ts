import { describe, expect, it } from "vitest";

import { procesarHorarioSemanal, type RepositorioParaProcesarHorarioSemanal } from "./procesar-horario-semanal";

function crearRepositorio(): {
  procesamientos: Array<{ dni: string; semana: string; equipo: string; responsableId: string }>;
  repositorio: RepositorioParaProcesarHorarioSemanal;
} {
  const procesamientos: Array<{ dni: string; semana: string; equipo: string; responsableId: string }> = [];
  return {
    procesamientos,
    repositorio: {
      listarSemanaPublicada: async () => ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"].map((fecha, indice) => ({
        fecha,
        descanso: indice === 6,
      })),
      asistenciasLaboralesEstanProcesadas: async () => true,
      obtenerEquipoOperativo: async () => "Tiendas",
      registrarProcesamiento: async (procesamiento) => { procesamientos.push(procesamiento); },
    },
  };
}

describe("procesar horario semanal", () => {
  const gerenteDeTiendas = { id: "gerente-1", rol: "gerente_de_area" as const, grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] };

  it("permite al gerente del grupo procesar siete días publicados con asistencias laborales resueltas", async () => {
    const { procesamientos, repositorio } = crearRepositorio();

    await procesarHorarioSemanal(repositorio, gerenteDeTiendas, "00001024", "2026-08-31");

    expect(procesamientos).toEqual([{ dni: "00001024", semana: "2026-08-31", equipo: "Tiendas", responsableId: "gerente-1" }]);
  });

  it("rechaza el procesamiento si falta un día publicado o una asistencia laboral sigue pendiente", async () => {
    const { repositorio } = crearRepositorio();
    repositorio.listarSemanaPublicada = async () => [];
    await expect(procesarHorarioSemanal(repositorio, gerenteDeTiendas, "00001024", "2026-08-31"))
      .rejects.toThrow("El horario semanal debe tener los siete días publicados para procesarlo.");

    repositorio.listarSemanaPublicada = async () => ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"].map((fecha) => ({ fecha, descanso: false }));
    repositorio.asistenciasLaboralesEstanProcesadas = async () => false;
    await expect(procesarHorarioSemanal(repositorio, gerenteDeTiendas, "00001024", "2026-08-31"))
      .rejects.toThrow("Todas las asistencias laborales de la semana deben estar confirmadas o tener un estado manual.");
  });

  it.each([
    ["Finanzas", { id: "finanzas-1", rol: "finanzas" as const }],
    ["Recursos Humanos", { id: "rrhh-1", rol: "recursos_humanos" as const }],
    ["un gerente de otro grupo", { id: "gerente-2", rol: "gerente_de_area" as const, grupos: [{ nombre: "Taller", gestionaAsistencia: true }] }],
  ])("rechaza a %s", async (_nombre, actor) => {
    const { procesamientos, repositorio } = crearRepositorio();

    await expect(procesarHorarioSemanal(repositorio, actor, "00001024", "2026-08-31"))
      .rejects.toThrow("No tiene permiso para procesar horarios semanales.");
    expect(procesamientos).toEqual([]);
  });

  it("rechaza a un gerente si la persona no existe, sin revelar nada más", async () => {
    const { repositorio } = crearRepositorio();
    repositorio.obtenerEquipoOperativo = async () => undefined;

    await expect(procesarHorarioSemanal(repositorio, gerenteDeTiendas, "99999999", "2026-08-31"))
      .rejects.toThrow("No tiene permiso para procesar horarios semanales.");
  });
});
