import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { clasificarGoce } from "@/clasificaciones-de-goce/gestionar-clasificaciones";
import { RepositorioPostgresDeClasificacionesDeGoce } from "@/clasificaciones-de-goce/repositorio-postgres";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import { RepositorioPostgresDeCondicionesLaborales } from "@/condiciones-laborales/repositorio-postgres";
import * as schema from "@/db/schema";
import { RepositorioPostgresDeDescansosYFeriados } from "@/descansos-y-feriados/repositorio-postgres";
import { RepositorioPostgresDeFuentesExternas } from "@/fuentes-externas/repositorio-postgres";
import { TIPOS_DE_FUENTE } from "@/fuentes-externas/tipos-de-fuente";
import { RepositorioPostgresDePeriodos } from "@/periodos/repositorio-postgres";
import { RepositorioPostgresDeReglasLegales } from "@/reglas-legales/repositorio-postgres";
import { RepositorioPostgresDeRelacionesLaborales } from "@/relaciones-laborales/repositorio-postgres";

import { prepararBorrador } from "./preparar-borrador";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// Ejemplos independientes (issue #123): sueldo S/ 1.800,00, jornada de 480 min; un día sin goce reduce 6000 y 200 céntimos.
// Año 2093 para no cruzarse con otras pruebas de integración que comparten base.
describe.skipIf(!databaseUrl)("reducciones del borrador con permisos y suspensiones reales", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const sufijo = randomUUID().slice(0, 8);
  const grupo = `Grupo goce borrador ${sufijo}`;
  const sede = `Sede goce borrador ${sufijo}`;
  const dni = dniDePrueba();
  const cuentaId = randomUUID();
  const relacionId = randomUUID();
  const fecha = "2093-10-06";
  const finanzas: Actor = { id: cuentaId, rol: "finanzas" };
  let periodoId = "";
  let asistenciaId = "";

  const clasificaciones = new RepositorioPostgresDeClasificacionesDeGoce(db);
  const fuentes = {
    relaciones: new RepositorioPostgresDeRelacionesLaborales(db),
    condiciones: new RepositorioPostgresDeCondicionesLaborales(db),
    reglas: new RepositorioPostgresDeReglasLegales(db),
    asistencia: new RepositorioPostgresDePeriodos(db),
    externas: new RepositorioPostgresDeFuentesExternas(db),
    descansos: new RepositorioPostgresDeDescansosYFeriados(db),
    clasificaciones,
  };

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `goce-borrador-${sufijo}`, hashContrasena: "prueba", rol: "finanzas" });
    await db.insert(schema.grupos).values({ nombre: grupo, gestionaAsistencia: false });
    await db.insert(schema.sedes).values({ nombre: sede, grupo });
    await db.insert(schema.colaboradores).values({ dni, nombre: "Persona con permiso", grupo, sede });
    await db.insert(schema.relacionesLaborales).values({ id: relacionId, dni, ingreso: "2093-01-01", ingresoConfirmadoPorId: cuentaId, ingresoConfirmadoEn: new Date(), registradaPorId: cuentaId });
    const condicion = { relacionLaboralId: relacionId, vigenteDesde: "2093-01-01", registradoPorId: cuentaId };
    await db.insert(schema.condicionesLaborales).values([
      { ...condicion, dato: "sueldo", sueldoCentimos: 180000 },
      { ...condicion, dato: "jornada_ordinaria_diaria", jornadaMinutos: 480 },
      { ...condicion, dato: "elegibilidad_familiar", elegibleAsignacionFamiliar: false },
      { ...condicion, dato: "regimen_laboral", regimen: "general" },
      { ...condicion, dato: "afiliacion_pensionaria", afiliacionPensionaria: "onp" },
      { ...condicion, dato: "sede_de_adscripcion", sedeDeAdscripcion: sede },
    ]);
    // Valores sintéticos: esta prueba trata de reducciones, pero el borrador ahora exige las reglas de aportes vigentes.
    const regla = { vigenteDesde: "2093-01-01", fuenteOficial: "Valor sintético de prueba", activadaPorId: cuentaId };
    await db.insert(schema.reglasLegales).values([
      { ...regla, codigo: "onp_tasa", tasaCentesimasDePunto: 1300 },
      { ...regla, codigo: "essalud_tasa", tasaCentesimasDePunto: 900 },
      { ...regla, codigo: "essalud_base_minima", importeCentimos: 100000 },
    ]);
    const [periodo] = await db.insert(schema.periodosPlanilla).values({ inicio: "2093-09-26", fin: "2093-10-25", estado: "abierto" }).returning({ id: schema.periodosPlanilla.id });
    periodoId = periodo.id;
    await db.insert(schema.turnosPublicados).values({ dni, fecha, grupo, sede, entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false });
    const [asistencia] = await db.insert(schema.asistenciasEsperadas).values({ dni, fecha, estado: "manual" }).returning({ id: schema.asistenciasEsperadas.id });
    asistenciaId = asistencia.id;
    await db.insert(schema.estadosManuales).values({ asistenciaId, tipo: "permiso", comentario: "Permiso del gerente", responsableId: cuentaId });
  });

  beforeEach(async () => {
    await db.delete(schema.clasificacionesDeGoce).where(eq(schema.clasificacionesDeGoce.dni, dni));
  });

  afterAll(async () => {
    await db.delete(schema.clasificacionesDeGoce).where(eq(schema.clasificacionesDeGoce.dni, dni));
    await db.delete(schema.confirmacionesDeFuente).where(eq(schema.confirmacionesDeFuente.confirmadaPorId, cuentaId));
    await db.delete(schema.reglasLegales).where(eq(schema.reglasLegales.activadaPorId, cuentaId));
    await db.delete(schema.estadosManuales).where(eq(schema.estadosManuales.asistenciaId, asistenciaId));
    await db.delete(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, dni));
    await db.delete(schema.turnosPublicados).where(eq(schema.turnosPublicados.dni, dni));
    await db.delete(schema.periodosPlanilla).where(inArray(schema.periodosPlanilla.id, [periodoId]));
    await db.delete(schema.condicionesLaborales).where(eq(schema.condicionesLaborales.relacionLaboralId, relacionId));
    await db.delete(schema.relacionesLaborales).where(eq(schema.relacionesLaborales.id, relacionId));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await pool.end();
  });

  const persona = async () => (await prepararBorrador(fuentes, "2093-10")).personas.find(({ relacion }) => relacion.dni === dni)!;
  const reducciones = (lineas: Awaited<ReturnType<typeof persona>>["lineas"]) => lineas.filter(({ concepto }) => concepto.startsWith("reduccion_por_"));

  it("CU-07 un permiso sin clasificar deja a la persona bloqueada y sin reducción", async () => {
    const ana = await persona();
    expect(reducciones(ana.lineas)).toEqual([]);
    expect(ana.bloqueos).toEqual([expect.stringMatching(/2093-10-06.*goce/)]);
  });

  it("CU-08 al clasificar sin goce el borrador se recalcula con las dos reducciones y sin bloqueo", async () => {
    await clasificarGoce(clasificaciones, finanzas, { dni, fecha, conGoce: false });
    const ana = await persona();
    expect(reducciones(ana.lineas)).toMatchObject([
      { concepto: "reduccion_por_ausencia_sin_goce", importeCentimos: 6000 },
      { concepto: "reduccion_por_descanso_semanal", importeCentimos: 200 },
    ]);
    expect(ana.bloqueos).toEqual([]);
  });

  it("CU-09 al clasificar con goce el borrador no reduce y no bloquea", async () => {
    await clasificarGoce(clasificaciones, finanzas, { dni, fecha, conGoce: true });
    const ana = await persona();
    expect(reducciones(ana.lineas)).toEqual([]);
    expect(ana.bloqueos).toEqual([]);
  });

  it("CU-11 el borrador real deja las bases Pendiente sin fuentes confirmadas y calcula bases y aportes al confirmarlas", async () => {
    await clasificarGoce(clasificaciones, finanzas, { dni, fecha, conGoce: true });
    const pendientes = await persona();
    expect(pendientes.basesPorDevengue).toMatchObject([{ mesDeDevengue: "2093-10", pensionariaCentimos: null, essaludRemunerativaCentimos: null, essaludAplicableCentimos: null, quintaCentimos: null }]);
    expect(pendientes.lineas.filter(({ concepto }) => concepto === "aporte_onp" || concepto === "essalud_patronal")).toEqual([]);
    await db.insert(schema.confirmacionesDeFuente).values(TIPOS_DE_FUENTE.map(({ codigo }) => ({ tipoDeFuente: codigo, mesDeAplicacion: "2093-10", confirmadaPorId: cuentaId })));
    try {
      const ana = await persona();
      // Esperados a mano, no del código: sueldo S/ 1.800,00; ONP 13 % = S/ 234,00; EsSalud 9 % sobre el mayor entre S/ 1.800,00 y el mínimo de S/ 1.000,00 = S/ 162,00.
      expect(ana.basesPorDevengue).toEqual([{ mesDeDevengue: "2093-10", pensionariaCentimos: 180000, essaludRemunerativaCentimos: 180000, essaludAplicableCentimos: 180000, quintaCentimos: 180000 }]);
      expect(ana.lineas.filter(({ concepto }) => concepto === "aporte_onp")).toMatchObject([{ importeCentimos: 23400, baseCentimos: 180000, tipo: "deduccion_del_trabajador", efectoEnNeto: "resta" }]);
      expect(ana.lineas.filter(({ concepto }) => concepto === "essalud_patronal")).toMatchObject([{ importeCentimos: 16200, baseCentimos: 180000, tipo: "aporte_patronal", efectoEnNeto: "ninguno" }]);
    } finally {
      await db.delete(schema.confirmacionesDeFuente).where(eq(schema.confirmacionesDeFuente.confirmadaPorId, cuentaId));
    }
  });

  it("CU-10 cada reducción se rastrea a la jornada real de Asistencia y a la decisión de goce", async () => {
    const guardada = await clasificarGoce(clasificaciones, finanzas, { dni, fecha, conGoce: false });
    const lineas = reducciones((await persona()).lineas);
    expect(lineas).toHaveLength(2);
    for (const linea of lineas) {
      expect(linea).toMatchObject({
        fecha,
        evidencia: { asistenciaId },
        decision: { conGoce: false, clasificadoPorId: cuentaId, clasificadoEn: guardada.clasificadoEn },
      });
    }
  });
});
