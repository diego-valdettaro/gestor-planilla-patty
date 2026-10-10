import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import { RepositorioPostgresDeCondicionesLaborales } from "@/condiciones-laborales/repositorio-postgres";
import * as schema from "@/db/schema";
import { RepositorioPostgresDeDescansosYFeriados } from "@/descansos-y-feriados/repositorio-postgres";
import { construirHechosDiarios } from "@/periodos/hechos-de-asistencia-postgres";
import { RepositorioPostgresDeFuentesExternas } from "@/fuentes-externas/repositorio-postgres";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";
import { RepositorioPostgresDePeriodos } from "@/periodos/repositorio-postgres";
import { RepositorioPostgresDeReglasLegales } from "@/reglas-legales/repositorio-postgres";
import { RepositorioPostgresDeRelacionesLaborales } from "@/relaciones-laborales/repositorio-postgres";

import { prepararBorrador } from "./preparar-borrador";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("borrador mensual completo desde PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const dni = dniDePrueba();
  const dniTarde = dniDePrueba();
  const cuentaId = randomUUID();
  const relacionId = randomUUID();
  const relacionTardeId = randomUUID();
  const grupo = `Grupo pagos ${randomUUID()}`;
  const sede = `Sede pagos ${randomUUID()}`;
  let periodoId: string;

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `pagos-${cuentaId}`, hashContrasena: "prueba", rol: "finanzas" });
    await db.insert(schema.grupos).values({ nombre: grupo, gestionaAsistencia: false });
    await db.insert(schema.sedes).values({ nombre: sede, grupo });
    await db.insert(schema.colaboradores).values([{ dni, nombre: "Ana sin marcas", grupo, sede }, { dni: dniTarde, nombre: "Beto ingreso tardío", grupo, sede }]);
    await db.insert(schema.relacionesLaborales).values([
      { id: relacionId, dni, ingreso: "2090-10-10", ingresoConfirmadoPorId: cuentaId, ingresoConfirmadoEn: new Date(), registradaPorId: cuentaId },
      { id: relacionTardeId, dni: dniTarde, ingreso: "2090-10-27", ingresoConfirmadoPorId: cuentaId, ingresoConfirmadoEn: new Date(), registradaPorId: cuentaId },
    ]);
    await db.insert(schema.condicionesLaborales).values([
      { relacionLaboralId: relacionId, dato: "sueldo", sueldoCentimos: 300000, vigenteDesde: "2090-10-10", registradoPorId: cuentaId },
      { relacionLaboralId: relacionId, dato: "sueldo", sueldoCentimos: 330000, vigenteDesde: "2090-10-16", registradoPorId: cuentaId },
      { relacionLaboralId: relacionTardeId, dato: "sueldo", sueldoCentimos: 300000, vigenteDesde: "2090-10-27", registradoPorId: cuentaId },
    ]);
    const [periodo] = await db.insert(schema.periodosPlanilla).values({ inicio: "2090-09-26", fin: "2090-10-25", estado: "abierto" }).returning({ id: schema.periodosPlanilla.id });
    periodoId = periodo.id;
  });

  afterAll(async () => {
    await db.delete(schema.reglasLegales).where(eq(schema.reglasLegales.activadaPorId, cuentaId));
    await db.delete(schema.revisionesDePeriodosPlanilla).where(eq(schema.revisionesDePeriodosPlanilla.periodoId, periodoId));
    await db.delete(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.id, periodoId));
    await db.delete(schema.confirmacionesDeFuente).where(eq(schema.confirmacionesDeFuente.mesDeAplicacion, "2090-10"));
    await db.delete(schema.condicionesLaborales).where(eq(schema.condicionesLaborales.relacionLaboralId, relacionId));
    await db.delete(schema.condicionesLaborales).where(eq(schema.condicionesLaborales.relacionLaboralId, relacionTardeId));
    await db.delete(schema.relacionesLaborales).where(eq(schema.relacionesLaborales.id, relacionId));
    await db.delete(schema.relacionesLaborales).where(eq(schema.relacionesLaborales.id, relacionTardeId));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dniTarde));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await pool.end();
  });

  const fuentes = {
    relaciones: new RepositorioPostgresDeRelacionesLaborales(db),
    condiciones: new RepositorioPostgresDeCondicionesLaborales(db),
    reglas: new RepositorioPostgresDeReglasLegales(db),
    asistencia: new RepositorioPostgresDePeriodos(db),
    externas: new RepositorioPostgresDeFuentesExternas(db),
    descansos: new RepositorioPostgresDeDescansosYFeriados(db),
  };

  it("prepara la población sin marcas, vigencias, fuentes y cobertura provisional", async () => {
    const borrador = await prepararBorrador(fuentes, "2090-10");
    const ana = borrador.personas.find(({ relacion }) => relacion.dni === dni);
    expect(ana?.lineas.map(({ dias, importeCentimos }) => ({ dias, importeCentimos }))).toEqual([
      { dias: 6, importeCentimos: 60000 }, { dias: 15, importeCentimos: 165000 },
    ]);
    expect(ana?.netoCentimos).toBeNull();
    expect(borrador.personas.some(({ relacion }) => relacion.dni === dniTarde)).toBe(false);
    expect(borrador.bloqueosDelMes).toEqual(expect.arrayContaining([expect.stringContaining("no está cerrado"), expect.stringContaining("Fuente externa pendiente")]));
    expect((await prepararBorrador(fuentes, "2090-10")).personas.find(({ relacion }) => relacion.dni === dni)?.lineas).toEqual(ana?.lineas);
  });

  it("muestra un bloqueo del mes si un período cerrado no tiene revisión congelada", async () => {
    await db.update(schema.periodosPlanilla).set({ estado: "cerrado" }).where(eq(schema.periodosPlanilla.id, periodoId));
    const borrador = await prepararBorrador(fuentes, "2090-10");
    expect(borrador.bloqueosDelMes).toContainEqual(expect.stringContaining("no tiene una revisión de asistencia con hechos congelados"));
    expect(borrador.revisiones).toEqual([]);
    expect(borrador.personas.find(({ relacion }) => relacion.dni === dni)?.netoCentimos).toBeNull();
  });

  it("usa revisión cerrada exacta y cero confirmado; conserva el devengue del ingreso tardío", async () => {
    await db.insert(schema.revisionesDePeriodosPlanilla).values({
      periodoId, numero: 1, resumen: { filas: [], bloqueos: [], totales: {} } as never,
      hechos: [{ dni, fecha: "2090-10-12", grupo, sede: null, horarioAplicado: { entradaProgramada: null, salidaProgramada: null },
        resultado: "vacaciones", minutosTrabajados: 0, tardanza: null, horaExtra: null, diaEspecial: null,
        evidencia: { asistenciaId: null, turnoPublicadoId: randomUUID() } }],
      responsableId: cuentaId, cerradaEn: new Date("2090-10-26T10:00:00Z"),
    });
    await db.insert(schema.confirmacionesDeFuente).values(TIPOS_DE_FUENTE.map(({ codigo }) => ({ tipoDeFuente: codigo, mesDeAplicacion: "2090-10", confirmadaPorId: cuentaId })));
    const octubre = await prepararBorrador(fuentes, "2090-10");
    expect(octubre.bloqueosDelMes.some((bloqueo) => bloqueo.includes("Fuente externa pendiente") || bloqueo.includes("no está cerrado"))).toBe(false);
    expect(octubre.revisiones).toEqual([expect.objectContaining({ numero: 1, provisional: false })]);
    expect(octubre.personas.find(({ relacion }) => relacion.dni === dni)?.lineas).toHaveLength(2);
    expect(octubre.personas.some(({ relacion }) => relacion.dni === dniTarde)).toBe(false);
    const noviembre = await prepararBorrador(fuentes, "2090-11");
    expect(noviembre.personas.find(({ relacion }) => relacion.dni === dniTarde)?.lineas[0]).toMatchObject({ mesDePago: "2090-11", mesDeDevengue: "2090-10", dias: 4 });
  });

  it("valora líneas 25 % y 35 % de hechos aprobados de una revisión cerrada", async () => {
    await db.insert(schema.condicionesLaborales).values([
      { relacionLaboralId: relacionId, dato: "jornada_ordinaria_diaria", jornadaMinutos: 360, vigenteDesde: "2090-10-10", registradoPorId: cuentaId },
      { relacionLaboralId: relacionId, dato: "elegibilidad_familiar", elegibleAsignacionFamiliar: false, vigenteDesde: "2090-10-10", registradoPorId: cuentaId },
    ]);
    await db.insert(schema.reglasLegales).values([
      { codigo: "horas_extra_sobretasa_primeras_dos_horas", tasaCentesimasDePunto: 2500, vigenteDesde: "2090-01-01", fuenteOficial: "Regla sintética de prueba", activadaPorId: cuentaId },
      { codigo: "horas_extra_sobretasa_horas_posteriores", tasaCentesimasDePunto: 3500, vigenteDesde: "2090-01-01", fuenteOficial: "Regla sintética de prueba", activadaPorId: cuentaId },
    ]);
    const hecho = (fecha: string, minutosAl25: number, minutosAl35: number) => ({
      dni, fecha, grupo, sede, horarioAplicado: { entradaProgramada: "09:00", salidaProgramada: "15:00" },
      resultado: "trabajada" as const, minutosTrabajados: 360 + minutosAl25 + minutosAl35, tardanza: null,
      horaExtra: { estado: "aprobada" as const, minutosAl25, minutosAl35, trabajoNocturno: false, causaDeDescarte: null },
      diaEspecial: null, evidencia: { asistenciaId: randomUUID(), turnoPublicadoId: randomUUID() },
    });
    await db.insert(schema.revisionesDePeriodosPlanilla).values({
      periodoId, numero: 2, resumen: { filas: [], bloqueos: [], totales: {} } as never,
      hechos: [hecho("2090-10-20", 120.5, 60.25)], responsableId: cuentaId, cerradaEn: new Date("2090-10-26T11:00:00Z"),
    });
    const borrador = await prepararBorrador(fuentes, "2090-10");
    expect(borrador.personas.find(({ relacion }) => relacion.dni === dni)?.lineas.filter(({ concepto }) => concepto.startsWith("horas_extra")))
      .toMatchObject([{ concepto: "horas_extra_25", importeCentimos: 4602, minutos: 120.5 }, { concepto: "horas_extra_35", importeCentimos: 2485, minutos: 60.25 }]);
  });

  describe("trabajo en descanso o feriado con jornadas reales", () => {
    // Octubre 2090: el 15 es domingo y el 16 es lunes; el descanso asignado es el lunes (nunca se asume el domingo).
    const instantanea = { sede, entradaProgramada: "09:00", salidaProgramada: "15:00", descanso: false };
    const fechas = ["2090-10-15", "2090-10-16"];
    let periodoDescansoId: string;

    beforeAll(async () => {
      await db.insert(schema.reglasLegales).values([
        { codigo: "trabajo_en_descanso_o_feriado_sobretasa", tasaCentesimasDePunto: 10000, vigenteDesde: "2090-01-01", fuenteOficial: "Regla sintética de prueba", activadaPorId: cuentaId },
        { codigo: "trabajo_en_primero_de_mayo_sobretasa", tasaCentesimasDePunto: 7500, vigenteDesde: "2090-01-01", fuenteOficial: "Regla sintética de prueba", activadaPorId: cuentaId },
      ]);
      await db.insert(schema.descansosSemanalesAsignados).values({ dni, diaSemana: 1, vigenteDesde: "2090-01-01", registradoPorId: cuentaId });
      await db.insert(schema.turnosPublicados).values(fechas.map((fecha) => ({ dni, fecha, grupo, sede, entradaProgramada: "09:00", salidaProgramada: "15:00", descanso: false })));
      await db.insert(schema.asistenciasEsperadas).values(fechas.map((fecha) => ({
        dni, fecha, estado: "confirmada" as const, entradaReal: `${fecha}T09:00:00Z`, salidaReal: `${fecha}T15:00:00Z`, minutosTrabajados: 360, instantaneaDeTurno: instantanea,
      })));
      // La revisión cerrada de octubre congela las jornadas reales recién creadas; noviembre queda abierto y provisional.
      const hechos = (await construirHechosDiarios(db, { inicio: "2090-09-26", fin: "2090-10-25" })).filter((hecho) => hecho.dni === dni);
      await db.insert(schema.revisionesDePeriodosPlanilla).values({
        periodoId, numero: 3, resumen: { filas: [], bloqueos: [], totales: {} } as never, hechos, responsableId: cuentaId, cerradaEn: new Date("2090-10-26T12:00:00Z"),
      });
      const [periodo] = await db.insert(schema.periodosPlanilla).values({ inicio: "2090-10-26", fin: "2090-11-25", estado: "abierto" }).returning({ id: schema.periodosPlanilla.id });
      periodoDescansoId = periodo.id;
    });

    afterAll(async () => {
      await db.delete(schema.descansosSustitutorios).where(eq(schema.descansosSustitutorios.dni, dni));
      await db.delete(schema.descansosSemanalesAsignados).where(eq(schema.descansosSemanalesAsignados.dni, dni));
      await db.delete(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, dni));
      await db.delete(schema.turnosPublicados).where(eq(schema.turnosPublicados.dni, dni));
      await db.delete(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.id, periodoDescansoId));
    });

    const lineasDeDescanso = async (mes: string) =>
      (await prepararBorrador(fuentes, mes)).personas.find(({ relacion }) => relacion.dni === dni)?.lineas.filter(({ concepto }) => concepto === "trabajo_en_descanso_o_feriado");

    it("valora el descanso asignado y no el domingo trabajado", async () => {
      expect(await lineasDeDescanso("2090-10")).toMatchObject([{ fecha: "2090-10-16", clase: "descanso_semanal", minutos: 360, regularizacion: false }]);
    });

    it("un sustitutorio previsto evita el adicional; no otorgado después del corte se regulariza en el pago siguiente", async () => {
      const [sustitutorio] = await db.insert(schema.descansosSustitutorios).values({
        dni, origenFecha: "2090-10-16", origenTipo: "descanso_semanal", fechaPrevista: "2090-10-20", registradoPorId: cuentaId,
      }).returning({ id: schema.descansosSustitutorios.id });
      expect(await lineasDeDescanso("2090-10")).toEqual([]);

      await db.update(schema.descansosSustitutorios).set({ estado: "no_otorgado", verificadoPorId: cuentaId, verificadoEn: new Date("2090-10-26T15:00:00Z") })
        .where(eq(schema.descansosSustitutorios.id, sustitutorio.id));
      expect(await lineasDeDescanso("2090-10")).toEqual([]);
      expect(await lineasDeDescanso("2090-11")).toMatchObject([{ fecha: "2090-10-16", regularizacion: true, mesDePago: "2090-11", mesDeDevengue: "2090-10", importeCentimos: expect.any(Number) }]);
      expect(await lineasDeDescanso("2090-12")).toEqual([]);

      await db.update(schema.descansosSustitutorios).set({ verificadoEn: new Date("2090-10-20T15:00:00Z") }).where(eq(schema.descansosSustitutorios.id, sustitutorio.id));
      expect(await lineasDeDescanso("2090-10")).toMatchObject([{ fecha: "2090-10-16", regularizacion: false, mesDePago: "2090-10" }]);
      expect(await lineasDeDescanso("2090-11")).toEqual([]);

      // El corte se mide en Lima: 23:00 del 25 aún es octubre y 00:00 del 26 ya es noviembre, aunque en UTC ambos sean 26.
      await db.update(schema.descansosSustitutorios).set({ verificadoEn: new Date("2090-10-26T04:00:00Z") }).where(eq(schema.descansosSustitutorios.id, sustitutorio.id));
      expect(await lineasDeDescanso("2090-10")).toMatchObject([{ regularizacion: false }]);
      await db.update(schema.descansosSustitutorios).set({ verificadoEn: new Date("2090-10-26T05:00:00Z") }).where(eq(schema.descansosSustitutorios.id, sustitutorio.id));
      expect(await lineasDeDescanso("2090-10")).toEqual([]);
      expect(await lineasDeDescanso("2090-11")).toMatchObject([{ regularizacion: true }]);
    });
  });
});
