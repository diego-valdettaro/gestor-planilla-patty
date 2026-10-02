import { dniDePrueba } from "./dni-de-prueba";
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
  async function idTecnico(valor: string): Promise<string> {
    const [fila] = await db.select({ id: schema.colaboradores.id }).from(schema.colaboradores).where(eq(schema.colaboradores.dni, valor));
    return fila.id;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeColaboradores(db);
  const dni = dniDePrueba();

  beforeAll(async () => {
    await repositorio.guardar({
      dni,
      nombre: "Ana Rojas",
      sede: "Lima",
      grupo: "Tiendas",
      activo: true,
    });
  });

  afterAll(async () => {
    await db
      .delete(schema.colaboradores)
      .where(eq(schema.colaboradores.dni, dni));
    await pool.end();
  });

  it("persiste y recupera un colaborador", async () => {
    await expect(repositorio.buscarPorDni(dni)).resolves.toMatchObject({
      dni,
      nombre: "Ana Rojas",
      sede: "Lima",
      grupo: "Tiendas",
      activo: true,
    });
  });

  it("deja que PostgreSQL rechace el DNI duplicado", async () => {
    await expect(
      repositorio.guardar({
        dni,
        nombre: "Brenda Soto",
        sede: "Lima",
        grupo: "Tiendas",
        activo: true,
      }),
    ).rejects.toThrow();
  });

  it("deja que PostgreSQL rechace un DNI que no tiene 8 dígitos", async () => {
    await expect(
      repositorio.guardar({ dni: "H-1024", nombre: "Colaborador sin DNI", sede: "Lima", grupo: "Tiendas", activo: true }),
    ).rejects.toMatchObject({ cause: { constraint: "colaboradores_dni_ocho_digitos" } });
  });

  it("conserva el mismo DNI al dar de baja y reactivar a la persona, sin crear otro colaborador", async () => {
    const original = await repositorio.buscarPorDni(dni);
    await repositorio.actualizar({ ...original!, activo: false });
    await repositorio.actualizar({ ...original!, activo: true });

    const filas = await db.select().from(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    expect(filas).toHaveLength(1);
    expect(filas[0].id).toBe(await idTecnico(dni));
  });

  it("deja que PostgreSQL rechace un grupo que no existe", async () => {
    await expect(
      repositorio.guardar({
        dni: dniDePrueba(),
        nombre: "Colaboradora sin grupo válido",
        sede: "Lima",
        grupo: `Grupo inexistente ${randomUUID()}`,
        activo: true,
      }),
    ).rejects.toThrow();
  });

  it("actualiza el grupo persistido", async () => {
    await repositorio.actualizar({
      dni,
      nombre: "Ana Rojas",
      sede: "Lima",
      grupo: "Taller",
      activo: true,
    });

    await expect(repositorio.buscarPorDni(dni)).resolves.toMatchObject({ grupo: "Taller" });

    await repositorio.actualizar({
      dni,
      nombre: "Ana Rojas",
      sede: "Lima",
      grupo: "Tiendas",
      activo: true,
    });
  });

  describe("tieneBorradorAbiertoEnGrupo", () => {
    const semana = "2031-02-03";

    afterAll(async () => {
      await db.delete(schema.celdasDePlanesSemanalesEnBorrador).where(eq(schema.celdasDePlanesSemanalesEnBorrador.dni, dni));
      await db.delete(schema.planesSemanalesEnBorrador).where(eq(schema.planesSemanalesEnBorrador.semana, semana));
    });

    it("devuelve false cuando el colaborador no tiene celdas en borrador para ese grupo", async () => {
      await expect(repositorio.tieneBorradorAbiertoEnGrupo(dni, "Tiendas")).resolves.toBe(false);
    });

    it("devuelve true cuando el colaborador tiene una celda en un plan en borrador de ese grupo", async () => {
      const [plan] = await db.insert(schema.planesSemanalesEnBorrador).values({ semana, equipo: "Tiendas" }).returning({ id: schema.planesSemanalesEnBorrador.id });
      await db.insert(schema.celdasDePlanesSemanalesEnBorrador).values({
        planId: plan.id, dni, fecha: semana, grupo: "Tiendas", sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
      });

      await expect(repositorio.tieneBorradorAbiertoEnGrupo(dni, "Tiendas")).resolves.toBe(true);
      await expect(repositorio.tieneBorradorAbiertoEnGrupo(dni, "Taller")).resolves.toBe(false);
    });
  });

  describe("cambiarGrupoDeColaborador conserva los registros históricos", () => {
    const fecha = "2031-04-07";

    afterAll(async () => {
      await db.delete(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, dni));
      await db.delete(schema.turnosPublicados).where(eq(schema.turnosPublicados.dni, dni));
    });

    it("no modifica un turno publicado ni una asistencia esperada ya existentes", async () => {
      await db.insert(schema.turnosPublicados).values({
        dni, fecha, grupo: "Tiendas", sede: "Lima", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false,
      });
      await db.insert(schema.asistenciasEsperadas).values({ dni, fecha, estado: "pendiente" });

      const antesDelCambio = {
        turno: await db.select().from(schema.turnosPublicados).where(eq(schema.turnosPublicados.dni, dni)),
        asistencia: await db.select().from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, dni)),
      };

      await cambiarGrupoDeColaborador(repositorio, { id: randomUUID(), rol: "administracion" }, dni, "Taller");

      await expect(repositorio.buscarPorDni(dni)).resolves.toMatchObject({ grupo: "Taller" });
      await expect(db.select().from(schema.turnosPublicados).where(eq(schema.turnosPublicados.dni, dni))).resolves.toEqual(antesDelCambio.turno);
      await expect(db.select().from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, dni))).resolves.toEqual(antesDelCambio.asistencia);

      await repositorio.actualizar({ dni, nombre: "Ana Rojas", sede: "Lima", grupo: "Tiendas", activo: true });
    });
  });
});
