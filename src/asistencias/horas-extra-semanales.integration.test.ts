import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { calcularMinutosTrabajados } from "./confirmar-y-ajustar-asistencia";
import { RepositorioPostgresDeAsistencias } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// Semana lunes–domingo del 2037-03-02 al 2037-03-08.
const lunesASabado = ["2037-03-02", "2037-03-03", "2037-03-04", "2037-03-05", "2037-03-06", "2037-03-07"];
const [lunes, martes, miercoles, , viernes, sabado] = lunesASabado;

describe.skipIf(!databaseUrl)("RepositorioPostgresDeAsistencias · horas extra por minutos reales", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeAsistencias(db);
  const cuentaId = randomUUID();
  // DNI de 8 dígitos, único por ejecución (la restricción de la base exige exactamente 8 dígitos).
  const primerDni = 70_000_000 + Math.floor(Math.random() * 20_000_000);
  const colaboradores: string[] = [];

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `extra-${cuentaId}`, hashContrasena: "prueba", rol: "finanzas" });
  });

  afterAll(async () => {
    const asistencias = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
      .where(inArray(schema.asistenciasEsperadas.dni, colaboradores));
    const ids = asistencias.map(({ id }) => id);
    if (ids.length) {
      await db.delete(schema.horasExtra).where(inArray(schema.horasExtra.asistenciaId, ids));
      await db.delete(schema.ajustesDeAsistencia).where(inArray(schema.ajustesDeAsistencia.asistenciaId, ids));
    }
    await db.delete(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.dni, colaboradores));
    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.dni, colaboradores));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await pool.end();
  });

  async function crearColaborador(nombre: string): Promise<string> {
    const dni = String(primerDni + colaboradores.length);
    colaboradores.push(dni);
    await db.insert(schema.colaboradores).values({ dni, nombre, sede: "Lima", grupo: "Tiendas", activo: true });
    await db.insert(schema.asistenciasEsperadas).values([...lunesASabado, "2037-03-08"].map((fecha) => ({ dni, fecha, estado: "pendiente" as const })));
    return dni;
  }

  async function confirmar(dni: string, fecha: string, entrada: string, salida: string): Promise<void> {
    const entradaReal = `${fecha}T${entrada}`;
    const salidaReal = `${fecha}T${salida}`;
    await repositorio.confirmar({
      dni, fecha, entradaReal, salidaReal,
      minutosTrabajados: calcularMinutosTrabajados(entradaReal, salidaReal),
      instantaneaDeTurno: { sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false },
      confirmadoPorId: cuentaId, confirmadoEn: new Date(),
    });
  }

  async function horasExtra(dni: string) {
    const filas = await db.select({
      fecha: schema.asistenciasEsperadas.fecha, minutosAl25: schema.horasExtra.minutosAl25, minutosAl35: schema.horasExtra.minutosAl35,
      trabajoNocturno: schema.horasExtra.trabajoNocturno, estado: schema.horasExtra.estado,
    }).from(schema.horasExtra).innerJoin(schema.asistenciasEsperadas, eq(schema.horasExtra.asistenciaId, schema.asistenciasEsperadas.id))
      .where(eq(schema.asistenciasEsperadas.dni, dni)).orderBy(schema.asistenciasEsperadas.fecha);
    return filas;
  }

  async function decidir(dni: string, fecha: string, estado: "aprobada" | "rechazada"): Promise<void> {
    await repositorio.decidirHoraExtra(dni, fecha, estado, cuentaId);
  }

  it("conserva el sobretiempo fraccionario y el tiempo anterior a la entrada", async () => {
    const dni = await crearColaborador("fraccion");

    await confirmar(dni, lunes, "08:23", "18:37");

    expect(await horasExtra(dni)).toEqual([
      { fecha: lunes, minutosAl25: 74, minutosAl35: 0, trabajoNocturno: false, estado: "pendiente" },
    ]);
  });

  it("cuenta una sola vez el exceso semanal y el diario, sin importar el orden de confirmación", async () => {
    const dni = await crearColaborador("semana");

    await confirmar(dni, sabado, "09:00", "20:00");
    for (const fecha of lunesASabado.slice(0, 5)) await confirmar(dni, fecha, "09:00", "18:00");

    // 45 h ordinarias de lunes a viernes; el sábado aporta 120 min diarios y 360 min semanales
    expect(await horasExtra(dni)).toEqual([
      { fecha: sabado, minutosAl25: 120, minutosAl35: 360, trabajoNocturno: false, estado: "pendiente" },
    ]);
  });

  it("recalcula la semana al ajustar un día y devuelve a pendiente solo lo que cambió", async () => {
    const dni = await crearColaborador("ajuste");
    for (const fecha of lunesASabado) await confirmar(dni, fecha, "09:00", "18:00");
    await decidir(dni, sabado, "aprobada");

    await repositorio.ajustar({
      dni, fecha: martes, entradaReal: `${martes}T09:00`, salidaReal: `${martes}T17:00`, motivo: "Salida anticipada.",
      minutosTrabajados: 480,
    }, cuentaId);

    // Lunes a viernes suman 4 × 540 + 480 = 2640 min; el sábado excede 2640 + 540 - 2880 = 300 min
    expect(await horasExtra(dni)).toEqual([
      { fecha: sabado, minutosAl25: 120, minutosAl35: 180, trabajoNocturno: false, estado: "pendiente" },
    ]);

    await decidir(dni, sabado, "aprobada");
    await repositorio.ajustar({
      dni, fecha: martes, entradaReal: `${martes}T09:00`, salidaReal: `${martes}T17:00`, motivo: "Mismo horario.",
      minutosTrabajados: 480,
    }, cuentaId);
    expect((await horasExtra(dni))[0]).toMatchObject({ fecha: sabado, estado: "aprobada" });

    await repositorio.ajustar({
      dni, fecha: sabado, entradaReal: `${sabado}T09:00`, salidaReal: `${sabado}T18:00`, motivo: "Se revisó la jornada.",
      minutosTrabajados: 540,
    }, cuentaId);
    expect((await horasExtra(dni))[0]).toMatchObject({ fecha: sabado, estado: "pendiente" });
  });

  it("no modifica la hora extra de una jornada de un período cerrado", async () => {
    const dni = await crearColaborador("cerrado");
    const [periodo] = await db.insert(schema.periodosPlanilla).values({
      inicio: lunes, fin: miercoles, estado: "cerrado", cerradoPorId: cuentaId, cerradoEn: new Date(),
    }).returning({ id: schema.periodosPlanilla.id });
    try {
      await confirmar(dni, lunes, "09:00", "18:30");
      const [asistenciaDeLunes] = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
        .where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, lunes)));
      // La hora extra del lunes quedó fijada con la revisión del período cerrado.
      await db.insert(schema.horasExtra).values({ asistenciaId: asistenciaDeLunes.id, minutosAl25: 25, minutosAl35: 0, estado: "aprobada" });
      await confirmar(dni, martes, "09:00", "18:00");

      await confirmar(dni, viernes, "09:00", "20:00");

      expect((await horasExtra(dni)).map(({ fecha, minutosAl25 }) => ({ fecha, minutosAl25 }))).toEqual([
        { fecha: lunes, minutosAl25: 25 },
        { fecha: viernes, minutosAl25: 120 },
      ]);
    } finally {
      await db.delete(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.id, periodo.id));
    }
  });

  it("no pierde sobretiempo cuando se confirman a la vez días distintos de la misma semana", async () => {
    const dni = await crearColaborador("concurrente");
    for (const fecha of lunesASabado.slice(0, 5)) await confirmar(dni, fecha, "09:00", "18:00");

    await Promise.all([confirmar(dni, sabado, "09:00", "18:00"), confirmar(dni, "2037-03-08", "09:00", "18:00")]);

    // Sábado y domingo superan juntos las 48 h: el sábado excede 360 min y el domingo, 540
    expect(await horasExtra(dni)).toEqual([
      { fecha: sabado, minutosAl25: 120, minutosAl35: 240, trabajoNocturno: false, estado: "pendiente" },
      { fecha: "2037-03-08", minutosAl25: 120, minutosAl35: 420, trabajoNocturno: false, estado: "pendiente" },
    ]);
  });

  it("señala el trabajo entre las 22:00 y las 06:00", async () => {
    const dni = await crearColaborador("nocturno");

    await confirmar(dni, lunes, "09:00", "22:30");

    expect(await horasExtra(dni)).toEqual([
      { fecha: lunes, minutosAl25: 120, minutosAl35: 150, trabajoNocturno: true, estado: "pendiente" },
    ]);
  });
});
