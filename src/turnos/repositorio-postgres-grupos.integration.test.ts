import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { RepositorioPostgresDeGrupos } from "./repositorio-postgres-grupos";
import { RepositorioPostgresDeTurnos } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("grupos persistidos", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const grupos = new RepositorioPostgresDeGrupos(db);
  const turnos = new RepositorioPostgresDeTurnos(db);
  const grupo = `Logistica ${randomUUID()}`;
  const sede = `Sede ${randomUUID()}`;
  const colaborador = `HU-${randomUUID()}`;
  const semana = "2031-01-06";
  const fechas = Array.from({ length: 7 }, (_, indice) => `2031-01-${String(6 + indice).padStart(2, "0")}`);
  const cuenta = randomUUID();

  afterAll(async () => {
    await db.delete(schema.celdasDePlanesSemanalesEnBorrador).where(eq(schema.celdasDePlanesSemanalesEnBorrador.idHuellero, colaborador));
    await db.delete(schema.planesSemanalesEnBorrador).where(eq(schema.planesSemanalesEnBorrador.semana, semana));
    await db.delete(schema.horariosSemanalesProcesados).where(eq(schema.horariosSemanalesProcesados.idHuellero, colaborador));
    await db.delete(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.idHuellero, colaborador));
    const publicados = await db.select({ id: schema.turnosPublicados.id }).from(schema.turnosPublicados).where(and(eq(schema.turnosPublicados.idHuellero, colaborador), inArray(schema.turnosPublicados.fecha, fechas)));
    if (publicados.length) await db.delete(schema.historialDeTurnosPublicados).where(inArray(schema.historialDeTurnosPublicados.turnoPublicadoId, publicados.map(({ id }) => id)));
    await db.delete(schema.turnosPublicados).where(and(eq(schema.turnosPublicados.idHuellero, colaborador), inArray(schema.turnosPublicados.fecha, fechas)));
    await db.delete(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.inicio, "2031-01-01"));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuenta));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.idHuellero, colaborador));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await pool.end();
  });

  it("persiste un grupo y traduce una clave duplicada a un error de dominio", async () => {
    await grupos.crear(grupo);

    await expect(grupos.listar()).resolves.toContain(grupo);
    await expect(grupos.crear(grupo)).rejects.toThrow("Ya existe un grupo con ese nombre.");
  });

  it("asigna una sede a un grupo dinámico y permite planificar a su colaborador", async () => {
    await db.insert(schema.sedes).values({ nombre: sede, grupo });
    await db.insert(schema.colaboradores).values({ idHuellero: colaborador, nombre: "Prueba grupo", sede, activo: true });

    await expect(turnos.listarColaboradoresActivosPorEquipo(grupo)).resolves.toEqual([
      expect.objectContaining({ idHuellero: colaborador, sede }),
    ]);
    await expect(turnos.obtenerOCrear(semana, grupo)).resolves.toMatchObject({ semana, equipo: grupo, celdas: [] });

    await db.insert(schema.cuentasLocales).values({ id: cuenta, nombreUsuario: `grupo-${cuenta}`, hashContrasena: "prueba", rol: "operaciones" });
    await db.insert(schema.periodosPlanilla).values({ inicio: "2031-01-01", fin: "2031-01-31", estado: "abierto" });
    await turnos.publicarEnLote(fechas.map((fecha) => ({ idHuellero: colaborador, fecha, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false })));
    await db.update(schema.asistenciasEsperadas).set({ estado: "manual" }).where(and(eq(schema.asistenciasEsperadas.idHuellero, colaborador), inArray(schema.asistenciasEsperadas.fecha, fechas)));
    await turnos.registrarProcesamiento({ idHuellero: colaborador, semana, equipo: grupo, responsableId: cuenta });
    await expect(turnos.listarProcesamientosDeSemana(semana, grupo)).resolves.toContain(colaborador);
  });
});
