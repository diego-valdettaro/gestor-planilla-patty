import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import * as schema from "@/db/schema";
import { ErrorDePeriodoFuenteReabierto } from "@/pagos/constancias-de-pago";
import { RepositorioPostgresDeConstancias } from "@/pagos/repositorio-postgres-de-constancias";
import { RepositorioPostgresDeVersiones } from "@/pagos/repositorio-postgres-de-versiones";

import { RepositorioPostgresDePeriodos } from "./repositorio-postgres";

// Qué períodos sustentan un mes con pago realizado confirmado y que el servidor no los reabre (#130, ADR 0013, contrato C2, D10, P4 y P7)
// contra PostgreSQL real. Meses sintéticos 2096-10 y 2096-12; el vínculo es `versiones_de_pago.revisiones` de la versión PAGADA. Las
// versiones y las constancias son inmutables: cada prueba retira su mundo con una conexión de superusuario de la base de PRUEBA.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

const MESES = ["2096-10", "2096-12"];

describe.skipIf(!databaseUrl)("períodos fuente de un mes pagado en PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const periodos = new RepositorioPostgresDePeriodos(db);
  const versiones = new RepositorioPostgresDeVersiones(db);
  const constancias = new RepositorioPostgresDeConstancias(db);
  let cuentaId: string;
  let grupo: string;
  let sede: string;
  let dni: string;
  let relacionId: string;
  let periodoIds: string[];

  const periodoNuevo = async (inicio: string, fin: string) => {
    const [fila] = await db.insert(schema.periodosPlanilla).values({ inicio, fin, estado: "cerrado", cerradoPorId: cuentaId, cerradoEn: new Date("2096-01-01T00:00:00Z") })
      .returning({ id: schema.periodosPlanilla.id });
    periodoIds.push(fila.id);
    return { id: fila.id, inicio, fin };
  };
  /** Guarda una versión finalizada del mes cuyas revisiones son los períodos dados. */
  const versionar = (mes: string, fuentes: Array<{ id: string; inicio: string; fin: string }>) => versiones.guardarVersion({
    mesDePago: mes, finalizadaPorId: cuentaId, finalizadaPor: "finanzas", finalizadaEn: new Date("2096-10-26T15:00:00Z"), reglas: [], fuentes: [],
    revisiones: fuentes.map(({ id, inicio, fin }) => ({ periodoId: id, revisionId: null, numero: null, inicio, fin })),
    personas: [{ relacionId, dni, nombre: "Ana", subtotalCentimos: 200000, lineas: [], bases: [] }],
  });
  const pagar = (mes: string, numeroDeVersion: number) =>
    constancias.confirmar({ mesDePago: mes, numeroDeVersion, fechaDelPago: "2019-12-02", confirmadaPorId: cuentaId, confirmadaEn: new Date("2019-12-02T15:00:00Z") });

  beforeEach(async () => {
    periodoIds = [];
    cuentaId = randomUUID();
    grupo = `Grupo reapertura ${randomUUID()}`;
    sede = `Sede reapertura ${randomUUID()}`;
    dni = dniDePrueba();
    relacionId = randomUUID();
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `finanzas-${cuentaId}`, hashContrasena: "prueba", rol: "finanzas" });
    await db.insert(schema.grupos).values({ nombre: grupo, gestionaAsistencia: false });
    await db.insert(schema.sedes).values({ nombre: sede, grupo });
    await db.insert(schema.colaboradores).values({ dni, nombre: "Ana", grupo, sede });
    await db.insert(schema.relacionesLaborales).values({
      id: relacionId, dni, ingreso: "2096-01-01", ingresoConfirmadoPorId: cuentaId, ingresoConfirmadoEn: new Date(), registradaPorId: cuentaId });
  });

  afterEach(async () => {
    const cliente = await pool.connect();
    try {
      await cliente.query("SET session_replication_role = replica");
      await cliente.query("DELETE FROM constancias_de_pago WHERE mes_de_pago = ANY($1)", [MESES]);
      await cliente.query("DELETE FROM versiones_de_pago_personas WHERE version_id IN (SELECT id FROM versiones_de_pago WHERE mes_de_pago = ANY($1))", [MESES]);
      await cliente.query("DELETE FROM versiones_de_pago WHERE mes_de_pago = ANY($1)", [MESES]);
    } finally {
      await cliente.query("RESET session_replication_role");
      cliente.release();
    }
    await db.delete(schema.auditoriaPeriodosPlanilla).where(inArray(schema.auditoriaPeriodosPlanilla.periodoId, periodoIds));
    await db.delete(schema.periodosPlanilla).where(inArray(schema.periodosPlanilla.id, periodoIds));
    await db.delete(schema.relacionesLaborales).where(eq(schema.relacionesLaborales.id, relacionId));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
  });

  // G13 · Qué períodos sustentan un pago: los de las revisiones de la versión pagada, y el adaptador tampoco los reabre (ADR 0013, contrato C2, P7).
  const casosG13: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "R1", descripcion: "los dos períodos del corte de la versión 1 pagada de 2096-10 devuelven «2096-10»",
      comprobar: async () => {
        const a = await periodoNuevo("2096-09-26", "2096-10-10");
        const b = await periodoNuevo("2096-10-11", "2096-10-25");
        await versionar("2096-10", [a, b]);
        await pagar("2096-10", 1);

        expect(await periodos.mesPagadoDelPeriodo(a.id)).toBe("2096-10");
        expect(await periodos.mesPagadoDelPeriodo(b.id)).toBe("2096-10");
      },
    },
    {
      fila: "R2", descripcion: "el período del mes siguiente y uno sin versiones no sustentan ningún pago",
      comprobar: async () => {
        const a = await periodoNuevo("2096-09-26", "2096-10-25");
        const siguiente = await periodoNuevo("2096-10-26", "2096-11-25");
        const sinVersiones = await periodoNuevo("2096-11-26", "2096-12-25");
        await versionar("2096-10", [a]);
        await pagar("2096-10", 1);

        expect(await periodos.mesPagadoDelPeriodo(siguiente.id)).toBeUndefined();
        expect(await periodos.mesPagadoDelPeriodo(sinVersiones.id)).toBeUndefined();
      },
    },
    {
      fila: "R3", descripcion: "con la versión 1 sobre el período A y la 2 pagada sobre B y C, A no sustenta el pago y B y C sí",
      comprobar: async () => {
        const a = await periodoNuevo("2096-11-26", "2096-12-05");
        const b = await periodoNuevo("2096-12-06", "2096-12-15");
        const c = await periodoNuevo("2096-12-16", "2096-12-25");
        await versionar("2096-12", [a]);
        await versionar("2096-12", [b, c]);
        await pagar("2096-12", 2);

        expect(await periodos.mesPagadoDelPeriodo(a.id)).toBeUndefined();
        expect(await periodos.mesPagadoDelPeriodo(b.id)).toBe("2096-12");
        expect(await periodos.mesPagadoDelPeriodo(c.id)).toBe("2096-12");
      },
    },
    {
      fila: "R4", descripcion: "reabrir directo en el adaptador un período fuente de un mes pagado se rechaza: sigue cerrado y sin auditoría de reapertura",
      comprobar: async () => {
        const a = await periodoNuevo("2096-09-26", "2096-10-25");
        await versionar("2096-10", [a]);
        await pagar("2096-10", 1);

        await expect(periodos.reabrir(a.id, cuentaId, "Corrección", new Date("2096-11-01T00:00:00Z"))).rejects.toThrow("Sustenta la preliquidación con pago realizado confirmado de 10/2096");

        const [periodo] = await db.select().from(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.id, a.id));
        expect(periodo.estado).toBe("cerrado");
        expect(await db.select().from(schema.auditoriaPeriodosPlanilla).where(eq(schema.auditoriaPeriodosPlanilla.periodoId, a.id))).toEqual([]);
      },
    },
  ];
  it.each(casosG13)("G13 $fila $descripcion", async ({ comprobar }) => comprobar());

  // G24 · Confirmar el pago y reabrir un período fuente se serializan con el mismo bloqueo del período (#114, P7): gana uno y el otro se rechaza (ADR 0013, contrato C2).
  const esperar = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));
  const estadoDe = (promesa: Promise<unknown>) => Promise.race([promesa.then(() => "resuelta", () => "rechazada"), esperar(400).then(() => "pendiente")]);
  /** Mantiene el bloqueo del período como lo haría una reapertura en curso, hasta que se llame a `soltar`. */
  const retenerBloqueo = async (periodoId: string) => {
    const cliente = await pool.connect();
    await cliente.query("BEGIN");
    await cliente.query("SELECT id FROM periodos_planilla WHERE id = $1 FOR UPDATE", [periodoId]);
    let suelto = false;
    return { soltar: async () => { if (suelto) return; suelto = true; await cliente.query("COMMIT"); cliente.release(); } };
  };
  const casosG24: Array<{ fila: string; descripcion: string; comprobar: () => Promise<void> }> = [
    {
      fila: "R6a", descripcion: "orden A: la reapertura llega primero, la confirmación espera el bloqueo y falla porque el período ya no está cerrado",
      comprobar: async () => {
        const a = await periodoNuevo("2096-09-26", "2096-10-25");
        await versionar("2096-10", [a]);
        const retenido = await retenerBloqueo(a.id);
        const pendientes: Array<Promise<unknown>> = [];
        try {
          const reapertura = periodos.reabrir(a.id, cuentaId, "Corrección", new Date("2096-11-01T00:00:00Z"));
          pendientes.push(reapertura.catch(() => undefined)); // si falla una aserción antes, no queda un rechazo sin atender
          expect(await estadoDe(reapertura)).toBe("pendiente");
          const confirmacion = pagar("2096-10", 1);
          pendientes.push(confirmacion.catch(() => undefined));
          expect(await estadoDe(confirmacion)).toBe("pendiente");
          await retenido.soltar();

          await expect(reapertura).resolves.toBeUndefined();
          await expect(confirmacion).rejects.toBeInstanceOf(ErrorDePeriodoFuenteReabierto);
          expect(await constancias.buscar("2096-10")).toBeUndefined();
          const [periodo] = await db.select().from(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.id, a.id));
          expect(periodo.estado).toBe("abierto");
        } finally {
          await retenido.soltar();
          await Promise.all(pendientes);
        }
      },
    },
    {
      fila: "R6b", descripcion: "orden B: la confirmación llega primero y gana; la reapertura espera y se rechaza con la causa del pago",
      comprobar: async () => {
        const a = await periodoNuevo("2096-09-26", "2096-10-25");
        await versionar("2096-10", [a]);
        const retenido = await retenerBloqueo(a.id);
        const pendientes: Array<Promise<unknown>> = [];
        try {
          const confirmacion = pagar("2096-10", 1);
          pendientes.push(confirmacion.catch(() => undefined));
          expect(await estadoDe(confirmacion)).toBe("pendiente");
          const reapertura = periodos.reabrir(a.id, cuentaId, "Corrección", new Date("2096-11-01T00:00:00Z"));
          pendientes.push(reapertura.catch(() => undefined)); // si falla una aserción antes, no queda un rechazo sin atender
          expect(await estadoDe(reapertura)).toBe("pendiente");
          await retenido.soltar();

          await expect(confirmacion).resolves.toMatchObject({ mesDePago: "2096-10", numeroDeVersion: 1 });
          await expect(reapertura).rejects.toThrow("Sustenta la preliquidación con pago realizado confirmado de 10/2096");
          const [periodo] = await db.select().from(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.id, a.id));
          expect(periodo.estado).toBe("cerrado");
        } finally {
          await retenido.soltar();
          await Promise.all(pendientes);
        }
      },
    },
  ];
  it.each(casosG24)("G24 $fila $descripcion", async ({ comprobar }) => comprobar());
});
