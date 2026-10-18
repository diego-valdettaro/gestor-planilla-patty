import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import * as schema from "@/db/schema";

import { registrarConciliacionDeCese } from "./conciliacion-de-cese";
import { consultarFuente } from "./gestionar-fuentes-externas";
import { RepositorioPostgresDeFuentesExternas } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// Conciliación de la liquidación por cese (#128) sobre el esquema real con todas las migraciones, sin migración nueva.
// Esperados de ejemplos-sinteticos.md (C-E2: 400,00 y 900,00; C-E6: abono de 700,00; C-E7: duplicado exacto). Año propio 2094; DNI de prueba.
describe.skipIf(!databaseUrl)("conciliación de la liquidación por cese (integración PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeFuentesExternas(db);
  const sufijo = randomUUID();
  const grupo = `Grupo conciliacion ${sufijo}`;
  const sede = `Sede conciliacion ${sufijo}`;
  const cuentaFinanzas = randomUUID();
  const finanzas: Actor = { id: cuentaFinanzas, rol: "finanzas", nombreUsuario: "finanzas-prueba" };
  const ana = dniDePrueba();
  const TIPO = "conciliacion_de_liquidacion_por_cese";
  const MES = "2094-10";

  const filaDeVacaciones = { dni: ana, concepto: "vacaciones_truncas", fechaDelHecho: "2094-10-12", mesDeDevengue: MES, mesDeAplicacion: MES, monto: "400,00" };
  const importesDeAna = () => db.select().from(schema.importesExternos).where(eq(schema.importesExternos.dni, ana));

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values({ id: cuentaFinanzas, nombreUsuario: `finanzas-${cuentaFinanzas}`, hashContrasena: "prueba", rol: "finanzas" });
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.sedes).values({ nombre: sede, activa: true, grupo });
    await db.insert(schema.colaboradores).values({ dni: ana, nombre: "Ana Conciliacion", sede, grupo, activo: true });
  });

  afterAll(async () => {
    await db.delete(schema.importesExternos).where(inArray(schema.importesExternos.dni, [ana]));
    await db.delete(schema.confirmacionesDeFuente).where(eq(schema.confirmacionesDeFuente.confirmadaPorId, cuentaFinanzas));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, ana));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.aprobacionesDeAsistencia).where(eq(schema.aprobacionesDeAsistencia.grupo, grupo));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaFinanzas));
    await pool.end();
  });

  it("PE-01 guarda y devuelve los conceptos de la liquidación y el abono con todos sus campos", async () => {
    await registrarConciliacionDeCese(repositorio, finanzas, filaDeVacaciones);
    await registrarConciliacionDeCese(repositorio, finanzas, { ...filaDeVacaciones, concepto: "cts_trunca", monto: "900,00" });
    await registrarConciliacionDeCese(repositorio, finanzas, { ...filaDeVacaciones, concepto: "abono_de_liquidacion", fechaDelHecho: "2094-10-13", monto: "700,00" });

    // Una consulta nueva, con otro repositorio sobre la misma base: lo guardado sobrevive a la recarga.
    const detalle = await consultarFuente(new RepositorioPostgresDeFuentesExternas(db), finanzas, TIPO, MES);
    expect(detalle).toMatchObject({ estado: "pendiente", filas: 3, total: 200000 });
    expect(detalle?.importes.map(({ concepto, monto, fechaDelHecho, mesDeDevengue, mesDeAplicacion, procedencia, registradoPor }) =>
      ({ concepto, monto, fechaDelHecho, mesDeDevengue, mesDeAplicacion, procedencia, registradoPor }))).toEqual(expect.arrayContaining([
      { concepto: "vacaciones_truncas", monto: 40000, fechaDelHecho: "2094-10-12", mesDeDevengue: MES, mesDeAplicacion: MES, procedencia: "carga_manual", registradoPor: `finanzas-${cuentaFinanzas}` },
      { concepto: "cts_trunca", monto: 90000, fechaDelHecho: "2094-10-12", mesDeDevengue: MES, mesDeAplicacion: MES, procedencia: "carga_manual", registradoPor: `finanzas-${cuentaFinanzas}` },
      { concepto: "abono_de_liquidacion", monto: 70000, fechaDelHecho: "2094-10-13", mesDeDevengue: MES, mesDeAplicacion: MES, procedencia: "carga_manual", registradoPor: `finanzas-${cuentaFinanzas}` },
    ]));
    expect(detalle?.importes.every(({ dni }) => dni === ana)).toBe(true);
    expect(await importesDeAna()).toHaveLength(3);
  });

  it("PE-02 la base impide el duplicado exacto y el total cuenta una sola fila", async () => {
    // Fuente propia (noviembre) para que la prueba no dependa de las filas de PE-01.
    const MES_DE_NOVIEMBRE = "2094-11";
    const fila = { ...filaDeVacaciones, fechaDelHecho: "2094-11-03", mesDeDevengue: MES_DE_NOVIEMBRE, mesDeAplicacion: MES_DE_NOVIEMBRE };
    await registrarConciliacionDeCese(repositorio, finanzas, fila);

    const { id: _id, registradoEn: _registradoEn, ...guardada } = (await importesDeAna()).find(({ mesDeAplicacion }) => mesDeAplicacion === MES_DE_NOVIEMBRE)!;
    await expect(registrarConciliacionDeCese(repositorio, finanzas, fila)).rejects.toThrow(/Ya existe/);
    await expect(db.insert(schema.importesExternos).values(guardada)).rejects.toThrow();

    expect((await importesDeAna()).filter(({ mesDeAplicacion }) => mesDeAplicacion === MES_DE_NOVIEMBRE)).toHaveLength(1);
    expect(await consultarFuente(repositorio, finanzas, TIPO, MES_DE_NOVIEMBRE)).toMatchObject({ filas: 1, total: 40000 });
  });
});
