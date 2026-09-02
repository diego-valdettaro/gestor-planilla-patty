import { describe, expect, it } from "vitest";

import { crearCasosDeUsoDePlanesSemanales } from "./casos-de-uso-planes-semanales";
import type { PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";

function crearRepositorioEnMemoria(): {
  asistenciasEsperadas: unknown[];
  turnosPublicados: unknown[];
  repositorio: RepositorioDePlanesSemanales;
} {
  const planes = new Map<string, PlanSemanalEnBorrador>();
  const celdas = new Map<string, PlanSemanalEnBorrador["celdas"][number]>();
  const plan = (semana: string, equipo: "tiendas" | "taller") => `${semana}:${equipo}`;

  return {
    asistenciasEsperadas: [],
    turnosPublicados: [],
    repositorio: {
      obtenerOCrear: async (semana, equipo) => {
        const clave = plan(semana, equipo);
        const existente = planes.get(clave) ?? { id: clave, semana, equipo, celdas: [] };
        planes.set(clave, existente);
        return { ...existente, celdas: [...celdas.values()].filter((celda) => celda.planId === existente.id) };
      },
      buscarPorId: async (id) => {
        const existente = [...planes.values()].find((item) => item.id === id);
        return existente ? { ...existente, celdas: [...celdas.values()].filter((celda) => celda.planId === id) } : undefined;
      },
      guardarCelda: async (celda) => { celdas.set(`${celda.planId}:${celda.idHuellero}:${celda.fecha}`, celda); },
      borrarCelda: async (planId, idHuellero, fecha) => { celdas.delete(`${planId}:${idHuellero}:${fecha}`); },
      colaboradorPerteneceAEquipo: async (idHuellero, equipo) => idHuellero === "HU-1024" && equipo === "tiendas",
    },
  };
}

describe("casos de uso de planes semanales en borrador", () => {
  it("permite a Operaciones guardar y continuar una celda de borrador sin publicar horarios ni asistencias", async () => {
    const { asistenciasEsperadas, repositorio, turnosPublicados } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
    });

    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");
    await casosDeUso.guardarCelda(plan.id, {
      idHuellero: "HU-1024", fecha: "2026-09-01", sede: "Lima",
      entradaProgramada: "09:00", salidaProgramada: "18:00", minutosDeAlmuerzo: 60, descanso: false,
    });

    const recuperado = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");
    expect(recuperado.celdas).toEqual([expect.objectContaining({ idHuellero: "HU-1024", fecha: "2026-09-01", descanso: false })]);
    expect(turnosPublicados).toHaveLength(0);
    expect(asistenciasEsperadas).toHaveLength(0);
  });

  it("permite guardar un descanso y borrar una celda para volverla sin definir", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administracion" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");

    await casosDeUso.guardarCelda(plan.id, {
      idHuellero: "HU-1024", fecha: "2026-09-01", sede: "Lima",
      entradaProgramada: "00:00", salidaProgramada: "00:00", minutosDeAlmuerzo: 0, descanso: true,
    });
    await casosDeUso.borrarCelda(plan.id, "HU-1024", "2026-09-01");

    expect((await casosDeUso.obtenerOCrear("2026-08-31", "tiendas")).celdas).toEqual([]);
  });

  it("rechaza a Finanzas antes de crear o editar el borrador", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "finanzas-1", rol: "finanzas" }),
    });

    await expect(casosDeUso.obtenerOCrear("2026-08-31", "tiendas")).rejects.toThrow("No tiene permiso para editar planes semanales en borrador.");
  });

  it("rechaza una celda fuera de semana, de otro equipo o editada por Finanzas", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const administracion = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administracion" }),
    });
    const plan = await administracion.obtenerOCrear("2026-08-31", "tiendas");
    const celda = { idHuellero: "HU-1024", fecha: "2026-09-07", sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", minutosDeAlmuerzo: 60, descanso: false };

    await expect(administracion.guardarCelda(plan.id, celda)).rejects.toThrow("La fecha no pertenece a la semana del plan.");
    await expect(administracion.guardarCelda(plan.id, { ...celda, fecha: "2026-09-01", idHuellero: "HU-9999" })).rejects.toThrow("El colaborador no pertenece al equipo operativo del plan.");
    const finanzas = crearCasosDeUsoDePlanesSemanales(repositorio, { obtenerActorActual: async () => ({ id: "finanzas-1", rol: "finanzas" }) });
    await expect(finanzas.borrarCelda(plan.id, "HU-1024", "2026-09-01")).rejects.toThrow("No tiene permiso para editar planes semanales en borrador.");
  });
});
