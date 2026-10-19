import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import * as schema from "@/db/schema";
import { RepositorioPostgresDeConstancias } from "@/pagos/repositorio-postgres-de-constancias";
import { RepositorioPostgresDeVersiones } from "@/pagos/repositorio-postgres-de-versiones";

import { confirmarFuente, registrarImporte, volverAPendiente } from "./gestionar-fuentes-externas";
import { RepositorioPostgresDeFuentesExternas } from "./repositorio-postgres";

// Un mes con el pago realizado confirmado es solo consulta también para las fuentes externas (#130, ADR 0013, diseño de interacción §4.2, R1-SPEC-02):
// el adaptador de fuentes consulta las constancias por mes. Meses sintéticos 2094-10 (pagado) y 2094-11 (sin pagar).
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

const PAGADO = "2094-10";
const LIBRE = "2094-11";
const MENSAJE = /tiene el pago realizado confirmado/;

describe.skipIf(!databaseUrl)("fuentes externas de un mes con pago confirmado (integración PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeFuentesExternas(db);
  const sufijo = randomUUID();
  const grupo = `Grupo pagado ${sufijo}`;
  const sede = `Sede pagado ${sufijo}`;
  const cuentaId = randomUUID();
  const finanzas: Actor = { id: cuentaId, rol: "finanzas", nombreUsuario: "finanzas-prueba" };
  const dni = dniDePrueba();
  const relacionId = randomUUID();

  const registrar = (mes: string) => registrarImporte(repositorio, finanzas, {
    tipoDeFuente: "comisiones_de_ventas", dni, concepto: "comision_de_ventas", fechaDelHecho: `${mes}-05`, mesDeDevengue: mes, mesDeAplicacion: mes, monto: "250,50",
  });
  const confirmar = (mes: string) => confirmarFuente(repositorio, finanzas, { tipoDeFuente: "comisiones_de_ventas", mes });
  const devolver = (mes: string) => volverAPendiente(repositorio, finanzas, { tipoDeFuente: "comisiones_de_ventas", mes });
  /** Finaliza una versión del mes y confirma su pago con los adaptadores reales. */
  const pagar = async (mes: string) => {
    await new RepositorioPostgresDeVersiones(db).guardarVersion({
      mesDePago: mes, finalizadaPorId: cuentaId, finalizadaPor: "finanzas-prueba", finalizadaEn: new Date("2094-10-26T15:00:00Z"), reglas: [], revisiones: [], fuentes: [],
      personas: [{ relacionId, dni, nombre: "Ana Pagada", subtotalCentimos: 100000, lineas: [], bases: [] }],
    });
    await new RepositorioPostgresDeConstancias(db).confirmar({ mesDePago: mes, numeroDeVersion: 1, fechaDelPago: "2019-12-02", confirmadaPorId: cuentaId, confirmadaEn: new Date("2019-12-02T15:00:00Z") });
  };

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `finanzas-${cuentaId}`, hashContrasena: "prueba", rol: "finanzas" });
    await db.insert(schema.grupos).values({ nombre: grupo, gestionaAsistencia: false });
    await db.insert(schema.sedes).values({ nombre: sede, activa: true, grupo });
    await db.insert(schema.colaboradores).values({ dni, nombre: "Ana Pagada", sede, grupo, activo: true });
    await db.insert(schema.relacionesLaborales).values({ id: relacionId, dni, ingreso: "2094-01-01", ingresoConfirmadoPorId: cuentaId, ingresoConfirmadoEn: new Date(), registradaPorId: cuentaId });
  });
  afterAll(async () => {
    const cliente = await pool.connect();
    try {
      // Las constancias y las versiones son inmutables: solo la base de prueba, con permisos de superusuario, las retira.
      await cliente.query("SET session_replication_role = replica");
      await cliente.query("DELETE FROM constancias_de_pago WHERE mes_de_pago = ANY($1)", [[PAGADO, LIBRE]]);
      await cliente.query("DELETE FROM versiones_de_pago_personas WHERE version_id IN (SELECT id FROM versiones_de_pago WHERE mes_de_pago = ANY($1))", [[PAGADO, LIBRE]]);
      await cliente.query("DELETE FROM versiones_de_pago WHERE mes_de_pago = ANY($1)", [[PAGADO, LIBRE]]);
    } finally {
      await cliente.query("RESET session_replication_role");
      cliente.release();
    }
    await db.delete(schema.importesExternos).where(eq(schema.importesExternos.dni, dni));
    await db.delete(schema.confirmacionesDeFuente).where(inArray(schema.confirmacionesDeFuente.mesDeAplicacion, [PAGADO, LIBRE]));
    await db.delete(schema.relacionesLaborales).where(eq(schema.relacionesLaborales.id, relacionId));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await pool.end();
  });

  // G27 · Tras confirmar el pago del mes X, registrar un importe, confirmar la fuente y devolverla a pendiente se rechazan en X; en el mes Y siguen permitidos.
  it("G27 F1-F4 el mes pagado rechaza registrar, confirmar y volver a pendiente; otro mes no se afecta", async () => {
    await confirmar(PAGADO); // antes del pago: la fuente de X queda confirmada para poder devolverla después
    await pagar(PAGADO);

    const casos: Array<{ fila: string; accion: () => Promise<unknown> }> = [
      { fila: "F1 registrarImporte", accion: () => registrar(PAGADO) },
      { fila: "F2 confirmarFuente", accion: () => confirmar(PAGADO) },
      { fila: "F3 volverAPendiente", accion: () => devolver(PAGADO) },
    ];
    for (const { fila, accion } of casos) await expect(accion(), fila).rejects.toThrow(MENSAJE);
    expect(await db.select().from(schema.importesExternos).where(eq(schema.importesExternos.dni, dni))).toEqual([]);
    expect(await db.select().from(schema.confirmacionesDeFuente).where(eq(schema.confirmacionesDeFuente.mesDeAplicacion, PAGADO))).toHaveLength(1);

    // F4 · el mes sin pago sigue admitiendo las tres operaciones.
    await expect(registrar(LIBRE)).resolves.toBeDefined();
    await expect(confirmar(LIBRE)).resolves.toBeDefined();
    await expect(devolver(LIBRE)).resolves.toBeUndefined();
  });
});
