import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { cambiarGrupoDeColaborador } from "./cambiar-grupo";
import { RepositorioPostgresDeColaboradores } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("RepositorioPostgresDeColaboradores", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeColaboradores(db);
  const idHuellero = `TEST-${randomUUID()}`;

  beforeAll(async () => {
    await repositorio.guardar({
      idHuellero,
      nombre: "Ana Rojas",
      sede: "Lima",
      grupo: "Tiendas",
      activo: true,
    });
  });

  afterAll(async () => {
    await db
      .delete(schema.colaboradores)
      .where(eq(schema.colaboradores.idHuellero, idHuellero));
    await pool.end();
  });

  it("persiste y recupera un colaborador", async () => {
    await expect(repositorio.buscarPorIdHuellero(idHuellero)).resolves.toMatchObject({
      idHuellero,
      nombre: "Ana Rojas",
      sede: "Lima",
      grupo: "Tiendas",
      activo: true,
    });
  });

  it("deja que PostgreSQL rechace el ID de huellero duplicado", async () => {
    await expect(
      repositorio.guardar({
        idHuellero,
        nombre: "Brenda Soto",
        sede: "Lima",
        grupo: "Tiendas",
        activo: true,
      }),
    ).rejects.toThrow();
  });

  it("deja que PostgreSQL rechace un grupo que no existe", async () => {
    await expect(
      repositorio.guardar({
        idHuellero: `TEST-${randomUUID()}`,
        nombre: "Colaboradora sin grupo válido",
        sede: "Lima",
        grupo: `Grupo inexistente ${randomUUID()}`,
        activo: true,
      }),
    ).rejects.toThrow();
  });

  it("actualiza el grupo persistido", async () => {
    await repositorio.actualizar({
      idHuellero,
      nombre: "Ana Rojas",
      sede: "Lima",
      grupo: "Taller",
      activo: true,
    });

    await expect(repositorio.buscarPorIdHuellero(idHuellero)).resolves.toMatchObject({ grupo: "Taller" });

    await repositorio.actualizar({
      idHuellero,
      nombre: "Ana Rojas",
      sede: "Lima",
      grupo: "Tiendas",
      activo: true,
    });
  });

  describe("tieneBorradorAbiertoEnGrupo", () => {
    const semana = "2031-02-03";

    afterAll(async () => {
      await db.delete(schema.celdasDePlanesSemanalesEnBorrador).where(eq(schema.celdasDePlanesSemanalesEnBorrador.idHuellero, idHuellero));
      await db.delete(schema.planesSemanalesEnBorrador).where(eq(schema.planesSemanalesEnBorrador.semana, semana));
    });

    it("devuelve false cuando el colaborador no tiene celdas en borrador para ese grupo", async () => {
      await expect(repositorio.tieneBorradorAbiertoEnGrupo(idHuellero, "Tiendas")).resolves.toBe(false);
    });

    it("devuelve true cuando el colaborador tiene una celda en un plan en borrador de ese grupo", async () => {
      const [plan] = await db.insert(schema.planesSemanalesEnBorrador).values({ semana, equipo: "Tiendas" }).returning({ id: schema.planesSemanalesEnBorrador.id });
      await db.insert(schema.celdasDePlanesSemanalesEnBorrador).values({
        planId: plan.id, idHuellero, fecha: semana, sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
      });

      await expect(repositorio.tieneBorradorAbiertoEnGrupo(idHuellero, "Tiendas")).resolves.toBe(true);
      await expect(repositorio.tieneBorradorAbiertoEnGrupo(idHuellero, "Taller")).resolves.toBe(false);
    });
  });

  describe("cambiarGrupoDeColaborador conserva los registros históricos", () => {
    const fecha = "2031-04-07";

    afterAll(async () => {
      await db.delete(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.idHuellero, idHuellero));
      await db.delete(schema.turnosPublicados).where(eq(schema.turnosPublicados.idHuellero, idHuellero));
    });

    it("no modifica un turno publicado ni una asistencia esperada ya existentes", async () => {
      await db.insert(schema.turnosPublicados).values({
        idHuellero, fecha, sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
      });
      await db.insert(schema.asistenciasEsperadas).values({ idHuellero, fecha, estado: "pendiente" });

      const antesDelCambio = {
        turno: await db.select().from(schema.turnosPublicados).where(eq(schema.turnosPublicados.idHuellero, idHuellero)),
        asistencia: await db.select().from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.idHuellero, idHuellero)),
      };

      await cambiarGrupoDeColaborador(repositorio, { id: randomUUID(), rol: "administracion" }, idHuellero, "Taller");

      await expect(repositorio.buscarPorIdHuellero(idHuellero)).resolves.toMatchObject({ grupo: "Taller" });
      await expect(db.select().from(schema.turnosPublicados).where(eq(schema.turnosPublicados.idHuellero, idHuellero))).resolves.toEqual(antesDelCambio.turno);
      await expect(db.select().from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.idHuellero, idHuellero))).resolves.toEqual(antesDelCambio.asistencia);

      await repositorio.actualizar({ idHuellero, nombre: "Ana Rojas", sede: "Lima", grupo: "Tiendas", activo: true });
    });
  });
});
