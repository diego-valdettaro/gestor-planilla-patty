import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import { confirmarAsistencia } from "@/asistencias/confirmar-y-ajustar-asistencia";
import { RepositorioPostgresDeAsistencias } from "@/asistencias/repositorio-postgres";
import { RepositorioPostgresDeImportaciones } from "@/importaciones/repositorio-postgres";
import { aprobarGruposQueGestionanAsistenciaDePrueba } from "./aprobaciones-de-prueba";
import { RepositorioPostgresDePeriodos } from "./repositorio-postgres";
import { bloquearPeriodos } from "./aprobaciones";
import { construirHechosDiarios } from "./hechos-de-asistencia-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL");

describe.skipIf(!databaseUrl)("registro y cierre #185", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const asistencias = new RepositorioPostgresDeAsistencias(db);
  const importaciones = new RepositorioPostgresDeImportaciones(db);
  const periodos = new RepositorioPostgresDePeriodos(db);
  const grupo = `QA185 ${randomUUID()}`;
  const grupoB = `QA185 B ${randomUUID()}`;
  const dniB = dniDePrueba();
  const responsableId = randomUUID();
  const dni = dniDePrueba();
  const creados: string[] = [];
  let siguienteDia = 0;
  const turno = { sede: "Centro", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false };

  beforeAll(async () => {
    await db.insert(schema.grupos).values([{ nombre: grupo }, { nombre: grupoB }]);
    await db.insert(schema.cuentasLocales).values({ id: responsableId, nombreUsuario: grupo, hashContrasena: "prueba", rol: "administrador" });
    await db.insert(schema.politicasTardanzasGrupo).values({ grupo, toleranciaEnMinutos: 30, tardanzasAcumuladas: 3, horasPenalizadas: 1, configuradaPorId: responsableId, configuradaEn: new Date() });
    await db.insert(schema.colaboradores).values([{ dni, grupo, sede: "Centro", nombre: "Ana QA185" }, { dni: dniB, grupo: grupoB, sede: "Centro", nombre: "Beto QA185" }]);
  });

  afterAll(async () => {
    const ids = (await db.select().from(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.dni, [dni, dniB]))).map(({ id }) => id);
    for (const tabla of [schema.reemplazosDeAsistenciaImportada, schema.ajustesDeAsistencia, schema.estadosManuales, schema.tardanzas, schema.horasExtra]) {
      if (ids.length) await db.delete(tabla).where(inArray(tabla.asistenciaId, ids));
    }
    await db.delete(schema.marcasCrudas).where(inArray(schema.marcasCrudas.dni, [dni, dniB]));
    await db.delete(schema.importacionesSemanales).where(eq(schema.importacionesSemanales.usuarioId, responsableId));
    await db.delete(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.dni, [dni, dniB]));
    await db.delete(schema.turnosPublicados).where(inArray(schema.turnosPublicados.dni, [dni, dniB]));
    for (const tabla of [schema.aprobacionesDeAsistencia, schema.revisionesDePeriodosPlanilla, schema.auditoriaPeriodosPlanilla]) {
      if (creados.length) await db.delete(tabla).where(inArray(tabla.periodoId, creados));
    }
    if (creados.length) await db.delete(schema.periodosPlanilla).where(inArray(schema.periodosPlanilla.id, creados));
    await db.delete(schema.relacionesLaborales).where(inArray(schema.relacionesLaborales.dni, [dni, dniB]));
    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.dni, [dni, dniB]));
    await db.delete(schema.politicasTardanzasGrupo).where(eq(schema.politicasTardanzasGrupo.grupo, grupo));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, responsableId));
    await db.delete(schema.grupos).where(inArray(schema.grupos.nombre, [grupo, grupoB]));
    await pool.end();
  });

  async function preparar() {
    const fecha = new Date(Date.UTC(2085, 0, 1 + 7 * siguienteDia++)).toISOString().slice(0, 10);
    await db.insert(schema.turnosPublicados).values({ dni, fecha, grupo, ...turno });
    const [asistencia] = await db.insert(schema.asistenciasEsperadas).values({ dni, fecha, estado: "pendiente", entradaPropuesta: `${fecha}T09:00:00Z`, salidaPropuesta: `${fecha}T17:00:00Z` }).returning();
    await importaciones.guardar({ archivo: { nombre: "original-QA185.xlsx", ubicacion: "ficticia", hashSha256: randomUUID().replaceAll("-", "").repeat(2) }, usuarioId: responsableId, importadaEn: new Date(), marcasCrudas: ["09:00", "17:00"].map((hora) => ({ dni, fecha, sede: "Centro", instante: `${fecha}T${hora}:00Z` })), propuestas: [], reemplazos: [] });
    const confirmacion = { dni, fecha, entradaReal: `${fecha}T09:00:00Z`, salidaReal: `${fecha}T17:00:00Z`, minutosTrabajados: 480, instantaneaDeTurno: turno, confirmadoPorId: responsableId, confirmadoEn: new Date() };
    // La solicitud existe cuando la jornada está pendiente. Otra operación válida la resuelve antes del cierre.
    const confirmar = () => asistencias.confirmar(confirmacion);
    const manual = () => asistencias.registrarEstadoManual({ dni, fecha, tipo: "falta", comentario: "Solicitud preparada", responsableId, registradoEn: new Date() });
    await confirmar();
    const ajustar = () => asistencias.ajustar({ dni, fecha, entradaReal: `${fecha}T09:10:00Z`, salidaReal: `${fecha}T17:00:00Z`, minutosTrabajados: 470, motivo: "Corrección preparada" }, responsableId);
    const importar = () => importaciones.guardar({ archivo: { nombre: "QA185.xlsx", ubicacion: "ficticia", hashSha256: randomUUID().replaceAll("-", "").repeat(2) }, usuarioId: responsableId, importadaEn: new Date(), marcasCrudas: [{ dni, fecha, sede: "Centro", instante: `${fecha}T09:10:00Z` }], propuestas: [], reemplazos: [{ asistenciaId: asistencia.id, dni, fecha, estadoAnterior: "confirmada", valorAnterior: { entradaReal: confirmacion.entradaReal, salidaReal: confirmacion.salidaReal }, entradaPropuesta: `${fecha}T09:10:00Z`, salidaPropuesta: `${fecha}T17:00:00Z` }] });
    const marcas = () => importaciones.guardar({ archivo: { nombre: "solo-marcas-QA185.xlsx", ubicacion: "ficticia", hashSha256: randomUUID().replaceAll("-", "").repeat(2) }, usuarioId: responsableId, importadaEn: new Date(), marcasCrudas: [{ dni, fecha, sede: "Centro", instante: `${fecha}T10:00:00Z` }], propuestas: [], reemplazos: [] });
    const [periodo] = await db.insert(schema.periodosPlanilla).values({ inicio: fecha, fin: fecha, estado: "abierto" }).returning();
    creados.push(periodo.id);
    await aprobarGruposQueGestionanAsistenciaDePrueba(db, periodo.id, responsableId);
    return { fecha, periodoId: periodo.id, escritores: { confirmar, ajustar, manual, importar, marcas } };
  }

  async function instantanea(periodoId: string, conexion = db) {
    const ids = (await conexion.select().from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, dni))).map(({ id }) => id);
    return {
      asistencias: await conexion.select().from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, dni)),
      ajustes: await conexion.select().from(schema.ajustesDeAsistencia).where(inArray(schema.ajustesDeAsistencia.asistenciaId, ids)),
      manuales: await conexion.select().from(schema.estadosManuales).where(inArray(schema.estadosManuales.asistenciaId, ids)),
      marcas: await conexion.select().from(schema.marcasCrudas).where(eq(schema.marcasCrudas.dni, dni)),
      archivos: await conexion.select().from(schema.importacionesSemanales).where(eq(schema.importacionesSemanales.usuarioId, responsableId)),
      aprobaciones: await conexion.select().from(schema.aprobacionesDeAsistencia).where(eq(schema.aprobacionesDeAsistencia.periodoId, periodoId)),
      revisiones: await new RepositorioPostgresDePeriodos(conexion).listarRevisiones(periodoId),
    };
  }

  async function esperarBloqueo(cliente: PoolClient) {
    const { rows: [backend] } = await cliente.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    for (let intento = 0; intento < 100; intento++) {
      await cliente.query("SELECT pg_stat_clear_snapshot()");
      const { rows } = await cliente.query("SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))", [backend.pid]);
      if (rows.length) return true;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return false;
  }

  const casos = (["confirmar", "ajustar", "manual", "importar"] as const).flatMap((escritor) => (["cerrado", "cierre gana carrera"] as const).map((situacion) => ({ escritor, situacion })));
  it.each(casos)("185 protección de fechas cerradas: $escritor / $situacion", probarProteccion);
  it.each((["cerrado", "cierre gana carrera"] as const).map((situacion) => ({ escritor: "marcas" as const, situacion })))("185 protección de fechas cerradas: solo marcas / $situacion", probarProteccion);

  async function probarProteccion({ escritor, situacion }: { escritor: "confirmar" | "ajustar" | "manual" | "importar" | "marcas"; situacion: "cerrado" | "cierre gana carrera" }) {
    const { periodoId, escritores } = await preparar();
    let resultado: Promise<unknown>;
    if (situacion === "cerrado") {
      await periodos.cerrar(periodoId, responsableId, new Date());
      const antes = await instantanea(periodoId);
      resultado = escritores[escritor]().then(() => null, (error: unknown) => error);
      expect(await resultado).toBeInstanceOf(Error);
      expect(String(await resultado)).toMatch(/cerrad.*reabr/i);
      expect(await instantanea(periodoId)).toEqual(antes);
    } else {
      const cliente = await pool.connect();
      let antes: Awaited<ReturnType<typeof instantanea>>;
      let esperaba = false;
      try {
        const conexion = drizzle({ client: cliente, schema });
        resultado = Promise.resolve(null);
        await conexion.transaction(async (tx) => {
          await new RepositorioPostgresDePeriodos(tx as unknown as typeof db).cerrar(periodoId, responsableId, new Date());
          antes = await instantanea(periodoId, tx as unknown as typeof db);
          resultado = escritores[escritor]().then(() => null, (error: unknown) => error);
          esperaba = await esperarBloqueo(cliente);
        });
        expect(esperaba, "El escritor debe esperar el cierre real").toBe(true);
        expect(String(await resultado)).toMatch(/cerrad.*reabr/i);
        expect(antes!.revisiones).toHaveLength(1);
        expect(await instantanea(periodoId)).toEqual(antes!);
      } finally {
        cliente.release();
      }
    }
  }
  it.each(["hueco cerrado", "pares persona fecha"] as const)("185 protección de fechas cerradas: exactitud %s", async (caso) => {
    const mes = caso === "hueco cerrado" ? "01" : "02";
    const dentro = `2086-${mes}-02`;
    const fuera = `2086-${mes}-01`;
    const despues = `2086-${mes}-03`;
    const [periodo] = await db.insert(schema.periodosPlanilla).values({ inicio: dentro, fin: dentro, estado: "abierto" }).returning();
    creados.push(periodo.id);
    await aprobarGruposQueGestionanAsistenciaDePrueba(db, periodo.id, responsableId);
    if (caso === "hueco cerrado") await periodos.cerrar(periodo.id, responsableId, new Date());
    const antes = await periodos.listarRevisiones(periodo.id);
    const pares = caso === "hueco cerrado" ? [{ dni, fecha: fuera }, { dni, fecha: despues }] : [{ dni, fecha: fuera }, { dni: dniB, fecha: dentro }];
    await db.insert(schema.turnosPublicados).values(pares.map((par) => ({ ...par, grupo: par.dni === dni ? grupo : grupoB, ...turno })));
    await importaciones.guardar({
      archivo: { nombre: "exactitud-QA185.xlsx", ubicacion: "ficticia", hashSha256: randomUUID().replaceAll("-", "").repeat(2) }, usuarioId: responsableId, importadaEn: new Date(),
      marcasCrudas: pares.map((par) => ({ ...par, sede: "Centro", instante: `${par.fecha}T09:00:00Z` })),
      propuestas: pares.map((par) => ({ ...par, estado: "pendiente", entradaPropuesta: `${par.fecha}T09:00:00Z`, salidaPropuesta: `${par.fecha}T17:00:00Z` })), reemplazos: [],
    });
    const aprobaciones = await db.select().from(schema.aprobacionesDeAsistencia).where(eq(schema.aprobacionesDeAsistencia.periodoId, periodo.id));
    expect(aprobaciones.find((a) => a.grupo === grupo)?.invalidadaEn).toBeNull();
    if (caso === "pares persona fecha") expect(aprobaciones.find((a) => a.grupo === grupoB)?.invalidadaEn).toBeInstanceOf(Date);
    else expect(aprobaciones.every((a) => a.invalidadaEn === null)).toBe(true);
    expect(await periodos.listarRevisiones(periodo.id)).toEqual(antes);
    for (const par of pares) expect(await db.select().from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, par.dni))).toEqual(expect.arrayContaining([expect.objectContaining({ ...par, estado: "pendiente", entradaPropuesta: `${par.fecha}T09:00:00Z` })]));
  });

  // F5/G4: esperados del plan E7; una hora cada 2 o cada 3 tardanzas del corte.
  it.each([
    { acumuladas: 2, mes: "09", esperados: [0, 60] },
    { acumuladas: 3, mes: "10", esperados: [0, 0, 60] },
  ])("185 apertura posterior y revisiones: una hora cada $acumuladas tardanzas", async ({ acumuladas, mes, esperados }) => {
    await db.update(schema.politicasTardanzasGrupo).set({ tardanzasAcumuladas: acumuladas })
      .where(eq(schema.politicasTardanzasGrupo.grupo, grupo));
    const exterior = `2087-${mes}-25`;
    const fechas = esperados.map((_, indice) => `2087-${mes}-${26 + indice}`);
    const ids: string[] = [];
    for (const fecha of [exterior, ...fechas]) {
      await db.insert(schema.turnosPublicados).values({ dni, fecha, grupo, ...turno });
      const [asistencia] = await db.insert(schema.asistenciasEsperadas).values({ dni, fecha, estado: "pendiente" }).returning();
      ids.push(asistencia.id);
      await asistencias.confirmar({
        dni, fecha, entradaReal: `${fecha}T09:40:00Z`, salidaReal: `${fecha}T17:00:00Z`,
        minutosTrabajados: 440, instantaneaDeTurno: turno, confirmadoPorId: responsableId, confirmadoEn: new Date(),
        tardanza: { minutosDeTardanza: 40, minutosPenalizados: 0, politicaVersion: 1 },
      });
    }
    const antes = await db.select().from(schema.tardanzas).where(inArray(schema.tardanzas.asistenciaId, ids));
    expect(antes).toHaveLength(esperados.length + 1);
    expect(antes.every((t) => t.minutosPenalizados === 0)).toBe(true);
    await periodos.crear(fechas[0], fechas.at(-1)!);
    const periodo = (await periodos.listar()).find((p) => p.inicio === fechas[0])!;
    creados.push(periodo.id);
    const resumen = await periodos.listarResumen({ periodoId: periodo.id });
    expect(resumen.filas.find((f) => f.dni === dni)?.jornadas.map((j) => j.minutosPenalizados)).toEqual(esperados);
    expect(resumen.totales.minutosPenalizados).toBe(60);
    const [fuera] = await db.select().from(schema.tardanzas).where(eq(schema.tardanzas.asistenciaId, ids[0]));
    expect(fuera).toEqual(antes.find((t) => t.asistenciaId === ids[0]));
    await db.update(schema.politicasTardanzasGrupo).set({ tardanzasAcumuladas: 3 })
      .where(eq(schema.politicasTardanzasGrupo.grupo, grupo));
  });

  it("185 guarda ciclo y corte: reabrir, ajustar confirmada y renovar solo su grupo permite revisión nueva", async () => {
    const { periodoId, fecha, escritores } = await preparar();
    await periodos.cerrar(periodoId, responsableId, new Date());
    const revision = await periodos.listarRevisiones(periodoId);
    const marcas = await asistencias.listarMarcasCrudasPorAsistencia();
    await periodos.reabrir(periodoId, responsableId, "Corregir jornada QA185", new Date());
    await escritores.ajustar();
    expect(await db.select().from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, dni))).toEqual(expect.arrayContaining([expect.objectContaining({ fecha, estado: "confirmada", minutosTrabajados: 470 })]));
    const aprobaciones = await periodos.listarAprobaciones(periodoId);
    expect(aprobaciones.find((a) => a.grupo === grupo)?.estado).toBe("invalidada");
    expect(aprobaciones.find((a) => a.grupo === grupoB)?.estado).toBe("aprobada");
    await expect(periodos.cerrar(periodoId, responsableId, new Date())).rejects.toThrow("falta la aprobación");
    await periodos.aprobarAsistencia(periodoId, grupo, responsableId, new Date());
    await periodos.cerrar(periodoId, responsableId, new Date());
    const revisiones = await periodos.listarRevisiones(periodoId);
    expect(revisiones).toHaveLength(2);
    expect(revisiones[0]).toEqual(revision[0]);
    expect(revisiones[1].numero).toBe(2);
    expect(revisiones[1].resumen.totales.minutosTrabajados).toBe(470);
    expect(await asistencias.listarMarcasCrudasPorAsistencia()).toEqual(marcas);
    expect(await db.select().from(schema.ajustesDeAsistencia)).toEqual(expect.arrayContaining([expect.objectContaining({ motivo: "Corrección preparada", responsableId })]));
    expect(await db.select().from(schema.auditoriaPeriodosPlanilla).where(eq(schema.auditoriaPeriodosPlanilla.periodoId, periodoId))).toEqual(expect.arrayContaining([expect.objectContaining({ accion: "reapertura", motivo: "Corregir jornada QA185" })]));
  });

  it("185 guarda escritura antes del cierre: el cierre espera e impide congelar con aprobación invalidada", async () => {
    const { periodoId, fecha } = await preparar();
    const cliente = await pool.connect();
    let cierre: Promise<unknown> = Promise.resolve(null);
    try {
      const conexion = drizzle({ client: cliente, schema });
      await conexion.transaction(async (tx) => {
        await new RepositorioPostgresDeAsistencias(tx as unknown as typeof db).ajustar({ dni, fecha, entradaReal: `${fecha}T09:10:00Z`, salidaReal: `${fecha}T17:00:00Z`, minutosTrabajados: 470, motivo: "Cambio antes de cierre" }, responsableId);
        cierre = periodos.cerrar(periodoId, responsableId, new Date()).then(() => null, (error: unknown) => error);
        expect(await esperarBloqueo(cliente)).toBe(true);
      });
      expect(String(await cierre)).toContain("falta la aprobación");
      expect((await periodos.buscar(periodoId))?.estado).toBe("abierto");
      expect(await periodos.listarRevisiones(periodoId)).toHaveLength(0);
    } finally {
      cliente.release();
    }
  });

  it("185 guarda ciclo y corte: rango confirma solo pendiente exterior y conserva la registrada del corte cerrado", async () => {
    const { periodoId, fecha } = await preparar();
    await periodos.cerrar(periodoId, responsableId, new Date());
    const antes = await instantanea(periodoId);
    const exterior = new Date(Date.parse(`${fecha}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
    siguienteDia++;
    await db.insert(schema.turnosPublicados).values({ dni, fecha: exterior, grupo, ...turno });
    await db.insert(schema.asistenciasEsperadas).values({ dni, fecha: exterior, estado: "pendiente", entradaPropuesta: `${exterior}T09:00:00Z`, salidaPropuesta: `${exterior}T17:00:00Z` });
    await asistencias.confirmarColaboradoresPorRango({ inicio: fecha, fin: exterior, dnis: [dni] }, responsableId);
    const despues = await instantanea(periodoId);
    expect(despues.asistencias.find((a) => a.fecha === fecha)).toEqual(antes.asistencias.find((a) => a.fecha === fecha));
    expect(despues.asistencias.find((a) => a.fecha === exterior)).toMatchObject({ estado: "confirmada", minutosTrabajados: 480 });
    expect(despues.aprobaciones).toEqual(antes.aprobaciones);
    expect(despues.revisiones).toEqual(antes.revisiones);
  });

  const casosSemanales = (["confirmar", "ajustar", "rango"] as const).flatMap((escritor) =>
    (["escritor primero", "cierre primero", "abierto"] as const).map((orden) => ({ escritor, orden, variante: "normal" as const })),
  );
  const tablaSemanal = [...casosSemanales,
    { escritor: "ajustar" as const, orden: "abierto" as const, variante: "eliminar" as const },
    { escritor: "ajustar" as const, orden: "abierto" as const, variante: "sin cambio derivado" as const },
  ];
  let semanaSiguiente = 0;
  it.each(tablaSemanal)("185-SPEC-002 efectos semanales: $escritor / $orden / $variante", async ({ escritor, orden, variante }) => {
    // F2 SPEC-002: seis jornadas de 8 h = 48 h; al confirmar el lunes, 56 h y domingo 120/360.
    // Ajuste: lunes 1 -> 8 h: extra dominical 60/0 -> 120/360.
    // Eliminación: martes–sábado 7 h y domingo 6 h = 41 h; lunes 8 -> 7: 49 -> 48 h.
    const fechas = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2090, 0, 2 + 7 * semanaSiguiente + i)).toISOString().slice(0, 10));
    semanaSiguiente++;
    const [lunes] = fechas;
    const corte = { inicio: fechas[3], fin: fechas[6] };
    const horasDelLunes = variante === "eliminar" ? 7 : variante === "sin cambio derivado" ? 2 : 8;
    const confirmarDia = async (repo: RepositorioPostgresDeAsistencias, fecha: string, horas: number) => repo.confirmar({
      dni, fecha, entradaReal: `${fecha}T09:00`, salidaReal: `${fecha}T${String(9 + horas).padStart(2, "0")}:00`,
      minutosTrabajados: horas * 60, instantaneaDeTurno: turno, confirmadoPorId: responsableId, confirmadoEn: new Date(),
    });
    for (const fecha of fechas) {
      await db.insert(schema.turnosPublicados).values({ dni, fecha, grupo, ...turno });
      await db.insert(schema.asistenciasEsperadas).values({ dni, fecha, estado: "pendiente", entradaPropuesta: `${fecha}T09:00`, salidaPropuesta: `${fecha}T17:00` });
    }
    for (const [i, fecha] of fechas.slice(1).entries()) {
      await confirmarDia(asistencias, fecha, variante === "eliminar" ? (i === 5 ? 6 : 7) : variante === "sin cambio derivado" ? 7 : 8);
    }
    if (escritor === "ajustar") await confirmarDia(asistencias, lunes, variante === "eliminar" ? 8 : 1);
    const extrasDeSemana = async () => (await asistencias.listarHorasExtra()).filter((e) => e.dni === dni && fechas.includes(e.fecha));
    for (const extra of await extrasDeSemana()) await asistencias.decidirHoraExtra(dni, extra.fecha, { estado: "aprobada" }, responsableId);
    const [periodo] = await db.insert(schema.periodosPlanilla).values({ ...corte, estado: "abierto" }).returning();
    creados.push(periodo.id);
    await aprobarGruposQueGestionanAsistenciaDePrueba(db, periodo.id, responsableId);
    const aprobacionesAntes = await periodos.listarAprobaciones(periodo.id);
    const escribir = async (conexion: NodePgDatabase<typeof schema>) => {
      const repo = new RepositorioPostgresDeAsistencias(conexion);
      if (escritor === "confirmar") await confirmarDia(repo, lunes, 8);
      else if (escritor === "rango") await repo.confirmarColaboradoresPorRango({ inicio: lunes, fin: lunes, dnis: [dni] }, responsableId);
      else await repo.ajustar({ dni, fecha: lunes, entradaReal: `${lunes}T09:00`, salidaReal: `${lunes}T${String(9 + horasDelLunes).padStart(2, "0")}:00`, minutosTrabajados: horasDelLunes * 60, motivo: "Corrección semanal QA185" }, responsableId);
    };
    const revisionesCrudas = () => db.select().from(schema.revisionesDePeriodosPlanilla).where(eq(schema.revisionesDePeriodosPlanilla.periodoId, periodo.id));
    const datosVivos = async () => ({
      jornadas: await db.select().from(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.dni, dni), gte(schema.asistenciasEsperadas.fecha, corte.inicio), lte(schema.asistenciasEsperadas.fecha, corte.fin))).orderBy(schema.asistenciasEsperadas.fecha),
      extras: await extrasDeSemana(),
      hechos: await construirHechosDiarios(db, corte),
    });
    let revisionAntes: Awaited<ReturnType<typeof revisionesCrudas>> | undefined;
    let vivosAntes: Awaited<ReturnType<typeof datosVivos>> | undefined;
    let esperaba = false;
    let resultado: unknown;
    if (orden === "abierto") await escribir(db);
    else {
      const a = await pool.connect();
      const b = await pool.connect();
      const conexionA = drizzle({ client: a, schema });
      const conexionB = drizzle({ client: b, schema });
      let pendiente: Promise<unknown> = Promise.resolve();
      try {
        const pidA = (await a.query("select pg_backend_pid() as pid")).rows[0].pid;
        const pidB = (await b.query("select pg_backend_pid() as pid")).rows[0].pid;
        expect(pidA).not.toBe(pidB);
        console.log("QA185 dos conexiones", { escritor, orden, pidA, pidB });
        if (orden === "escritor primero") {
          await conexionA.transaction(async (tx) => {
            await escribir(tx as unknown as typeof db);
            pendiente = new RepositorioPostgresDePeriodos(conexionB).cerrar(periodo.id, responsableId, new Date()).then(() => null, (e: unknown) => e);
            esperaba = await esperarBloqueo(a);
          });
        } else {
          await conexionB.transaction(async (tx) => {
            await new RepositorioPostgresDePeriodos(tx as unknown as typeof db).cerrar(periodo.id, responsableId, new Date());
            pendiente = escribir(conexionA).then(() => null, (e: unknown) => e);
            esperaba = await esperarBloqueo(b);
          });
        }
        resultado = await pendiente;
      } finally {
        await pendiente;
        a.release(); b.release();
      }
      if (orden === "escritor primero") {
        // En el candidato, B puede cerrar sin esperar y congelar la versión anterior.
        expect(esperaba, "El cierre debe esperar los efectos semanales del lunes exterior").toBe(true);
        expect(String(resultado)).toContain("falta la aprobación");
        expect(await periodos.listarRevisiones(periodo.id)).toHaveLength(0);
      } else {
        expect(esperaba, "El escritor debe esperar el cierre de otro período de su semana").toBe(true);
        if (resultado) {
          expect(escritor).toBe("rango");
          expect(String(resultado)).toContain("La selección cambió");
          expect((await db.select().from(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, lunes))))[0].estado).toBe("pendiente");
          await escribir(db);
        }
        revisionAntes = await revisionesCrudas();
        vivosAntes = await datosVivos();
        expect(vivosAntes.hechos).toEqual(revisionAntes[0].hechos);
        const esperado = escritor === "ajustar" ? [{ fecha: fechas[6], minutosAl25: 60, minutosAl35: 0, estado: "aprobada" }] : [];
        expect(vivosAntes.extras).toEqual(esperado.map((e) => expect.objectContaining(e)));
        expect(await periodos.listarAprobaciones(periodo.id)).toEqual(aprobacionesAntes);
        // Otra escritura exterior tampoco altera los datos vivos ni la revisión ya cerrada.
        if (escritor === "ajustar") await escribir(db);
        expect(await revisionesCrudas()).toEqual(revisionAntes);
        expect(await datosVivos()).toEqual(vivosAntes);
        return;
      }
    }
    const aprobaciones = await periodos.listarAprobaciones(periodo.id);
    expect(aprobaciones.find((a) => a.grupo === grupoB)).toEqual(aprobacionesAntes.find((a) => a.grupo === grupoB));
    expect(aprobaciones.find((a) => a.grupo === grupo)?.estado).toBe(variante === "sin cambio derivado" ? "aprobada" : "invalidada");
    const esperadas = variante === "eliminar" || variante === "sin cambio derivado" ? [] : [{ dni, fecha: fechas[6], minutosAl25: 120, minutosAl35: 360, estado: "pendiente" }];
    expect(await extrasDeSemana()).toEqual(esperadas);
    expect((await db.select().from(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, lunes))))[0].estado).toBe("confirmada");
    if (variante !== "sin cambio derivado") {
      await expect(periodos.cerrar(periodo.id, responsableId, new Date())).rejects.toThrow("falta la aprobación");
      for (const extra of await extrasDeSemana()) await asistencias.decidirHoraExtra(dni, extra.fecha, { estado: "aprobada" }, responsableId);
      // Renovación agrega una aprobación, sin borrar el historial de la invalidada.
      await periodos.aprobarAsistencia(periodo.id, grupo, responsableId, new Date());
      const historial = await db.select().from(schema.aprobacionesDeAsistencia).where(and(eq(schema.aprobacionesDeAsistencia.periodoId, periodo.id), eq(schema.aprobacionesDeAsistencia.grupo, grupo)));
      expect(historial).toHaveLength(2);
      expect(historial.filter((a) => a.invalidadaEn !== null)).toHaveLength(1);
    }
    await periodos.cerrar(periodo.id, responsableId, new Date());
    const [revision] = await revisionesCrudas();
    expect((await datosVivos()).hechos).toEqual(revision.hechos);
    expect(revision.numero).toBe(1);
  });

  // Ronda2 E321 / plan E322-E325: período inicialmente inexistente; oráculos literales.
  let semanaNueva = 0;
  async function prepararCreacion(escritor: "confirmar" | "ajustar" | "rango") {
    const base = new Date("2092-01-01T00:00:00Z");
    while (base.getUTCDay() !== 1) base.setUTCDate(base.getUTCDate() + 1);
    const fechas = Array.from({ length: 7 }, (_, i) => new Date(base.getTime() + (7 * semanaNueva + i) * 86400000).toISOString().slice(0, 10));
    semanaNueva++;
    const corte = { inicio: fechas[3], fin: fechas[6] };
    for (const [persona, ingreso] of [[dni, fechas[0]], [dniB, fechas[3]]] as const) {
      await db.insert(schema.relacionesLaborales).values({ dni: persona, ingreso, cese: fechas[6], registradaPorId: responsableId,
        ingresoConfirmadoPorId: responsableId, ingresoConfirmadoEn: new Date(), ceseConfirmadoPorId: responsableId, ceseConfirmadoEn: new Date() });
    }
    for (const [persona, dias] of [[dni, fechas], [dniB, fechas.slice(3)]] as const) {
      for (const fecha of dias) {
        await db.insert(schema.turnosPublicados).values({ dni: persona, fecha, grupo: persona === dni ? grupo : grupoB, ...turno });
        await db.insert(schema.asistenciasEsperadas).values({ dni: persona, fecha, estado: "pendiente", entradaPropuesta: `${fecha}T09:00`, salidaPropuesta: `${fecha}T17:00` });
        if (fecha !== fechas[0] || persona === dniB || escritor === "ajustar") {
          const horas = fecha === fechas[0] && persona === dni ? 1 : 8;
          await asistencias.confirmar({ dni: persona, fecha, entradaReal: `${fecha}T09:00`, salidaReal: `${fecha}T${9 + horas}:00`, minutosTrabajados: horas * 60, instantaneaDeTurno: turno, confirmadoPorId: responsableId, confirmadoEn: new Date() });
        }
      }
    }
    for (const extra of (await asistencias.listarHorasExtra()).filter((e) => e.dni === dni && fechas.includes(e.fecha))) {
      await asistencias.decidirHoraExtra(dni, extra.fecha, { estado: "aprobada" }, responsableId);
    }
    const escribir = async (conexion: NodePgDatabase<typeof schema>) => {
      const repo = new RepositorioPostgresDeAsistencias(conexion);
      if (escritor === "rango") await repo.confirmarColaboradoresPorRango({ dnis: [dni], inicio: fechas[0], fin: fechas[0] }, responsableId);
      else if (escritor === "ajustar") await repo.ajustar({ dni, fecha: fechas[0], entradaReal: `${fechas[0]}T09:00`, salidaReal: `${fechas[0]}T17:00`, minutosTrabajados: 480, motivo: "Corrección exterior R2" }, responsableId);
      else await repo.confirmar({ dni, fecha: fechas[0], entradaReal: `${fechas[0]}T09:00`, salidaReal: `${fechas[0]}T17:00`, minutosTrabajados: 480, instantaneaDeTurno: turno, confirmadoPorId: responsableId, confirmadoEn: new Date() });
    };
    const crear = async (repo: RepositorioPostgresDePeriodos) => {
      await repo.crear(corte.inicio, corte.fin);
      const periodo = (await repo.listar()).find((p) => p.inicio === corte.inicio)!;
      creados.push(periodo.id);
      return periodo.id;
    };
    const aprobar = async (conexion: NodePgDatabase<typeof schema>, id: string) => {
      await aprobarGruposQueGestionanAsistenciaDePrueba(conexion, id, responsableId, { excepto: [grupo, grupoB] });
      const repo = new RepositorioPostgresDePeriodos(conexion);
      await repo.aprobarAsistencia(id, grupo, responsableId, new Date());
      await repo.aprobarAsistencia(id, grupoB, responsableId, new Date());
    };
    const vivos = async (conexion = db) => ({
      jornadas: await conexion.select().from(schema.asistenciasEsperadas).where(and(inArray(schema.asistenciasEsperadas.dni, [dni, dniB]), gte(schema.asistenciasEsperadas.fecha, corte.inicio), lte(schema.asistenciasEsperadas.fecha, corte.fin))).orderBy(schema.asistenciasEsperadas.dni, schema.asistenciasEsperadas.fecha),
      extras: (await new RepositorioPostgresDeAsistencias(conexion).listarHorasExtra()).filter((e) => [dni, dniB].includes(e.dni) && fechas.slice(3).includes(e.fecha)),
      hechos: await construirHechosDiarios(conexion, corte),
    });
    return { fechas, corte, escribir, crear, aprobar, vivos };
  }

  const carrerasNuevas = (["confirmar", "ajustar", "rango"] as const).flatMap((escritor) =>
    (["escritor primero", "creación y cierre primero", "creación y aprobación abierta primero"] as const).map((orden) => ({ escritor, orden })));
  it.each(carrerasNuevas)("185-SPEC-002 creación concurrente: $escritor / $orden", async ({ escritor, orden }) => {
    const f = await prepararCreacion(escritor);
    expect((await periodos.listar()).some((p) => p.inicio === f.corte.inicio)).toBe(false);
    const a = await pool.connect(); const b = await pool.connect();
    const ca = drizzle({ client: a, schema }); const cb = drizzle({ client: b, schema });
    const rb = new RepositorioPostgresDePeriodos(cb);
    let pendiente: Promise<unknown> = Promise.resolve(); let id = ""; let espera = false; let resultado: unknown;
    let congelado: Awaited<ReturnType<typeof f.vivos>> | undefined;
    let revision: Awaited<ReturnType<typeof periodos.listarRevisiones>> | undefined;
    let aprobaciones: Awaited<ReturnType<typeof periodos.listarAprobaciones>> | undefined;
    try {
      const pidA = (await a.query("select pg_backend_pid() as pid")).rows[0].pid;
      const pidB = (await b.query("select pg_backend_pid() as pid")).rows[0].pid;
      expect(pidA).not.toBe(pidB);
      await a.query("set statement_timeout = '10s'"); await b.query("set statement_timeout = '10s'");
      console.log("R2 dos conexiones", { escritor, orden, pidA, pidB });
      if (orden === "escritor primero") {
        await ca.transaction(async (tx) => {
          await f.escribir(tx as unknown as typeof db);
          pendiente = f.crear(rb).then((nuevoId) => { id = nuevoId; return null; }, (error: unknown) => error);
          espera = await esperarBloqueo(a);
          console.log("R2 barrera", { escritor, orden, espera });
        }, { isolationLevel: escritor === "rango" ? "serializable" : "read committed" });
      } else {
        await cb.transaction(async (tx) => {
          const conexion = tx as unknown as typeof db; const repo = new RepositorioPostgresDePeriodos(conexion);
          id = await f.crear(repo); await f.aprobar(conexion, id);
          if (orden === "creación y cierre primero") await repo.cerrar(id, responsableId, new Date());
          congelado = await f.vivos(conexion);
          revision = await repo.listarRevisiones(id); aprobaciones = await repo.listarAprobaciones(id);
          pendiente = f.escribir(ca).then(() => null, (error: unknown) => error);
          espera = await esperarBloqueo(b);
          console.log("R2 barrera", { escritor, orden, espera });
        });
      }
      resultado = await pendiente;
    } finally {
      await pendiente;
      await a.query("reset statement_timeout"); await b.query("reset statement_timeout"); a.release(); b.release();
    }
    expect(espera, "Crear y escritor deben esperar incluso cuando el período no era visible").toBe(true);
    if (resultado) {
      expect(escritor).toBe("rango"); expect(String(resultado)).toContain("La selección cambió");
      await f.escribir(db);
    }
    if (orden === "creación y cierre primero") {
      expect(await f.vivos()).toEqual(congelado);
      expect(await periodos.listarRevisiones(id)).toEqual(revision);
      expect(await periodos.listarAprobaciones(id)).toEqual(aprobaciones);
      const extra = (await f.vivos()).extras;
      expect(extra).toEqual(escritor === "ajustar" ? [expect.objectContaining({ fecha: f.fechas[6], minutosAl25: 60, minutosAl35: 0, estado: "aprobada" })] : []);
    } else {
      if (orden === "escritor primero") await f.aprobar(db, id);
      else {
        const actuales = await periodos.listarAprobaciones(id);
        expect(actuales.find((g) => g.grupo === grupo)?.estado).toBe("invalidada");
        expect(actuales.find((g) => g.grupo === grupoB)).toEqual(aprobaciones!.find((g) => g.grupo === grupoB));
        expect((await f.vivos()).jornadas.filter((j) => j.dni === dniB)).toEqual(congelado!.jornadas.filter((j) => j.dni === dniB));
        await expect(periodos.cerrar(id, responsableId, new Date())).rejects.toThrow("falta la aprobación");
        await periodos.aprobarAsistencia(id, grupo, responsableId, new Date());
      }
      expect((await f.vivos()).extras).toEqual([expect.objectContaining({ dni, fecha: f.fechas[6], minutosAl25: 120, minutosAl35: 360, estado: "pendiente" })]);
      await expect(periodos.cerrar(id, responsableId, new Date())).rejects.toThrow("horas extra pendientes");
      await asistencias.decidirHoraExtra(dni, f.fechas[6], { estado: "aprobada" }, responsableId);
      await periodos.cerrar(id, responsableId, new Date());
    }
    const [cerrada] = await periodos.listarRevisiones(id);
    expect(cerrada.numero).toBe(1);
    expect(cerrada.resumen.totales).toMatchObject({ jornadasTrabajadas: 8, minutosTrabajados: 3840, minutosPenalizados: 0 });
    expect(cerrada.resumen.filas.flatMap((g) => g.jornadas).map((j) => j.fecha).sort()).toEqual(f.fechas.slice(3).flatMap((fecha) => [fecha, fecha]).sort());
    const vivos = await f.vivos();
    expect(vivos.hechos).toEqual((await periodos.leerHechosDelPeriodo(id)).hechos);
    // Contraste independiente con filas vivas, no con listarResumen del corte cerrado (que lee la misma revisión).
    for (const jornada of vivos.jornadas) {
      const detalle = cerrada.resumen.filas.find((fila) => fila.dni === jornada.dni)?.jornadas.find((j) => j.fecha === jornada.fecha);
      expect(detalle).toMatchObject({ fecha: jornada.fecha, resultado: "trabajada", minutosTrabajados: jornada.minutosTrabajados, entradaReal: jornada.entradaReal, salidaReal: jornada.salidaReal });
    }
    expect(vivos.hechos).toHaveLength(8);
    for (const hecho of vivos.hechos) expect(hecho).toMatchObject({ resultado: "trabajada", minutosTrabajados: 480 });
    const antes = await periodos.listarRevisiones(id);
    await new RepositorioPostgresDeAsistencias(db).ajustar({ dni, fecha: f.fechas[0], entradaReal: `${f.fechas[0]}T09:00`, salidaReal: `${f.fechas[0]}T16:00`, minutosTrabajados: 420, motivo: "Guarda exterior" }, responsableId);
    expect(await f.vivos()).toEqual(vivos); expect(await periodos.listarRevisiones(id)).toEqual(antes);
  });

  it.each((["importar", "manual"] as const).flatMap(escritor =>
    (["escritor primero", "cierre primero"] as const).map(orden => ({ escritor, orden }))))(
    "185 recuperación SPEC002: $escritor / $orden", async ({ escritor, orden }) => {
      const f = await prepararCreacion("ajustar");
      const fecha = f.fechas[3];
      const [jornada] = await db.select().from(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, fecha)));
      if (escritor === "manual" && orden === "escritor primero") {
        await db.update(schema.asistenciasEsperadas).set({ estado: "pendiente" }).where(eq(schema.asistenciasEsperadas.id, jornada.id));
      }
      const escribir = (conexion: NodePgDatabase<typeof schema>) => escritor === "manual"
        ? new RepositorioPostgresDeAsistencias(conexion).registrarEstadoManual({ dni, fecha, tipo: "falta", comentario: "Carrera", responsableId, registradoEn: new Date() })
        : new RepositorioPostgresDeImportaciones(conexion).guardar({
          archivo: { nombre: "carrera.xlsx", ubicacion: "ficticia", hashSha256: randomUUID().replaceAll("-", "").repeat(2) },
          usuarioId: responsableId, importadaEn: new Date(), marcasCrudas: [], propuestas: [],
          reemplazos: [{ asistenciaId: jornada.id, dni, fecha, estadoAnterior: "confirmada", valorAnterior: {}, entradaPropuesta: `${fecha}T09:00`, salidaPropuesta: `${fecha}T17:00` }],
        });
      let id = "";
      const cerrar = async (conexion: NodePgDatabase<typeof schema>) => {
        const repo = new RepositorioPostgresDePeriodos(conexion);
        id = await f.crear(repo);
        if (orden === "escritor primero" && escritor === "importar") {
          await new RepositorioPostgresDeAsistencias(conexion).confirmar({ dni, fecha, entradaReal: `${fecha}T09:00`, salidaReal: `${fecha}T17:00`, minutosTrabajados: 480, instantaneaDeTurno: turno, confirmadoPorId: responsableId, confirmadoEn: new Date() });
        }
        await f.aprobar(conexion, id);
        await repo.cerrar(id, responsableId, new Date());
      };
      const a = await pool.connect(); const b = await pool.connect();
      const ca = drizzle({ client: a, schema }); const cb = drizzle({ client: b, schema });
      let pendiente: Promise<unknown> = Promise.resolve(); let espera = false;
      try {
        await a.query("set statement_timeout = '5s'"); await b.query("set statement_timeout = '5s'");
        await ca.transaction(async tx => {
          if (orden === "escritor primero") await escribir(tx);
          else await cerrar(tx);
          pendiente = (orden === "escritor primero" ? cerrar(cb) : escribir(cb)).then(() => null, (error: unknown) => error);
          espera = await esperarBloqueo(a);
        });
        const error = await pendiente;
        expect(espera, "La ausencia inicial de períodos también debe serializarse").toBe(true);
        if (orden === "cierre primero") expect(String(error)).toContain("período cerrado");
        else expect(error).toBeNull();
        const antes = await f.vivos();
        await expect(escribir(db)).rejects.toThrow("período cerrado");
        expect(await f.vivos()).toEqual(antes);
        expect((await periodos.buscar(id))?.estado).toBe("cerrado");
        expect(await periodos.listarRevisiones(id)).toHaveLength(1);
      } finally {
        await pendiente; await a.query("reset statement_timeout"); await b.query("reset statement_timeout"); a.release(); b.release();
      }
    });

  it.each(["apertura antes", "apertura después"] as const)("185 recuperación SPEC003: %s", async orden => {
    const mes = orden === "apertura antes" ? "09" : "10";
    const exterior = `2095-${mes}-26`; const inicio = `2095-${mes}-27`; const fin = `2095-${mes}-28`;
    await db.update(schema.politicasTardanzasGrupo).set({ tardanzasAcumuladas: 2 }).where(eq(schema.politicasTardanzasGrupo.grupo, grupo));
    await db.insert(schema.relacionesLaborales).values({ dni, ingreso: exterior, cese: fin, registradaPorId: responsableId, ingresoConfirmadoPorId: responsableId, ingresoConfirmadoEn: new Date(), ceseConfirmadoPorId: responsableId, ceseConfirmadoEn: new Date() });
    for (const fecha of [exterior, inicio, fin]) {
      await db.insert(schema.turnosPublicados).values({ dni, fecha, grupo, ...turno });
      await db.insert(schema.asistenciasEsperadas).values({ dni, fecha, estado: "pendiente" });
    }
    const confirmar = (fecha: string, hora: string) => confirmarAsistencia(asistencias, { id: responsableId, rol: "administrador" }, { dni, fecha, sede: "Centro", entradaReal: `${fecha}T${hora}`, salidaReal: `${fecha}T17:00` });
    await confirmar(exterior, "09:40");
    if (orden === "apertura antes") await periodos.crear(inicio, fin);
    await confirmar(inicio, "09:40"); await confirmar(fin, "09:00");
    if (orden === "apertura después") await periodos.crear(inicio, fin);
    const periodo = (await periodos.listar()).find(p => p.inicio === inicio)!; creados.push(periodo.id);
    const resumen = await periodos.listarResumen({ periodoId: periodo.id });
    expect(resumen.filas.find(f => f.dni === dni)?.jornadas.map(j => j.minutosPenalizados)).toEqual([0, 0]);
    await aprobarGruposQueGestionanAsistenciaDePrueba(db, periodo.id, responsableId);
    await periodos.cerrar(periodo.id, responsableId, new Date());
    expect((await periodos.listarResumen({ periodoId: periodo.id })).totales.minutosPenalizados).toBe(0);
    await db.update(schema.politicasTardanzasGrupo).set({ tardanzasAcumuladas: 3 }).where(eq(schema.politicasTardanzasGrupo.grupo, grupo));
  });

  // Compatibilidad obligatoria E325: guardas que ya pueden pasar antes del gate, no TDD nuevo.
  it.each(["bloquear-cerrar", "bloquear-reabrir", "aprobar-cerrar", "decidir-cerrar"] as const)("185-SPEC-002 creación concurrente compatibilidad: %s", async (cliente) => {
    const f = await prepararCreacion("confirmar"); const id = await f.crear(periodos);
    if (cliente !== "aprobar-cerrar") await f.aprobar(db, id);
    let extraId = "";
    if (cliente === "decidir-cerrar") {
      const [jornada] = await db.select().from(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, f.fechas[6])));
      const [extra] = await db.insert(schema.horasExtra).values({ asistenciaId: jornada.id, minutosAl25: 8, minutosAl35: 0, estado: "pendiente" }).returning(); extraId = extra.id;
    }
    if (cliente === "bloquear-reabrir") await periodos.cerrar(id, responsableId, new Date());
    const a = await pool.connect(); const b = await pool.connect();
    const ca = drizzle({ client: a, schema }); const cb = drizzle({ client: b, schema });
    let pendiente: Promise<unknown> = Promise.resolve(); let espera = false;
    try {
      await a.query("set statement_timeout = '10s'"); await b.query("set statement_timeout = '10s'");
      await ca.transaction(async (tx) => {
        const conexion = tx as unknown as typeof db; const repo = new RepositorioPostgresDePeriodos(conexion);
        if (cliente.startsWith("bloquear")) await bloquearPeriodos(tx);
        else if (cliente === "aprobar-cerrar") {
          await aprobarGruposQueGestionanAsistenciaDePrueba(conexion, id, responsableId, { excepto: [grupo] });
          await repo.aprobarAsistencia(id, grupo, responsableId, new Date());
        } else await repo.decidirHorasExtra(id, [extraId], { estado: "aprobada" }, responsableId, new Date());
        const rival = new RepositorioPostgresDePeriodos(cb);
        pendiente = (cliente === "bloquear-reabrir" ? rival.reabrir(id, responsableId, "Rival", new Date()) : rival.cerrar(id, responsableId, new Date())).then(() => null, (e: unknown) => e);
        espera = await esperarBloqueo(a);
        if (cliente === "bloquear-reabrir") await repo.reabrir(id, responsableId, "Anidada", new Date());
        else await repo.cerrar(id, responsableId, new Date());
      });
      expect(espera).toBe(true);
      expect(String(await pendiente)).toMatch(/ya est|ya cerrad|no est|no existe/i);
    } finally {
      await pendiente; await a.query("reset statement_timeout"); await b.query("reset statement_timeout"); a.release(); b.release();
    }
    expect((await periodos.buscar(id))?.estado).toBe(cliente === "bloquear-reabrir" ? "abierto" : "cerrado");
    expect(await periodos.listarRevisiones(id)).toHaveLength(1);
  });

});
