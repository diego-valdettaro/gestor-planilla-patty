import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { crearCasosDeUsoDeImportaciones } from "./casos-de-uso-servidor";
import { RepositorioPostgresDeImportaciones } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("RepositorioPostgresDeImportaciones", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeImportaciones(db);
  const sufijo = randomUUID();
  const grupo = `Grupo importación ${sufijo}`;
  const sede = `Sede importación ${sufijo}`;
  const idHuellero = `IMPORT-${sufijo}`;
  const cuentaId = randomUUID();
  const fecha = "2032-09-01";

  beforeAll(async () => {
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.sedes).values({ nombre: sede, grupo, activa: true });
    await db.insert(schema.colaboradores).values({ idHuellero, nombre: "Colaborador de importación", sede, grupo, activo: true });
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `import-${sufijo}`, hashContrasena: "prueba", rol: "administracion" });
    await db.insert(schema.periodosPlanilla).values({ inicio: "2032-08-26", fin: "2032-09-25", estado: "abierto" });
    await db.insert(schema.turnosPublicados).values({
      idHuellero, fecha, grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null,
    });
  });

  afterAll(async () => {
    const importaciones = await db.select({ id: schema.importacionesSemanales.id }).from(schema.importacionesSemanales)
      .where(eq(schema.importacionesSemanales.usuarioId, cuentaId));
    if (importaciones.length) await db.delete(schema.marcasCrudas).where(eq(schema.marcasCrudas.importacionId, importaciones[0].id));
    await db.delete(schema.importacionesSemanales).where(eq(schema.importacionesSemanales.usuarioId, cuentaId));
    await db.delete(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.idHuellero, idHuellero), eq(schema.asistenciasEsperadas.fecha, fecha)));
    await db.delete(schema.turnosPublicados).where(and(eq(schema.turnosPublicados.idHuellero, idHuellero), eq(schema.turnosPublicados.fecha, fecha)));
    await db.delete(schema.periodosPlanilla).where(and(eq(schema.periodosPlanilla.inicio, "2032-08-26"), eq(schema.periodosPlanilla.fin, "2032-09-25")));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.idHuellero, idHuellero));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await pool.end();
  });

  it("persiste una carga autosuficiente sin sede ni semana de alcance", async () => {
    const sedeDelArchivo = ` ${sede.toLocaleUpperCase()} `;
    const casosDeUso = crearCasosDeUsoDeImportaciones(repositorio, { obtenerActorActual: async () => ({ id: cuentaId, rol: "administracion" }) });
    await expect(casosDeUso.importar({
      filas: [{ fila: 2, idHuellero, sede: sedeDelArchivo, fecha, entrada: "09:05", salida: "18:10" }],
      erroresDelArchivo: [], archivo: { nombre: "asistencias.xlsx", ubicacion: "pruebas/asistencias.xlsx", hashSha256: "a".repeat(64) },
    })).resolves.toEqual({ jornadas: 1 });

    await expect(db.select({ sede: schema.importacionesSemanales.sede, semana: schema.importacionesSemanales.semana })
      .from(schema.importacionesSemanales).where(eq(schema.importacionesSemanales.usuarioId, cuentaId))).resolves.toEqual([{ sede: null, semana: null }]);
    await expect(db.select({ sede: schema.marcasCrudas.sede, instante: schema.marcasCrudas.instante }).from(schema.marcasCrudas)
      .innerJoin(schema.importacionesSemanales, eq(schema.marcasCrudas.importacionId, schema.importacionesSemanales.id))
      .where(eq(schema.importacionesSemanales.usuarioId, cuentaId))).resolves.toEqual([
      { sede: sedeDelArchivo, instante: `${fecha}T09:05:00` }, { sede: sedeDelArchivo, instante: `${fecha}T18:10:00` },
    ]);
  });
});
