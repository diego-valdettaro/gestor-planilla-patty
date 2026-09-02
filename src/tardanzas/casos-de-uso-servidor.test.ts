import { describe, expect, it } from "vitest";

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
      buscarPoliticaVigente: async (sede, fecha) => politicas
        .filter((politica) => politica.sede === sede && politica.vigenteDesde <= fecha)
        .sort((primera, segunda) => segunda.vigenteDesde.localeCompare(primera.vigenteDesde))[0],
      contarTardanzas: async () => tardanzasAcumuladas,
    },
  };
}

describe("casos de uso de tardanzas en el servidor", () => {
  it("permite a Administración versionar una política de penalización por sede", async () => {
    const { politicas, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeTardanzas(repositorio, {
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administracion" }),
    });

    await casosDeUso.configurarPolitica({
      sede: "Lima", toleranciaEnMinutos: 10, tardanzasAcumuladas: 3,
      horasPenalizadas: 1, version: 1, vigenteDesde: "2026-09-01",
    });

    expect(politicas).toEqual([{
      sede: "Lima", toleranciaEnMinutos: 10, tardanzasAcumuladas: 3,
      horasPenalizadas: 1, version: 1, vigenteDesde: "2026-09-01",
      configuradaPorId: "administracion-1", configuradaEn: expect.any(Date),
    }]);
  });

  it("calcula una tardanza solo cuando la entrada supera la tolerancia vigente", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeTardanzas(repositorio, {
      obtenerActorActual: async () => ({ id: "finanzas-1", rol: "finanzas" }),
    });
    await casosDeUso.configurarPolitica({
      sede: "Lima", toleranciaEnMinutos: 10, tardanzasAcumuladas: 3,
      horasPenalizadas: 1, version: 1, vigenteDesde: "2026-09-01",
    });

    await expect(casosDeUso.calcularTardanza({
      idHuellero: "HU-1024", sede: "Lima", fecha: "2026-09-01", entradaProgramada: "09:00",
      entradaReal: "2026-09-01T09:10:00-05:00",
    })).resolves.toBeUndefined();

    await expect(casosDeUso.calcularTardanza({
      idHuellero: "HU-1024", sede: "Lima", fecha: "2026-09-01", entradaProgramada: "09:00",
      entradaReal: "2026-09-01T09:11:00-05:00",
    })).resolves.toEqual({ minutosDeTardanza: 11, minutosPenalizados: 0, politicaVersion: 1 });
  });

  it("rechaza configurar una política de tardanzas desde Operaciones", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeTardanzas(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
    });

    await expect(casosDeUso.configurarPolitica({
      sede: "Lima", toleranciaEnMinutos: 10, tardanzasAcumuladas: 3,
      horasPenalizadas: 1, version: 1, vigenteDesde: "2026-09-01",
    })).rejects.toThrow("No tiene permiso para configurar políticas de tardanzas.");
  });

  it("penaliza cada acumulación configurada dentro del período de planilla", async () => {
    const { repositorio } = crearRepositorioEnMemoria(2);
    const casosDeUso = crearCasosDeUsoDeTardanzas(repositorio, {
      obtenerActorActual: async () => ({ id: "finanzas-1", rol: "finanzas" }),
    });
    await casosDeUso.configurarPolitica({
      sede: "Lima", toleranciaEnMinutos: 10, tardanzasAcumuladas: 3,
      horasPenalizadas: 1, version: 1, vigenteDesde: "2026-08-26",
    });

    await expect(casosDeUso.calcularTardanza({
      idHuellero: "HU-1024", sede: "Lima", fecha: "2026-09-01", entradaProgramada: "09:00",
      entradaReal: "2026-09-01T09:11:00-05:00",
    })).resolves.toEqual({ minutosDeTardanza: 11, minutosPenalizados: 60, politicaVersion: 1 });
  });
});
