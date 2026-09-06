import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { RepositorioPostgresDeModelosDeHorario } from "./repositorio-postgres-modelos-de-horario";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("RepositorioPostgresDeModelosDeHorario", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeModelosDeHorario(db);
  const responsableId = randomUUID();
  const modeloId = randomUUID();
  const modeloFallidoId = randomUUID();

  beforeAll(async () => {
    await db.insert(schema.sedes).values({ nombre: "Lima" }).onConflictDoNothing();
    await db.insert(schema.cuentasLocales).values({ id: responsableId, nombreUsuario: `modelos-${responsableId}`, hashContrasena: "hash", rol: "administracion" });
  });

  afterAll(async () => {
    await db.delete(schema.auditoriaDeModelosDeHorario).where(eq(schema.auditoriaDeModelosDeHorario.modeloId, modeloId));
    await db.delete(schema.modelosDeHorario).where(eq(schema.modelosDeHorario.id, modeloId));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, responsableId));
    await pool.end();
  });

  it("guarda cada cambio junto con su auditoría y revierte ambos si la auditoría falla", async () => {
    const modelo = { id: modeloId, sede: "Lima", nombre: `Apertura ${modeloId}`, entrada: "09:00", salida: "18:00", activo: true };

    await repositorio.guardar(modelo, responsableId);
    await repositorio.guardar({ ...modelo, activo: false }, responsableId);

    await expect(db.select({ accion: schema.auditoriaDeModelosDeHorario.accion }).from(schema.auditoriaDeModelosDeHorario)
      .where(eq(schema.auditoriaDeModelosDeHorario.modeloId, modeloId))).resolves.toEqual([{ accion: "creacion" }, { accion: "desactivacion" }]);
    await expect(repositorio.guardar({ ...modelo, id: modeloFallidoId }, randomUUID())).rejects.toThrow();
    await expect(repositorio.buscarPorId(modeloFallidoId)).resolves.toBeUndefined();
  });

  it("conserva la auditoría cuando elimina un modelo nunca usado", async () => {
    await repositorio.eliminar(modeloId, responsableId);

    await expect(repositorio.buscarPorId(modeloId)).resolves.toBeUndefined();
    await expect(db.select({ accion: schema.auditoriaDeModelosDeHorario.accion }).from(schema.auditoriaDeModelosDeHorario)
      .where(eq(schema.auditoriaDeModelosDeHorario.modeloId, modeloId))).resolves.toEqual([
      { accion: "creacion" }, { accion: "desactivacion" }, { accion: "eliminacion" },
    ]);
  });
});
