import { dniDePrueba } from "../colaboradores/dni-de-prueba";
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
  const dni = dniDePrueba();
  const cuentaId = randomUUID();
  const fecha = "2032-09-01";
  const casosDeUso = crearCasosDeUsoDeImportaciones(repositorio, { obtenerActorActual: async () => ({ id: cuentaId, rol: "administrador" }) });

  beforeAll(async () => {
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.sedes).values({ nombre: sede, grupo, activa: true });
    await db.insert(schema.colaboradores).values({ dni, nombre: "Colaborador de importación", sede, grupo, activo: true });
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `import-${sufijo}`, hashContrasena: "prueba", rol: "administrador" });
    await db.insert(schema.periodosPlanilla).values([
      { inicio: "2032-08-26", fin: "2032-09-25", estado: "abierto" },
      { inicio: "2032-11-01", fin: "2032-11-01", estado: "cerrado", cerradoPorId: cuentaId, cerradoEn: new Date() },
    ]);
  });

  afterAll(async () => {
    const importaciones = await db.select({ id: schema.importacionesSemanales.id }).from(schema.importacionesSemanales)
      .where(eq(schema.importacionesSemanales.usuarioId, cuentaId));
    for (const { id } of importaciones) {
      await db.delete(schema.marcasCrudas).where(eq(schema.marcasCrudas.importacionId, id));
      await db.delete(schema.reemplazosDeAsistenciaImportada).where(eq(schema.reemplazosDeAsistenciaImportada.importacionId, id));
    }
    await db.delete(schema.importacionesSemanales).where(eq(schema.importacionesSemanales.usuarioId, cuentaId));
    const asistencias = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
      .where(eq(schema.asistenciasEsperadas.dni, dni));
    for (const { id } of asistencias) {
      await db.delete(schema.tardanzas).where(eq(schema.tardanzas.asistenciaId, id));
      await db.delete(schema.horasExtra).where(eq(schema.horasExtra.asistenciaId, id));
    }
    await db.delete(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, dni));
    await db.delete(schema.turnosPublicados).where(eq(schema.turnosPublicados.dni, dni));
    await db.delete(schema.periodosPlanilla).where(and(eq(schema.periodosPlanilla.inicio, "2032-08-26"), eq(schema.periodosPlanilla.fin, "2032-09-25")));
    await db.delete(schema.periodosPlanilla).where(and(eq(schema.periodosPlanilla.inicio, "2032-11-01"), eq(schema.periodosPlanilla.fin, "2032-11-01")));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await pool.end();
  });

  it.each([
    ["antes del primer corte", "2032-08-25", "1"],
    ["en el hueco posterior al corte", "2032-10-01", "2"],
  ])("185 importación anterior al período: %s", async (_caso, dia, hash) => {
    await db.insert(schema.turnosPublicados).values({
      dni, fecha: dia, grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null,
    });
    const solicitud = {
      filas: [{ fila: 2, dni, sede, fecha: dia, entrada: "09:05", salida: "18:10" }],
      erroresDelArchivo: [],
      archivo: { nombre: `sin-periodo-${dia}.xlsx`, ubicacion: `pruebas/sin-periodo-${dia}.xlsx`, hashSha256: hash.repeat(64) },
      confirmarReemplazoDeConfirmadas: false,
    };

    try {
      await expect(casosDeUso.previsualizar(solicitud)).resolves.toMatchObject({ errores: [], vistaPrevia: { conteos: { nuevo: 1 } } });
      await expect(casosDeUso.aplicar(solicitud)).resolves.toEqual({ requiereConfirmacion: false, jornadas: 1 });
      await expect(repositorio.buscarAsistenciasExistentes([{ dni, fecha: dia }])).resolves.toMatchObject([{
        dni, fecha: dia, estado: "pendiente", entradaPropuesta: `${dia}T09:05:00`, salidaPropuesta: `${dia}T18:10:00`,
        entradaReal: null, salidaReal: null,
      }]);
      await expect(db.select({ instante: schema.marcasCrudas.instante }).from(schema.marcasCrudas)
        .where(and(eq(schema.marcasCrudas.dni, dni), eq(schema.marcasCrudas.fecha, dia))).orderBy(schema.marcasCrudas.instante))
        .resolves.toEqual([{ instante: `${dia}T09:05:00` }, { instante: `${dia}T18:10:00` }]);
      await expect(db.select({ nombre: schema.importacionesSemanales.archivoNombre, ubicacion: schema.importacionesSemanales.archivoUbicacion })
        .from(schema.importacionesSemanales).where(and(eq(schema.importacionesSemanales.archivoHashSha256, hash.repeat(64)), eq(schema.importacionesSemanales.usuarioId, cuentaId))))
        .resolves.toEqual([{ nombre: solicitud.archivo.nombre, ubicacion: solicitud.archivo.ubicacion }]);
    } finally {
      const fuentes = await db.select({ id: schema.importacionesSemanales.id }).from(schema.importacionesSemanales)
        .where(and(eq(schema.importacionesSemanales.archivoHashSha256, hash.repeat(64)), eq(schema.importacionesSemanales.usuarioId, cuentaId)));
      for (const { id } of fuentes) {
        await db.delete(schema.marcasCrudas).where(eq(schema.marcasCrudas.importacionId, id));
        await db.delete(schema.importacionesSemanales).where(eq(schema.importacionesSemanales.id, id));
      }
      await db.delete(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, dia)));
      await db.delete(schema.turnosPublicados).where(and(eq(schema.turnosPublicados.dni, dni), eq(schema.turnosPublicados.fecha, dia)));
    }
  });

  it("persiste una carga autosuficiente sin sede ni semana de alcance", async () => {
    await db.insert(schema.turnosPublicados).values({
      dni, fecha, grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null,
    });
    const sedeDelArchivo = ` ${sede.toLocaleUpperCase()} `;

    const resultado = await casosDeUso.aplicar({
      filas: [{ fila: 2, dni, sede: sedeDelArchivo, fecha, entrada: "09:05", salida: "18:10" }],
      erroresDelArchivo: [], archivo: { nombre: "asistencias.xlsx", ubicacion: "pruebas/asistencias.xlsx", hashSha256: "a".repeat(64) },
      confirmarReemplazoDeConfirmadas: false,
    });

    expect(resultado).toEqual({ requiereConfirmacion: false, jornadas: 1 });
    await expect(db.select({ sede: schema.importacionesSemanales.sede, semana: schema.importacionesSemanales.semana })
      .from(schema.importacionesSemanales).where(eq(schema.importacionesSemanales.usuarioId, cuentaId))).resolves.toEqual([{ sede: null, semana: null }]);
    await expect(db.select({ sede: schema.marcasCrudas.sede, instante: schema.marcasCrudas.instante }).from(schema.marcasCrudas)
      .innerJoin(schema.importacionesSemanales, eq(schema.marcasCrudas.importacionId, schema.importacionesSemanales.id))
      .where(eq(schema.importacionesSemanales.usuarioId, cuentaId))).resolves.toEqual([
      { sede: sedeDelArchivo, instante: `${fecha}T09:05:00` }, { sede: sedeDelArchivo, instante: `${fecha}T18:10:00` },
    ]);
  });

  it("una fila idéntica es un no-op y una fila ausente del archivo permanece intacta", async () => {
    const otroDia = "2032-09-02";
    await db.insert(schema.turnosPublicados).values({
      dni, fecha: otroDia, grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null,
    });
    const [existente] = await db.insert(schema.asistenciasEsperadas).values({
      dni, fecha: otroDia, estado: "pendiente", entradaPropuesta: `${otroDia}T09:00:00`, salidaPropuesta: `${otroDia}T18:00:00`,
    }).returning({ id: schema.asistenciasEsperadas.id });

    const resultado = await casosDeUso.aplicar({
      filas: [{ fila: 2, dni, sede, fecha: otroDia, entrada: "09:00", salida: "18:00" }],
      erroresDelArchivo: [], archivo: { nombre: "asistencias.xlsx", ubicacion: "pruebas/asistencias.xlsx", hashSha256: "b".repeat(64) },
      confirmarReemplazoDeConfirmadas: false,
    });

    expect(resultado).toEqual({ requiereConfirmacion: false, jornadas: 0 });
    await expect(db.select({ entradaPropuesta: schema.asistenciasEsperadas.entradaPropuesta })
      .from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.id, existente.id)))
      .resolves.toEqual([{ entradaPropuesta: `${otroDia}T09:00:00` }]);
    await expect(db.select({ id: schema.asistenciasEsperadas.id })
      .from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.fecha, fecha)))
      .resolves.toHaveLength(1);
  });

  it("exige confirmación antes de reemplazar una jornada confirmada y, al confirmar, conserva el valor anterior y retira los derivados", async () => {
    const diaConfirmado = "2032-09-03";
    await db.insert(schema.turnosPublicados).values({
      dni, fecha: diaConfirmado, grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null,
    });
    const [confirmada] = await db.insert(schema.asistenciasEsperadas).values({
      dni, fecha: diaConfirmado, estado: "confirmada",
      entradaReal: `${diaConfirmado}T08:30:00`, salidaReal: `${diaConfirmado}T17:30:00`, minutosTrabajados: 540,
      confirmadoPorId: cuentaId, confirmadoEn: new Date(),
    }).returning({ id: schema.asistenciasEsperadas.id });
    await db.insert(schema.tardanzas).values({ asistenciaId: confirmada.id, minutosDeTardanza: 5, minutosPenalizados: 0, politicaVersion: 1 });
    await db.insert(schema.horasExtra).values({ asistenciaId: confirmada.id, minutosAl25: 0, minutosAl35: 0, estado: "pendiente" });

    const solicitud = {
      filas: [{ fila: 2, dni, sede, fecha: diaConfirmado, entrada: "09:00", salida: "18:00" }],
      erroresDelArchivo: [], archivo: { nombre: "asistencias.xlsx", ubicacion: "pruebas/asistencias.xlsx", hashSha256: "c".repeat(64) },
    };

    const sinConfirmar = await casosDeUso.aplicar({ ...solicitud, confirmarReemplazoDeConfirmadas: false });
    expect(sinConfirmar).toEqual({ requiereConfirmacion: true, conteos: { nuevo: 0, igual: 0, pendiente: 0, confirmado: 1 } });
    await expect(db.select({ estado: schema.asistenciasEsperadas.estado }).from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.id, confirmada.id)))
      .resolves.toEqual([{ estado: "confirmada" }]);

    const confirmado = await casosDeUso.aplicar({ ...solicitud, confirmarReemplazoDeConfirmadas: true });
    expect(confirmado).toEqual({ requiereConfirmacion: false, jornadas: 1 });

    const [actualizada] = await db.select().from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.id, confirmada.id));
    expect(actualizada).toMatchObject({
      estado: "pendiente", entradaPropuesta: `${diaConfirmado}T09:00:00`, salidaPropuesta: `${diaConfirmado}T18:00:00`,
      entradaReal: null, salidaReal: null, minutosTrabajados: null, confirmadoPorId: null, confirmadoEn: null,
    });
    await expect(db.select().from(schema.tardanzas).where(eq(schema.tardanzas.asistenciaId, confirmada.id))).resolves.toEqual([]);
    await expect(db.select().from(schema.horasExtra).where(eq(schema.horasExtra.asistenciaId, confirmada.id))).resolves.toEqual([]);
    const [reemplazo] = await db.select().from(schema.reemplazosDeAsistenciaImportada).where(eq(schema.reemplazosDeAsistenciaImportada.asistenciaId, confirmada.id));
    expect(reemplazo).toMatchObject({
      estadoAnterior: "confirmada",
      valorAnterior: { entradaReal: `${diaConfirmado}T08:30:00`, salidaReal: `${diaConfirmado}T17:30:00` },
      responsableId: cuentaId,
    });
  });

  it("rechaza toda la carga cuando una fila cae en un período cerrado, sin persistir ninguna fila", async () => {
    const diaCerrado = "2032-11-01";
    const diaValido = "2032-09-04";
    await db.insert(schema.turnosPublicados).values([
      { dni, fecha: diaValido, grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null },
      { dni, fecha: diaCerrado, grupo, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null },
    ]);

    await expect(casosDeUso.aplicar({
      filas: [
        { fila: 2, dni, sede, fecha: diaValido, entrada: "09:00", salida: "18:00" },
        { fila: 3, dni, sede, fecha: diaCerrado, entrada: "09:00", salida: "18:00" },
      ],
      erroresDelArchivo: [], archivo: { nombre: "asistencias.xlsx", ubicacion: "pruebas/asistencias.xlsx", hashSha256: "d".repeat(64) },
      confirmarReemplazoDeConfirmadas: false,
    })).rejects.toMatchObject({ errores: [expect.objectContaining({ fila: 3, motivo: "El período de planilla está cerrado. Pida a Finanzas que lo reabra." })] });

    await expect(db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, diaValido))))
      .resolves.toEqual([]);
  });

  it("es atómica: si una jornada pendiente pasó a confirmada antes de guardar la propuesta, no persiste ningún cambio de la carga", async () => {
    const diaNuevo = "2032-09-07";
    const diaYaConfirmada = "2032-09-08";
    const [pendiente] = await db.insert(schema.asistenciasEsperadas).values({
      dni, fecha: diaYaConfirmada, estado: "pendiente",
      entradaPropuesta: `${diaYaConfirmada}T08:00:00`, salidaPropuesta: `${diaYaConfirmada}T17:00:00`,
    }).returning({ id: schema.asistenciasEsperadas.id });

    // Simula que otro proceso ya confirmó la jornada mientras se preparaba esta propuesta.
    await db.update(schema.asistenciasEsperadas)
      .set({ estado: "confirmada", entradaReal: `${diaYaConfirmada}T08:00:00`, salidaReal: `${diaYaConfirmada}T17:00:00`, minutosTrabajados: 540 })
      .where(eq(schema.asistenciasEsperadas.id, pendiente.id));

    await expect(repositorio.guardar({
      archivo: { nombre: "concurrente-propuesta.xlsx", ubicacion: "pruebas/concurrente-propuesta.xlsx", hashSha256: "g".repeat(64) },
      usuarioId: cuentaId, importadaEn: new Date(),
      marcasCrudas: [],
      propuestas: [
        { dni, fecha: diaNuevo, estado: "pendiente", entradaPropuesta: `${diaNuevo}T09:00:00`, salidaPropuesta: `${diaNuevo}T18:00:00` },
        { dni, fecha: diaYaConfirmada, estado: "pendiente", entradaPropuesta: `${diaYaConfirmada}T09:00:00`, salidaPropuesta: `${diaYaConfirmada}T18:00:00` },
      ],
      reemplazos: [],
    })).rejects.toThrow(`La asistencia de ${dni} el ${diaYaConfirmada} cambió mientras se aplicaba la importación.`);

    await expect(db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, diaNuevo))))
      .resolves.toEqual([]);
    await expect(db.select({ estado: schema.asistenciasEsperadas.estado }).from(schema.asistenciasEsperadas)
      .where(eq(schema.asistenciasEsperadas.id, pendiente.id)))
      .resolves.toEqual([{ estado: "confirmada" }]);
  });

  it("es atómica: si una asistencia cambió de estado antes de guardar su reemplazo, no persiste ningún cambio de la carga", async () => {
    const diaNuevo = "2032-09-05";
    const diaConcurrente = "2032-09-06";
    const [confirmada] = await db.insert(schema.asistenciasEsperadas).values({
      dni, fecha: diaConcurrente, estado: "confirmada",
      entradaReal: `${diaConcurrente}T08:30:00`, salidaReal: `${diaConcurrente}T17:30:00`, minutosTrabajados: 540,
    }).returning({ id: schema.asistenciasEsperadas.id });

    // Simula que otro proceso ya resolvió la jornada mientras se preparaba este reemplazo.
    await db.update(schema.asistenciasEsperadas)
      .set({ estado: "pendiente", entradaReal: null, salidaReal: null, minutosTrabajados: null })
      .where(eq(schema.asistenciasEsperadas.id, confirmada.id));

    await expect(repositorio.guardar({
      archivo: { nombre: "concurrente.xlsx", ubicacion: "pruebas/concurrente.xlsx", hashSha256: "e".repeat(64) },
      usuarioId: cuentaId, importadaEn: new Date(), marcasCrudas: [],
      propuestas: [{ dni, fecha: diaNuevo, estado: "pendiente", entradaPropuesta: `${diaNuevo}T09:00:00`, salidaPropuesta: `${diaNuevo}T18:00:00` }],
      reemplazos: [{
        dni, fecha: diaConcurrente, asistenciaId: confirmada.id, estadoAnterior: "confirmada",
        valorAnterior: { entradaReal: `${diaConcurrente}T08:30:00`, salidaReal: `${diaConcurrente}T17:30:00` },
        entradaPropuesta: `${diaConcurrente}T09:00:00`, salidaPropuesta: `${diaConcurrente}T18:00:00`,
      }],
    })).rejects.toThrow(`La asistencia de ${dni} el ${diaConcurrente} cambió mientras se aplicaba la importación.`);

    await expect(db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, diaNuevo))))
      .resolves.toEqual([]);
    await expect(db.select({ id: schema.reemplazosDeAsistenciaImportada.id }).from(schema.reemplazosDeAsistenciaImportada)
      .where(eq(schema.reemplazosDeAsistenciaImportada.asistenciaId, confirmada.id)))
      .resolves.toEqual([]);
  });
});
