import { dniDePrueba } from "../colaboradores/dni-de-prueba";
import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { estadoDeCelda } from "@/app/turnos/estado-de-celda";
import * as schema from "@/db/schema";
import { eliminarRelacionesDePrueba, registrarRelacionConfirmadaDePrueba } from "@/relaciones-laborales/relacion-de-prueba";

import { RepositorioPostgresDeTurnos } from "./repositorio-postgres";
import { diasDeLaSemana, inicioDeSemana } from "./semana";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("RepositorioPostgresDeTurnos", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeTurnos(db);
  const dni = dniDePrueba();
  const sede = `Sede turnos ${randomUUID()}`;
  const fecha = "2030-09-02";
  const fechaParaAtomicidad = "2030-09-03";
  const semanaDePlan = "2030-09-02";
  const fechasDeCorreccion = Array.from({ length: 7 }, (_, indice) => new Date(Date.UTC(2030, 8, 10 + indice)).toISOString().slice(0, 10));
  const semanaProcesada = "2030-09-17";
  const fechasProcesadas = Array.from({ length: 7 }, (_, indice) => new Date(Date.UTC(2030, 8, 17 + indice)).toISOString().slice(0, 10));
  const cuentaId = randomUUID();

  beforeAll(async () => {
    await db.insert(schema.sedes).values({ nombre: sede, grupo: "Tiendas", activa: true });
    await db.insert(schema.colaboradores).values({
      dni,
      nombre: "Ana Rojas",
      sede,
      grupo: "Tiendas",
      activo: true,
    });
    await registrarRelacionConfirmadaDePrueba(db, dni);
    await db.insert(schema.periodosPlanilla).values({
      inicio: "2030-08-26",
      fin: "2030-09-25",
      estado: "abierto",
    });
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `turnos-${cuentaId}`, hashContrasena: "prueba", rol: "administrador" });
  });

  afterAll(async () => {
    await db.delete(schema.horariosSemanalesProcesados).where(and(eq(schema.horariosSemanalesProcesados.dni, dni), eq(schema.horariosSemanalesProcesados.semana, semanaProcesada)));
    const turnos = await db
      .select({ id: schema.turnosPublicados.id })
      .from(schema.turnosPublicados)
      .where(and(eq(schema.turnosPublicados.dni, dni), inArray(schema.turnosPublicados.fecha, [fecha, fechaParaAtomicidad, ...fechasDeCorreccion, ...fechasProcesadas])));

    const asistencias = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.dni, dni), inArray(schema.asistenciasEsperadas.fecha, [fecha, fechaParaAtomicidad, ...fechasDeCorreccion, ...fechasProcesadas])));
    if (asistencias.length) {
      await db.delete(schema.tardanzas).where(inArray(schema.tardanzas.asistenciaId, asistencias.map(({ id }) => id)));
      await db.delete(schema.horasExtra).where(inArray(schema.horasExtra.asistenciaId, asistencias.map(({ id }) => id)));
    }

    await db
      .delete(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.dni, dni), inArray(schema.asistenciasEsperadas.fecha, [fecha, fechaParaAtomicidad, ...fechasDeCorreccion, ...fechasProcesadas])));
    if (turnos.length) {
      await db
        .delete(schema.historialDeTurnosPublicados)
        .where(inArray(schema.historialDeTurnosPublicados.turnoPublicadoId, turnos.map(({ id }) => id)));
    }
    await db
      .delete(schema.turnosPublicados)
      .where(and(eq(schema.turnosPublicados.dni, dni), inArray(schema.turnosPublicados.fecha, [fecha, fechaParaAtomicidad, ...fechasDeCorreccion, ...fechasProcesadas])));
    await db
      .delete(schema.periodosPlanilla)
      .where(and(eq(schema.periodosPlanilla.inicio, "2030-08-26"), eq(schema.periodosPlanilla.fin, "2030-09-25")));
    const planes = await db.select({ id: schema.planesSemanalesEnBorrador.id }).from(schema.planesSemanalesEnBorrador)
      .where(and(eq(schema.planesSemanalesEnBorrador.semana, semanaDePlan), eq(schema.planesSemanalesEnBorrador.equipo, "tiendas")));
    if (planes.length) await db.delete(schema.celdasDePlanesSemanalesEnBorrador).where(inArray(schema.celdasDePlanesSemanalesEnBorrador.planId, planes.map(({ id }) => id)));
    await db.delete(schema.planesSemanalesEnBorrador).where(and(eq(schema.planesSemanalesEnBorrador.semana, semanaDePlan), eq(schema.planesSemanalesEnBorrador.equipo, "tiendas")));
    await eliminarRelacionesDePrueba(db, [dni]);
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await pool.end();
  });

  it("guarda el turno, su historial y la asistencia esperada", async () => {
    await repositorio.publicar({
      dni,
      fecha,
      sede,
      entradaProgramada: "09:00",
      salidaProgramada: "18:00",
      descanso: false,
    });

    await expect(repositorio.buscarPublicado(dni, fecha)).resolves.toMatchObject({
      dni,
      fecha,
      sede,
    });
    await expect(
      db
        .select({ id: schema.historialDeTurnosPublicados.id })
        .from(schema.historialDeTurnosPublicados)
        .innerJoin(
          schema.turnosPublicados,
          eq(schema.historialDeTurnosPublicados.turnoPublicadoId, schema.turnosPublicados.id),
        )
        .where(and(eq(schema.turnosPublicados.dni, dni), eq(schema.turnosPublicados.fecha, fecha))),
    ).resolves.toHaveLength(1);
    await expect(
      db
        .select({ estado: schema.asistenciasEsperadas.estado })
        .from(schema.asistenciasEsperadas)
        .where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, fecha))),
    ).resolves.toEqual([{ estado: "pendiente" }]);
  });

  it("revierte toda la publicación en lote cuando un horario semanal está duplicado", async () => {
    const turno = { dni, fecha: fechaParaAtomicidad, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false };

    await expect(repositorio.publicarEnLote([turno, turno])).rejects.toThrow();
    await expect(repositorio.buscarPublicado(dni, fechaParaAtomicidad)).resolves.toBeUndefined();
  });

  it("crea y lee un plan semanal en borrador", async () => {
    await expect(repositorio.obtenerOCrear(semanaDePlan, "tiendas")).resolves.toMatchObject({ semana: semanaDePlan, equipo: "tiendas", celdas: [] });
  });

  it("republica los siete días, conserva la auditoría y reinicia cálculos pendientes", async () => {
    const actor = { id: cuentaId, rol: "administrador" as const };
    const originales = fechasDeCorreccion.map((fechaDeCorreccion) => ({ dni, fecha: fechaDeCorreccion, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false }));
    await repositorio.publicarEnLote(originales, actor);
    const [asistencia] = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, fechasDeCorreccion[0])));
    await db.update(schema.asistenciasEsperadas).set({ entradaPropuesta: "09:05", salidaPropuesta: "18:10" }).where(eq(schema.asistenciasEsperadas.id, asistencia.id));
    await db.insert(schema.tardanzas).values({ asistenciaId: asistencia.id, minutosDeTardanza: 5, minutosPenalizados: 0, politicaVersion: 1 });
    await db.insert(schema.horasExtra).values({ asistenciaId: asistencia.id, minutosAl25: 10, minutosAl35: 0, estado: "pendiente" });

    await repositorio.reemplazarSemanaPublicada(originales.map((turno, indice) => indice === 0 ? { ...turno, entradaProgramada: "10:00", salidaProgramada: "19:00" } : turno), actor, "Corrige entrada pactada");

    await expect(db.select({ estado: schema.asistenciasEsperadas.estado, entrada: schema.asistenciasEsperadas.entradaPropuesta, salida: schema.asistenciasEsperadas.salidaPropuesta }).from(schema.asistenciasEsperadas)
      .where(eq(schema.asistenciasEsperadas.id, asistencia.id))).resolves.toEqual([{ estado: "pendiente", entrada: null, salida: null }]);
    await expect(db.select().from(schema.tardanzas).where(eq(schema.tardanzas.asistenciaId, asistencia.id))).resolves.toEqual([]);
    await expect(db.select().from(schema.horasExtra).where(eq(schema.horasExtra.asistenciaId, asistencia.id))).resolves.toEqual([]);
    await expect(db.select({ horario: schema.historialDeTurnosPublicados.horario, responsableId: schema.historialDeTurnosPublicados.responsableId, motivo: schema.historialDeTurnosPublicados.motivo }).from(schema.historialDeTurnosPublicados)
      .innerJoin(schema.turnosPublicados, eq(schema.historialDeTurnosPublicados.turnoPublicadoId, schema.turnosPublicados.id))
      .where(and(eq(schema.turnosPublicados.dni, dni), eq(schema.turnosPublicados.fecha, fechasDeCorreccion[0])))).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ responsableId: cuentaId, motivo: "Corrige entrada pactada", horario: expect.objectContaining({ entradaProgramada: "10:00" }) }),
    ]));
  });

  it("persiste el procesamiento semanal con responsable y bloquea la edición posterior", async () => {
    await repositorio.publicarEnLote(fechasProcesadas.map((fechaDeProcesamiento) => ({
      dni, fecha: fechaDeProcesamiento, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
    })));
    await db.update(schema.asistenciasEsperadas).set({ estado: "manual" }).where(and(
      eq(schema.asistenciasEsperadas.dni, dni), inArray(schema.asistenciasEsperadas.fecha, fechasProcesadas),
    ));

    await expect(repositorio.asistenciasLaboralesEstanProcesadas(dni, semanaProcesada)).resolves.toBe(true);
    await repositorio.registrarProcesamiento({ dni, semana: semanaProcesada, equipo: "tiendas", responsableId: cuentaId });

    await expect(repositorio.horarioSemanalEstaProcesado(dni, semanaProcesada)).resolves.toBe(true);
    await db.update(schema.colaboradores).set({ activo: false }).where(eq(schema.colaboradores.dni, dni));
    await expect(repositorio.listarColaboradoresProcesadosPorSemanaYEquipo(semanaProcesada, "tiendas"))
      .resolves.toEqual(expect.arrayContaining([expect.objectContaining({ dni })]));
    await expect(repositorio.reemplazarSemanaPublicada(
      fechasProcesadas.map((fechaDeProcesamiento) => ({ dni, fecha: fechaDeProcesamiento, sede, entradaProgramada: "10:00", salidaProgramada: "19:00", descanso: false })),
      { id: cuentaId, rol: "administrador" }, "Cambio posterior",
    )).rejects.toThrow("No se puede corregir un horario semanal que ya fue procesado.");
  });

  it("deriva el estado de celda de Horarios desde las consultas de turnos publicados y procesamientos de semana", async () => {
    const publicados = await repositorio.listarPublicadosPorColaboradoresYSemana([dni], fechasProcesadas[0], fechasProcesadas.at(-1)!);
    expect(publicados).toHaveLength(7);
    const procesados = await repositorio.listarProcesamientosDeSemana(semanaProcesada, "tiendas");
    expect(procesados).toContain(dni);

    const publicadoDelDia = publicados.find(({ fecha }) => fecha === fechasProcesadas[0])!;
    expect(estadoDeCelda(publicadoDelDia, publicadoDelDia, procesados.includes(dni))).toBe("liquidado");
    expect(estadoDeCelda(publicadoDelDia, publicadoDelDia, false)).toBe("publicado");
    expect(estadoDeCelda({ ...publicadoDelDia, salidaProgramada: "20:00" }, publicadoDelDia, false)).toBe("cambios-sin-publicar");

    const semanaSinPublicar = "2030-09-02";
    const sinPublicar = await repositorio.listarProcesamientosDeSemana(semanaSinPublicar, "tiendas");
    expect(estadoDeCelda(undefined, undefined, sinPublicar.includes(dni))).toBe("borrador-editable");
  });
});

// P-B: guardar el borrador dentro de la transacción no puede modificar una fecha de un período cerrado y deja el borrador como estaba
// (contrato C3; Diego: «fecha cerrada bloquea también guardar borrador semanal»; Q5: lo que no cambia no cuenta).
describe.skipIf(!databaseUrl)("guardar el borrador con fechas cerradas (integración PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeTurnos(db);
  const grupo = `Grupo borrador ${randomUUID()}`;
  const sede = `Sede borrador ${randomUUID()}`;
  const dniBorrador = dniDePrueba();
  const semana = inicioDeSemana("2036-05-05");
  const dias = diasDeLaSemana(semana);
  const periodosCreados: string[] = [];
  const jornada = (planId: string, fecha: string, entrada = "09:00", salida = "18:00") => ({
    planId, dni: dniBorrador, fecha, sede, entradaProgramada: entrada, salidaProgramada: salida, descanso: false,
  });

  async function limpiar() {
    const planes = await db.select({ id: schema.planesSemanalesEnBorrador.id }).from(schema.planesSemanalesEnBorrador)
      .where(and(eq(schema.planesSemanalesEnBorrador.semana, semana), eq(schema.planesSemanalesEnBorrador.equipo, grupo)));
    if (planes.length) await db.delete(schema.celdasDePlanesSemanalesEnBorrador).where(inArray(schema.celdasDePlanesSemanalesEnBorrador.planId, planes.map(({ id }) => id)));
    await db.delete(schema.planesSemanalesEnBorrador).where(and(eq(schema.planesSemanalesEnBorrador.semana, semana), eq(schema.planesSemanalesEnBorrador.equipo, grupo)));
    if (periodosCreados.length) await db.delete(schema.periodosPlanilla).where(inArray(schema.periodosPlanilla.id, periodosCreados.splice(0)));
  }

  const ordenadas = <T extends { fecha: string }>(celdas: T[]) => [...celdas].sort((a, b) => a.fecha.localeCompare(b.fecha));

  beforeAll(async () => {
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.sedes).values({ nombre: sede, grupo, activa: true });
    await db.insert(schema.colaboradores).values({ dni: dniBorrador, nombre: "Colaborador borrador", sede, grupo, activo: true });
  });
  afterEach(limpiar);
  afterAll(async () => {
    await limpiar();
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dniBorrador));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await pool.end();
  });

  it.each([
    {
      fila: "P5 reemplazar el borrador cambiando una celda del 4.º día cerrado",
      operar: (planId: string) => repositorio.reemplazarCeldasDelPlan(planId, [jornada(planId, dias[1]), jornada(planId, dias[3], "10:00", "19:00")]),
      rechaza: true,
    },
    {
      fila: "P5 reemplazar el borrador quitando la celda del 4.º día cerrado",
      operar: (planId: string) => repositorio.reemplazarCeldasDelPlan(planId, [jornada(planId, dias[1])]),
      rechaza: true,
    },
    {
      fila: "P5 guardar celdas cambiando el 4.º día cerrado",
      operar: (planId: string) => repositorio.guardarCeldas([jornada(planId, dias[3], "10:00", "19:00")]),
      rechaza: true,
    },
    {
      fila: "P5 reemplazar el borrador con el 4.º día cerrado sin cambios y un cambio en el 2.º",
      operar: (planId: string) => repositorio.reemplazarCeldasDelPlan(planId, [jornada(planId, dias[1], "10:00", "19:00"), jornada(planId, dias[3])]),
      rechaza: false,
    },
  ])("P-B · $fila", async ({ operar, rechaza }) => {
    const plan = await repositorio.obtenerOCrear(semana, grupo);
    await repositorio.guardarCeldas([jornada(plan.id, dias[1]), jornada(plan.id, dias[3])]);
    const [periodo] = await db.insert(schema.periodosPlanilla).values({ inicio: dias[3], fin: dias[3], estado: "cerrado" }).returning({ id: schema.periodosPlanilla.id });
    periodosCreados.push(periodo.id);
    const antes = (await repositorio.buscarPorId(plan.id))!;

    const operacion = operar(plan.id);

    if (rechaza) {
      await expect(operacion).rejects.toMatchObject({ name: "FechasCerradasError", fechas: [dias[3]] });
      const despues = (await repositorio.buscarPorId(plan.id))!;
      expect(ordenadas(despues.celdas)).toEqual(ordenadas(antes.celdas));
      expect(despues.actualizadoEn).toEqual(antes.actualizadoEn);
      return;
    }
    await operacion;
    const despues = (await repositorio.buscarPorId(plan.id))!;
    expect(ordenadas(despues.celdas).map(({ fecha, entradaProgramada }) => ({ fecha, entradaProgramada }))).toEqual([
      { fecha: dias[1], entradaProgramada: "10:00" }, { fecha: dias[3], entradaProgramada: "09:00" },
    ]);
  });

  // S-01 (revisión 1): un día «Sin relación laboral» nuevo en fecha cerrada no cuenta como modificado; una celda de trabajo sí.
  it.each([
    { fila: "P6 reemplazar el borrador agregando el 4.º día cerrado «Sin relación laboral» y cambiando el 2.º", usar: "reemplazar" as const },
    { fila: "P6 guardar celdas agregando el 4.º día cerrado «Sin relación laboral» y cambiando el 2.º", usar: "guardar" as const },
  ])("P-B · $fila", async ({ usar }) => {
    const plan = await repositorio.obtenerOCrear(semana, grupo);
    await repositorio.guardarCeldas([jornada(plan.id, dias[1])]);
    const [periodo] = await db.insert(schema.periodosPlanilla).values({ inicio: dias[3], fin: dias[3], estado: "cerrado" }).returning({ id: schema.periodosPlanilla.id });
    periodosCreados.push(periodo.id);
    const sinRelacion = { planId: plan.id, dni: dniBorrador, fecha: dias[3], sede: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "sin_relacion_laboral" as const };
    const cambio = jornada(plan.id, dias[1], "10:00", "19:00");

    if (usar === "reemplazar") await repositorio.reemplazarCeldasDelPlan(plan.id, [cambio, sinRelacion]);
    else await repositorio.guardarCeldas([cambio, sinRelacion]);

    const despues = (await repositorio.buscarPorId(plan.id))!;
    expect(ordenadas(despues.celdas).map(({ fecha, entradaProgramada, motivoNoAsistencia }) => ({ fecha, entradaProgramada, motivoNoAsistencia }))).toEqual([
      { fecha: dias[1], entradaProgramada: "10:00", motivoNoAsistencia: null },
      { fecha: dias[3], entradaProgramada: null, motivoNoAsistencia: "sin_relacion_laboral" },
    ]);
  });

  it("P-B · P6 reemplazar el borrador agregando una celda de trabajo en el 4.º día cerrado sigue rechazando", async () => {
    const plan = await repositorio.obtenerOCrear(semana, grupo);
    await repositorio.guardarCeldas([jornada(plan.id, dias[1])]);
    const [periodo] = await db.insert(schema.periodosPlanilla).values({ inicio: dias[3], fin: dias[3], estado: "cerrado" }).returning({ id: schema.periodosPlanilla.id });
    periodosCreados.push(periodo.id);
    const antes = (await repositorio.buscarPorId(plan.id))!;

    await expect(repositorio.reemplazarCeldasDelPlan(plan.id, [jornada(plan.id, dias[1]), jornada(plan.id, dias[3])]))
      .rejects.toMatchObject({ name: "FechasCerradasError", fechas: [dias[3]] });
    expect(ordenadas((await repositorio.buscarPorId(plan.id))!.celdas)).toEqual(ordenadas(antes.celdas));
  });
});
