import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import * as schema from "@/db/schema";

import {
  consultarCondicionesVigentes,
  consultarDetalleDeRelacion,
  corregirCondicionLaboral,
  listarCondicionesLaborales,
  listarSedesDeAdscripcion,
  registrarCondicionLaboral,
} from "./gestionar-condiciones-laborales";
import { RepositorioPostgresDeCondicionesLaborales } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("condiciones laborales con vigencia (integración PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeCondicionesLaborales(db);
  const sufijo = randomUUID();
  const grupo = `Grupo condiciones ${sufijo}`;
  const sede = `Sede condiciones ${sufijo}`;
  const sedeInactiva = `Sede inactiva ${sufijo}`;
  const cuentaFinanzas = randomUUID();
  const cuentaAdministrador = randomUUID();
  const finanzas: Actor = { id: cuentaFinanzas, rol: "finanzas", nombreUsuario: "finanzas-prueba" };
  const administrador: Actor = { id: cuentaAdministrador, rol: "administrador" };
  const ana = dniDePrueba();
  const beto = dniDePrueba();
  const carla = dniDePrueba();
  const dniDeTodos = [ana, beto, carla];
  const relacionAna = randomUUID();
  const reingresoAna = randomUUID();
  const relacionBeto = randomUUID();
  const sinConfirmar = randomUUID();
  const relaciones = [relacionAna, reingresoAna, relacionBeto, sinConfirmar];
  const confirmadoEn = new Date("2025-01-01T00:00:00Z");

  const registrar = (relacionId: string, dato: string, valor: string, vigenteDesde: string) => registrarCondicionLaboral(repositorio, finanzas, { relacionId, dato, valor, vigenteDesde });

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values([
      { id: cuentaFinanzas, nombreUsuario: `finanzas-${cuentaFinanzas}`, hashContrasena: "prueba", rol: "finanzas" },
      { id: cuentaAdministrador, nombreUsuario: `admin-${cuentaAdministrador}`, hashContrasena: "prueba", rol: "administrador" },
    ]);
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.sedes).values([{ nombre: sede, activa: true, grupo }, { nombre: sedeInactiva, activa: false, grupo }]);
    await db.insert(schema.colaboradores).values(dniDeTodos.map((dni, indice) => ({ dni, nombre: `Persona ${indice}`, sede, grupo, activo: true })));
    await db.insert(schema.relacionesLaborales).values([
      { id: relacionAna, dni: ana, ingreso: "2025-03-03", cese: "2026-01-30", ingresoConfirmadoPorId: cuentaFinanzas, ingresoConfirmadoEn: confirmadoEn, ceseConfirmadoPorId: cuentaFinanzas, ceseConfirmadoEn: confirmadoEn, registradaPorId: cuentaFinanzas },
      { id: reingresoAna, dni: ana, ingreso: "2026-06-01", ingresoConfirmadoPorId: cuentaFinanzas, ingresoConfirmadoEn: confirmadoEn, registradaPorId: cuentaFinanzas },
      { id: relacionBeto, dni: beto, ingreso: "2024-01-08", ingresoConfirmadoPorId: cuentaFinanzas, ingresoConfirmadoEn: confirmadoEn, registradaPorId: cuentaFinanzas },
      // Solo ingreso registrado, sin confirmar: no entra en Pagos.
      { id: sinConfirmar, dni: carla, ingreso: "2027-01-04", registradaPorId: cuentaFinanzas },
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.condicionesLaborales).where(inArray(schema.condicionesLaborales.relacionLaboralId, relaciones));
    await db.delete(schema.relacionesLaborales).where(inArray(schema.relacionesLaborales.id, relaciones));
    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.dni, dniDeTodos));
    await db.delete(schema.sedes).where(inArray(schema.sedes.nombre, [sede, sedeInactiva]));
    // Otras pruebas aprueban todos los grupos de la base, también los que crea esta: sin esto el borrado falla según el orden de ejecución.
    await db.delete(schema.aprobacionesDeAsistencia).where(eq(schema.aprobacionesDeAsistencia.grupo, grupo));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(inArray(schema.cuentasLocales.id, [cuentaFinanzas, cuentaAdministrador]));
    await pool.end();
  });

  it("conserva cada dato con su vigencia y un cambio de sueldo dentro del mes son dos vigencias", async () => {
    await registrar(relacionBeto, "sueldo", "1500", "2026-09-01");
    await registrar(relacionBeto, "sueldo", "1800,50", "2026-09-16");
    await registrar(relacionBeto, "jornada_ordinaria_diaria", "7,5", "2026-09-01");
    await registrar(relacionBeto, "regimen_laboral", "remype_pequena_empresa", "2026-09-01");
    await registrar(relacionBeto, "afiliacion_pensionaria", "afp_prima", "2026-09-01");
    await registrar(relacionBeto, "comision_afp", "flujo", "2026-09-01");
    await registrar(relacionBeto, "elegibilidad_familiar", "si", "2026-09-01");
    await registrar(relacionBeto, "sede_de_adscripcion", sede, "2026-09-01");

    await expect(consultarCondicionesVigentes(repositorio, finanzas, relacionBeto, "2026-08-31")).resolves.toMatchObject({ sueldo: undefined, jornada_ordinaria_diaria: undefined });
    await expect(consultarCondicionesVigentes(repositorio, finanzas, relacionBeto, "2026-09-15")).resolves.toEqual({
      sueldo: 150000, jornada_ordinaria_diaria: 450, regimen_laboral: "remype_pequena_empresa", afiliacion_pensionaria: "afp_prima",
      comision_afp: "flujo", elegibilidad_familiar: true, sede_de_adscripcion: sede,
    });
    expect((await consultarCondicionesVigentes(repositorio, finanzas, relacionBeto, "2026-09-16")).sueldo).toBe(180050);

    const detalle = await consultarDetalleDeRelacion(repositorio, finanzas, relacionBeto, "2026-09-30");
    const sueldos = detalle!.datos.find(({ dato }) => dato === "sueldo")!;
    expect(sueldos.historial.map(({ valor, vigenteDesde, vigenteHasta, estado, registradaPor }) => ({ valor, vigenteDesde, vigenteHasta, estado, registradaPor }))).toEqual([
      { valor: 150000, vigenteDesde: "2026-09-01", vigenteHasta: "2026-09-15", estado: "anterior", registradaPor: `finanzas-${cuentaFinanzas}` },
      { valor: 180050, vigenteDesde: "2026-09-16", vigenteHasta: null, estado: "vigente", registradaPor: `finanzas-${cuentaFinanzas}` },
    ]);
  });

  it("la base guarda cada dato en su columna y rechaza combinaciones y valores inválidos", async () => {
    const insertar = (valores: Partial<typeof schema.condicionesLaborales.$inferInsert>) => db.insert(schema.condicionesLaborales)
      .values({ relacionLaboralId: relacionBeto, dato: "sueldo", sueldoCentimos: 100000, vigenteDesde: "2030-01-01", registradoPorId: cuentaFinanzas, ...valores });

    await expect(insertar({ sueldoCentimos: 0 })).rejects.toThrow();
    await expect(insertar({ sueldoCentimos: null })).rejects.toThrow();
    await expect(insertar({ jornadaMinutos: 480 })).rejects.toThrow();
    await expect(insertar({ dato: "jornada_ordinaria_diaria", sueldoCentimos: null, jornadaMinutos: 0 })).rejects.toThrow();
    await expect(insertar({ dato: "jornada_ordinaria_diaria", sueldoCentimos: null, jornadaMinutos: 1441 })).rejects.toThrow();
    await expect(insertar({ dato: "regimen_laboral", sueldoCentimos: null, regimen: "otro" as "general" })).rejects.toThrow();
    await expect(insertar({ dato: "sueldo", sueldoCentimos: 100000, vigenteDesde: "2030-01-02", reemplazadaEn: new Date() })).rejects.toThrow();
    await expect(insertar({ dato: "sede_de_adscripcion", sueldoCentimos: null, sedeDeAdscripcion: "Centro de costo inexistente" })).rejects.toThrow();
  });

  it("no hay otro catálogo: la sede de adscripción solo admite sedes existentes y activas", async () => {
    await expect(registrar(relacionBeto, "sede_de_adscripcion", "Centro de costo 7", "2027-01-01")).rejects.toThrow("No existe la sede");
    await expect(registrar(relacionBeto, "sede_de_adscripcion", sedeInactiva, "2027-01-01")).rejects.toThrow("inactiva");
    const sedes = await listarSedesDeAdscripcion(repositorio, finanzas);
    expect(sedes).toContain(sede);
    expect(sedes).not.toContain(sedeInactiva);
    const { rows } = await pool.query<{ tabla: string }>("SELECT table_name AS tabla FROM information_schema.columns WHERE column_name = 'sede_de_adscripcion' AND table_schema = 'public'");
    expect(rows.map(({ tabla }) => tabla)).toEqual(["condiciones_laborales"]);
  });

  it("solo una vigencia activa por dato y fecha: la repetida se rechaza y no reescribe la historia", async () => {
    await registrar(relacionAna, "sueldo", "1400", "2025-03-03");
    await expect(registrar(relacionAna, "sueldo", "1450", "2025-03-03")).rejects.toThrow("use «Corregir»");
    await expect(registrar(relacionAna, "sueldo", "1450", "2025-03-02")).rejects.toThrow("antes del ingreso");
    await expect(registrar(relacionAna, "sueldo", "1450", "2025-03-04")).resolves.toMatchObject({ valor: 145000 });
    await expect(registrar(relacionAna, "sueldo", "1460", "2025-03-03")).rejects.toThrow("ya tiene un valor desde el 04/03/2025");
    await expect(registrar("no-es-uuid", "sueldo", "1450", "2025-04-01")).rejects.toThrow("relación laboral confirmada");
    await expect(registrar(relacionAna, "sueldo", "1450", "2026-02-01")).rejects.toThrow("después del cese");
    expect((await consultarCondicionesVigentes(repositorio, finanzas, relacionAna, "2025-03-03")).sueldo).toBe(140000);
  });

  it("dos registros simultáneos de la misma vigencia dejan uno solo", async () => {
    const resultados = await Promise.allSettled([
      registrar(relacionBeto, "sueldo", "2100", "2027-02-01"),
      registrar(relacionBeto, "sueldo", "2200", "2027-02-01"),
    ]);

    expect(resultados.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(resultados.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const guardadas = await db.select().from(schema.condicionesLaborales).where(eq(schema.condicionesLaborales.relacionLaboralId, relacionBeto));
    expect(guardadas.filter(({ dato, vigenteDesde }) => dato === "sueldo" && vigenteDesde === "2027-02-01")).toHaveLength(1);
  });

  it("corregir reemplaza con motivo en una sola transacción y conserva la historia", async () => {
    const errada = await registrar(reingresoAna, "sueldo", "17000", "2026-06-01");
    await expect(corregirCondicionLaboral(repositorio, finanzas, { condicionId: errada.id, valor: "1700", motivo: "" })).rejects.toThrow("motivo");
    await corregirCondicionLaboral(repositorio, finanzas, { condicionId: errada.id, valor: "1700", motivo: "Error de digitación" });
    await expect(corregirCondicionLaboral(repositorio, finanzas, { condicionId: errada.id, valor: "1750", motivo: "Otra vez" })).rejects.toThrow("ya fue reemplazado");

    const detalle = await consultarDetalleDeRelacion(repositorio, finanzas, reingresoAna, "2026-09-30");
    const historial = detalle!.datos.find(({ dato }) => dato === "sueldo")!.historial;
    expect(historial.map(({ valor, estado, motivoDeReemplazo }) => ({ valor, estado, motivoDeReemplazo }))).toEqual([
      { valor: 1700000, estado: "reemplazado", motivoDeReemplazo: "Error de digitación" },
      { valor: 170000, estado: "vigente", motivoDeReemplazo: null },
    ]);
    expect((await consultarCondicionesVigentes(repositorio, finanzas, reingresoAna, "2026-07-01")).sueldo).toBe(170000);
  });

  it("un reingreso tiene su propio historial y una relación sin ingreso confirmado no entra en Pagos", async () => {
    const { filas } = await listarCondicionesLaborales(repositorio, finanzas, { hoy: "2026-09-30", filtros: { persona: ana } });
    expect(filas.map(({ id }) => id)).toEqual([reingresoAna, relacionAna]);
    expect(filas[0]).toMatchObject({ cese: null, nombre: "Persona 0" });
    expect(filas[1]).toMatchObject({ cese: "2026-01-30" });
    expect(filas[0].vigentes.sueldo).toBe(170000);
    expect(filas[1].vigentes.sueldo).toBe(145000);
    await expect(registrar(sinConfirmar, "sueldo", "1500", "2027-01-04")).rejects.toThrow("relación laboral confirmada");
    await expect(consultarDetalleDeRelacion(repositorio, finanzas, sinConfirmar, "2026-09-30")).resolves.toBeUndefined();
  });

  it("el Administrador del sistema recibe el rechazo del servidor y la base no cambia", async () => {
    const antes = await db.select().from(schema.condicionesLaborales).where(inArray(schema.condicionesLaborales.relacionLaboralId, relaciones));
    await expect(registrarCondicionLaboral(repositorio, administrador, { relacionId: relacionBeto, dato: "sueldo", valor: "9999", vigenteDesde: "2028-01-01" })).rejects.toThrow("No tiene permiso");
    await expect(listarCondicionesLaborales(repositorio, administrador, { hoy: "2026-09-30" })).rejects.toThrow("No tiene permiso");
    const despues = await db.select().from(schema.condicionesLaborales).where(inArray(schema.condicionesLaborales.relacionLaboralId, relaciones));
    expect(despues).toHaveLength(antes.length);
  });
});
