import { describe, expect, it, vi } from "vitest";

import { crearCasosDeUsoDeTardanzas } from "./casos-de-uso-servidor";
import type { PoliticaDePenalizacionPorTardanzas, RepositorioDeTardanzas } from "./politica-de-penalizacion";

function crearRepositorioEnMemoria(tardanzasAcumuladas = 0): {
  politicas: PoliticaDePenalizacionPorTardanzas[];
  repositorio: RepositorioDeTardanzas;
} {
  const politicas: PoliticaDePenalizacionPorTardanzas[] = [];
  return {
    politicas,
    repositorio: {
      guardarPolitica: async (politica) => { politicas.push(politica); },
      obtenerGrupo: async (nombre) => ({ nombre, gestionaAsistencia: true }),
      guardarPoliticaDeGrupo: async () => undefined,
      buscarPoliticaVigente: async (sede, fecha) => politicas
        .filter((politica) => politica.sede === sede && politica.vigenteDesde <= fecha)
        .sort((primera, segunda) => segunda.vigenteDesde.localeCompare(primera.vigenteDesde))[0],
      contarTardanzas: async () => tardanzasAcumuladas,
    },
  };
}

describe("casos de uso de tardanzas en el servidor", () => {
  it("permite al Administrador configurar la política del grupo operativo", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const guardarPoliticaDeGrupo = vi.fn();
    repositorio.guardarPoliticaDeGrupo = guardarPoliticaDeGrupo;
    const casosDeUso = crearCasosDeUsoDeTardanzas(repositorio, {
      obtenerActorActual: async () => ({ id: "admin-1", rol: "administrador" }),
    });

    await casosDeUso.configurarPolitica({
      grupo: "Tiendas", toleranciaEnMinutos: 10, tardanzasAcumuladas: 3,
      horasPenalizadas: 1,
    });

    expect(guardarPoliticaDeGrupo).toHaveBeenCalledWith({
      grupo: "Tiendas", toleranciaEnMinutos: 10, tardanzasAcumuladas: 3,
      horasPenalizadas: 1, configuradaPorId: "admin-1", configuradaEn: expect.any(Date),
    });
  });

  it("calcula una tardanza solo cuando la entrada supera la tolerancia vigente", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeTardanzas(repositorio, {
      obtenerActorActual: async () => ({ id: "admin-1", rol: "administrador" }),
    });
    repositorio.guardarPolitica({ sede: "Lima", toleranciaEnMinutos: 10, tardanzasAcumuladas: 3,
      horasPenalizadas: 1, version: 1, vigenteDesde: "2026-09-01", configuradaPorId: "fixture", configuradaEn: new Date() });

    await expect(casosDeUso.calcularTardanza({
      dni: "00001024", sede: "Lima", fecha: "2026-09-01", entradaProgramada: "09:00",
      entradaReal: "2026-09-01T09:10:00-05:00",
    })).resolves.toBeUndefined();

    await expect(casosDeUso.calcularTardanza({
      dni: "00001024", sede: "Lima", fecha: "2026-09-01", entradaProgramada: "09:00",
      entradaReal: "2026-09-01T09:11:00-05:00",
    })).resolves.toEqual({ minutosDeTardanza: 11, minutosPenalizados: 0, politicaVersion: 1 });
  });

  it("rechaza configurar una política de tardanzas desde Operaciones", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeTardanzas(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "gerente_de_area" }),
    });

    await expect(casosDeUso.configurarPolitica({
      sede: "Lima", toleranciaEnMinutos: 10, tardanzasAcumuladas: 3,
      horasPenalizadas: 1, version: 1, vigenteDesde: "2026-09-01",
    })).rejects.toThrow("No tiene permiso para configurar políticas de tardanzas.");
  });

  it("penaliza cada acumulación configurada dentro del período de planilla", async () => {
    const { repositorio } = crearRepositorioEnMemoria(2);
    const casosDeUso = crearCasosDeUsoDeTardanzas(repositorio, {
      obtenerActorActual: async () => ({ id: "admin-1", rol: "administrador" }),
    });
    await repositorio.guardarPolitica({ sede: "Lima", toleranciaEnMinutos: 10, tardanzasAcumuladas: 3,
      horasPenalizadas: 1, version: 1, vigenteDesde: "2026-08-26", configuradaPorId: "fixture", configuradaEn: new Date() });

    await expect(casosDeUso.calcularTardanza({
      dni: "00001024", sede: "Lima", fecha: "2026-09-01", entradaProgramada: "09:00",
      entradaReal: "2026-09-01T09:11:00-05:00",
    })).resolves.toEqual({ minutosDeTardanza: 11, minutosPenalizados: 60, politicaVersion: 1 });
  });

  it("rechaza las solicitudes históricas de escritura por sede", async () => {
    const { politicas, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeTardanzas(repositorio, {
      obtenerActorActual: async () => ({ id: "admin-1", rol: "administrador" }),
    });
    await expect(casosDeUso.configurarPolitica({ sede: "Lima", toleranciaEnMinutos: 10,
      tardanzasAcumuladas: 3, horasPenalizadas: 1, version: 1, vigenteDesde: "2026-09-01" }))
      .rejects.toThrow("La política de tardanzas se configura por grupo operativo que gestiona asistencia.");
    expect(politicas).toEqual([]);
  });
});
