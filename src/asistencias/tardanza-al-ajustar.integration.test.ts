import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import type { Actor } from "@/autenticacion/permisos";
import { calcularTardanza, configurarPoliticaDePenalizacionPorTardanzas } from "@/tardanzas/politica-de-penalizacion";
import { RepositorioPostgresDeTardanzas } from "@/tardanzas/repositorio-postgres";

import { dniDePrueba } from "../colaboradores/dni-de-prueba";
import { calcularMinutosTrabajados } from "./confirmar-y-ajustar-asistencia";
import { RepositorioPostgresDeAsistencias } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

const [dia1, dia2, dia3] = ["2038-03-29", "2038-03-30", "2038-03-31"];

describe.skipIf(!databaseUrl)("RepositorioPostgresDeAsistencias · tardanza al ajustar una asistencia", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeAsistencias(db);
  const cuentaId = randomUUID();
  const sede = `Sede tardanza ${cuentaId.slice(0, 8)}`;
  const colaboradores: string[] = [];
  const periodos: string[] = [];

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `tardanza-${cuentaId}`, hashContrasena: "prueba", rol: "finanzas" });
    // Tolerancia de 10 min; la segunda tardanza del período penaliza 1 hora.
    await db.insert(schema.politicasDePenalizacionPorTardanzas).values({
      sede, toleranciaEnMinutos: 10, tardanzasAcumuladas: 2, horasPenalizadas: 1, version: 7, vigenteDesde: "2000-01-01", configuradaPorId: cuentaId,
    });
    await db.insert(schema.politicasTardanzasGrupo).values({
      grupo: "Tiendas", toleranciaEnMinutos: 10, tardanzasAcumuladas: 2, horasPenalizadas: 1, configuradaPorId: cuentaId, configuradaEn: new Date(),
    }).onConflictDoUpdate({ target: schema.politicasTardanzasGrupo.grupo, set: { toleranciaEnMinutos: 10, tardanzasAcumuladas: 2, horasPenalizadas: 1, conflicto: false, configuradaPorId: cuentaId, configuradaEn: new Date() } });
    const [periodo] = await db.insert(schema.periodosPlanilla).values({ inicio: "2038-03-26", fin: "2038-04-25", estado: "abierto" }).returning({ id: schema.periodosPlanilla.id });
    periodos.push(periodo.id);
  });

  afterAll(async () => {
    const asistencias = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
      .where(inArray(schema.asistenciasEsperadas.dni, colaboradores));
    const ids = asistencias.map(({ id }) => id);
    if (ids.length) {
      await db.delete(schema.horasExtra).where(inArray(schema.horasExtra.asistenciaId, ids));
      await db.delete(schema.tardanzas).where(inArray(schema.tardanzas.asistenciaId, ids));
      await db.delete(schema.ajustesDeAsistencia).where(inArray(schema.ajustesDeAsistencia.asistenciaId, ids));
    }
    await db.delete(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.dni, colaboradores));
    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.dni, colaboradores));
    await db.delete(schema.periodosPlanilla).where(inArray(schema.periodosPlanilla.id, periodos));
    await db.delete(schema.politicasDePenalizacionPorTardanzas).where(eq(schema.politicasDePenalizacionPorTardanzas.sede, sede));
    await db.delete(schema.politicasTardanzasGrupo).where(eq(schema.politicasTardanzasGrupo.grupo, "Tiendas"));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await pool.end();
  });

  async function crearColaborador(): Promise<string> {
    const dni = dniDePrueba();
    colaboradores.push(dni);
    await db.insert(schema.colaboradores).values({ dni, nombre: "Ana Tardanza", sede, grupo: "Tiendas", activo: true });
    await db.insert(schema.asistenciasEsperadas).values([dia1, dia2, dia3].map((fecha) => ({ dni, fecha, estado: "pendiente" as const })));
    return dni;
  }

  async function confirmar(dni: string, fecha: string, entrada: string): Promise<void> {
    const entradaReal = `${fecha}T${entrada}`;
    const salidaReal = `${fecha}T18:00`;
    await repositorio.confirmar({
      dni, fecha, entradaReal, salidaReal, minutosTrabajados: calcularMinutosTrabajados(entradaReal, salidaReal),
      instantaneaDeTurno: { sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false },
      confirmadoPorId: cuentaId, confirmadoEn: new Date(),
      tardanza: await calcularTardanza(repositorio, { dni, sede, fecha, entradaProgramada: "09:00", entradaReal }),
    });
  }

  async function ajustarEntrada(dni: string, fecha: string, entrada: string): Promise<void> {
    const entradaReal = `${fecha}T${entrada}`;
    const salidaReal = `${fecha}T18:00`;
    await repositorio.ajustar({ dni, fecha, entradaReal, salidaReal, motivo: "Corrección de la marca de entrada.", minutosTrabajados: calcularMinutosTrabajados(entradaReal, salidaReal) }, cuentaId);
  }

  async function tardanzas(dni: string) {
    return db.select({ fecha: schema.asistenciasEsperadas.fecha, minutos: schema.tardanzas.minutosDeTardanza, penalizados: schema.tardanzas.minutosPenalizados, politica: schema.tardanzas.politicaVersion })
      .from(schema.tardanzas).innerJoin(schema.asistenciasEsperadas, eq(schema.tardanzas.asistenciaId, schema.asistenciasEsperadas.id))
      .where(eq(schema.asistenciasEsperadas.dni, dni)).orderBy(schema.asistenciasEsperadas.fecha);
  }

  it("elimina la tardanza cuando la entrada corregida queda dentro de la tolerancia", async () => {
    const dni = await crearColaborador();
    await confirmar(dni, dia1, "09:30");
    expect(await tardanzas(dni)).toEqual([{ fecha: dia1, minutos: 30, penalizados: 0, politica: 1 }]);

    await ajustarEntrada(dni, dia1, "09:10");

    expect(await tardanzas(dni)).toEqual([]);
  });

  it("registra la tardanza cuando la entrada corregida supera la tolerancia", async () => {
    const dni = await crearColaborador();
    await confirmar(dni, dia1, "09:00");
    expect(await tardanzas(dni)).toEqual([]);

    await ajustarEntrada(dni, dia1, "09:20");

    expect(await tardanzas(dni)).toEqual([{ fecha: dia1, minutos: 20, penalizados: 0, politica: 1 }]);
  });

  it("actualiza los minutos de una tardanza existente con la entrada corregida", async () => {
    const dni = await crearColaborador();
    await confirmar(dni, dia1, "09:30");

    await ajustarEntrada(dni, dia1, "09:45");

    expect(await tardanzas(dni)).toEqual([{ fecha: dia1, minutos: 45, penalizados: 0, politica: 1 }]);
  });

  it("renumera las horas penalizadas del período cuando un ajuste crea o elimina una tardanza", async () => {
    const dni = await crearColaborador();
    await confirmar(dni, dia1, "09:30");
    await confirmar(dni, dia2, "09:30");
    await confirmar(dni, dia3, "09:00");
    expect(await tardanzas(dni)).toEqual([
      { fecha: dia1, minutos: 30, penalizados: 0, politica: 1 },
      { fecha: dia2, minutos: 30, penalizados: 60, politica: 1 },
    ]);

    // La primera tardanza deja de serlo: la del día 2 pasa a ser la primera y ya no penaliza.
    await ajustarEntrada(dni, dia1, "09:00");
    expect(await tardanzas(dni)).toEqual([{ fecha: dia2, minutos: 30, penalizados: 0, politica: 1 }]);

    // La tardanza del día 3 pasa a ser la segunda del período y penaliza una hora.
    await ajustarEntrada(dni, dia3, "09:25");
    expect(await tardanzas(dni)).toEqual([
      { fecha: dia2, minutos: 30, penalizados: 0, politica: 1 },
      { fecha: dia3, minutos: 25, penalizados: 60, politica: 1 },
    ]);
  });

  it("no renumera las penalizaciones de un período cerrado", async () => {
    const dni = await crearColaborador();
    await confirmar(dni, dia1, "09:30");
    await confirmar(dni, dia2, "09:30");
    const [cerrado] = await db.update(schema.periodosPlanilla).set({ estado: "cerrado", cerradoPorId: cuentaId, cerradoEn: new Date() })
      .where(eq(schema.periodosPlanilla.id, periodos[0])).returning({ id: schema.periodosPlanilla.id });
    try {
      await ajustarEntrada(dni, dia1, "09:00");

      expect(await tardanzas(dni)).toEqual([{ fecha: dia2, minutos: 30, penalizados: 60, politica: 1 }]);
    } finally {
      await db.update(schema.periodosPlanilla).set({ estado: "abierto", cerradoPorId: null, cerradoEn: null }).where(eq(schema.periodosPlanilla.id, cerrado.id));
    }
  });

  it("G10 recalcula solo resultados abiertos afectados al cambiar la política del grupo", async () => {
    const dni = await crearColaborador();
    const cuentaAdminId = randomUUID();
    const grupoAjeno = `Grupo G10 ajeno ${randomUUID()}`;
    const periodoSinCambio = randomUUID();
    const periodoCerrado = randomUUID();
    const fechaSinCambio = "2038-05-30";
    const fechaCerrada = "2038-04-29";
    const configurador: Actor = { id: cuentaAdminId, rol: "administrador" };
    const repoPoliticas = new RepositorioPostgresDeTardanzas(db);
    await db.insert(schema.cuentasLocales).values({ id: cuentaAdminId, nombreUsuario: `admin-g10-${cuentaAdminId}`, hashContrasena: "prueba", rol: "administrador" });
    await db.insert(schema.grupos).values({ nombre: grupoAjeno, gestionaAsistencia: true });
    await db.insert(schema.sedes).values({ nombre: sede, activa: true, grupo: "Tiendas" });
    await db.insert(schema.periodosPlanilla).values([
      { id: periodoSinCambio, inicio: "2038-05-26", fin: "2038-06-25", estado: "abierto" },
      { id: periodoCerrado, inicio: "2038-04-26", fin: "2038-05-25", estado: "cerrado", cerradoPorId: cuentaId, cerradoEn: new Date() },
    ]);
    const [abierta] = await db.update(schema.asistenciasEsperadas).set({
      estado: "confirmada", entradaReal: `${dia1}T09:15`, salidaReal: `${dia1}T18:00`, minutosTrabajados: 525,
      instantaneaDeTurno: { sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false },
      confirmadoPorId: cuentaId, confirmadoEn: new Date(),
    }).where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, dia1))).returning({ id: schema.asistenciasEsperadas.id });
    const [sinCambio] = await db.insert(schema.asistenciasEsperadas).values({
      dni, fecha: fechaSinCambio, estado: "confirmada", entradaReal: `${fechaSinCambio}T09:00`, salidaReal: `${fechaSinCambio}T18:00`, minutosTrabajados: 540,
      instantaneaDeTurno: { sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false }, confirmadoPorId: cuentaId, confirmadoEn: new Date(),
    }).returning({ id: schema.asistenciasEsperadas.id });
    const [cerrada] = await db.insert(schema.asistenciasEsperadas).values({
      dni, fecha: fechaCerrada, estado: "confirmada", entradaReal: `${fechaCerrada}T09:15`, salidaReal: `${fechaCerrada}T18:00`, minutosTrabajados: 525,
      instantaneaDeTurno: { sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false }, confirmadoPorId: cuentaId, confirmadoEn: new Date(),
    }).returning({ id: schema.asistenciasEsperadas.id });
    await db.insert(schema.tardanzas).values([
      { asistenciaId: abierta.id, minutosDeTardanza: 15, minutosPenalizados: 0, politicaVersion: 7 },
      { asistenciaId: cerrada.id, minutosDeTardanza: 15, minutosPenalizados: 0, politicaVersion: 7 },
    ]);
    await db.insert(schema.aprobacionesDeAsistencia).values([
      { periodoId: periodos[0], grupo: "Tiendas", aprobadaPorId: cuentaId, aprobadaEn: new Date() },
      { periodoId: periodos[0], grupo: grupoAjeno, aprobadaPorId: cuentaId, aprobadaEn: new Date() },
      { periodoId: periodoSinCambio, grupo: "Tiendas", aprobadaPorId: cuentaId, aprobadaEn: new Date() },
      { periodoId: periodoCerrado, grupo: "Tiendas", aprobadaPorId: cuentaId, aprobadaEn: new Date() },
    ]);

    try {
      await configurarPoliticaDePenalizacionPorTardanzas(repoPoliticas, configurador, {
        grupo: "Tiendas", toleranciaEnMinutos: 10, tardanzasAcumuladas: 2, horasPenalizadas: 1,
      });
      await configurarPoliticaDePenalizacionPorTardanzas(repoPoliticas, configurador, {
        grupo: "Tiendas", toleranciaEnMinutos: 20, tardanzasAcumuladas: 2, horasPenalizadas: 1,
      });
      await expect(tardanzas(dni)).resolves.toEqual([{ fecha: fechaCerrada, minutos: 15, penalizados: 0, politica: 7 }]);
      const aprobaciones = await db.select().from(schema.aprobacionesDeAsistencia).where(inArray(schema.aprobacionesDeAsistencia.periodoId, [periodos[0], periodoSinCambio, periodoCerrado]));
      expect(aprobaciones.filter(({ periodoId, grupo }) => periodoId === periodos[0] && grupo === "Tiendas")[0].invalidadaEn).toBeInstanceOf(Date);
      expect(aprobaciones.filter(({ periodoId, grupo }) => periodoId === periodos[0] && grupo === grupoAjeno)[0].invalidadaEn).toBeNull();
      expect(aprobaciones.filter(({ periodoId }) => periodoId === periodoSinCambio)[0].invalidadaEn).toBeNull();
      expect(aprobaciones.filter(({ periodoId }) => periodoId === periodoCerrado)[0].invalidadaEn).toBeNull();

      await db.insert(schema.aprobacionesDeAsistencia).values({ periodoId: periodos[0], grupo: "Tiendas", aprobadaPorId: cuentaId, aprobadaEn: new Date() });
      await configurarPoliticaDePenalizacionPorTardanzas(repoPoliticas, configurador, {
        grupo: "Tiendas", toleranciaEnMinutos: 10, tardanzasAcumuladas: 2, horasPenalizadas: 1,
      });
      await expect(tardanzas(dni)).resolves.toContainEqual({ fecha: dia1, minutos: 15, penalizados: 0, politica: 1 });
      await db.insert(schema.aprobacionesDeAsistencia).values({ periodoId: periodos[0], grupo: "Tiendas", aprobadaPorId: cuentaId, aprobadaEn: new Date() });
      await configurarPoliticaDePenalizacionPorTardanzas(repoPoliticas, configurador, {
        grupo: "Tiendas", toleranciaEnMinutos: 11, tardanzasAcumuladas: 2, horasPenalizadas: 1,
      });
      const finales = await db.select().from(schema.aprobacionesDeAsistencia).where(eq(schema.aprobacionesDeAsistencia.periodoId, periodos[0]));
      expect(finales.filter(({ grupo }) => grupo === "Tiendas").at(-1)?.invalidadaEn).toBeNull();
    } finally {
      const ids = [abierta.id, sinCambio.id, cerrada.id];
      await db.delete(schema.tardanzas).where(inArray(schema.tardanzas.asistenciaId, ids));
      await db.delete(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.id, ids));
      await db.delete(schema.aprobacionesDeAsistencia).where(inArray(schema.aprobacionesDeAsistencia.periodoId, [periodos[0], periodoSinCambio, periodoCerrado]));
      await db.delete(schema.periodosPlanilla).where(inArray(schema.periodosPlanilla.id, [periodoSinCambio, periodoCerrado]));
      await pool.query("DELETE FROM politicas_tardanzas_grupo WHERE grupo = $1", ["Tiendas"]);
      await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
      await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupoAjeno));
      await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaAdminId));
    }
  });

  it("G10 cuenta penalizaciones dentro de los límites reales del período abierto", async () => {
    const dni = await crearColaborador();
    const fechaAnterior = "2040-01-30";
    const fechaDelPeriodo = "2040-02-10";
    const periodoIrregular = randomUUID();
    const cuentaAdminId = randomUUID();
    await db.insert(schema.cuentasLocales).values({ id: cuentaAdminId, nombreUsuario: `admin-g10-periodo-${cuentaAdminId}`, hashContrasena: "prueba", rol: "administrador" });
    await pool.query("DELETE FROM politicas_tardanzas_grupo WHERE grupo = $1", ["Tiendas"]);
    await db.insert(schema.periodosPlanilla).values({ id: periodoIrregular, inicio: "2040-02-01", fin: "2040-02-28", estado: "abierto" });
    const [anterior] = await db.insert(schema.asistenciasEsperadas).values({
      dni, fecha: fechaAnterior, estado: "confirmada", entradaReal: `${fechaAnterior}T09:15`, salidaReal: `${fechaAnterior}T18:00`, minutosTrabajados: 525,
      instantaneaDeTurno: { sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false }, confirmadoPorId: cuentaId, confirmadoEn: new Date(),
    }).returning({ id: schema.asistenciasEsperadas.id });
    const [actual] = await db.insert(schema.asistenciasEsperadas).values({
      dni, fecha: fechaDelPeriodo, estado: "confirmada", entradaReal: `${fechaDelPeriodo}T09:15`, salidaReal: `${fechaDelPeriodo}T18:00`, minutosTrabajados: 525,
      instantaneaDeTurno: { sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false }, confirmadoPorId: cuentaId, confirmadoEn: new Date(),
    }).returning({ id: schema.asistenciasEsperadas.id });
    await db.insert(schema.tardanzas).values({ asistenciaId: anterior.id, minutosDeTardanza: 15, minutosPenalizados: 0, politicaVersion: 7 });
    await db.insert(schema.tardanzas).values({ asistenciaId: actual.id, minutosDeTardanza: 15, minutosPenalizados: 0, politicaVersion: 7 });
    try {
      await configurarPoliticaDePenalizacionPorTardanzas(new RepositorioPostgresDeTardanzas(db), { id: cuentaAdminId, rol: "administrador" }, {
        grupo: "Tiendas", toleranciaEnMinutos: 10, tardanzasAcumuladas: 2, horasPenalizadas: 1,
      });
      await expect(tardanzas(dni)).resolves.toContainEqual({ fecha: fechaDelPeriodo, minutos: 15, penalizados: 0, politica: 7 });
    } finally {
      await db.delete(schema.tardanzas).where(inArray(schema.tardanzas.asistenciaId, [anterior.id, actual.id]));
      await db.delete(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.id, [anterior.id, actual.id]));
      await db.delete(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.id, periodoIrregular));
      await pool.query("DELETE FROM politicas_tardanzas_grupo WHERE grupo = $1", ["Tiendas"]);
      await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaAdminId));
    }
  });

  it("G10 busca la política según el grupo vigente de la persona, no el grupo actual de su sede", async () => {
    const dni = await crearColaborador();
    const cuentaAdminId = randomUUID();
    const grupoDeSede = `G10 sede ${randomUUID()}`;
    const grupoDePersona = `G10 persona ${randomUUID()}`;
    const sedeActual = `G10 sede actual ${randomUUID()}`;
    await db.insert(schema.cuentasLocales).values({ id: cuentaAdminId, nombreUsuario: `admin-g10-grupo-${cuentaAdminId}`, hashContrasena: "prueba", rol: "administrador" });
    await db.insert(schema.grupos).values([{ nombre: grupoDeSede }, { nombre: grupoDePersona }]);
    await db.insert(schema.sedes).values({ nombre: sedeActual, activa: true, grupo: grupoDeSede });
    await db.update(schema.colaboradores).set({ sede: sedeActual, grupo: grupoDePersona }).where(eq(schema.colaboradores.dni, dni));
    await db.insert(schema.politicasTardanzasGrupo).values([
      { grupo: grupoDeSede, toleranciaEnMinutos: 45, tardanzasAcumuladas: 2, horasPenalizadas: 1, configuradaPorId: cuentaAdminId, configuradaEn: new Date() },
      { grupo: grupoDePersona, toleranciaEnMinutos: 10, tardanzasAcumuladas: 2, horasPenalizadas: 1, configuradaPorId: cuentaAdminId, configuradaEn: new Date() },
    ]);
    try {
      await expect(calcularTardanza(new RepositorioPostgresDeTardanzas(db), {
        dni, sede: sedeActual, fecha: dia1, entradaProgramada: "09:00", entradaReal: `${dia1}T09:20`,
      })).resolves.toMatchObject({ minutosDeTardanza: 20 });
    } finally {
      await db.delete(schema.politicasTardanzasGrupo).where(inArray(schema.politicasTardanzasGrupo.grupo, [grupoDeSede, grupoDePersona]));
      await db.update(schema.colaboradores).set({ sede, grupo: "Tiendas" }).where(eq(schema.colaboradores.dni, dni));
      await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sedeActual));
      await db.delete(schema.grupos).where(inArray(schema.grupos.nombre, [grupoDeSede, grupoDePersona]));
      await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaAdminId));
    }
  });

  it("G10 no elige automáticamente una política histórica cuando el grupo todavía no tiene política", async () => {
    const dni = await crearColaborador();
    const cuentaAdminId = randomUUID();
    const grupoSinPolitica = `G10 sin política ${randomUUID()}`;
    const sedeSinPolitica = `G10 sede sin política ${randomUUID()}`;
    await db.insert(schema.cuentasLocales).values({ id: cuentaAdminId, nombreUsuario: `admin-g10-vacia-${cuentaAdminId}`, hashContrasena: "prueba", rol: "administrador" });
    await db.insert(schema.grupos).values({ nombre: grupoSinPolitica });
    await db.insert(schema.sedes).values({ nombre: sedeSinPolitica, activa: true, grupo: grupoSinPolitica });
    await db.update(schema.colaboradores).set({ sede: sedeSinPolitica, grupo: grupoSinPolitica }).where(eq(schema.colaboradores.dni, dni));
    await db.insert(schema.politicasDePenalizacionPorTardanzas).values({
      sede: sedeSinPolitica, toleranciaEnMinutos: 10, tardanzasAcumuladas: 2, horasPenalizadas: 1, version: 1, vigenteDesde: "2000-01-01", configuradaPorId: cuentaAdminId,
    });
    try {
      await expect(calcularTardanza(new RepositorioPostgresDeTardanzas(db), {
        dni, sede: sedeSinPolitica, fecha: dia1, entradaProgramada: "09:00", entradaReal: `${dia1}T09:20`,
      })).rejects.toThrow(/grupo.*política/i);
    } finally {
      await db.delete(schema.politicasDePenalizacionPorTardanzas).where(eq(schema.politicasDePenalizacionPorTardanzas.sede, sedeSinPolitica));
      await db.update(schema.colaboradores).set({ sede, grupo: "Tiendas" }).where(eq(schema.colaboradores.dni, dni));
      await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sedeSinPolitica));
      await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupoSinPolitica));
      await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaAdminId));
    }
  });

  it("G10 espera la desactivación concurrente y rechaza guardar política para un grupo sin asistencia", async () => {
    const cuentaAdminId = randomUUID();
    const grupo = `G10 carrera asistencia ${randomUUID()}`;
    await db.insert(schema.cuentasLocales).values({ id: cuentaAdminId, nombreUsuario: `admin-g10-carrera-${cuentaAdminId}`, hashContrasena: "prueba", rol: "administrador" });
    await db.insert(schema.grupos).values({ nombre: grupo, gestionaAsistencia: true });
    const bloqueo = await pool.connect();
    await bloqueo.query("BEGIN");
    await bloqueo.query("UPDATE grupos SET gestiona_asistencia=false WHERE nombre=$1", [grupo]);
    let resuelta = false;
    const configuracion = configurarPoliticaDePenalizacionPorTardanzas(new RepositorioPostgresDeTardanzas(db), { id: cuentaAdminId, rol: "administrador" }, {
      grupo, toleranciaEnMinutos: 10, tardanzasAcumuladas: 2, horasPenalizadas: 1,
    }).then(() => { resuelta = true; return { ok: true }; }, (error: unknown) => { resuelta = true; return { error }; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(resuelta).toBe(false);
      await bloqueo.query("COMMIT");
      const resultado = await configuracion;
      expect(resultado).toMatchObject({ error: expect.objectContaining({ message: "El grupo no gestiona asistencia." }) });
      await expect(db.select().from(schema.politicasTardanzasGrupo).where(eq(schema.politicasTardanzasGrupo.grupo, grupo))).resolves.toEqual([]);
    } finally {
      await bloqueo.query("ROLLBACK").catch(() => undefined);
      bloqueo.release();
      await configuracion;
      await db.delete(schema.politicasTardanzasGrupo).where(eq(schema.politicasTardanzasGrupo.grupo, grupo));
      await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
      await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaAdminId));
    }
  });
});
