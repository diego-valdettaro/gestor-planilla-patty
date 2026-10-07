import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { diaDeLaSemana } from "@/descansos-y-feriados/reglas";
import * as schema from "@/db/schema";

import { dniDePrueba } from "../colaboradores/dni-de-prueba";
import { aprobarGruposQueGestionanAsistenciaDePrueba, eliminarAprobacionesDePrueba } from "./aprobaciones-de-prueba";
import {
  CoberturaDelCorteInvalidaError,
  corteDeIncidencias,
  hechosParaFinalizar,
  obtenerHechosDelCorte,
  type HechoDiarioDeAsistencia,
} from "./hechos-para-pagos";
import { RepositorioPostgresDePeriodos } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// Años 2080+ para no cruzarse con otras pruebas de integración que comparten base.
describe.skipIf(!databaseUrl)("hechos de asistencia para Pagos en PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDePeriodos(db);
  const sufijo = randomUUID().slice(0, 8);
  const grupo = `Grupo 115 ${sufijo}`;
  const dniAna = dniDePrueba();
  const dniBeto = String(Number(dniAna) + 1);
  const finanzasId = randomUUID();
  const periodoIds: string[] = [];
  const corte = corteDeIncidencias("2080-10");
  const feriadoFecha = "2080-09-28";
  const descansoFecha = "2080-09-27";
  let primeroId = "";
  let segundoId = "";
  let asistenciaDeAnaId = "";

  const instantaneaCentro = { sede: "Centro", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false };
  const turno = (dni: string, fecha: string, cambios: Partial<typeof schema.turnosPublicados.$inferInsert> = {}) => (
    { dni, fecha, grupo, sede: "Centro", entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false, ...cambios }
  );

  async function crearPeriodo(inicio: string, fin: string, estado: "abierto" | "cerrado" = "abierto") {
    const [periodo] = await db.insert(schema.periodosPlanilla).values({ inicio, fin, estado }).returning({ id: schema.periodosPlanilla.id });
    periodoIds.push(periodo.id);
    return periodo.id;
  }

  beforeAll(async () => {
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.cuentasLocales).values({ id: finanzasId, nombreUsuario: `finanzas-115-${sufijo}`, hashContrasena: "prueba", rol: "finanzas" });
    await db.insert(schema.colaboradores).values([
      { dni: dniAna, nombre: "Ana Hechos", sede: "Centro", grupo },
      { dni: dniBeto, nombre: "Beto Hechos", sede: "Centro", grupo },
    ]);
    primeroId = await crearPeriodo("2080-09-26", "2080-10-05");
    segundoId = await crearPeriodo("2080-10-06", "2080-10-25");

    await db.insert(schema.descansosSemanalesAsignados).values({
      dni: dniAna, diaSemana: diaDeLaSemana(descansoFecha), vigenteDesde: "2080-01-01", registradoPorId: finanzasId,
    });
    await db.insert(schema.feriados).values({ fecha: feriadoFecha, nombre: "Feriado de prueba", clase: "feriado", registradoPorId: finanzasId });

    await db.insert(schema.turnosPublicados).values([
      turno(dniAna, "2080-09-26"),
      turno(dniAna, descansoFecha, { sede: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "descanso" }),
      turno(dniAna, feriadoFecha),
      turno(dniAna, "2080-10-06"),
      turno(dniBeto, "2080-09-29"),
      turno(dniBeto, "2080-09-30", { sede: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "permiso" }),
      turno(dniBeto, "2080-10-01"),
    ]);
    const asistencias = await db.insert(schema.asistenciasEsperadas).values([
      { dni: dniAna, fecha: "2080-09-26", estado: "confirmada", entradaReal: "2080-09-26T09:15:00Z", salidaReal: "2080-09-26T18:15:00Z", minutosTrabajados: 540, instantaneaDeTurno: instantaneaCentro },
      { dni: dniAna, fecha: feriadoFecha, estado: "confirmada", entradaReal: `${feriadoFecha}T09:00:00Z`, salidaReal: `${feriadoFecha}T17:00:00Z`, minutosTrabajados: 480, instantaneaDeTurno: instantaneaCentro },
      { dni: dniAna, fecha: "2080-10-06", estado: "confirmada", entradaReal: "2080-10-06T09:00:00Z", salidaReal: "2080-10-06T17:00:00Z", minutosTrabajados: 480, instantaneaDeTurno: { ...instantaneaCentro, sede: "Norte" } },
      { dni: dniBeto, fecha: "2080-09-29", estado: "manual" },
      { dni: dniBeto, fecha: "2080-10-01", estado: "confirmada", entradaReal: "2080-10-01T09:00:00Z", salidaReal: "2080-10-01T19:00:00Z", minutosTrabajados: 600, instantaneaDeTurno: instantaneaCentro },
    ]).returning({ id: schema.asistenciasEsperadas.id, dni: schema.asistenciasEsperadas.dni, fecha: schema.asistenciasEsperadas.fecha });
    const id = (dni: string, fecha: string) => asistencias.find((fila) => fila.dni === dni && fila.fecha === fecha)!.id;
    asistenciaDeAnaId = id(dniAna, "2080-09-26");

    await db.insert(schema.tardanzas).values({ asistenciaId: asistenciaDeAnaId, minutosDeTardanza: 15, minutosPenalizados: 60, politicaVersion: 3 });
    await db.insert(schema.horasExtra).values([
      { asistenciaId: asistenciaDeAnaId, minutosAl25: 60, minutosAl35: 0, estado: "aprobada", decididaPorId: finanzasId, decididaEn: new Date("2080-10-02T10:00:00Z") },
      { asistenciaId: id(dniBeto, "2080-10-01"), minutosAl25: 120, minutosAl35: 0, estado: "descartada", causaDeDescarte: "marca_erronea", motivoDeDescarte: "Marca duplicada", decididaPorId: finanzasId, decididaEn: new Date("2080-10-02T10:00:00Z") },
    ]);
    await db.insert(schema.estadosManuales).values({ asistenciaId: id(dniBeto, "2080-09-29"), tipo: "vacaciones", comentario: "Vacaciones aprobadas", responsableId: finanzasId });
    await db.insert(schema.descansosSustitutorios).values({
      dni: dniAna, origenFecha: feriadoFecha, origenTipo: "feriado", fechaPrevista: "2080-10-02", registradoPorId: finanzasId,
    });
  });

  afterAll(async () => {
    const asistencias = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.dni, [dniAna, dniBeto]));
    const ids = asistencias.map(({ id }) => id);
    await eliminarAprobacionesDePrueba(db, periodoIds);
    await db.delete(schema.revisionesDePeriodosPlanilla).where(inArray(schema.revisionesDePeriodosPlanilla.periodoId, periodoIds));
    await db.delete(schema.auditoriaPeriodosPlanilla).where(inArray(schema.auditoriaPeriodosPlanilla.periodoId, periodoIds));
    await db.delete(schema.descansosSustitutorios).where(eq(schema.descansosSustitutorios.dni, dniAna));
    await db.delete(schema.descansosSemanalesAsignados).where(eq(schema.descansosSemanalesAsignados.dni, dniAna));
    await db.delete(schema.feriados).where(eq(schema.feriados.fecha, feriadoFecha));
    if (ids.length) {
      await db.delete(schema.horasExtra).where(inArray(schema.horasExtra.asistenciaId, ids));
      await db.delete(schema.tardanzas).where(inArray(schema.tardanzas.asistenciaId, ids));
      await db.delete(schema.estadosManuales).where(inArray(schema.estadosManuales.asistenciaId, ids));
    }
    await db.delete(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.dni, [dniAna, dniBeto]));
    await db.delete(schema.turnosPublicados).where(inArray(schema.turnosPublicados.dni, [dniAna, dniBeto]));
    await db.delete(schema.periodosPlanilla).where(inArray(schema.periodosPlanilla.id, periodoIds));
    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.dni, [dniAna, dniBeto]));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, finanzasId));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await pool.end();
  });

  async function cerrar(periodoId: string, instante: string) {
    await aprobarGruposQueGestionanAsistenciaDePrueba(db, periodoId, finanzasId);
    await repositorio.cerrar(periodoId, finanzasId, new Date(instante));
  }

  const porFecha = (hechos: HechoDiarioDeAsistencia[], fecha: string) => hechos.find((hecho) => hecho.fecha === fecha)!;

  it("con períodos partidos abiertos entrega los hechos por DNI como provisionales y no deja finalizar", async () => {
    const resultado = await obtenerHechosDelCorte(repositorio, corte);

    expect(resultado.provisional).toBe(true);
    expect(resultado.finalizable).toBe(false);
    expect(resultado.cubreExactamente).toBe(true);
    expect(resultado.problemas.map(({ tipo }) => tipo)).toEqual(["periodo_abierto", "periodo_abierto"]);
    expect(resultado.revisiones.map(({ periodoId, provisional, revisionId }) => ({ periodoId, provisional, revisionId })))
      .toEqual([{ periodoId: primeroId, provisional: true, revisionId: null }, { periodoId: segundoId, provisional: true, revisionId: null }]);
    expect(Object.keys(resultado.hechosPorDni).sort()).toEqual([dniAna, dniBeto].sort());
    expect(resultado.hechosPorDni[dniAna].map(({ fecha }) => fecha)).toEqual(["2080-09-26", descansoFecha, feriadoFecha, "2080-10-06"]);
    await expect(hechosParaFinalizar(repositorio, corte)).rejects.toBeInstanceOf(CoberturaDelCorteInvalidaError);
  });

  it("entrega la asistencia resuelta, las decisiones que afectan el dinero y la referencia a la evidencia", async () => {
    const { hechosPorDni } = await obtenerHechosDelCorte(repositorio, corte);
    const ana = hechosPorDni[dniAna];
    const beto = hechosPorDni[dniBeto];

    const jornada = porFecha(ana, "2080-09-26");
    expect(jornada).toEqual({
      dni: dniAna,
      fecha: "2080-09-26",
      grupo,
      sede: "Centro",
      horarioAplicado: { entradaProgramada: "09:00", salidaProgramada: "17:00" },
      resultado: "trabajada",
      minutosTrabajados: 540,
      tardanza: { minutos: 15, minutosPenalizados: 60, politicaVersion: 3 },
      horaExtra: { estado: "aprobada", minutosAl25: 60, minutosAl35: 0, trabajoNocturno: false, causaDeDescarte: null },
      diaEspecial: null,
      evidencia: { asistenciaId: asistenciaDeAnaId, turnoPublicadoId: expect.any(String) },
    });
    // El día de descanso publicado no tiene asistencia por registrar, pero es un hecho resuelto.
    expect(porFecha(ana, descansoFecha)).toMatchObject({
      resultado: "descanso",
      sede: null,
      minutosTrabajados: 0,
      diaEspecial: { descansoSemanal: true, feriado: null, sustitutorio: null },
      evidencia: { asistenciaId: null, turnoPublicadoId: expect.any(String) },
    });
    // Feriado trabajado con descanso sustitutorio previsto: Pagos lo valora después.
    expect(porFecha(ana, feriadoFecha)).toMatchObject({
      resultado: "trabajada",
      diaEspecial: { descansoSemanal: false, feriado: "feriado", sustitutorio: { estado: "previsto", fechaPrevista: "2080-10-02" } },
    });
    // La sede de la jornada viene de la instantánea del turno confirmado.
    expect(porFecha(ana, "2080-10-06").sede).toBe("Norte");

    expect(porFecha(beto, "2080-09-29")).toMatchObject({ resultado: "vacaciones", sede: null, minutosTrabajados: 0 });
    expect(porFecha(beto, "2080-09-30")).toMatchObject({ resultado: "permiso", evidencia: { asistenciaId: null } });
    expect(porFecha(beto, "2080-10-01")).toMatchObject({
      resultado: "trabajada",
      horaExtra: { estado: "descartada", minutosAl25: 120, causaDeDescarte: "marca_erronea" },
    });
    for (const hecho of [...ana, ...beto]) {
      expect(Object.keys(hecho).sort()).toEqual([
        "diaEspecial", "dni", "evidencia", "fecha", "grupo", "horaExtra", "horarioAplicado", "minutosTrabajados", "resultado", "sede", "tardanza",
      ]);
    }
  });

  it("congela los hechos al cerrar cada período y permite finalizar cuando todos están cerrados", async () => {
    await cerrar(primeroId, "2080-10-07T10:00:00Z");
    const conUnoAbierto = await obtenerHechosDelCorte(repositorio, corte);
    expect(conUnoAbierto.revisiones.map(({ provisional }) => provisional)).toEqual([false, true]);
    expect(conUnoAbierto.provisional).toBe(true);

    await cerrar(segundoId, "2080-10-07T11:00:00Z");
    const finalizable = await hechosParaFinalizar(repositorio, corte);
    expect(finalizable.provisional).toBe(false);
    expect(finalizable.problemas).toEqual([]);
    expect(finalizable.revisiones.map(({ numero, provisional }) => ({ numero, provisional }))).toEqual([{ numero: 1, provisional: false }, { numero: 1, provisional: false }]);
    expect(finalizable.revisiones.every(({ revisionId }) => typeof revisionId === "string")).toBe(true);
    expect(finalizable.hechosPorDni[dniAna]).toHaveLength(4);
    expect(finalizable.hechosPorDni[dniBeto]).toHaveLength(3);
  });

  it("no cambia una revisión cerrada aunque Asistencia cambie después; al reabrir vuelve a ser provisional", async () => {
    const antes = await hechosParaFinalizar(repositorio, corte);
    await db.update(schema.asistenciasEsperadas).set({ minutosTrabajados: 1 }).where(eq(schema.asistenciasEsperadas.id, asistenciaDeAnaId));

    const despues = await hechosParaFinalizar(repositorio, corte);
    expect(despues.hechosPorDni).toEqual(antes.hechosPorDni);
    expect(porFecha(despues.hechosPorDni[dniAna], "2080-09-26").minutosTrabajados).toBe(540);

    await repositorio.reabrir(primeroId, finanzasId, "Corrección de prueba", new Date("2080-10-08T10:00:00Z"));
    const reabierto = await obtenerHechosDelCorte(repositorio, corte);
    expect(reabierto.provisional).toBe(true);
    expect(porFecha(reabierto.hechosPorDni[dniAna], "2080-09-26").minutosTrabajados).toBe(1);
    await expect(hechosParaFinalizar(repositorio, corte)).rejects.toThrow(/no está cerrado/);
  });

  it("explica un corte incompleto y un período que lo cruza", async () => {
    const corteCruzado = corteDeIncidencias("2081-02");
    await crearPeriodo("2081-02-10", "2081-03-05");

    const resultado = await obtenerHechosDelCorte(repositorio, corteCruzado);

    expect(resultado.cubreExactamente).toBe(false);
    expect(resultado.problemas).toEqual(expect.arrayContaining([
      expect.objectContaining({ tipo: "hueco", desde: "2081-01-26", hasta: "2081-02-09" }),
      expect.objectContaining({ tipo: "cruza_corte", mensaje: "El período del 10/02/2081 al 05/03/2081 cruza el día 25: sale del corte del 26/01/2081 al 25/02/2081." }),
    ]));
    await expect(hechosParaFinalizar(repositorio, corteCruzado)).rejects.toThrow(/Falta cobertura del 26\/01\/2081 al 09\/02\/2081/);
  });

  it("detecta períodos solapados cargados fuera del flujo normal", async () => {
    await crearPeriodo("2081-03-26", "2081-04-10");
    await crearPeriodo("2081-04-05", "2081-04-25");

    const resultado = await obtenerHechosDelCorte(repositorio, corteDeIncidencias("2081-04"));

    expect(resultado.finalizable).toBe(false);
    expect(resultado.problemas).toContainEqual(expect.objectContaining({ tipo: "solapamiento", desde: "2081-04-05", hasta: "2081-04-10" }));
  });

  it("un corte sin períodos es un hueco completo", async () => {
    const resultado = await obtenerHechosDelCorte(repositorio, corteDeIncidencias("2082-01"));
    expect(resultado.revisiones).toEqual([]);
    expect(resultado.hechosPorDni).toEqual({});
    expect(resultado.problemas).toEqual([expect.objectContaining({ tipo: "hueco", desde: "2081-12-26", hasta: "2082-01-25" })]);
  });

  it("rechaza como fuente una revisión cerrada que no tiene hechos congelados", async () => {
    const periodoId = await crearPeriodo("2082-06-26", "2082-07-25", "cerrado");
    await db.insert(schema.revisionesDePeriodosPlanilla).values({
      periodoId, numero: 1, resumen: { filas: [], bloqueos: [], totales: {} } as never, responsableId: finanzasId, cerradaEn: new Date("2082-07-26T10:00:00Z"),
    });

    await expect(repositorio.leerHechosDelPeriodo(periodoId)).rejects.toThrow(/no tiene hechos congelados/);
  });
});
