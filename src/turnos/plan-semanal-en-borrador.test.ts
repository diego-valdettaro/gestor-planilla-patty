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
      guardarCeldas: async (celdasParaGuardar) => { celdasParaGuardar.forEach((celda) => celdas.set(`${celda.planId}:${celda.idHuellero}:${celda.fecha}`, celda)); },
      reemplazarCeldasDelPlan: async (planId, celdasParaGuardar) => {
        [...celdas.keys()].filter((clave) => clave.startsWith(`${planId}:`)).forEach((clave) => celdas.delete(clave));
        celdasParaGuardar.forEach((celda) => celdas.set(`${celda.planId}:${celda.idHuellero}:${celda.fecha}`, celda));
      },
      borrarCelda: async (planId, idHuellero, fecha) => { celdas.delete(`${planId}:${idHuellero}:${fecha}`); },
      buscarPublicado: async () => undefined,
      colaboradorPerteneceAEquipo: async (idHuellero, equipo) => (idHuellero === "HU-1024" || idHuellero === "HU-2048") && equipo === "tiendas",
      obtenerSedeDelColaborador: async (idHuellero) => idHuellero === "HU-1024" || idHuellero === "HU-2048" ? "Lima" : undefined,
      listarHorariosPublicadosDelEquipoEnSemana: async () => [{
        idHuellero: "HU-1024", fecha: "2026-09-01", sede: "Lima",
        entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
      }],
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
      modeloHorarioId: "modelo-apertura",
      entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
    });

    const recuperado = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");
    expect(recuperado.celdas).toEqual([expect.objectContaining({ idHuellero: "HU-1024", fecha: "2026-09-01", modeloHorarioId: "modelo-apertura", descanso: false })]);
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
      entradaProgramada: null, salidaProgramada: null, descanso: true,
    });
    await casosDeUso.borrarCelda(plan.id, "HU-1024", "2026-09-01");

    expect((await casosDeUso.obtenerOCrear("2026-08-31", "tiendas")).celdas).toEqual([]);
  });

  it("guarda el borrador completo en una sola operación después de validar todas sus celdas", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const reemplazarCeldasDelPlan = repositorio.reemplazarCeldasDelPlan;
    let guardados = 0;
    repositorio.reemplazarCeldasDelPlan = async (planId, celdas) => {
      guardados += 1;
      await reemplazarCeldasDelPlan(planId, celdas);
    };
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");

    await casosDeUso.guardarBorrador(plan.id, [{
      idHuellero: "HU-1024", fecha: "2026-09-01", sede: "Lima",
      entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
    }, {
      idHuellero: "HU-1024", fecha: "2026-09-02", sede: "Lima",
      entradaProgramada: null, salidaProgramada: null, descanso: true,
    }]);

    expect(guardados).toBe(1);
    expect((await casosDeUso.obtenerOCrear("2026-08-31", "tiendas")).celdas).toHaveLength(2);
  });

  it("no persiste ninguna celda si el borrador completo contiene una celda inválida", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");

    await expect(casosDeUso.guardarBorrador(plan.id, [{
      idHuellero: "HU-1024", fecha: "2026-09-01", sede: "Lima",
      entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
    }, {
      idHuellero: "HU-1024", fecha: "2026-09-07", sede: "Lima",
      entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
    }])).rejects.toThrow("La fecha no pertenece a la semana del plan.");

    expect((await casosDeUso.obtenerOCrear("2026-08-31", "tiendas")).celdas).toEqual([]);
  });

  it("copia los horarios semanales publicados de la semana anterior al borrador sin publicarlos otra vez", async () => {
    const { asistenciasEsperadas, repositorio, turnosPublicados } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-09-07", "tiendas");

    await casosDeUso.copiarSemanaAnterior(plan.id);

    expect((await casosDeUso.obtenerOCrear("2026-09-07", "tiendas")).celdas).toEqual([
      expect.objectContaining({ idHuellero: "HU-1024", fecha: "2026-09-08", descanso: false }),
    ]);
    expect(turnosPublicados).toEqual([]);
    expect(asistenciasEsperadas).toEqual([]);
  });

  it("aplica un descanso solo a las celdas seleccionadas del borrador", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administracion" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");

    await casosDeUso.aplicarHorarioACeldas(plan.id, [
      { idHuellero: "HU-1024", fecha: "2026-09-01", sede: "Lima" },
      { idHuellero: "HU-1024", fecha: "2026-09-02", sede: "Lima" },
    ], { entradaProgramada: null, salidaProgramada: null, descanso: true });

    expect((await casosDeUso.obtenerOCrear("2026-08-31", "tiendas")).celdas).toEqual([
      expect.objectContaining({ fecha: "2026-09-01", descanso: true }),
      expect.objectContaining({ fecha: "2026-09-02", descanso: true }),
    ]);
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
    const celda = { idHuellero: "HU-1024", fecha: "2026-09-07", sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false };

    await expect(administracion.guardarCelda(plan.id, celda)).rejects.toThrow("La fecha no pertenece a la semana del plan.");
    await expect(administracion.guardarCelda(plan.id, { ...celda, fecha: "2026-09-01", idHuellero: "HU-9999" })).rejects.toThrow("El colaborador no pertenece al equipo operativo del plan.");
    await expect(administracion.guardarCelda(plan.id, { ...celda, fecha: "2026-09-01", sede: "Tienda Norte" })).rejects.toThrow("La sede de la celda no corresponde al colaborador.");
    const finanzas = crearCasosDeUsoDePlanesSemanales(repositorio, { obtenerActorActual: async () => ({ id: "finanzas-1", rol: "finanzas" }) });
    await expect(finanzas.borrarCelda(plan.id, "HU-1024", "2026-09-01")).rejects.toThrow("No tiene permiso para editar planes semanales en borrador.");
  });

  it("impide corregir en el borrador una jornada publicada que ya fue procesada", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    repositorio.buscarPublicado = async (idHuellero, fecha) => idHuellero === "HU-1024" && fecha === "2026-09-01"
      ? { idHuellero, fecha, sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false }
      : undefined;
    repositorio.asistenciaEstaProcesada = async () => true;
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");
    const celda = { idHuellero: "HU-1024", fecha: "2026-09-01", sede: "Lima", entradaProgramada: "10:00", salidaProgramada: "19:00", descanso: false };

    await expect(casosDeUso.guardarCelda(plan.id, celda)).rejects.toThrow("El horario semanal ya fue procesado y no se puede corregir.");
    await expect(casosDeUso.aplicarHorarioACeldas(plan.id, [celda], celda)).rejects.toThrow("El horario semanal ya fue procesado y no se puede corregir.");
    await expect(casosDeUso.borrarCelda(plan.id, celda.idHuellero, celda.fecha)).rejects.toThrow("El horario semanal ya fue publicado y no se puede editar desde el borrador.");
  });

  it("bloquea guardar el borrador completo cuando el horario semanal fue procesado", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    repositorio.horarioSemanalEstaProcesado = async () => true;
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");

    await expect(casosDeUso.guardarBorrador(plan.id, [{
      idHuellero: "HU-1024", fecha: "2026-09-01", sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
    }])).rejects.toThrow("El horario semanal ya fue procesado y no se puede editar.");
  });

  it("preserva la fila procesada al guardar cambios de otra persona", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");
    const celdaProcesada = { planId: plan.id, idHuellero: "HU-1024", fecha: "2026-09-01", sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false };
    const celdaEditable = { planId: plan.id, idHuellero: "HU-2048", fecha: "2026-09-01", sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false };
    await repositorio.guardarCeldas([celdaProcesada, celdaEditable]);
    repositorio.horarioSemanalEstaProcesado = async (idHuellero) => idHuellero === "HU-1024";

    await casosDeUso.guardarBorrador(plan.id, [celdaProcesada, { ...celdaEditable, entradaProgramada: "10:00", salidaProgramada: "19:00" }]);

    await expect(casosDeUso.obtenerOCrear("2026-08-31", "tiendas")).resolves.toMatchObject({ celdas: expect.arrayContaining([
      expect.objectContaining(celdaProcesada), expect.objectContaining({ ...celdaEditable, entradaProgramada: "10:00", salidaProgramada: "19:00" }),
    ]) });
  });

  it("no copia la semana anterior sobre una jornada ya publicada", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    repositorio.buscarPublicado = async (idHuellero, fecha) => idHuellero === "HU-1024" && fecha === "2026-09-08"
      ? { idHuellero, fecha, sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false }
      : undefined;
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "operaciones" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-09-07", "tiendas");

    await expect(casosDeUso.copiarSemanaAnterior(plan.id)).rejects.toThrow("El horario semanal ya fue publicado y no se puede editar desde el borrador.");
    expect((await casosDeUso.obtenerOCrear("2026-09-07", "tiendas")).celdas).toEqual([]);
  });
});
