import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as XLSX from "xlsx";
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

import { exportarPreliquidacion } from "./exportar-mes";
import { evaluarFinalizacion, finalizarMes, type DependenciasDeFinalizacion } from "./finalizar-mes";
import { RepositorioPostgresDeConstancias } from "./repositorio-postgres-de-constancias";
import { RepositorioPostgresDeVersiones } from "./repositorio-postgres-de-versiones";

// Exportar la preliquidación (#131) contra PostgreSQL real: una versión finalizada se exporta tal como se guardó, con la sede de adscripción de cuando se finalizó
// aunque después se registre otra. Mismo mundo sintético que la finalización (#129): mes 2095-10, Ana S/ 2.000,00, Beto S/ 1.500,00 y Carla S/ 1.000,00.
// Cada prueba arma su propio mundo y lo retira al terminar con una conexión de superusuario de la base de PRUEBA.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

const AHORA = new Date("2095-10-26T15:00:00Z");
const SUELDOS = [{ nombre: "Ana", sueldo: 200000 }, { nombre: "Beto", sueldo: 150000 }, { nombre: "Carla", sueldo: 100000 }];

describe.skipIf(!databaseUrl)("exportación de la preliquidación con PostgreSQL", () => {
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
  let otraSede: string;

  beforeEach(async () => {
    const cuentaId = randomUUID();
    cuenta = { id: cuentaId, rol: "finanzas", nombreUsuario: `finanzas-${cuentaId}` };
    grupo = `Grupo versiones ${randomUUID()}`;
    sede = `Sede versiones ${randomUUID()}`;
    otraSede = `Otra sede ${randomUUID()}`;
    dnis = SUELDOS.map(() => dniDePrueba());
    relacionIds = SUELDOS.map(() => randomUUID());
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: cuenta.nombreUsuario!, hashContrasena: "prueba", rol: "finanzas" });
    await db.insert(schema.grupos).values({ nombre: grupo, gestionaAsistencia: false });
    await db.insert(schema.sedes).values([{ nombre: sede, grupo }, { nombre: otraSede, grupo }]);
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
      versiones, pago: new RepositorioPostgresDeConstancias(db), ahora: () => AHORA,
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
    await db.delete(schema.sedes).where(inArray(schema.sedes.nombre, [sede, otraSede]));
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
  const hojas = (contenido: Uint8Array) => {
    const libro = XLSX.read(contenido, { type: "array" });
    return Object.fromEntries(libro.SheetNames.map((nombre) => [nombre, XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], { header: 1, defval: "" })]));
  };

  it("F-20 exporta la versión finalizada con su identificador, subtotal y la sede de cuando se finalizó, aunque después se registre otra", async () => {
    const revision = await evaluarFinalizacion(dependencias, cuenta, { mes: "2095-10" });
    expect(revision.estado).toBe("lista");
    const resultado = await finalizarMes(dependencias, cuenta, { mes: "2095-10", huella: revision.huella });
    expect(resultado.estado).toBe("finalizada");
    // Registrada después de finalizar (el reloj del mundo es 2095-10-26): vigente antes en el calendario, pero no existía al finalizar.
    await db.insert(schema.condicionesLaborales).values({ relacionLaboralId: relacionIds[0], dato: "sede_de_adscripcion", sedeDeAdscripcion: otraSede, vigenteDesde: "2095-02-01",
      registradoPorId: cuenta.id, registradoEn: new Date("2095-11-01T00:00:00Z") });

    const exportada = await exportarPreliquidacion(dependencias, cuenta, { mes: "2095-10", version: 1 });
    expect(exportada.estado).toBe("lista");
    if (exportada.estado !== "lista") return;
    const libro = hojas(exportada.archivo.contenido);
    expect(exportada.archivo.nombre).toBe("preliquidacion-2095-10-version-1.xlsx");
    expect(libro["Preliquidación"].find(([rotulo]) => rotulo === "Identificador")?.[1]).toBe("2095-10-v1");
    expect(libro["Preliquidación"].find(([rotulo]) => rotulo === "Subtotal de las personas calculadas (S/)")?.[1]).toBe(4500);
    expect(libro["Personas"].slice(1).map(([, nombre, sedeDeAdscripcion, , neto]) => [nombre, sedeDeAdscripcion, neto])).toEqual([["Ana", sede, 2000], ["Beto", sede, 1500], ["Carla", sede, 1000]]);

    const borrador = await exportarPreliquidacion(dependencias, cuenta, { mes: "2095-10" });
    if (borrador.estado !== "lista") throw new Error("Se esperaba el borrador.");
    expect(hojas(borrador.archivo.contenido)["Personas"].slice(1).map(([, nombre, sedeDeAdscripcion]) => [nombre, sedeDeAdscripcion])).toEqual([["Ana", otraSede], ["Beto", sede], ["Carla", sede]]);
  });
});
