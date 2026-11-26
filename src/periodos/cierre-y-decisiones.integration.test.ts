import { dniDePrueba } from "../colaboradores/dni-de-prueba";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { aprobarGruposQueGestionanAsistenciaDePrueba, eliminarAprobacionesDePrueba } from "./aprobaciones-de-prueba";
import { decidirHorasExtra } from "./periodo-planilla";
import { RepositorioPostgresDePeriodos } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("decisiones y revisiones de períodos en PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDePeriodos(db);
  const sufijo = randomUUID().slice(0, 8);
  const grupo = `Grupo 75 ${sufijo}`;
  const dni = dniDePrueba();
  const finanzasId = randomUUID();
  const administracionId = randomUUID();
  const instantePrimerCierre = new Date("2071-02-05T10:00:00Z");
  const instanteSegundoCierre = new Date("2071-02-06T10:00:00Z");
  let periodoDecisionesId = "";
  let periodoCierreId = "";
  let extraUnoId = "";
  let extraDosId = "";
  let asistenciaTrabajadaId = "";
  let asistenciaPendienteId = "";

  beforeAll(async () => {
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.cuentasLocales).values([
      { id: finanzasId, nombreUsuario: `finanzas-75-${sufijo}`, hashContrasena: "prueba", rol: "finanzas" },
      { id: administracionId, nombreUsuario: `admin-75-${sufijo}`, hashContrasena: "prueba", rol: "administrador" },
    ]);
    await db.insert(schema.colaboradores).values({ dni, nombre: "Ana Revisión", sede: "Centro", grupo });
    // ADR0012: esta guarda prueba pendientes exigibles, dentro de una relación confirmada.
    await db.insert(schema.relacionesLaborales).values({
      dni, ingreso: "2071-01-01", registradaPorId: administracionId,
      ingresoConfirmadoPorId: administracionId, ingresoConfirmadoEn: instantePrimerCierre,
    });
    const periodos = await db.insert(schema.periodosPlanilla).values([
      { inicio: "2071-01-01", fin: "2071-01-10", estado: "abierto" },
      { inicio: "2071-02-01", fin: "2071-02-03", estado: "abierto" },
    ]).returning({ id: schema.periodosPlanilla.id, inicio: schema.periodosPlanilla.inicio });
    periodoDecisionesId = periodos.find(({ inicio }) => inicio === "2071-01-01")!.id;
    periodoCierreId = periodos.find(({ inicio }) => inicio === "2071-02-01")!.id;

    const fechas = ["2071-01-01", "2071-01-02", "2071-02-01", "2071-02-02", "2071-02-03"];
    await db.insert(schema.turnosPublicados).values(fechas.map((fecha) => ({
      dni, fecha, grupo, sede: "Centro", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false,
    })));
    const asistencias = await db.insert(schema.asistenciasEsperadas).values([
      ...["2071-01-01", "2071-01-02"].map((fecha) => ({
        dni, fecha, estado: "confirmada" as const, entradaReal: `${fecha}T09:00:00Z`, salidaReal: `${fecha}T18:00:00Z`, minutosTrabajados: 540,
        instantaneaDeTurno: { sede: "Centro", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false },
      })),
      { dni, fecha: "2071-02-01", estado: "confirmada", entradaReal: "2071-02-01T09:15:00Z", salidaReal: "2071-02-01T18:00:00Z", minutosTrabajados: 525, instantaneaDeTurno: { sede: "Centro", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false } },
      { dni, fecha: "2071-02-02", estado: "manual" },
      { dni, fecha: "2071-02-03", estado: "pendiente" },
    ]).returning({ id: schema.asistenciasEsperadas.id, fecha: schema.asistenciasEsperadas.fecha });
    const porFecha = new Map(asistencias.map(({ id, fecha }) => [fecha, id]));
    asistenciaTrabajadaId = porFecha.get("2071-02-01")!;
    asistenciaPendienteId = porFecha.get("2071-02-03")!;
    const extras = await db.insert(schema.horasExtra).values([
      { asistenciaId: porFecha.get("2071-01-01")!, minutosAl25: 60, minutosAl35: 0 },
      { asistenciaId: porFecha.get("2071-01-02")!, minutosAl25: 0, minutosAl35: 60 },
      { asistenciaId: asistenciaTrabajadaId, minutosAl25: 60, minutosAl35: 0, estado: "aprobada", decididaPorId: finanzasId, decididaEn: instantePrimerCierre },
    ]).returning({ id: schema.horasExtra.id, asistenciaId: schema.horasExtra.asistenciaId });
    extraUnoId = extras.find(({ asistenciaId }) => asistenciaId === porFecha.get("2071-01-01"))!.id;
    extraDosId = extras.find(({ asistenciaId }) => asistenciaId === porFecha.get("2071-01-02"))!.id;
    await db.insert(schema.tardanzas).values({ asistenciaId: asistenciaTrabajadaId, minutosDeTardanza: 15, minutosPenalizados: 60, politicaVersion: 3 });
    await db.insert(schema.estadosManuales).values({ asistenciaId: porFecha.get("2071-02-02")!, tipo: "falta", comentario: "Ausencia confirmada", responsableId: administracionId });
  });

  afterAll(async () => {
    const asistencias = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, dni));
    const ids = asistencias.map(({ id }) => id);
    await eliminarAprobacionesDePrueba(db, [periodoDecisionesId, periodoCierreId]);
    await db.delete(schema.revisionesDePeriodosPlanilla).where(inArray(schema.revisionesDePeriodosPlanilla.periodoId, [periodoDecisionesId, periodoCierreId]));
    await db.delete(schema.auditoriaPeriodosPlanilla).where(inArray(schema.auditoriaPeriodosPlanilla.periodoId, [periodoDecisionesId, periodoCierreId]));
    if (ids.length) {
      await db.delete(schema.horasExtra).where(inArray(schema.horasExtra.asistenciaId, ids));
      await db.delete(schema.tardanzas).where(inArray(schema.tardanzas.asistenciaId, ids));
      await db.delete(schema.estadosManuales).where(inArray(schema.estadosManuales.asistenciaId, ids));
    }
    await db.delete(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, dni));
    await db.delete(schema.turnosPublicados).where(eq(schema.turnosPublicados.dni, dni));
    await db.delete(schema.periodosPlanilla).where(inArray(schema.periodosPlanilla.id, [periodoDecisionesId, periodoCierreId]));
    await db.delete(schema.relacionesLaborales).where(eq(schema.relacionesLaborales.dni, dni));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await db.delete(schema.cuentasLocales).where(inArray(schema.cuentasLocales.id, [finanzasId, administracionId]));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await pool.end();
  });

  it("decide varias horas extra de forma atómica dentro del período abierto", async () => {
    await expect(repositorio.decidirHorasExtra(periodoDecisionesId, [extraUnoId, randomUUID()], { estado: "aprobada" }, finanzasId, instantePrimerCierre)).rejects.toThrow("pendientes");
    const despuesDelFallo = await db.select({ estado: schema.horasExtra.estado }).from(schema.horasExtra).where(inArray(schema.horasExtra.id, [extraUnoId, extraDosId]));
    expect(despuesDelFallo.map(({ estado }) => estado)).toEqual(["pendiente", "pendiente"]);

    await repositorio.decidirHorasExtra(
      periodoDecisionesId, [extraUnoId, extraDosId],
      { estado: "descartada", causa: "marca_erronea", motivo: "Marca duplicada del huellero" }, finanzasId, instantePrimerCierre,
    );

    const decididas = await db.select().from(schema.horasExtra).where(inArray(schema.horasExtra.id, [extraUnoId, extraDosId]));
    const descartada = { estado: "descartada", causaDeDescarte: "marca_erronea", motivoDeDescarte: "Marca duplicada del huellero", decididaPorId: finanzasId, decididaEn: instantePrimerCierre };
    expect(decididas).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: extraUnoId, ...descartada }),
      expect.objectContaining({ id: extraDosId, ...descartada }),
    ]));
  });

  it("rechaza en el caso de uso un descarte sin motivo o sin evidencia y deja la hora extra pendiente", async () => {
    const [pendiente] = await db.insert(schema.horasExtra).values({ asistenciaId: asistenciaPendienteId, minutosAl25: 45, minutosAl35: 0 }).returning({ id: schema.horasExtra.id });
    const finanzas = { id: finanzasId, nombreUsuario: "finanzas", rol: "finanzas" as const };
    const base = { periodoId: periodoCierreId, horasExtraIds: [pendiente.id], decision: "descartada" as const };

    await expect(decidirHorasExtra(repositorio, finanzas, { ...base, causa: "marca_erronea", motivo: " " })).rejects.toThrow("requiere un motivo");
    await expect(decidirHorasExtra(repositorio, finanzas, { ...base, motivo: "Marca duplicada" })).rejects.toThrow("evidencia");
    await expect(decidirHorasExtra(repositorio, finanzas, { ...base, causa: "sin_autorizacion_previa", motivo: "No estaba autorizada" })).rejects.toThrow("no justifica");

    const [fila] = await db.select().from(schema.horasExtra).where(eq(schema.horasExtra.id, pendiente.id));
    expect(fila).toMatchObject({ estado: "pendiente", causaDeDescarte: null, motivoDeDescarte: null });
    await db.delete(schema.horasExtra).where(eq(schema.horasExtra.id, pendiente.id));
  });

  it("la base impide descartar una hora extra sin evidencia ni motivo o dejar un descarte en otra decisión", async () => {
    const [pendiente] = await db.insert(schema.horasExtra).values({ asistenciaId: asistenciaPendienteId, minutosAl25: 45, minutosAl35: 0 }).returning({ id: schema.horasExtra.id });
    const actualizar = (valores: Partial<typeof schema.horasExtra.$inferInsert>) => db.update(schema.horasExtra).set(valores).where(eq(schema.horasExtra.id, pendiente.id));

    await expect(actualizar({ estado: "descartada" })).rejects.toThrow();
    await expect(actualizar({ estado: "descartada", causaDeDescarte: "marca_erronea", motivoDeDescarte: "   " })).rejects.toThrow();
    await expect(actualizar({ estado: "aprobada", causaDeDescarte: "marca_erronea", motivoDeDescarte: "Marca duplicada" })).rejects.toThrow();
    await db.delete(schema.horasExtra).where(eq(schema.horasExtra.id, pendiente.id));
  });

  it("bloquea pendientes, congela una revisión completa y conserva cierres anteriores al reabrir", async () => {
    // El cierre exige la aprobación de cada grupo que gestiona asistencia (ADR 0012); aquí no es lo que se prueba.
    await aprobarGruposQueGestionanAsistenciaDePrueba(db, periodoCierreId, finanzasId);
    await expect(repositorio.cerrar(periodoCierreId, finanzasId, instantePrimerCierre)).rejects.toThrow("asistencias pendientes");
    await db.update(schema.asistenciasEsperadas).set({ estado: "confirmada", entradaReal: "2071-02-03T09:00:00Z", salidaReal: "2071-02-03T18:00:00Z", minutosTrabajados: 540, instantaneaDeTurno: { sede: "Centro", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false } }).where(eq(schema.asistenciasEsperadas.id, asistenciaPendienteId));
    const [extraPendiente] = await db.insert(schema.horasExtra).values({ asistenciaId: asistenciaPendienteId, minutosAl25: 60, minutosAl35: 0 }).returning({ id: schema.horasExtra.id });

    await expect(repositorio.cerrar(periodoCierreId, finanzasId, instantePrimerCierre)).rejects.toThrow("horas extra pendientes");
    await repositorio.decidirHorasExtra(periodoCierreId, [extraPendiente.id], { estado: "aprobada" }, finanzasId, instantePrimerCierre);
    await repositorio.cerrar(periodoCierreId, finanzasId, instantePrimerCierre);

    const [primera] = await repositorio.listarRevisiones(periodoCierreId);
    expect(primera).toMatchObject({ numero: 1, responsableId: finanzasId, cerradaEn: instantePrimerCierre });
    expect(primera.resumen.bloqueos).toEqual([]);
    expect(primera.resumen.filas[0].jornadas).toEqual(expect.arrayContaining([
      expect.objectContaining({ fecha: "2071-02-01", resultado: "trabajada", politicaDeTardanzaVersion: 3 }),
      expect.objectContaining({ fecha: "2071-02-02", resultado: "falta" }),
      expect.objectContaining({ fecha: "2071-02-03", horaExtra: expect.objectContaining({ estado: "aprobada" }) }),
    ]));
    expect(primera.resumen.totales).toMatchObject({ jornadasTrabajadas: 2, minutosTrabajados: 1_065, minutosPenalizados: 60 });

    await repositorio.reabrir(periodoCierreId, finanzasId, "Corregir jornada", new Date("2071-02-05T12:00:00Z"));
    await db.update(schema.asistenciasEsperadas).set({ minutosTrabajados: 480 }).where(eq(schema.asistenciasEsperadas.id, asistenciaTrabajadaId));
    await db.update(schema.tardanzas).set({ politicaVersion: 4 }).where(eq(schema.tardanzas.asistenciaId, asistenciaTrabajadaId));
    await repositorio.cerrar(periodoCierreId, finanzasId, instanteSegundoCierre);

    const revisiones = await repositorio.listarRevisiones(periodoCierreId);
    expect(revisiones).toHaveLength(2);
    expect(revisiones[0].resumen.totales.minutosTrabajados).toBe(1_065);
    expect(revisiones[0].resumen.filas[0].jornadas[0].politicaDeTardanzaVersion).toBe(3);
    expect(revisiones[1]).toMatchObject({ numero: 2, responsableId: finanzasId, cerradaEn: instanteSegundoCierre });
    expect(revisiones[1].resumen.totales.minutosTrabajados).toBe(1_020);
    expect(revisiones[1].resumen.filas[0].jornadas[0].politicaDeTardanzaVersion).toBe(4);
    const reaperturas = await db.select().from(schema.auditoriaPeriodosPlanilla).where(eq(schema.auditoriaPeriodosPlanilla.periodoId, periodoCierreId));
    expect(reaperturas).toEqual(expect.arrayContaining([expect.objectContaining({ accion: "reapertura", motivo: "Corregir jornada" })]));
  });
});

// QA4: esperados de ADR0012 #108/#109/#114 y contrato C5/C6 (plan E265/E266).
// Cada fila usa una transacción revertida: conserva los datos históricos ajenos al caso.
describe.skipIf(!databaseUrl)("185 QA4 elegibilidad de pendientes", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  afterAll(() => pool.end());
  const dia = (mesDia: string) => `2019-${mesDia}`;
  const relacion = (ingreso = "09-26", cese = "09-27", confirmaIngreso = true, confirmaCese = true) => ({
    ingreso: dia(ingreso), cese: dia(cese), confirmaIngreso, confirmaCese,
  });
  const escenarios = [
    { numero: 1, fechas: ["09-28"], relaciones: [relacion()], bloquea: false },
    { numero: 2, fechas: ["09-27"], relaciones: [relacion("09-28", "09-29")], bloquea: false },
    { numero: 3, fechas: ["09-28"], relaciones: [relacion("09-26", "09-29", false, false)], bloquea: false },
    { numero: 4, fechas: ["09-28"], relaciones: [relacion("09-26", "09-29")], bloquea: false, gestiona: false },
    { numero: 5, fechas: ["09-26", "09-27"], relaciones: [relacion()], bloquea: true },
    { numero: 6, fechas: ["09-28"], relaciones: [relacion("09-26", "09-27", true, false)], bloquea: true },
    { numero: 7, fechas: ["09-25", "10-26"], relaciones: [relacion("09-01", "10-31")], bloquea: false },
    { numero: 8, fechas: ["09-26", "10-25"], relaciones: [relacion("09-01", "10-31")], bloquea: true },
    { numero: 9, fechas: ["09-28"], relaciones: [relacion(), relacion("09-30", "10-01")], bloquea: false },
    { numero: 10, fechas: ["09-28"], relaciones: [], bloquea: false },
  ];
  const casos = (["asistencia", "hora-extra"] as const).flatMap((tipo) => escenarios.map((escenario) => ({
    ...escenario, tipo, id: `${tipo === "asistencia" ? "A" : "X"}${escenario.numero}`, activo: true,
  })));
  casos.push({ ...escenarios[0], numero: 11, id: "A11", tipo: "asistencia", fechas: ["09-28"], relaciones: [relacion("09-26", "09-29")], bloquea: true, activo: false });

  it.each(casos)("$id $tipo, regla de elegibilidad", async (caso) => {
    // Los bordes de una fila se ejecutan como escenarios independientes, sin resolverse entre sí.
    for (const mesDia of caso.fechas) {
      const revertir = new Error("Revertir únicamente fixture QA4");
      await db.transaction(async (tx) => {
        const conexion = tx as unknown as typeof db;
        const repositorio = new RepositorioPostgresDePeriodos(conexion);
        const actor = randomUUID();
        const grupo = `QA4 ${randomUUID()}`;
        const dni = dniDePrueba();
        const fecha = dia(mesDia);
        const ahora = new Date("2019-10-26T10:00:00Z");
        await tx.insert(schema.cuentasLocales).values({ id: actor, nombreUsuario: grupo, hashContrasena: "prueba", rol: "administrador" });
        await tx.insert(schema.grupos).values({ nombre: grupo, gestionaAsistencia: caso.gestiona !== false });
        await tx.insert(schema.colaboradores).values({ dni, nombre: "Ana QA4", grupo, sede: "Centro", activo: caso.activo });
        for (const r of caso.relaciones) await tx.insert(schema.relacionesLaborales).values({
          dni, ingreso: r.ingreso, cese: r.cese, registradaPorId: actor,
          ingresoConfirmadoEn: r.confirmaIngreso ? ahora : null, ingresoConfirmadoPorId: r.confirmaIngreso ? actor : null,
          ceseConfirmadoEn: r.confirmaCese ? ahora : null, ceseConfirmadoPorId: r.confirmaCese ? actor : null,
        });
        const [periodo] = await tx.insert(schema.periodosPlanilla).values({ inicio: dia("09-26"), fin: dia("10-25"), estado: "abierto" }).returning();
        // Cubrir todas las fechas exigibles del corte para aislar la única pendiente de cada caso.
        const fechas = new Set([fecha]);
        for (let t = Date.parse("2019-09-26"); t <= Date.parse("2019-10-25"); t += 86400000) {
          const f = new Date(t).toISOString().slice(0, 10);
          if (caso.relaciones.some((r) => r.confirmaIngreso && r.ingreso <= f && (!r.confirmaCese || f <= r.cese))) fechas.add(f);
        }
        let asistenciaId = "";
        for (const f of fechas) {
          await tx.insert(schema.turnosPublicados).values({ dni, fecha: f, grupo, sede: "Centro", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false });
          const [a] = await tx.insert(schema.asistenciasEsperadas).values({
            dni, fecha: f, estado: f === fecha && caso.tipo === "asistencia" ? "pendiente" : "confirmada",
            minutosTrabajados: f === fecha && caso.tipo === "asistencia" ? null : 480,
          }).returning();
          if (f === fecha) asistenciaId = a.id;
        }
        if (caso.tipo === "hora-extra") await tx.insert(schema.horasExtra).values({ asistenciaId, estado: "pendiente", minutosAl25: 8, minutosAl35: 0 });
        const originales = async () => ({
          asistencias: await tx.select().from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, dni)),
          extras: await tx.select().from(schema.horasExtra).where(eq(schema.horasExtra.asistenciaId, asistenciaId)),
          relaciones: await tx.select().from(schema.relacionesLaborales).where(eq(schema.relacionesLaborales.dni, dni)),
        });
        const antes = await originales();
        await aprobarGruposQueGestionanAsistenciaDePrueba(conexion, periodo.id, actor, { excepto: [grupo] });
        if (caso.gestiona === false) {
          expect((await repositorio.listarAprobaciones(periodo.id)).some((a) => a.grupo === grupo)).toBe(false);
        } else if (caso.bloquea && caso.tipo === "asistencia") {
          await expect(repositorio.aprobarAsistencia(periodo.id, grupo, actor, ahora)).rejects.toThrow();
          await expect(repositorio.cerrar(periodo.id, actor, ahora)).rejects.toThrow("falta la aprobación");
          // Solo para comprobar la guarda redundante de cierre, después del rechazo real.
          await aprobarGruposQueGestionanAsistenciaDePrueba(conexion, periodo.id, actor);
        } else {
          await repositorio.aprobarAsistencia(periodo.id, grupo, actor, ahora);
        }
        const resumen = await repositorio.listarResumen({ periodoId: periodo.id });
        expect.soft(resumen.bloqueos.filter((b) => b.dni === dni), `${caso.id}/${fecha}: bloqueos del resumen`).toHaveLength(caso.bloquea ? 1 : 0);
        if (caso.bloquea) {
          await expect(repositorio.cerrar(periodo.id, actor, ahora)).rejects.toThrow(caso.tipo === "asistencia" ? "asistencias pendientes" : "horas extra pendientes");
          expect((await repositorio.buscar(periodo.id))?.estado).toBe("abierto");
          expect(await repositorio.listarRevisiones(periodo.id)).toHaveLength(0);
        } else {
          await expect(repositorio.cerrar(periodo.id, actor, ahora)).resolves.toBeUndefined();
          expect((await repositorio.buscar(periodo.id))?.estado).toBe("cerrado");
          const revisiones = await repositorio.listarRevisiones(periodo.id);
          expect(revisiones).toHaveLength(1);
          expect(revisiones[0].numero).toBe(1);
          expect(revisiones[0].resumen.bloqueos).toEqual([]);
          if (caso.numero === 7) expect(revisiones[0].resumen.filas.flatMap((f) => f.jornadas).some((j) => j.fecha === fecha)).toBe(false);
        }
        expect(await originales()).toEqual(antes);
        throw revertir;
      }).catch((error: unknown) => { if (error !== revertir) throw error; });
    }
  });
});
