import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import { RepositorioPostgresDeCondicionesLaborales } from "@/condiciones-laborales/repositorio-postgres";
import * as schema from "@/db/schema";
import { RepositorioPostgresDeDescansosYFeriados } from "@/descansos-y-feriados/repositorio-postgres";
import { registrarConciliacionDeCese } from "@/fuentes-externas/conciliacion-de-cese";
import { confirmarFuente } from "@/fuentes-externas/gestionar-fuentes-externas";
import { RepositorioPostgresDeFuentesExternas } from "@/fuentes-externas/repositorio-postgres";
import { RepositorioPostgresDePeriodos } from "@/periodos/repositorio-postgres";
import { RepositorioPostgresDeReglasLegales } from "@/reglas-legales/repositorio-postgres";
import { RepositorioPostgresDeRelacionesLaborales } from "@/relaciones-laborales/repositorio-postgres";

import { prepararBorrador } from "./preparar-borrador";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// El bloqueo de cese sin conciliar (#128) con los repositorios reales. Esperados de ejemplos-sinteticos.md (C-E1, C-E2). Año propio 2094.
describe.skipIf(!databaseUrl)("bloqueo de cese sin conciliar desde PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const dni = dniDePrueba();
  const cuentaId = randomUUID();
  const relacionId = randomUUID();
  const grupo = `Grupo conciliacion pagos ${randomUUID()}`;
  const sede = `Sede conciliacion pagos ${randomUUID()}`;
  const finanzas: Actor = { id: cuentaId, rol: "finanzas", nombreUsuario: "finanzas-prueba" };
  const MES = "2094-10";
  const TIPO = "conciliacion_de_liquidacion_por_cese";
  const BLOQUEO_DE_CESE = "El cese de Ana Cese no tiene su liquidación conciliada.";
  let periodoId: string;

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `pagos-cese-${cuentaId}`, hashContrasena: "prueba", rol: "finanzas" });
    await db.insert(schema.grupos).values({ nombre: grupo, gestionaAsistencia: false });
    await db.insert(schema.sedes).values({ nombre: sede, grupo });
    await db.insert(schema.colaboradores).values({ dni, nombre: "Ana Cese", grupo, sede });
    await db.insert(schema.relacionesLaborales).values({
      id: relacionId, dni, ingreso: "2094-01-01", ingresoConfirmadoPorId: cuentaId, ingresoConfirmadoEn: new Date(),
      cese: "2094-10-12", ceseConfirmadoPorId: cuentaId, ceseConfirmadoEn: new Date(), registradaPorId: cuentaId,
    });
    await db.insert(schema.condicionesLaborales).values({ relacionLaboralId: relacionId, dato: "sueldo", sueldoCentimos: 200000, vigenteDesde: "2094-01-01", registradoPorId: cuentaId });
    const [periodo] = await db.insert(schema.periodosPlanilla).values({ inicio: "2094-09-26", fin: "2094-10-25", estado: "abierto" }).returning({ id: schema.periodosPlanilla.id });
    periodoId = periodo.id;
  });

  afterAll(async () => {
    await db.delete(schema.importesExternos).where(eq(schema.importesExternos.dni, dni));
    await db.delete(schema.confirmacionesDeFuente).where(eq(schema.confirmacionesDeFuente.mesDeAplicacion, MES));
    await db.delete(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.id, periodoId));
    await db.delete(schema.condicionesLaborales).where(eq(schema.condicionesLaborales.relacionLaboralId, relacionId));
    await db.delete(schema.relacionesLaborales).where(eq(schema.relacionesLaborales.id, relacionId));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await pool.end();
  });

  const externas = new RepositorioPostgresDeFuentesExternas(db);
  const fuentes = {
    relaciones: new RepositorioPostgresDeRelacionesLaborales(db),
    condiciones: new RepositorioPostgresDeCondicionesLaborales(db),
    reglas: new RepositorioPostgresDeReglasLegales(db),
    asistencia: new RepositorioPostgresDePeriodos(db),
    externas,
    descansos: new RepositorioPostgresDeDescansosYFeriados(db),
  };
  const ana = (borrador: Awaited<ReturnType<typeof prepararBorrador>>) => borrador.personas.find(({ relacion }) => relacion.dni === dni);

  it("PE-03 el bloqueo del cese aparece, se resuelve al cargar y confirmar la conciliación, y persiste al recalcular", async () => {
    const antes = await prepararBorrador(fuentes, MES);
    expect(antes.bloqueosDelMes).toContain(BLOQUEO_DE_CESE);
    expect(ana(antes)?.bloqueos).toContain(BLOQUEO_DE_CESE);

    const fila = { dni, concepto: "vacaciones_truncas", fechaDelHecho: "2094-10-12", mesDeDevengue: MES, mesDeAplicacion: MES, monto: "400,00" };
    await registrarConciliacionDeCese(externas, finanzas, fila);
    await registrarConciliacionDeCese(externas, finanzas, { ...fila, concepto: "cts_trunca", monto: "900,00" });
    await confirmarFuente(externas, finanzas, { tipoDeFuente: TIPO, mes: MES });

    const despues = await prepararBorrador(fuentes, MES);
    expect(despues.bloqueosDelMes).not.toContain(BLOQUEO_DE_CESE);
    expect(ana(despues)?.bloqueos).not.toContain(BLOQUEO_DE_CESE);
    expect(ana(despues)?.conciliacion.conceptosCentimos).toBe(130000);

    // Persiste: un cálculo nuevo con repositorios nuevos sobre la misma base da lo mismo.
    const recalculado = await prepararBorrador({ ...fuentes, externas: new RepositorioPostgresDeFuentesExternas(db) }, MES);
    expect(recalculado.bloqueosDelMes).not.toContain(BLOQUEO_DE_CESE);
    expect(ana(recalculado)?.conciliacion.conceptosCentimos).toBe(130000);
  });
});
