import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  estadoDeCeldaAsistencia,
  etiquetaDeCeldaAsistencia,
  type DiaDeAsistencia,
} from "@/app/asistencias/estado-de-celda";
import * as schema from "@/db/schema";

import { RepositorioPostgresDeAsistencias, type FilaDeResumenMensual } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

function diaDeFila(fila: FilaDeResumenMensual): DiaDeAsistencia {
  return {
    estado: fila.estado,
    designacionManual: fila.estadoManual,
    hayMarcasCrudas: fila.hayMarcasCrudas,
    propuestaCompleta: Boolean(fila.entradaPropuesta && fila.salidaPropuesta),
    enPeriodoCerrado: fila.enPeriodoCerrado,
  };
}

describe.skipIf(!databaseUrl)("RepositorioPostgresDeAsistencias · resumen mensual y estado de celda", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeAsistencias(db);

  const idHuellero = `TEST-${randomUUID()}`;
  const cuentaId = randomUUID();
  const importacionId = randomUUID();

  const fechaEsperada = "2031-03-10";
  const fechaPendienteDeRevision = "2031-03-11";
  const fechaConfirmada = "2031-03-12";
  const fechaManual = "2031-03-13";
  const fechaLiquidada = "2031-02-15";
  const fechasDeMarzo = [fechaEsperada, fechaPendienteDeRevision, fechaConfirmada, fechaManual];
  const todasLasFechas = [...fechasDeMarzo, fechaLiquidada];

  const periodoAbierto = { inicio: "2031-02-26", fin: "2031-03-25" } as const;
  const periodoCerrado = { inicio: "2031-01-26", fin: "2031-02-25" } as const;

  beforeAll(async () => {
    await db.insert(schema.colaboradores).values({ idHuellero, nombre: "Nora Prueba", sede: "Lima", activo: true });
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `asis-${cuentaId}`, hashContrasena: "prueba", rol: "administracion" });
    await db.insert(schema.periodosPlanilla).values([
      { inicio: periodoAbierto.inicio, fin: periodoAbierto.fin, estado: "abierto" },
      { inicio: periodoCerrado.inicio, fin: periodoCerrado.fin, estado: "cerrado", cerradoPorId: cuentaId, cerradoEn: new Date() },
    ]);

    await db.insert(schema.asistenciasEsperadas).values([
      { idHuellero, fecha: fechaEsperada, estado: "pendiente" },
      { idHuellero, fecha: fechaPendienteDeRevision, estado: "pendiente" },
      { idHuellero, fecha: fechaConfirmada, estado: "confirmada", entradaReal: `${fechaConfirmada}T09:00`, salidaReal: `${fechaConfirmada}T18:00`, minutosTrabajados: 540 },
      { idHuellero, fecha: fechaManual, estado: "manual" },
      { idHuellero, fecha: fechaLiquidada, estado: "pendiente" },
    ]);

    const [manual] = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.idHuellero, idHuellero), eq(schema.asistenciasEsperadas.fecha, fechaManual)));
    await db.insert(schema.estadosManuales).values({ asistenciaId: manual.id, tipo: "feriado", comentario: "Prueba de integración", responsableId: cuentaId });

    await db.insert(schema.importacionesSemanales).values({
      id: importacionId, sede: "Lima", semana: "2031-03-09", archivoNombre: "prueba.xlsx",
      archivoUbicacion: "prueba/prueba.xlsx", archivoHashSha256: "0".repeat(64), usuarioId: cuentaId,
    });
    // Una sola marca del día: no permite proponer entrada y salida completas.
    await db.insert(schema.marcasCrudas).values({ importacionId, idHuellero, fecha: fechaPendienteDeRevision, instante: `${fechaPendienteDeRevision}T09:03` });
  });

  afterAll(async () => {
    const asistencias = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.idHuellero, idHuellero), inArray(schema.asistenciasEsperadas.fecha, todasLasFechas)));
    if (asistencias.length) {
      await db.delete(schema.estadosManuales).where(inArray(schema.estadosManuales.asistenciaId, asistencias.map(({ id }) => id)));
    }
    await db.delete(schema.marcasCrudas).where(eq(schema.marcasCrudas.importacionId, importacionId));
    await db.delete(schema.importacionesSemanales).where(eq(schema.importacionesSemanales.id, importacionId));
    await db.delete(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.idHuellero, idHuellero), inArray(schema.asistenciasEsperadas.fecha, todasLasFechas)));
    await db.delete(schema.periodosPlanilla).where(inArray(schema.periodosPlanilla.inicio, [periodoAbierto.inicio, periodoCerrado.inicio]));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.idHuellero, idHuellero));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await pool.end();
  });

  it("un día con horario y sin marcas se deriva como 'esperada'", async () => {
    const filas = await repositorio.listarResumenMensual(idHuellero, "2031-03-01", "2031-03-31");
    const fila = filas.find(({ fecha }) => fecha === fechaEsperada)!;
    expect(fila.hayMarcasCrudas).toBe(false);
    expect(fila.enPeriodoCerrado).toBe(false);
    expect(estadoDeCeldaAsistencia(diaDeFila(fila))).toBe("esperada");
  });

  it("un día pendiente con marcas que no permiten proponer entrada/salida se deriva como 'pendiente-de-revision'", async () => {
    const filas = await repositorio.listarResumenMensual(idHuellero, "2031-03-01", "2031-03-31");
    const fila = filas.find(({ fecha }) => fecha === fechaPendienteDeRevision)!;
    expect(fila.hayMarcasCrudas).toBe(true);
    expect(Boolean(fila.entradaPropuesta && fila.salidaPropuesta)).toBe(false);
    expect(estadoDeCeldaAsistencia(diaDeFila(fila))).toBe("pendiente-de-revision");
  });

  it("un día confirmado se deriva como 'registrada'", async () => {
    const filas = await repositorio.listarResumenMensual(idHuellero, "2031-03-01", "2031-03-31");
    const fila = filas.find(({ fecha }) => fecha === fechaConfirmada)!;
    expect(estadoDeCeldaAsistencia(diaDeFila(fila))).toBe("registrada");
  });

  it("un día con designación manual se deriva como 'registrada' y se etiqueta con el tipo", async () => {
    const filas = await repositorio.listarResumenMensual(idHuellero, "2031-03-01", "2031-03-31");
    const fila = filas.find(({ fecha }) => fecha === fechaManual)!;
    const estado = estadoDeCeldaAsistencia(diaDeFila(fila));
    expect(estado).toBe("registrada");
    expect(etiquetaDeCeldaAsistencia(estado, fila.estadoManual)).toBe("Feriado");
  });

  it("un día dentro de un período de planilla cerrado se deriva como 'liquidado'", async () => {
    const filas = await repositorio.listarResumenMensual(idHuellero, "2031-02-01", "2031-02-28");
    const fila = filas.find(({ fecha }) => fecha === fechaLiquidada)!;
    expect(fila.enPeriodoCerrado).toBe(true);
    expect(estadoDeCeldaAsistencia(diaDeFila(fila))).toBe("liquidado");
  });
});
