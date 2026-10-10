import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import { RepositorioPostgresDeCondicionesLaborales } from "@/condiciones-laborales/repositorio-postgres";
import * as schema from "@/db/schema";
import { registrarAbonoVacacional } from "@/fuentes-externas/abonos-vacacionales";
import { anularImporte } from "@/fuentes-externas/gestionar-fuentes-externas";
import { RepositorioPostgresDeFuentesExternas } from "@/fuentes-externas/repositorio-postgres";
import { RepositorioPostgresDePeriodos } from "@/periodos/repositorio-postgres";
import { RepositorioPostgresDeReglasLegales } from "@/reglas-legales/repositorio-postgres";
import { RepositorioPostgresDeRelacionesLaborales } from "@/relaciones-laborales/repositorio-postgres";

import { prepararBorrador } from "./preparar-borrador";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// Año 2091 para no cruzarse con otras pruebas de integración que comparten base.
describe.skipIf(!databaseUrl)("vacaciones entre meses desde PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const sufijo = randomUUID().slice(0, 8);
  const dni = dniDePrueba();
  const dniSinCalendario = dniDePrueba();
  const cuentaId = randomUUID();
  const relacionId = randomUUID();
  const relacionSinCalendarioId = randomUUID();
  const grupo = `Grupo vacaciones ${sufijo}`;
  const sede = `Sede vacaciones ${sufijo}`;
  const periodoIds: string[] = [];
  const finanzas: Actor = { id: cuentaId, rol: "finanzas", nombreUsuario: `vacaciones-${sufijo}` };

  const fuentes = {
    relaciones: new RepositorioPostgresDeRelacionesLaborales(db),
    condiciones: new RepositorioPostgresDeCondicionesLaborales(db),
    reglas: new RepositorioPostgresDeReglasLegales(db),
    asistencia: new RepositorioPostgresDePeriodos(db),
    externas: new RepositorioPostgresDeFuentesExternas(db),
  };

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `vacaciones-${sufijo}`, hashContrasena: "prueba", rol: "finanzas" });
    await db.insert(schema.grupos).values({ nombre: grupo, gestionaAsistencia: false });
    await db.insert(schema.sedes).values({ nombre: sede, grupo });
    await db.insert(schema.colaboradores).values([{ dni, nombre: "Ana Vacaciones", grupo, sede }, { dni: dniSinCalendario, nombre: "Beto Sin Calendario", grupo, sede }]);
    await db.insert(schema.relacionesLaborales).values([
      { id: relacionId, dni, ingreso: "2091-01-01", ingresoConfirmadoPorId: cuentaId, ingresoConfirmadoEn: new Date(), registradaPorId: cuentaId },
      { id: relacionSinCalendarioId, dni: dniSinCalendario, ingreso: "2091-01-01", ingresoConfirmadoPorId: cuentaId, ingresoConfirmadoEn: new Date(), registradaPorId: cuentaId },
    ]);
    await db.insert(schema.condicionesLaborales).values([
      { relacionLaboralId: relacionId, dato: "sueldo", sueldoCentimos: 300000, vigenteDesde: "2091-01-01", registradoPorId: cuentaId },
      { relacionLaboralId: relacionSinCalendarioId, dato: "sueldo", sueldoCentimos: 300000, vigenteDesde: "2091-01-01", registradoPorId: cuentaId },
    ]);
    const periodos = await db.insert(schema.periodosPlanilla).values([
      { inicio: "2091-08-26", fin: "2091-09-25", estado: "abierto" },
      { inicio: "2091-09-26", fin: "2091-10-25", estado: "abierto" },
    ]).returning({ id: schema.periodosPlanilla.id });
    periodoIds.push(...periodos.map(({ id }) => id));
    // Descanso aprobado en el calendario: 29/09 al 04/10. Los días de septiembre posteriores al 25 viven en el período siguiente.
    const dias = ["2091-09-29", "2091-09-30", "2091-10-01", "2091-10-02", "2091-10-03", "2091-10-04"];
    await db.insert(schema.turnosPublicados).values(dias.map((fecha) => ({ dni, fecha, grupo, sede: null, entradaProgramada: null, salidaProgramada: null, descanso: true, motivoNoAsistencia: "vacaciones" as const })));
  });

  afterAll(async () => {
    await db.delete(schema.importesExternos).where(inArray(schema.importesExternos.dni, [dni, dniSinCalendario]));
    await db.delete(schema.turnosPublicados).where(eq(schema.turnosPublicados.dni, dni));
    await db.delete(schema.periodosPlanilla).where(inArray(schema.periodosPlanilla.id, periodoIds));
    await db.delete(schema.condicionesLaborales).where(inArray(schema.condicionesLaborales.relacionLaboralId, [relacionId, relacionSinCalendarioId]));
    await db.delete(schema.relacionesLaborales).where(inArray(schema.relacionesLaborales.id, [relacionId, relacionSinCalendarioId]));
    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.dni, [dni, dniSinCalendario]));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await pool.end();
  });

  it("septiembre ve sus 2 días de un período posterior al corte y no cambia la cobertura del corte", async () => {
    const borrador = await prepararBorrador(fuentes, "2091-09");
    const ana = borrador.personas.find(({ relacion }) => relacion.dni === dni);
    expect(ana?.lineas.filter(({ concepto }) => concepto === "remuneracion_vacacional")).toMatchObject([{ dias: 2, importeCentimos: 20000, desde: "2091-09-29", hasta: "2091-09-30" }]);
    expect(ana?.sueldoCalculadoCentimos).toBe(300000);
    expect(ana?.vacaciones[0].meses.map(({ mes, diasDeDescanso }) => [mes, diasDeDescanso])).toEqual([["2091-09", 2], ["2091-10", 4]]);
    expect(borrador.vacacionesProvisionales).toBe(true);
    // El corte de septiembre es solo el primer período: el período posterior con las vacaciones no es una revisión del corte.
    expect(borrador.revisiones.map(({ inicio, fin }) => [inicio, fin])).toEqual([["2091-08-26", "2091-09-25"]]);
    expect(borrador.bloqueosDelMes.filter((bloqueo) => bloqueo.includes("no está cerrado"))).toHaveLength(1);
  });

  it("octubre muestra 4 días y el abono registrado en septiembre reduce cada saldo una vez", async () => {
    const abono = await registrarAbonoVacacional(fuentes.externas, finanzas, { dni, fechaDelAbono: "2091-09-28", mesDeAplicacion: "2091-09", monto: "300,00" });
    const octubre = await prepararBorrador(fuentes, "2091-10");
    const ana = octubre.personas.find(({ relacion }) => relacion.dni === dni);
    expect(ana?.lineas.filter(({ concepto }) => concepto === "remuneracion_vacacional")).toMatchObject([{ dias: 4, importeCentimos: 40000 }]);
    expect(ana?.vacaciones[0].meses).toEqual([
      { mes: "2091-09", diasDeDescanso: 2, diasConvencionales: 2, remuneracionCentimos: 20000, abonosAsignadosCentimos: 10000, saldoCentimos: 10000 },
      { mes: "2091-10", diasDeDescanso: 4, diasConvencionales: 4, remuneracionCentimos: 40000, abonosAsignadosCentimos: 20000, saldoCentimos: 20000 },
    ]);
    expect(ana?.vacaciones[0].abonos).toMatchObject([{ id: abono.id, mesDeAplicacion: "2091-09" }]);
    expect(ana?.bloqueos.some((bloqueo) => bloqueo.includes("abono vacacional"))).toBe(false);
    // Septiembre muestra el mismo reparto, sin sumar el abono dos veces.
    const septiembre = (await prepararBorrador(fuentes, "2091-09")).personas.find(({ relacion }) => relacion.dni === dni);
    expect(septiembre?.vacaciones[0].meses.map(({ abonosAsignadosCentimos }) => abonosAsignadosCentimos)).toEqual([10000, 20000]);
  });

  it("una persona sin jornadas de vacaciones no tiene desglose, y un abono anulado deja de repartirse", async () => {
    const octubre = await prepararBorrador(fuentes, "2091-10");
    expect(octubre.personas.find(({ relacion }) => relacion.dni === dniSinCalendario)).toMatchObject({ vacaciones: [], sueldoCalculadoCentimos: 300000 });
    const [abono] = await fuentes.externas.listarAbonosVacacionales();
    await anularImporte(fuentes.externas, finanzas, { importeId: abono.id, motivo: "Abono mal registrado" });
    const sinAbono = (await prepararBorrador(fuentes, "2091-10")).personas.find(({ relacion }) => relacion.dni === dni);
    expect(sinAbono?.vacaciones[0].meses.map(({ saldoCentimos }) => saldoCentimos)).toEqual([20000, 40000]);
  });
});
