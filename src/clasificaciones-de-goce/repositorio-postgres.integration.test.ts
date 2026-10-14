import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import * as schema from "@/db/schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("clasificaciones de goce en PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const dni = dniDePrueba();
  const finanzasId = randomUUID();
  const otraFinanzasId = randomUUID();
  const grupo = `Grupo goce ${randomUUID()}`;
  const sede = `Sede goce ${randomUUID()}`;

  // Se importa dentro de cada prueba para que la ausencia del módulo sea un fallo de la prueba y no un error de carga.
  async function repositorio() {
    const { RepositorioPostgresDeClasificacionesDeGoce } = await import("./repositorio-postgres");
    return new RepositorioPostgresDeClasificacionesDeGoce(drizzle({ client: pool, schema }));
  }

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values([
      { id: finanzasId, nombreUsuario: `goce-${finanzasId}`, hashContrasena: "prueba", rol: "finanzas" },
      { id: otraFinanzasId, nombreUsuario: `goce-${otraFinanzasId}`, hashContrasena: "prueba", rol: "finanzas" },
    ]);
    await db.insert(schema.grupos).values({ nombre: grupo, gestionaAsistencia: false });
    await db.insert(schema.sedes).values({ nombre: sede, grupo });
    await db.insert(schema.colaboradores).values({ dni, nombre: "Persona con permiso", grupo, sede });
  });

  afterAll(async () => {
    await db.delete(schema.clasificacionesDeGoce).where(eq(schema.clasificacionesDeGoce.dni, dni));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(inArray(schema.cuentasLocales.id, [finanzasId, otraFinanzasId]));
    await pool.end();
  });

  it("PE-01 guarda la clasificación y la recupera con su jornada, goce, actor y fecha de registro", async () => {
    const guardada = await (await repositorio()).guardar({ dni, fecha: "2090-10-06", conGoce: false, clasificadoPorId: finanzasId });
    expect(guardada).toMatchObject({ dni, fecha: "2090-10-06", conGoce: false, clasificadoPorId: finanzasId });
    expect(guardada.clasificadoEn).toBeInstanceOf(Date);

    const [leida] = await (await repositorio()).listarEntre("2090-10-06", "2090-10-06");
    expect(leida).toEqual(guardada);
  });

  it("PE-02 al listar el corte solo vuelven las clasificaciones de fechas dentro de él", async () => {
    const lector = await repositorio();
    for (const fecha of ["2090-09-25", "2090-09-26", "2090-10-25", "2090-10-26"]) {
      await lector.guardar({ dni, fecha, conGoce: true, clasificadoPorId: finanzasId });
    }
    const delCorte = await lector.listarEntre("2090-09-26", "2090-10-25");
    expect(delCorte.filter((fila) => fila.dni === dni).map(({ fecha }) => fecha)).toEqual(["2090-09-26", "2090-10-06", "2090-10-25"]);
  });

  it("PE-03 reclasificar reemplaza la decisión vigente con su nuevo actor y fecha", async () => {
    const lector = await repositorio();
    const primera = await lector.guardar({ dni, fecha: "2090-11-03", conGoce: true, clasificadoPorId: finanzasId });
    const segunda = await lector.guardar({ dni, fecha: "2090-11-03", conGoce: false, clasificadoPorId: otraFinanzasId });
    const vigentes = (await lector.listarEntre("2090-11-03", "2090-11-03")).filter((fila) => fila.dni === dni);
    expect(vigentes).toEqual([segunda]);
    expect(vigentes[0]).toMatchObject({ conGoce: false, clasificadoPorId: otraFinanzasId });
    expect(vigentes[0].clasificadoEn.getTime()).toBeGreaterThanOrEqual(primera.clasificadoEn.getTime());
  });
});
