import { describe, expect, it } from "vitest";

import { crearCasosDeUsoDePlanesSemanales } from "./casos-de-uso-planes-semanales";
import type { PlanSemanalEnBorrador, RepositorioDePlanesSemanales } from "./plan-semanal-en-borrador";

function crearRepositorioEnMemoria(vigencias = [{ ingreso: "2026-01-01", cese: null as string | null }], cerradas: string[] = []): {
  asistenciasEsperadas: unknown[];
  turnosPublicados: unknown[];
  repositorio: RepositorioDePlanesSemanales;
} {
  const planes = new Map<string, PlanSemanalEnBorrador>();
  const celdas = new Map<string, PlanSemanalEnBorrador["celdas"][number]>();
  const plan = (semana: string, equipo: string) => `${semana}:${equipo}`;

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
      guardarCelda: async (celda) => { celdas.set(`${celda.planId}:${celda.dni}:${celda.fecha}`, celda); },
      guardarCeldas: async (celdasParaGuardar) => { celdasParaGuardar.forEach((celda) => celdas.set(`${celda.planId}:${celda.dni}:${celda.fecha}`, celda)); },
      reemplazarCeldasDelPlan: async (planId, celdasParaGuardar) => {
        [...celdas.keys()].filter((clave) => clave.startsWith(`${planId}:`)).forEach((clave) => celdas.delete(clave));
        celdasParaGuardar.forEach((celda) => celdas.set(`${celda.planId}:${celda.dni}:${celda.fecha}`, celda));
      },
      borrarCelda: async (planId, dni, fecha) => { celdas.delete(`${planId}:${dni}:${fecha}`); },
      buscarPublicado: async () => undefined,
      consultarEstadoDeFechas: async (inicio, fin) => ({ cerradas: cerradas.filter((fecha) => fecha >= inicio && fecha <= fin), sinPeriodo: [] }),
      colaboradorPerteneceAEquipo: async (dni, equipo) => (dni === "00001024" || dni === "00002048") && equipo === "tiendas",
      listarVigenciasConfirmadas: async () => vigencias,
      sedeActivaPerteneceAlGrupo: async (sede, equipo) => sede === "Lima" && equipo === "tiendas",
      buscarModeloDeHorario: async (id) => id === "modelo-apertura"
        ? { id, sede: "Lima", nombre: "Apertura", entrada: "09:00", salida: "18:00", activo: true }
        : undefined,
      listarColaboradoresActivosPorEquipo: async () => [],
      listarHorariosPublicadosDelEquipoEnSemana: async () => [{
        dni: "00001024", fecha: "2026-09-01", sede: "Lima",
        entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
      }],
    },
  };
}

describe("casos de uso de planes semanales en borrador", () => {
  // G5: guardar el borrador (completo o por celda) no puede modificar una fecha cerrada; lo que no cambia no cuenta
  // (contrato C3; Diego: «fecha cerrada bloquea también guardar borrador semanal»; Q5; diseno-software §Horarios).
  describe("G5 · guardar el borrador no modifica fechas cerradas", () => {
    type Celda = { dni: string; fecha: string; sede: string | null; entradaProgramada: string | null; salidaProgramada: string | null; descanso: boolean };
    type Casos = ReturnType<typeof crearCasosDeUsoDePlanesSemanales>;
    const celda = (fecha: string, entrada = "09:00", salida = "18:00"): Celda => ({
      dni: "00001024", fecha, sede: "Lima", entradaProgramada: entrada, salidaProgramada: salida, descanso: false,
    });
    const MENSAJE_24 = "La fecha 24/09/2026 está cerrada y requiere reapertura. Reabrir el período para modificarla.";

    it.each<{ fila: string; existentes: Celda[]; operar: (casos: Casos, planId: string) => Promise<void>; rechaza: boolean }>([
      {
        fila: "F5.1 guardarBorrador cambia una celda ya guardada del 24 cerrado",
        existentes: [celda("2026-09-22"), celda("2026-09-24")],
        operar: (casos, planId) => casos.guardarBorrador(planId, [celda("2026-09-22"), celda("2026-09-24", "10:00", "19:00")]),
        rechaza: true,
      },
      {
        fila: "F5.1 guardarBorrador agrega una celda en el 24 cerrado",
        existentes: [celda("2026-09-22")],
        operar: (casos, planId) => casos.guardarBorrador(planId, [celda("2026-09-22"), celda("2026-09-24")]),
        rechaza: true,
      },
      {
        fila: "F5.1 guardarBorrador quita la celda del 24 cerrado",
        existentes: [celda("2026-09-22"), celda("2026-09-24")],
        operar: (casos, planId) => casos.guardarBorrador(planId, [celda("2026-09-22")]),
        rechaza: true,
      },
      {
        fila: "F5.2 guardarBorrador con el 24 cerrado sin cambios y un cambio en el 22 guarda",
        existentes: [celda("2026-09-22"), celda("2026-09-24")],
        operar: (casos, planId) => casos.guardarBorrador(planId, [celda("2026-09-22", "10:00", "19:00"), celda("2026-09-24")]),
        rechaza: false,
      },
      {
        fila: "F5.3 guardarCelda cambia el 24 cerrado",
        existentes: [celda("2026-09-24")],
        operar: (casos, planId) => casos.guardarCelda(planId, celda("2026-09-24", "10:00", "19:00")),
        rechaza: true,
      },
      {
        fila: "F5.3 aplicarHorarioACeldas sobre el 24 cerrado",
        existentes: [celda("2026-09-22"), celda("2026-09-24")],
        operar: (casos, planId) => casos.aplicarHorarioACeldas(planId, [{ dni: "00001024", fecha: "2026-09-24", sede: "Lima" }], { entradaProgramada: "10:00", salidaProgramada: "19:00", descanso: false }),
        rechaza: true,
      },
    ])("$fila", async ({ existentes, operar, rechaza }) => {
      const { repositorio } = crearRepositorioEnMemoria(undefined, ["2026-09-24"]);
      const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, { obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }) });
      const plan = await casosDeUso.obtenerOCrear("2026-09-21", "tiendas");
      await repositorio.guardarCeldas(existentes.map((existente) => ({ planId: plan.id, ...existente })));
      const antes = (await repositorio.buscarPorId(plan.id))!.celdas;

      const operacion = operar(casosDeUso, plan.id);

      if (rechaza) {
        await expect(operacion).rejects.toMatchObject({ name: "FechasCerradasError", fechas: ["2026-09-24"], message: MENSAJE_24 });
        expect((await repositorio.buscarPorId(plan.id))!.celdas).toEqual(antes);
      } else {
        await operacion;
        const despues = (await repositorio.buscarPorId(plan.id))!.celdas;
        expect(despues.find((guardada) => guardada.fecha === "2026-09-22")).toMatchObject({ entradaProgramada: "10:00", salidaProgramada: "19:00" });
        expect(despues.find((guardada) => guardada.fecha === "2026-09-24")).toMatchObject({ entradaProgramada: "09:00", salidaProgramada: "18:00" });
      }
    });
  });

  // S-01 (revisión 1): un día «Sin relación laboral» que la grilla agrega solo no cuenta como modificado (contrato C3, Q3).
  describe("S-01 · guardar el borrador con días «Sin relación laboral» en fechas cerradas", () => {
    const trabajo = (fecha: string, entrada = "09:00") => ({
      dni: "00001024", fecha, sede: "Lima", entradaProgramada: entrada, salidaProgramada: "18:00", descanso: false,
    });
    const sinRelacion = (fecha: string) => ({
      dni: "00001024", fecha, sede: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "sin_relacion_laboral" as const,
    });
    const preparar = async (cerradas: string[]) => {
      // La relación laboral empieza el 25: el 24 queda fuera de ella.
      const { repositorio } = crearRepositorioEnMemoria([{ ingreso: "2026-09-25", cese: null }], cerradas);
      const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, { obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }) });
      const plan = await casosDeUso.obtenerOCrear("2026-09-21", "tiendas");
      await repositorio.guardarCeldas([{ planId: plan.id, ...trabajo("2026-09-26") }]);
      return { repositorio, casosDeUso, plan };
    };

    it("F5.4 guardarBorrador con un 24 cerrado «Sin relación laboral» nuevo y un cambio en el 26 abierto guarda", async () => {
      const { repositorio, casosDeUso, plan } = await preparar(["2026-09-24"]);

      await casosDeUso.guardarBorrador(plan.id, [sinRelacion("2026-09-24"), trabajo("2026-09-26", "10:00")]);

      const celdas = (await repositorio.buscarPorId(plan.id))!.celdas;
      expect(celdas.find(({ fecha }) => fecha === "2026-09-24")).toMatchObject({ motivoNoAsistencia: "sin_relacion_laboral" });
      expect(celdas.find(({ fecha }) => fecha === "2026-09-26")).toMatchObject({ entradaProgramada: "10:00" });
    });

    it("F5.5 guardarBorrador sigue rechazando una celda de trabajo nueva en fecha cerrada aunque haya un día sin relación cerrado", async () => {
      const { repositorio, casosDeUso, plan } = await preparar(["2026-09-24", "2026-09-25"]);
      const antes = (await repositorio.buscarPorId(plan.id))!.celdas;

      await expect(casosDeUso.guardarBorrador(plan.id, [sinRelacion("2026-09-24"), trabajo("2026-09-25"), trabajo("2026-09-26")]))
        .rejects.toMatchObject({ name: "FechasCerradasError", fechas: ["2026-09-25"] });
      expect((await repositorio.buscarPorId(plan.id))!.celdas).toEqual(antes);
    });
  });

  it("permite a Operaciones guardar y continuar una celda de borrador sin publicar horarios ni asistencias", async () => {
    const { asistenciasEsperadas, repositorio, turnosPublicados } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });

    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");
    await casosDeUso.guardarCelda(plan.id, {
      dni: "00001024", fecha: "2026-09-01", sede: "Lima",
      modeloHorarioId: "modelo-apertura",
      entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
    });

    const recuperado = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");
    expect(recuperado.celdas).toEqual([expect.objectContaining({ dni: "00001024", fecha: "2026-09-01", modeloHorarioId: "modelo-apertura", descanso: false })]);
    expect(turnosPublicados).toHaveLength(0);
    expect(asistenciasEsperadas).toHaveLength(0);
  });

  it("permite guardar un descanso y borrar una celda para volverla sin definir", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administrador" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");

    await casosDeUso.guardarCelda(plan.id, {
      dni: "00001024", fecha: "2026-09-01", sede: null,
      entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "descanso",
    });
    await casosDeUso.borrarCelda(plan.id, "00001024", "2026-09-01");

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
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");

    await casosDeUso.guardarBorrador(plan.id, [{
      dni: "00001024", fecha: "2026-09-01", sede: "Lima",
      entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
    }, {
      dni: "00001024", fecha: "2026-09-02", sede: null,
      entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "descanso",
    }]);

    expect(guardados).toBe(1);
    expect((await casosDeUso.obtenerOCrear("2026-08-31", "tiendas")).celdas).toHaveLength(2);
  });

  it("no persiste ninguna celda si el borrador completo contiene una celda inválida", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");

    await expect(casosDeUso.guardarBorrador(plan.id, [{
      dni: "00001024", fecha: "2026-09-01", sede: "Lima",
      entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
    }, {
      dni: "00001024", fecha: "2026-09-07", sede: "Lima",
      entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
    }])).rejects.toThrow("La fecha no pertenece a la semana del plan.");

    expect((await casosDeUso.obtenerOCrear("2026-08-31", "tiendas")).celdas).toEqual([]);
  });

  it("copia los horarios semanales publicados de la semana anterior al borrador sin publicarlos otra vez", async () => {
    const { asistenciasEsperadas, repositorio, turnosPublicados } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-09-07", "tiendas");

    await casosDeUso.copiarSemanaAnterior(plan.id);

    expect((await casosDeUso.obtenerOCrear("2026-09-07", "tiendas")).celdas).toEqual([
      expect.objectContaining({ dni: "00001024", fecha: "2026-09-08", descanso: false }),
    ]);
    expect(turnosPublicados).toEqual([]);
    expect(asistenciasEsperadas).toEqual([]);
  });

  it("no copia a la semana nueva un día fuera de la relación laboral confirmada; el sistema lo marca al publicar", async () => {
    const { repositorio } = crearRepositorioEnMemoria([{ ingreso: "2026-01-01", cese: "2026-09-07" }]);
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-09-07", "tiendas");

    await casosDeUso.copiarSemanaAnterior(plan.id);

    expect((await casosDeUso.obtenerOCrear("2026-09-07", "tiendas")).celdas).toEqual([]);
  });

  it("no copia los días que quedan fuera de la relación laboral confirmada: el sistema los marca «Sin relación laboral»", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    repositorio.listarVigenciasConfirmadas = async () => [{ ingreso: "2026-01-01", cese: "2026-09-07" }];
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-09-07", "tiendas");

    await casosDeUso.copiarSemanaAnterior(plan.id);

    expect((await casosDeUso.obtenerOCrear("2026-09-07", "tiendas")).celdas).toEqual([]);
  });

  it("no copia la jornada de una persona que ya no pertenece al grupo del plan", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    repositorio.colaboradorPerteneceAEquipo = async () => false;
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-09-07", "tiendas");

    await casosDeUso.copiarSemanaAnterior(plan.id);

    expect((await casosDeUso.obtenerOCrear("2026-09-07", "tiendas")).celdas).toEqual([]);
  });

  it("no copia una jornada cuya sede dejó de estar activa en el grupo", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    repositorio.sedeActivaPerteneceAlGrupo = async () => false;
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-09-07", "tiendas");

    await expect(casosDeUso.copiarSemanaAnterior(plan.id)).rejects.toThrow(
      "La sede debe estar activa y pertenecer al grupo del colaborador.",
    );
    expect((await casosDeUso.obtenerOCrear("2026-09-07", "tiendas")).celdas).toEqual([]);
  });

  it("reemplaza las celdas editables del borrador al copiar la semana anterior", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-09-07", "tiendas");
    await repositorio.guardarCelda({
      planId: plan.id, dni: "00002048", fecha: "2026-09-08", sede: "Lima",
      entradaProgramada: "10:00", salidaProgramada: "19:00", descanso: false,
    });

    await casosDeUso.copiarSemanaAnterior(plan.id);

    expect((await casosDeUso.obtenerOCrear("2026-09-07", "tiendas")).celdas).toEqual([
      expect.objectContaining({ dni: "00001024", fecha: "2026-09-08", entradaProgramada: "09:00", salidaProgramada: "18:00" }),
    ]);
  });

  it("conserva las celdas de una persona procesada y no copia sus horarios", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-09-07", "tiendas");
    const celdaProcesada = {
      planId: plan.id, dni: "00001024", fecha: "2026-09-08", sede: "Lima",
      entradaProgramada: "10:00", salidaProgramada: "19:00", descanso: false,
    };
    await repositorio.guardarCelda(celdaProcesada);
    repositorio.horarioSemanalEstaProcesado = async (dni) => dni === "00001024";

    await casosDeUso.copiarSemanaAnterior(plan.id);

    await expect(casosDeUso.obtenerOCrear("2026-09-07", "tiendas")).resolves.toMatchObject({
      celdas: [expect.objectContaining(celdaProcesada)],
    });
  });

  it("aplica un descanso solo a las celdas seleccionadas del borrador", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administrador" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");

    await casosDeUso.aplicarHorarioACeldas(plan.id, [
      { dni: "00001024", fecha: "2026-09-01", sede: "Lima" },
      { dni: "00001024", fecha: "2026-09-02", sede: "Lima" },
    ], { entradaProgramada: null, salidaProgramada: null, descanso: true });

    expect((await casosDeUso.obtenerOCrear("2026-08-31", "tiendas")).celdas).toEqual([
      expect.objectContaining({ fecha: "2026-09-01", descanso: true }),
      expect.objectContaining({ fecha: "2026-09-02", descanso: true }),
    ]);
  });

  it("rechaza a Finanzas y a un gerente de otro grupo en el borrador", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const finanzas = crearCasosDeUsoDePlanesSemanales(repositorio, { obtenerActorActual: async () => ({ id: "finanzas-1", rol: "finanzas" }) });
    const otroGrupo = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "gerente-1", rol: "gerente_de_area", grupos: [{ nombre: "taller", gestionaAsistencia: true }] }),
    });

    await expect(finanzas.obtenerOCrear("2026-08-31", "tiendas")).rejects.toThrow("No tiene permiso para editar planes semanales en borrador.");
    await expect(otroGrupo.obtenerOCrear("2026-08-31", "tiendas")).rejects.toThrow("No tiene permiso para editar planes semanales de este grupo.");
  });

  it("permite al gerente de área del grupo crear, guardar y borrar celdas del borrador", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const finanzas = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "gerente-1", rol: "gerente_de_area", grupos: [{ nombre: "tiendas", gestionaAsistencia: true }] }),
    });

    const plan = await finanzas.obtenerOCrear("2026-08-31", "tiendas");
    await finanzas.guardarCelda(plan.id, {
      dni: "00001024", fecha: "2026-09-01", sede: "Lima",
      entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
    });
    await finanzas.borrarCelda(plan.id, "00001024", "2026-09-01");

    expect((await finanzas.obtenerOCrear("2026-08-31", "tiendas")).celdas).toEqual([]);
  });

  it("rechaza una celda fuera de semana, de otro equipo o con una sede fuera del grupo", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const administracion = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administrador" }),
    });
    const plan = await administracion.obtenerOCrear("2026-08-31", "tiendas");
    const celda = { dni: "00001024", fecha: "2026-09-07", sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false };

    await expect(administracion.guardarCelda(plan.id, celda)).rejects.toThrow("La fecha no pertenece a la semana del plan.");
    await expect(administracion.guardarCelda(plan.id, { ...celda, fecha: "2026-09-01", dni: "00009999" })).rejects.toThrow("El colaborador no pertenece al equipo operativo del plan.");
    await expect(administracion.guardarCelda(plan.id, { ...celda, fecha: "2026-09-01", sede: "Tienda Norte" })).rejects.toThrow("La sede debe estar activa y pertenecer al grupo del colaborador.");
  });

  it("impide corregir en el borrador una jornada publicada que ya fue procesada", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    repositorio.buscarPublicado = async (dni, fecha) => dni === "00001024" && fecha === "2026-09-01"
      ? { dni, fecha, sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false }
      : undefined;
    repositorio.asistenciaEstaProcesada = async () => true;
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");
    const celda = { dni: "00001024", fecha: "2026-09-01", sede: "Lima", entradaProgramada: "10:00", salidaProgramada: "19:00", descanso: false };

    await expect(casosDeUso.guardarCelda(plan.id, celda)).rejects.toThrow("El horario semanal ya fue procesado y no se puede corregir.");
    await expect(casosDeUso.aplicarHorarioACeldas(plan.id, [celda], celda)).rejects.toThrow("El horario semanal ya fue procesado y no se puede corregir.");
    await expect(casosDeUso.borrarCelda(plan.id, celda.dni, celda.fecha)).rejects.toThrow("El horario semanal ya fue publicado y no se puede editar desde el borrador.");
  });

  it("bloquea guardar el borrador completo cuando el horario semanal fue procesado", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    repositorio.horarioSemanalEstaProcesado = async () => true;
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");

    await expect(casosDeUso.guardarBorrador(plan.id, [{
      dni: "00001024", fecha: "2026-09-01", sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
    }])).rejects.toThrow("El horario semanal ya fue procesado y no se puede editar.");
  });

  it("preserva la fila procesada al guardar cambios de otra persona", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-08-31", "tiendas");
    const celdaProcesada = { planId: plan.id, dni: "00001024", fecha: "2026-09-01", sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false };
    const celdaEditable = { planId: plan.id, dni: "00002048", fecha: "2026-09-01", sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false };
    await repositorio.guardarCeldas([celdaProcesada, celdaEditable]);
    repositorio.horarioSemanalEstaProcesado = async (dni) => dni === "00001024";

    await casosDeUso.guardarBorrador(plan.id, [celdaProcesada, { ...celdaEditable, entradaProgramada: "10:00", salidaProgramada: "19:00" }]);

    await expect(casosDeUso.obtenerOCrear("2026-08-31", "tiendas")).resolves.toMatchObject({ celdas: expect.arrayContaining([
      expect.objectContaining(celdaProcesada), expect.objectContaining({ ...celdaEditable, entradaProgramada: "10:00", salidaProgramada: "19:00" }),
    ]) });
  });

  it("no copia la semana anterior sobre una jornada ya publicada", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    repositorio.buscarPublicado = async (dni, fecha) => dni === "00001024" && fecha === "2026-09-08"
      ? { dni, fecha, sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false }
      : undefined;
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: "operaciones-1", rol: "administrador" }),
    });
    const plan = await casosDeUso.obtenerOCrear("2026-09-07", "tiendas");

    await expect(casosDeUso.copiarSemanaAnterior(plan.id)).rejects.toThrow("El horario semanal ya fue publicado y no se puede editar desde el borrador.");
    expect((await casosDeUso.obtenerOCrear("2026-09-07", "tiendas")).celdas).toEqual([]);
  });
});
