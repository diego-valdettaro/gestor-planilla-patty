import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { PeriodosSolapadosError } from "./periodo-planilla";
import { RepositorioPostgresDePeriodos } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("períodos de planilla persistidos", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const periodos = new RepositorioPostgresDePeriodos(db);
  const inicio = "2031-05-26";
  const fin = "2031-06-25";
  const sufijo = randomUUID().slice(0, 8);
  const cuentaId = randomUUID();
  const grupoActual = `Actual 74 ${sufijo}`;
  const grupoHistorico = `Historico 74 ${sufijo}`;
  const segundoGrupo = `Segundo 74 ${sufijo}`;
  const ana = `L74-A-${sufijo}`;
  const beto = `L74-B-${sufijo}`;
  let periodoDeRevisionId = "";

  beforeAll(async () => {
    await db.insert(schema.grupos).values([{ nombre: grupoActual }, { nombre: grupoHistorico }, { nombre: segundoGrupo }]);
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `liquidacion-${sufijo}`, hashContrasena: "prueba", rol: "administracion" });
    await db.insert(schema.colaboradores).values([
      { idHuellero: ana, nombre: "Ana Historica", sede: "Sede fija actual", grupo: grupoActual },
      { idHuellero: beto, nombre: "Beto Segundo", sede: "Otra sede fija", grupo: segundoGrupo },
    ]);
    const [periodoDeRevision] = await db.insert(schema.periodosPlanilla).values({ inicio: "2042-01-01", fin: "2042-01-10", estado: "abierto" }).returning({ id: schema.periodosPlanilla.id });
    periodoDeRevisionId = periodoDeRevision.id;
    const fechas = ["2041-12-31", ...Array.from({ length: 10 }, (_, indice) => `2042-01-${String(indice + 1).padStart(2, "0")}`), "2042-01-11"];
    await db.insert(schema.turnosPublicados).values(fechas.map((fecha, indice) => ({
      idHuellero: ana, fecha, grupo: grupoHistorico, sede: indice === 8 ? "Sede Sur" : "Sede programada", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false,
    })));
    await db.insert(schema.turnosPublicados).values({ idHuellero: beto, fecha: "2042-01-10", grupo: segundoGrupo, sede: "Sede B", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false });
    const asistenciasAna = await db.insert(schema.asistenciasEsperadas).values([
      { idHuellero: ana, fecha: "2041-12-31", estado: "confirmada", minutosTrabajados: 999, entradaReal: "2041-12-31T09:00:00Z", salidaReal: "2041-12-31T17:00:00Z", instantaneaDeTurno: { sede: "Fuera", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false } },
      { idHuellero: ana, fecha: "2042-01-01", estado: "confirmada", minutosTrabajados: 480, entradaReal: "2042-01-01T09:15:00Z", salidaReal: "2042-01-01T17:15:00Z", instantaneaDeTurno: { sede: "Sede Norte", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false } },
      ...(["falta", "descanso", "feriado", "vacaciones", "permiso", "suspension"] as const).map((_, indice) => ({ idHuellero: ana, fecha: `2042-01-0${indice + 2}`, estado: "manual" as const })),
      { idHuellero: ana, fecha: "2042-01-08", estado: "confirmada", minutosTrabajados: 450, entradaReal: "2042-01-08T09:00:00Z", salidaReal: "2042-01-08T16:30:00Z", instantaneaDeTurno: { sede: "Sede Sur", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false } },
      { idHuellero: ana, fecha: "2042-01-09", estado: "confirmada", minutosTrabajados: 420, entradaReal: "2042-01-09T09:00:00Z", salidaReal: "2042-01-09T16:00:00Z", instantaneaDeTurno: { sede: "Sede Centro", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false } },
      { idHuellero: ana, fecha: "2042-01-10", estado: "pendiente" },
      { idHuellero: ana, fecha: "2042-01-11", estado: "confirmada", minutosTrabajados: 999, entradaReal: "2042-01-11T09:00:00Z", salidaReal: "2042-01-11T17:00:00Z", instantaneaDeTurno: { sede: "Fuera", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false } },
    ]).returning({ id: schema.asistenciasEsperadas.id, fecha: schema.asistenciasEsperadas.fecha });
    const porFecha = new Map(asistenciasAna.map((fila) => [fila.fecha, fila.id]));
    for (const [indice, motivo] of (["falta", "descanso", "feriado", "vacaciones", "permiso", "suspension"] as const).entries()) {
      await db.insert(schema.estadosManuales).values({ asistenciaId: porFecha.get(`2042-01-0${indice + 2}`)!, tipo: motivo, comentario: "Resultado real", responsableId: cuentaId });
    }
    await db.insert(schema.tardanzas).values({ asistenciaId: porFecha.get("2042-01-01")!, minutosDeTardanza: 15, minutosPenalizados: 60, politicaVersion: 1 });
    await db.insert(schema.horasExtra).values([
      { asistenciaId: porFecha.get("2042-01-01")!, minutosAl25: 30, minutosAl35: 0, estado: "pendiente" },
      { asistenciaId: porFecha.get("2042-01-08")!, minutosAl25: 60, minutosAl35: 30, estado: "aprobada" },
      { asistenciaId: porFecha.get("2042-01-09")!, minutosAl25: 0, minutosAl35: 60, estado: "rechazada" },
    ]);
    await db.insert(schema.asistenciasEsperadas).values({ idHuellero: beto, fecha: "2042-01-10", estado: "confirmada", minutosTrabajados: 480, entradaReal: "2042-01-10T09:00:00Z", salidaReal: "2042-01-10T17:00:00Z", instantaneaDeTurno: { sede: "Sede B", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false } });
  });

  afterAll(async () => {
    const asistencias = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.idHuellero, [ana, beto]));
    const ids = asistencias.map(({ id }) => id);
    if (ids.length) {
      await db.delete(schema.tardanzas).where(inArray(schema.tardanzas.asistenciaId, ids));
      await db.delete(schema.horasExtra).where(inArray(schema.horasExtra.asistenciaId, ids));
      await db.delete(schema.estadosManuales).where(inArray(schema.estadosManuales.asistenciaId, ids));
    }
    await db.delete(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.idHuellero, [ana, beto]));
    await db.delete(schema.turnosPublicados).where(inArray(schema.turnosPublicados.idHuellero, [ana, beto]));
    await db.delete(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.id, periodoDeRevisionId));
    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.idHuellero, [ana, beto]));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await db.delete(schema.grupos).where(inArray(schema.grupos.nombre, [grupoActual, grupoHistorico, segundoGrupo]));
    await db.delete(schema.periodosPlanilla).where(and(gte(schema.periodosPlanilla.inicio, "2031-05-01"), lte(schema.periodosPlanilla.fin, "2031-08-31")));
    await pool.end();
  });

  it("resume todas las jornadas del rango con grupo, sede y resultado históricos", async () => {
    const resumen = await periodos.listarResumen({ periodoId: periodoDeRevisionId });

    expect(resumen.filas).toHaveLength(2);
    const fila = resumen.filas.find(({ idHuellero }) => idHuellero === ana)!;
    expect(fila.grupo).toBe(grupoHistorico);
    expect(fila.jornadasTrabajadas).toBe(3);
    expect(fila.minutosTrabajados).toBe(1_350);
    expect(fila.noAsistencias).toEqual({ falta: 1, descanso: 1, feriado: 1, vacaciones: 1, permiso: 1, suspension: 1 });
    expect(fila.cantidadTardanzas).toBe(1);
    expect(fila.minutosPenalizados).toBe(60);
    expect(fila.horasExtra).toEqual({ pendiente: { minutosAl25: 30, minutosAl35: 0 }, aprobada: { minutosAl25: 60, minutosAl35: 30 }, rechazada: { minutosAl25: 0, minutosAl35: 60 } });
    expect(fila.jornadas.find(({ fecha }) => fecha === "2042-01-01")?.sede).toBe("Sede Norte");
    expect(fila.jornadas.map(({ fecha }) => fecha)).not.toContain("2041-12-31");
    expect(fila.jornadas.map(({ fecha }) => fecha)).not.toContain("2042-01-11");
  });

  it("mantiene totales y bloqueos globales cuando los filtros cambian la presentación", async () => {
    const completo = await periodos.listarResumen({ periodoId: periodoDeRevisionId });
    const filtrado = await periodos.listarResumen({ periodoId: periodoDeRevisionId, sede: "Sede Sur", idHuellero: ana });

    expect(filtrado.filas.map(({ idHuellero }) => idHuellero)).toEqual([ana]);
    expect(filtrado.totales).toEqual(completo.totales);
    expect(filtrado.bloqueos).toEqual(completo.bloqueos);
    expect(filtrado.bloqueos).toEqual(expect.arrayContaining([
      expect.objectContaining({ tipo: "asistencia", idHuellero: ana, grupo: grupoActual, fecha: "2042-01-10" }),
      expect.objectContaining({ tipo: "hora-extra", idHuellero: ana, fecha: "2042-01-01" }),
    ]));
  });

  it("crea un período y lo expone en el listado", async () => {
    await periodos.crear(inicio, fin);

    await expect(periodos.listar()).resolves.toContainEqual(expect.objectContaining({ inicio, fin, estado: "abierto" }));
  });

  it("rechaza un período que se solapa con uno existente", async () => {
    await expect(periodos.crear("2031-06-01", "2031-06-30")).rejects.toThrow(PeriodosSolapadosError);
  });

  it("persiste un período contiguo que no se solapa", async () => {
    const inicioContiguo = "2031-06-26";
    const finContiguo = "2031-07-25";

    await periodos.crear(inicioContiguo, finContiguo);

    await expect(periodos.listar()).resolves.toContainEqual(expect.objectContaining({ inicio: inicioContiguo, fin: finContiguo, estado: "abierto" }));
  });
});
