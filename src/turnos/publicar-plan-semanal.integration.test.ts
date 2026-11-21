import { dniDePrueba } from "../colaboradores/dni-de-prueba";
import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { eliminarRelacionesDePrueba, registrarRelacionConfirmadaDePrueba } from "@/relaciones-laborales/relacion-de-prueba";

import { publicarPlanSemanal } from "./publicar-plan-semanal";
import { RepositorioPostgresDeTurnos } from "./repositorio-postgres";
import { diasDeLaSemana, inicioDeSemana } from "./semana";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// Cubre, contra PostgreSQL real, que una publicación de varios colaboradores seleccionados
// es atómica: si uno de ellos ya no puede publicarse (p. ej. otra persona lo publicó
// concurrentemente entre que se armó la selección y que se confirmó), no queda publicado
// NINGÚN colaborador de la selección, ni siquiera los que sí eran válidos.
describe.skipIf(!databaseUrl)("publicarPlanSemanal (selección, integración PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeTurnos(db);
  const grupo = `Grupo publicacion ${randomUUID()}`;
  const sede = `Sede publicacion ${randomUUID()}`;
  const huIdValido = dniDePrueba();
  const huIdConflicto = dniDePrueba();
  const semana = inicioDeSemana("2032-03-01");
  const dias = diasDeLaSemana(semana);
  const cuentaId = randomUUID();
  const actor = { id: cuentaId, rol: "administrador" as const };

  afterAll(async () => {
    const planes = await db.select({ id: schema.planesSemanalesEnBorrador.id }).from(schema.planesSemanalesEnBorrador)
      .where(and(eq(schema.planesSemanalesEnBorrador.semana, semana), eq(schema.planesSemanalesEnBorrador.equipo, grupo)));
    if (planes.length) await db.delete(schema.celdasDePlanesSemanalesEnBorrador).where(inArray(schema.celdasDePlanesSemanalesEnBorrador.planId, planes.map(({ id }) => id)));
    await db.delete(schema.planesSemanalesEnBorrador).where(and(eq(schema.planesSemanalesEnBorrador.semana, semana), eq(schema.planesSemanalesEnBorrador.equipo, grupo)));

    const publicados = await db.select({ id: schema.turnosPublicados.id }).from(schema.turnosPublicados)
      .where(and(inArray(schema.turnosPublicados.dni, [huIdValido, huIdConflicto]), inArray(schema.turnosPublicados.fecha, dias)));
    if (publicados.length) await db.delete(schema.historialDeTurnosPublicados).where(inArray(schema.historialDeTurnosPublicados.turnoPublicadoId, publicados.map(({ id }) => id)));
    await db.delete(schema.turnosPublicados).where(and(inArray(schema.turnosPublicados.dni, [huIdValido, huIdConflicto]), inArray(schema.turnosPublicados.fecha, dias)));
    await db.delete(schema.asistenciasEsperadas).where(and(inArray(schema.asistenciasEsperadas.dni, [huIdValido, huIdConflicto]), inArray(schema.asistenciasEsperadas.fecha, dias)));

    await eliminarRelacionesDePrueba(db, [huIdValido, huIdConflicto]);
    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.dni, [huIdValido, huIdConflicto]));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.inicio, dias[0]));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await pool.end();
  });

  it("no publica a nadie de la selección si uno de los seleccionados ya fue publicado concurrentemente", async () => {
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.sedes).values({ nombre: sede, grupo, activa: true });
    await db.insert(schema.colaboradores).values([
      { dni: huIdValido, nombre: "Colaborador válido", sede, grupo, activo: true },
      { dni: huIdConflicto, nombre: "Colaborador en conflicto", sede, grupo, activo: true },
    ]);
    await registrarRelacionConfirmadaDePrueba(db, huIdValido);
    await registrarRelacionConfirmadaDePrueba(db, huIdConflicto);
    await db.insert(schema.periodosPlanilla).values({ inicio: dias[0], fin: dias[6], estado: "abierto" });
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `publicacion-${cuentaId}`, hashContrasena: "prueba", rol: "administrador" });

    const plan = await repositorio.obtenerOCrear(semana, grupo);
    const jornada = (dni: string, fecha: string) => ({
      planId: plan.id, dni, fecha, sede, modeloHorarioId: null,
      entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null,
    });
    await repositorio.guardarCeldas(dias.flatMap((fecha) => [jornada(huIdValido, fecha), jornada(huIdConflicto, fecha)]));

    // Simula que, entre que se completó la fila y se confirmó la publicación, otra persona
    // ya publicó el primer día de huIdConflicto por otra vía (p. ej. otra pestaña).
    await repositorio.publicarEnLote([{ dni: huIdConflicto, fecha: dias[0], sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false }]);

    const resultado = await publicarPlanSemanal(repositorio, actor, plan.id, [huIdValido, huIdConflicto]);

    expect(resultado.publicados).toBe(0);
    expect(resultado.errores).toContainEqual(expect.objectContaining({
      dni: huIdConflicto, fecha: dias[0], mensaje: "Ya existe un horario semanal publicado para este colaborador y fecha.",
    }));
    // Ninguno de los días del colaborador válido quedó publicado: la falla de uno solo
    // en la selección deja intacta toda la selección, no solo al que falló.
    for (const fecha of dias) {
      await expect(repositorio.buscarPublicado(huIdValido, fecha)).resolves.toBeUndefined();
    }
    // El único publicado sigue siendo el que ya existía antes de intentar la publicación seleccionada.
    for (const fecha of dias.slice(1)) {
      await expect(repositorio.buscarPublicado(huIdConflicto, fecha)).resolves.toBeUndefined();
    }
    await expect(repositorio.buscarPublicado(huIdConflicto, dias[0])).resolves.toBeDefined();
  });
});

// P-A (con republicar.integration) y P-C: la transacción de publicar acepta fechas sin período, rechaza las de un período
// cerrado sin dejar ninguna fila y se coordina con el cierre (contrato C2/C3; diseno-software §Horarios y §Consistencia).
describe.skipIf(!databaseUrl)("publicarEnLote: fechas sin período y períodos cerrados (integración PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeTurnos(db);
  const grupo = `Grupo fechas ${randomUUID()}`;
  const sede = `Sede fechas ${randomUUID()}`;
  const dni = dniDePrueba();
  const dias = diasDeLaSemana(inicioDeSemana("2036-03-03"));
  const cuentaId = randomUUID();
  const actor = { id: cuentaId, rol: "administrador" as const };
  const periodosCreados: string[] = [];

  const semanaCompleta = () => dias.map((fecha, indice) => indice === 6
    ? { dni, fecha, sede: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "descanso" as const }
    : { dni, fecha, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false });

  async function crearPeriodo(inicio: string, fin: string, estado: "abierto" | "cerrado") {
    const [periodo] = await db.insert(schema.periodosPlanilla).values({ inicio, fin, estado }).returning({ id: schema.periodosPlanilla.id });
    periodosCreados.push(periodo.id);
    return periodo.id;
  }

  async function limpiar() {
    const turnos = await db.select({ id: schema.turnosPublicados.id }).from(schema.turnosPublicados)
      .where(and(eq(schema.turnosPublicados.dni, dni), inArray(schema.turnosPublicados.fecha, dias)));
    if (turnos.length) await db.delete(schema.historialDeTurnosPublicados).where(inArray(schema.historialDeTurnosPublicados.turnoPublicadoId, turnos.map(({ id }) => id)));
    await db.delete(schema.turnosPublicados).where(and(eq(schema.turnosPublicados.dni, dni), inArray(schema.turnosPublicados.fecha, dias)));
    await db.delete(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.dni, dni), inArray(schema.asistenciasEsperadas.fecha, dias)));
    if (periodosCreados.length) await db.delete(schema.periodosPlanilla).where(inArray(schema.periodosPlanilla.id, periodosCreados.splice(0)));
  }

  async function contarFilas() {
    const turnos = await db.select({ id: schema.turnosPublicados.id }).from(schema.turnosPublicados)
      .where(and(eq(schema.turnosPublicados.dni, dni), inArray(schema.turnosPublicados.fecha, dias)));
    const historial = turnos.length
      ? await db.select({ motivo: schema.historialDeTurnosPublicados.motivo }).from(schema.historialDeTurnosPublicados).where(inArray(schema.historialDeTurnosPublicados.turnoPublicadoId, turnos.map(({ id }) => id)))
      : [];
    const asistencias = await db.select({ estado: schema.asistenciasEsperadas.estado }).from(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.dni, dni), inArray(schema.asistenciasEsperadas.fecha, dias)));
    return { turnos: turnos.length, historial, asistencias };
  }

  beforeAll(async () => {
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.sedes).values({ nombre: sede, grupo, activa: true });
    await db.insert(schema.colaboradores).values({ dni, nombre: "Colaborador fechas", sede, grupo, activo: true });
    await registrarRelacionConfirmadaDePrueba(db, dni);
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `fechas-${cuentaId}`, hashContrasena: "prueba", rol: "administrador" });
  });
  afterEach(limpiar);
  afterAll(async () => {
    await limpiar();
    await eliminarRelacionesDePrueba(db, [dni]);
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await pool.end();
  });

  it.each([
    { fila: "P1 una semana sin ningún período se persiste completa", cerrado: undefined },
    { fila: "P2 un día en período cerrado rechaza la semana y no deja ninguna fila", cerrado: 3 },
  ])("P-A · $fila", async ({ cerrado }) => {
    if (cerrado !== undefined) await crearPeriodo(dias[cerrado], dias[cerrado], "cerrado");

    const publicacion = repositorio.publicarEnLote(semanaCompleta(), actor);

    if (cerrado !== undefined) {
      await expect(publicacion).rejects.toMatchObject({ name: "FechasCerradasError", fechas: [dias[cerrado]] });
      await expect(contarFilas()).resolves.toEqual({ turnos: 0, historial: [], asistencias: [] });
      return;
    }
    await publicacion;
    for (const fecha of dias) await expect(repositorio.buscarPublicado(dni, fecha)).resolves.toMatchObject({ dni, fecha });
    const filas = await contarFilas();
    expect(filas.turnos).toBe(7);
    expect(filas.historial).toEqual(Array.from({ length: 7 }, () => ({ motivo: "Publicación inicial" })));
    expect(filas.asistencias).toEqual(Array.from({ length: 6 }, () => ({ estado: "pendiente" })));
  });

  it("P-C · un cierre confirmado por otra transacción mientras se publica hace que la publicación espere y se rechace", async () => {
    const periodoId = await crearPeriodo(dias[0], dias[6], "abierto");
    const cierre = await pool.connect();
    let confirmado = false;
    try {
      await cierre.query("begin");
      await cierre.query("select id from periodos_planilla order by id for update");
      await cierre.query("update periodos_planilla set estado = 'cerrado' where id = $1", [periodoId]);

      const publicacion = repositorio.publicarEnLote(semanaCompleta(), actor);
      publicacion.catch(() => undefined);
      const mientrasCierraElPeriodo = await Promise.race([
        publicacion.then(() => "terminó", () => "terminó"),
        new Promise((resolver) => setTimeout(() => resolver("espera"), 500)),
      ]);
      expect(mientrasCierraElPeriodo).toBe("espera");

      await cierre.query("commit");
      confirmado = true;
      await expect(publicacion).rejects.toMatchObject({ name: "FechasCerradasError", fechas: dias });
      await expect(contarFilas()).resolves.toEqual({ turnos: 0, historial: [], asistencias: [] });
    } finally {
      if (!confirmado) await cierre.query("rollback");
      cierre.release();
    }
  });
});
