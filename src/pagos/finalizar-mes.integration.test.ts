import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import { RepositorioPostgresDeCondicionesLaborales } from "@/condiciones-laborales/repositorio-postgres";
import * as schema from "@/db/schema";
import { RepositorioPostgresDeClasificacionesDeGoce } from "@/clasificaciones-de-goce/repositorio-postgres";
import { RepositorioPostgresDeDescansosYFeriados } from "@/descansos-y-feriados/repositorio-postgres";
import { confirmarFuente, volverAPendiente } from "@/fuentes-externas/gestionar-fuentes-externas";
import { RepositorioPostgresDeFuentesExternas } from "@/fuentes-externas/repositorio-postgres";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";
import { RepositorioPostgresDePeriodos } from "@/periodos/repositorio-postgres";
import { RepositorioPostgresDeReglasLegales } from "@/reglas-legales/repositorio-postgres";
import { RepositorioPostgresDeRelacionesLaborales } from "@/relaciones-laborales/repositorio-postgres";

import { consultarVersion, evaluarFinalizacion, finalizarMes, listarVersiones, type DependenciasDeFinalizacion, type NuevaVersionDePago } from "./finalizar-mes";
import { RepositorioPostgresDeVersiones } from "./repositorio-postgres-de-versiones";

// Persistencia de las versiones finalizadas (#129, ADR 0007 y 0014) contra PostgreSQL real: sin dobles de repositorio.
// Meses 2095-10 (corte 26/09 al 25/10) y 2095-11 (26/10 al 25/11); personas sintéticas del plan: Ana S/ 2.000,00, Beto S/ 1.500,00 y
// Carla S/ 1.000,00. Subtotal «Neto antes de aportes del trabajador» esperado (aritmética manual de #96, historia 5): 200000 / 150000 / 100000.
// Las versiones son inmutables, así que cada prueba arma su propio mundo y lo retira al terminar con una conexión de superusuario de la
// base de PRUEBA (session_replication_role = replica); por eso cada prueba funciona sola con `-t "F-nn"`.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

const AHORA = new Date("2095-10-26T15:00:00Z");
const RONDAS_DE_CONCURRENCIA = 5;
const SUELDOS = [{ nombre: "Ana", sueldo: 200000 }, { nombre: "Beto", sueldo: 150000 }, { nombre: "Carla", sueldo: 100000 }];

describe.skipIf(!databaseUrl)("persistencia de las versiones finalizadas en PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  let cuenta: Actor;
  let grupo: string;
  let sede: string;
  let dnis: string[];
  let relacionIds: string[];
  let periodoIds: string[];
  let dependencias: DependenciasDeFinalizacion;
  let externas: RepositorioPostgresDeFuentesExternas;
  let versiones: RepositorioPostgresDeVersiones;

  beforeEach(async () => {
    const cuentaId = randomUUID();
    cuenta = { id: cuentaId, rol: "finanzas", nombreUsuario: `finanzas-${cuentaId}` };
    grupo = `Grupo versiones ${randomUUID()}`;
    sede = `Sede versiones ${randomUUID()}`;
    dnis = SUELDOS.map(() => dniDePrueba());
    relacionIds = SUELDOS.map(() => randomUUID());
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: cuenta.nombreUsuario!, hashContrasena: "prueba", rol: "finanzas" });
    await db.insert(schema.grupos).values({ nombre: grupo, gestionaAsistencia: false });
    await db.insert(schema.sedes).values({ nombre: sede, grupo });
    await db.insert(schema.colaboradores).values(SUELDOS.map(({ nombre }, i) => ({ dni: dnis[i], nombre, grupo, sede })));
    await db.insert(schema.relacionesLaborales).values(SUELDOS.map((_, i) => ({
      id: relacionIds[i], dni: dnis[i], ingreso: "2095-01-01", ingresoConfirmadoPorId: cuentaId, ingresoConfirmadoEn: new Date(), registradaPorId: cuentaId })));
    await db.insert(schema.condicionesLaborales).values(SUELDOS.flatMap(({ sueldo }, i) => {
      const base = { relacionLaboralId: relacionIds[i], vigenteDesde: "2095-01-01", registradoPorId: cuentaId };
      return [
        { ...base, dato: "sueldo" as const, sueldoCentimos: sueldo }, { ...base, dato: "jornada_ordinaria_diaria" as const, jornadaMinutos: 480 },
        { ...base, dato: "regimen_laboral" as const, regimen: "general" as const }, { ...base, dato: "afiliacion_pensionaria" as const, afiliacionPensionaria: "onp" as const },
        { ...base, dato: "elegibilidad_familiar" as const, elegibleAsignacionFamiliar: false }, { ...base, dato: "sede_de_adscripcion" as const, sedeDeAdscripcion: sede },
      ];
    }));
    await db.insert(schema.reglasLegales).values([
      { codigo: "onp_tasa", tasaCentesimasDePunto: 1300, vigenteDesde: "2095-01-01", fuenteOficial: "DEMO sintética; no usar en producción", activadaPorId: cuentaId },
      { codigo: "essalud_tasa", tasaCentesimasDePunto: 900, vigenteDesde: "2095-01-01", fuenteOficial: "DEMO sintética; no usar en producción", activadaPorId: cuentaId },
      { codigo: "essalud_base_minima", importeCentimos: 100000, vigenteDesde: "2095-01-01", fuenteOficial: "DEMO sintética; no usar en producción", activadaPorId: cuentaId },
    ]);
    const periodos = await db.insert(schema.periodosPlanilla).values([
      { inicio: "2095-09-26", fin: "2095-10-25", estado: "cerrado" }, { inicio: "2095-10-26", fin: "2095-11-25", estado: "cerrado" },
    ]).returning({ id: schema.periodosPlanilla.id });
    periodoIds = periodos.map(({ id }) => id);
    await db.insert(schema.revisionesDePeriodosPlanilla).values(periodoIds.map((periodoId, i) => ({
      periodoId, numero: 1, resumen: { filas: [], bloqueos: [], totales: {} } as never, hechos: [], responsableId: cuentaId, cerradaEn: new Date(`2095-1${i}-26T10:00:00Z`) })));
    await db.insert(schema.confirmacionesDeFuente).values(["2095-10", "2095-11"].flatMap((mes) =>
      TIPOS_DE_FUENTE.map(({ codigo }) => ({ tipoDeFuente: codigo, mesDeAplicacion: mes, confirmadaPorId: cuentaId }))));

    externas = new RepositorioPostgresDeFuentesExternas(db);
    versiones = new RepositorioPostgresDeVersiones(db);
    dependencias = {
      fuentes: {
        relaciones: new RepositorioPostgresDeRelacionesLaborales(db), condiciones: new RepositorioPostgresDeCondicionesLaborales(db),
        reglas: new RepositorioPostgresDeReglasLegales(db), asistencia: new RepositorioPostgresDePeriodos(db), externas,
        descansos: new RepositorioPostgresDeDescansosYFeriados(db), clasificaciones: new RepositorioPostgresDeClasificacionesDeGoce(db),
      },
      versiones, pago: externas, ahora: () => AHORA,
    };
  });

  afterEach(async () => {
    const cliente = await pool.connect();
    try {
      // Las versiones no se pueden borrar por la vía normal: solo la base de prueba, con permisos de superusuario, las retira.
      await cliente.query("SET session_replication_role = replica");
      await cliente.query("DELETE FROM versiones_de_pago_personas WHERE version_id IN (SELECT id FROM versiones_de_pago WHERE finalizada_por_id = $1)", [cuenta.id]);
      await cliente.query("DELETE FROM versiones_de_pago WHERE finalizada_por_id = $1", [cuenta.id]);
    } finally {
      await cliente.query("RESET session_replication_role");
      cliente.release();
    }
    await db.delete(schema.confirmacionesDeFuente).where(eq(schema.confirmacionesDeFuente.confirmadaPorId, cuenta.id));
    await db.delete(schema.revisionesDePeriodosPlanilla).where(inArray(schema.revisionesDePeriodosPlanilla.periodoId, periodoIds));
    await db.delete(schema.periodosPlanilla).where(inArray(schema.periodosPlanilla.id, periodoIds));
    await db.delete(schema.reglasLegales).where(eq(schema.reglasLegales.activadaPorId, cuenta.id));
    await db.delete(schema.condicionesLaborales).where(inArray(schema.condicionesLaborales.relacionLaboralId, relacionIds));
    await db.delete(schema.relacionesLaborales).where(inArray(schema.relacionesLaborales.id, relacionIds));
    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.dni, dnis));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuenta.id));
  });

  /** Como en la pantalla: Finanzas revisa (evalúa) y luego finaliza con la huella de lo que revisó. */
  const finalizar = async (mes: string) => {
    const revision = await evaluarFinalizacion(dependencias, cuenta, { mes });
    expect(revision.estado).toBe("lista");
    const resultado = await finalizarMes(dependencias, cuenta, { mes, huella: revision.huella });
    if (resultado.estado !== "finalizada") throw new Error(`Se esperaba una versión finalizada y se obtuvo «${resultado.estado}».`);
    return resultado.version;
  };
  const corregirSueldoDeAna = async (centimos: number) => {
    await db.update(schema.condicionesLaborales).set({ reemplazadaEn: new Date("2095-10-20T00:00:00Z"), motivoDeReemplazo: "Corrección de la prueba" })
      .where(and(eq(schema.condicionesLaborales.relacionLaboralId, relacionIds[0]), eq(schema.condicionesLaborales.dato, "sueldo")));
    await db.insert(schema.condicionesLaborales).values({ relacionLaboralId: relacionIds[0], dato: "sueldo", sueldoCentimos: centimos, vigenteDesde: "2095-01-01", registradoPorId: cuenta.id });
  };

  it("F-29 finaliza el mes completo con repositorios PostgreSQL reales: versión 1 con 3 filas y total de 450000", async () => {
    const guardada = await finalizar("2095-10");

    expect(guardada.numero).toBe(1);
    const leida = await consultarVersion(dependencias, cuenta, "2095-10", 1);
    expect(leida?.numero).toBe(1);
    expect(leida?.personas.map(({ nombre, subtotalCentimos }) => ({ nombre, subtotalCentimos }))).toEqual([
      { nombre: "Ana", subtotalCentimos: 200000 }, { nombre: "Beto", subtotalCentimos: 150000 }, { nombre: "Carla", subtotalCentimos: 100000 },
    ]);
    expect(leida?.subtotalCentimos).toBe(450000);
    expect(leida?.mesDePago).toBe("2095-10");
  });

  it("F-30 una segunda finalización crea la versión 2 y deja la versión 1 sin cambios", async () => {
    await finalizar("2095-10");
    const antes = await consultarVersion(dependencias, cuenta, "2095-10", 1);
    expect(antes?.subtotalCentimos).toBe(450000);

    await corregirSueldoDeAna(210000);
    const segunda = await finalizar("2095-10");

    expect(segunda.numero).toBe(2);
    expect(segunda.subtotalCentimos).toBe(460000);
    expect(await consultarVersion(dependencias, cuenta, "2095-10", 1)).toEqual(antes);
    expect((await listarVersiones(dependencias, cuenta, "2095-10")).map(({ numero, subtotalCentimos, estado }) => ({ numero, subtotalCentimos, estado }))).toEqual([
      { numero: 2, subtotalCentimos: 460000, estado: "Vigente" }, { numero: 1, subtotalCentimos: 450000, estado: "Reemplazada" },
    ]);
  });

  it("F-35 la numeración de versiones es independiente por mes", async () => {
    const octubre = await finalizar("2095-10");
    const noviembre = await finalizar("2095-11");

    expect(octubre.numero).toBe(1);
    expect(noviembre.numero).toBe(1);
    expect((await versiones.listarVersiones("2095-10")).map(({ numero }) => numero)).toEqual([1]);
    expect((await versiones.listarVersiones("2095-11")).map(({ numero }) => numero)).toEqual([1]);
  });

  it("F-36 el historial y la versión leídos devuelven exactamente lo guardado: actor, fecha, reglas, revisiones, fuentes e importes enteros", async () => {
    const guardada = await finalizar("2095-10");
    const leida = await consultarVersion(dependencias, cuenta, "2095-10", 1);

    expect(leida).toEqual(guardada);
    expect(leida?.finalizadaPorId).toBe(cuenta.id);
    expect(leida?.finalizadaPor).toBe(cuenta.nombreUsuario);
    expect(leida?.finalizadaEn).toEqual(AHORA);
    expect(leida?.reglas.map(({ codigo, valor, vigenteDesde, activadaPorId, activadaPor }) => ({ codigo, valor, vigenteDesde, activadaPorId, activadaPor })).sort((a, b) => a.codigo.localeCompare(b.codigo))).toEqual([
      { codigo: "essalud_base_minima", valor: 100000, vigenteDesde: "2095-01-01", activadaPorId: cuenta.id, activadaPor: cuenta.nombreUsuario },
      { codigo: "essalud_tasa", valor: 900, vigenteDesde: "2095-01-01", activadaPorId: cuenta.id, activadaPor: cuenta.nombreUsuario },
      { codigo: "onp_tasa", valor: 1300, vigenteDesde: "2095-01-01", activadaPorId: cuenta.id, activadaPor: cuenta.nombreUsuario },
    ]);
    expect(leida?.reglas.every(({ fuenteOficial }) => fuenteOficial === "DEMO sintética; no usar en producción")).toBe(true);
    expect(leida?.revisiones).toEqual([expect.objectContaining({ periodoId: periodoIds[0], numero: 1, inicio: "2095-09-26", fin: "2095-10-25" })]);
    expect(leida?.revisiones[0].revisionId).toEqual(expect.any(String));
    expect(leida?.fuentes.map(({ tipoDeFuente, nombre, estado, filas, totalCentimos }) => ({ tipoDeFuente, nombre, estado, filas, totalCentimos }))).toEqual(
      TIPOS_DE_FUENTE.map(({ codigo, nombre }) => ({ tipoDeFuente: codigo, nombre, estado: "Confirmada", filas: 0, totalCentimos: 0 })));
    expect(leida?.personas.map(({ relacionId, dni, subtotalCentimos }) => ({ relacionId, dni, subtotalCentimos }))).toEqual(
      SUELDOS.map(({ sueldo }, i) => ({ relacionId: relacionIds[i], dni: dnis[i], subtotalCentimos: sueldo })));
    for (const persona of leida?.personas ?? []) {
      expect(Number.isInteger(persona.subtotalCentimos)).toBe(true);
      expect(persona.lineas.every(({ importeCentimos }) => Number.isInteger(importeCentimos))).toBe(true);
      expect(persona.lineas.find(({ concepto }) => concepto === "sueldo_basico")?.importeCentimos).toBe(persona.subtotalCentimos);
    }
    const [resumen] = await listarVersiones(dependencias, cuenta, "2095-10");
    expect(resumen).toMatchObject({ numero: 1, finalizadaPorId: cuenta.id, finalizadaPor: cuenta.nombreUsuario, finalizadaEn: AHORA, estado: "Vigente", personas: 3, subtotalCentimos: 450000 });
  });

  /** Una versión armada a mano (no sale del cálculo): una fila por persona con el subtotal indicado. */
  const versionManual = (subtotales: number[]): NuevaVersionDePago => ({
    mesDePago: "2095-10", finalizadaPorId: cuenta.id, finalizadaPor: cuenta.nombreUsuario!, finalizadaEn: AHORA, reglas: [],
    revisiones: [{ periodoId: periodoIds[0], revisionId: null, numero: null, inicio: "2095-09-26", fin: "2095-10-25" }], fuentes: [],
    personas: subtotales.map((subtotalCentimos, i) => ({ relacionId: relacionIds[i], dni: dnis[i], nombre: SUELDOS[i].nombre, subtotalCentimos, lineas: [], bases: [] })),
  });

  it("F-33 si una de las tres filas no se puede guardar no queda ninguna fila ni cabecera y la numeración no avanza", async () => {
    // 1,5 céntimos no es un entero: la base rechaza la tercera fila.
    await expect(versiones.guardarVersion(versionManual([200000, 150000, 1.5]))).rejects.toThrow();

    expect(await versiones.listarVersiones("2095-10")).toEqual([]);
    expect(await db.select().from(schema.versionesDePagoPersonas).where(inArray(schema.versionesDePagoPersonas.relacionId, relacionIds))).toEqual([]);
    expect((await versiones.guardarVersion(versionManual([200000, 150000, 100000]))).numero).toBe(1);
  });

  it("F-34 dos finalizaciones simultáneas del mismo mes no producen números duplicados ni una versión a medias", async () => {
    const revision = await evaluarFinalizacion(dependencias, cuenta, { mes: "2095-10" });
    // La carrera depende del momento exacto de las dos conexiones: se repite el par de finalizaciones simultáneas para que no pase inadvertida.
    const resultados: PromiseSettledResult<unknown>[] = [];
    for (let ronda = 0; ronda < RONDAS_DE_CONCURRENCIA; ronda++) {
      resultados.push(...await Promise.allSettled([
        finalizarMes(dependencias, cuenta, { mes: "2095-10", huella: revision.huella }),
        finalizarMes(dependencias, cuenta, { mes: "2095-10", huella: revision.huella }),
      ]));
    }

    // Aceptable: las versiones 1 y 2, o la versión 1 y un rechazo «No se guardó ninguna versión». Nunca dos con el mismo número.
    const guardadas = await versiones.listarVersiones("2095-10");
    const numeros = guardadas.map(({ numero }) => numero);
    expect(new Set(numeros).size).toBe(numeros.length);
    expect(numeros).toEqual(numeros.map((_, i) => i + 1));
    expect(guardadas.every(({ personas }) => personas.length === 3)).toBe(true);
    expect(await db.select().from(schema.versionesDePagoPersonas).where(inArray(schema.versionesDePagoPersonas.relacionId, relacionIds))).toHaveLength(3 * guardadas.length);
    const rechazadas = resultados.filter((resultado): resultado is PromiseRejectedResult => resultado.status === "rejected");
    expect(guardadas.length + rechazadas.length).toBe(2 * RONDAS_DE_CONCURRENCIA);
    for (const rechazo of rechazadas) expect(String(rechazo.reason)).toContain("No se guardó ninguna versión");
  });

  /** Ejecuta cada sentencia directa contra la base; devuelve las que la base ACEPTÓ y exige que las rechazadas lo sean por la protección de las versiones. */
  const sentenciasAceptadas = async (casos: Array<[string, string]>) => {
    const aceptadas: string[] = [];
    for (const [descripcion, sentencia] of casos) {
      try {
        await pool.query(sentencia);
        aceptadas.push(descripcion);
      } catch (error) {
        expect(String(error), descripcion).toContain("versiones finalizadas");
      }
    }
    return aceptadas;
  };

  it("F-31 la base rechaza modificar cualquier registro de una versión guardada, también fuera del caso de uso", async () => {
    await finalizar("2095-10");
    const antes = await consultarVersion(dependencias, cuenta, "2095-10", 1);

    const aceptadas = await sentenciasAceptadas([
      ["fecha de la cabecera", "UPDATE versiones_de_pago SET finalizada_en = now()"],
      ["número de la cabecera", "UPDATE versiones_de_pago SET numero = 99"],
      ["reglas de la cabecera", "UPDATE versiones_de_pago SET reglas = '[]'::jsonb"],
      ["fuentes de la cabecera", "UPDATE versiones_de_pago SET fuentes = '[]'::jsonb"],
      ["subtotal de una persona", "UPDATE versiones_de_pago_personas SET subtotal_centimos = 1"],
      ["líneas de una persona", "UPDATE versiones_de_pago_personas SET lineas = '[]'::jsonb"],
      ["bases de una persona", "UPDATE versiones_de_pago_personas SET bases = '[]'::jsonb"],
      ["nombre de una persona", "UPDATE versiones_de_pago_personas SET nombre = 'Otra'"],
    ].map(([descripcion, sentencia]) => [descripcion, `${sentencia} WHERE ${sentencia.includes("_personas") ? `version_id IN (SELECT id FROM versiones_de_pago WHERE finalizada_por_id = '${cuenta.id}')` : `finalizada_por_id = '${cuenta.id}'`}`]));

    expect(aceptadas).toEqual([]);
    expect(await consultarVersion(dependencias, cuenta, "2095-10", 1)).toEqual(antes);
  });

  it("F-32 la base rechaza borrar registros de una versión guardada", async () => {
    await finalizar("2095-10");
    const antes = await consultarVersion(dependencias, cuenta, "2095-10", 1);

    const aceptadas = await sentenciasAceptadas([
      ["una persona", `DELETE FROM versiones_de_pago_personas WHERE relacion_id = '${relacionIds[0]}'`],
      ["todas las personas de la versión", `DELETE FROM versiones_de_pago_personas WHERE version_id IN (SELECT id FROM versiones_de_pago WHERE finalizada_por_id = '${cuenta.id}')`],
      ["la cabecera", `DELETE FROM versiones_de_pago WHERE finalizada_por_id = '${cuenta.id}'`],
    ]);

    expect(aceptadas).toEqual([]);
    expect(await consultarVersion(dependencias, cuenta, "2095-10", 1)).toEqual(antes);
    expect(antes?.personas).toHaveLength(3);
  });

  it("F-72 la base rechaza una versión cuyo mes de pago no tiene formato AAAA-MM, como las demás tablas de Pagos", async () => {
    const mesesInvalidos = ["2095-13", "2095-00", "2095-1", "95-10", "2095-10-01", "texto", ""];
    const aceptados: string[] = [];
    for (const mes of mesesInvalidos) {
      try {
        await pool.query(
          "INSERT INTO versiones_de_pago (mes_de_pago, numero, finalizada_por_id, finalizada_en, corte_inicio, corte_fin, reglas, revisiones, fuentes) VALUES ($1, 1, $2, now(), '2095-09-26', '2095-10-25', '[]', '[]', '[]')",
          [mes, cuenta.id]);
        aceptados.push(mes);
      } catch (error) {
        // Se rechaza por la restricción del formato de mes, no por otra causa (clave foránea, nulo, tipo).
        expect(String(error), `mes «${mes}»`).toContain("versiones_de_pago_mes_valido");
      }
    }

    expect(aceptados).toEqual([]);
    expect(await pool.query("SELECT 1 FROM versiones_de_pago WHERE finalizada_por_id = $1", [cuenta.id])).toHaveProperty("rowCount", 0);
  });

  it("F-62 la consulta mesFinalizado de las fuentes externas dice la verdad: solo el mes con alguna versión finalizada está finalizado", async () => {
    expect(await externas.mesFinalizado("2095-10")).toBe(false);

    await finalizar("2095-10");

    expect(await externas.mesFinalizado("2095-10")).toBe(true);
    expect(await externas.mesFinalizado("2095-11")).toBe(false);
  });

  it("F-63 tras finalizar el mes, volver una fuente confirmada a «Pendiente» se rechaza; antes de finalizar sí se permite", async () => {
    const tipoDeFuente = TIPOS_DE_FUENTE[0].codigo;
    const estaConfirmada = async () => (await externas.listarConfirmacionesDelMes("2095-10")).some((confirmacion) => confirmacion.tipoDeFuente === tipoDeFuente);

    await volverAPendiente(externas, cuenta, { tipoDeFuente, mes: "2095-10" });
    expect(await estaConfirmada()).toBe(false);
    await confirmarFuente(externas, cuenta, { tipoDeFuente, mes: "2095-10" });
    expect(await estaConfirmada()).toBe(true);

    await finalizar("2095-10");

    await expect(volverAPendiente(externas, cuenta, { tipoDeFuente, mes: "2095-10" })).rejects.toThrow("mes finalizado");
    expect(await estaConfirmada()).toBe(true);
  });
});
