import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import { RepositorioPostgresDeAsistencias } from "@/asistencias/repositorio-postgres";
import { RepositorioPostgresDeImportaciones } from "@/importaciones/repositorio-postgres";
import { aprobarGruposQueGestionanAsistenciaDePrueba } from "./aprobaciones-de-prueba";
import { RepositorioPostgresDePeriodos } from "./repositorio-postgres";
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

});
