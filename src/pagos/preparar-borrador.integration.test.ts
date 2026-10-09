import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import { RepositorioPostgresDeCondicionesLaborales } from "@/condiciones-laborales/repositorio-postgres";
import * as schema from "@/db/schema";
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

  it("usa revisión cerrada exacta y cero confirmado; conserva el devengue del ingreso tardío", async () => {
    await db.update(schema.periodosPlanilla).set({ estado: "cerrado" }).where(eq(schema.periodosPlanilla.id, periodoId));
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
});
