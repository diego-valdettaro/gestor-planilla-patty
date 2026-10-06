import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { calcularTardanza } from "@/tardanzas/politica-de-penalizacion";

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
    expect(await tardanzas(dni)).toEqual([{ fecha: dia1, minutos: 30, penalizados: 0, politica: 7 }]);

    await ajustarEntrada(dni, dia1, "09:10");

    expect(await tardanzas(dni)).toEqual([]);
  });

  it("registra la tardanza cuando la entrada corregida supera la tolerancia", async () => {
    const dni = await crearColaborador();
    await confirmar(dni, dia1, "09:00");
    expect(await tardanzas(dni)).toEqual([]);

    await ajustarEntrada(dni, dia1, "09:20");

    expect(await tardanzas(dni)).toEqual([{ fecha: dia1, minutos: 20, penalizados: 0, politica: 7 }]);
  });

  it("actualiza los minutos de una tardanza existente con la entrada corregida", async () => {
    const dni = await crearColaborador();
    await confirmar(dni, dia1, "09:30");

    await ajustarEntrada(dni, dia1, "09:45");

    expect(await tardanzas(dni)).toEqual([{ fecha: dia1, minutos: 45, penalizados: 0, politica: 7 }]);
  });

  it("renumera las horas penalizadas del período cuando un ajuste crea o elimina una tardanza", async () => {
    const dni = await crearColaborador();
    await confirmar(dni, dia1, "09:30");
    await confirmar(dni, dia2, "09:30");
    await confirmar(dni, dia3, "09:00");
    expect(await tardanzas(dni)).toEqual([
      { fecha: dia1, minutos: 30, penalizados: 0, politica: 7 },
      { fecha: dia2, minutos: 30, penalizados: 60, politica: 7 },
    ]);

    // La primera tardanza deja de serlo: la del día 2 pasa a ser la primera y ya no penaliza.
    await ajustarEntrada(dni, dia1, "09:00");
    expect(await tardanzas(dni)).toEqual([{ fecha: dia2, minutos: 30, penalizados: 0, politica: 7 }]);

    // La tardanza del día 3 pasa a ser la segunda del período y penaliza una hora.
    await ajustarEntrada(dni, dia3, "09:25");
    expect(await tardanzas(dni)).toEqual([
      { fecha: dia2, minutos: 30, penalizados: 0, politica: 7 },
      { fecha: dia3, minutos: 25, penalizados: 60, politica: 7 },
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

      expect(await tardanzas(dni)).toEqual([{ fecha: dia2, minutos: 30, penalizados: 60, politica: 7 }]);
    } finally {
      await db.update(schema.periodosPlanilla).set({ estado: "abierto", cerradoPorId: null, cerradoEn: null }).where(eq(schema.periodosPlanilla.id, cerrado.id));
    }
  });
});
