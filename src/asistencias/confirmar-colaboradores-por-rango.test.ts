import { describe, expect, it } from "vitest";

import {
  confirmarColaboradoresPorRango,
  evaluarColaboradoresPorRango,
  type RepositorioDeConfirmacionPorRango,
} from "./confirmar-colaboradores-por-rango";

describe("confirmación de asistencias por rango", () => {
  const evaluacion = [{
    dni: "00000011",
    nombre: "Ana Torres",
    seleccionable: true,
    jornadasPendientes: 2,
    jornadasRegistradas: 1,
    bloqueos: [],
  }];
  const llamadas: string[] = [];
  const repositorio: RepositorioDeConfirmacionPorRango = {
    obtenerGruposDeColaboradores: async (dnis) => dnis.map((dni) => ({ dni, grupo: "Tiendas" })),
    evaluarColaboradoresPorRango: async () => evaluacion,
    confirmarColaboradoresPorRango: async (solicitud, responsableId) => {
      llamadas.push(`${responsableId}:${solicitud.dnis.join(",")}`);
    },
  };

  it("evalúa el rango para una selección única de colaboradores", async () => {
    const resultado = await evaluarColaboradoresPorRango(repositorio, { id: "admin-1", rol: "administrador" }, {
      inicio: "2031-03-24",
      fin: "2031-03-27",
      colaboradores: [
        { dni: "00000011", nombre: "Ana Torres" },
        { dni: "00000011", nombre: "Ana Torres" },
      ],
    });

    expect(resultado).toEqual(evaluacion);
  });

  it("confirma la selección completa con el responsable autenticado", async () => {
    await confirmarColaboradoresPorRango(repositorio, { id: "gerente-1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }, {
      inicio: "2031-03-24",
      fin: "2031-03-27",
      dnis: ["00000011", "00000011"],
    });

    expect(llamadas).toEqual(["gerente-1:00000011"]);
  });

  it("rechaza rangos inválidos, selecciones vacías y roles sin permiso", async () => {
    await expect(evaluarColaboradoresPorRango(repositorio, { id: "op-1", rol: "gerente_de_area" }, {
      inicio: "2031-03-24", fin: "2031-03-27", colaboradores: [{ dni: "00000011", nombre: "Ana" }],
    })).rejects.toThrow("No tiene permiso");
    await expect(confirmarColaboradoresPorRango(repositorio, { id: "admin-1", rol: "administrador" }, {
      inicio: "2031-03-28", fin: "2031-03-27", dnis: ["00000011"],
    })).rejects.toThrow("rango de confirmación");
    await expect(confirmarColaboradoresPorRango(repositorio, { id: "admin-1", rol: "administrador" }, {
      inicio: "2031-03-24", fin: "2031-03-27", dnis: [],
    })).rejects.toThrow("al menos un colaborador");
  });

  it("rechaza a Finanzas y al gerente cuando alguna persona es de otro grupo", async () => {
    const solicitud = { inicio: "2031-03-24", fin: "2031-03-27", dnis: ["00000011", "00000022"] };
    const gerente = { id: "gerente-1", rol: "gerente_de_area" as const, grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] };
    const mixto: RepositorioDeConfirmacionPorRango = { ...repositorio, obtenerGruposDeColaboradores: async (dnis) => dnis.map((dni) => ({ dni, grupo: dni === "00000022" ? "Taller" : "Tiendas" })) };
    llamadas.length = 0;

    await expect(confirmarColaboradoresPorRango(mixto, { id: "finanzas-1", rol: "finanzas" }, solicitud)).rejects.toThrow("No tiene permiso para revisar asistencias.");
    await expect(confirmarColaboradoresPorRango(mixto, gerente, solicitud)).rejects.toThrow("No tiene permiso para revisar asistencias de este grupo.");
    await expect(evaluarColaboradoresPorRango(mixto, gerente, { inicio: "2031-03-24", fin: "2031-03-27", colaboradores: [{ dni: "00000022", nombre: "Beto" }] })).rejects.toThrow("No tiene permiso para revisar asistencias de este grupo.");
    expect(llamadas).toEqual([]);
  });
});
