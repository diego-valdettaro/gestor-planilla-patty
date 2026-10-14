import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import * as schema from "@/db/schema";
import { RepositorioPostgresDePeriodos } from "@/periodos/repositorio-postgres";

import { RepositorioPostgresDeClasificacionesDeGoce } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// Año 2092 para no cruzarse con otras pruebas de integración que comparten base.
describe.skipIf(!databaseUrl)("casos de uso de clasificación de goce", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeClasificacionesDeGoce(db);
  const periodos = new RepositorioPostgresDePeriodos(db);
  const sufijo = randomUUID().slice(0, 8);
  const grupo = `Grupo goce CU ${sufijo}`;
  const sede = `Sede goce CU ${sufijo}`;
  const dni = dniDePrueba();
  const finanzasId = randomUUID();
  const fecha = "2092-10-06";
  let periodoId = "";

  const finanzas: Actor = { id: finanzasId, rol: "finanzas" };
  const ajenos: Array<[string, Actor]> = [
    ["el Administrador del sistema", { id: randomUUID(), rol: "administrador" }],
    ["Recursos Humanos", { id: randomUUID(), rol: "recursos_humanos" }],
    ["un gerente de área", { id: randomUUID(), rol: "gerente_de_area", grupos: [{ nombre: grupo, gestionaAsistencia: true }] }],
  ];
  const casosDeUso = async () => import("./gestionar-clasificaciones");
  const filasDe = (persona: string) => db.select().from(schema.clasificacionesDeGoce).where(eq(schema.clasificacionesDeGoce.dni, persona));

  beforeAll(async () => {
    await db.insert(schema.grupos).values({ nombre: grupo, gestionaAsistencia: false });
    await db.insert(schema.sedes).values({ nombre: sede, grupo });
    await db.insert(schema.cuentasLocales).values({ id: finanzasId, nombreUsuario: `finanzas-goce-${sufijo}`, hashContrasena: "prueba", rol: "finanzas" });
    await db.insert(schema.colaboradores).values({ dni, nombre: "Persona con permiso", grupo, sede });
    const [periodo] = await db.insert(schema.periodosPlanilla).values({ inicio: "2092-09-26", fin: "2092-10-25", estado: "abierto" }).returning({ id: schema.periodosPlanilla.id });
    periodoId = periodo.id;
    await db.insert(schema.turnosPublicados).values({ dni, fecha, grupo, sede, entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false });
    const [asistencia] = await db.insert(schema.asistenciasEsperadas).values({ dni, fecha, estado: "manual" }).returning({ id: schema.asistenciasEsperadas.id });
    await db.insert(schema.estadosManuales).values({ asistenciaId: asistencia.id, tipo: "permiso", comentario: "Permiso del gerente", responsableId: finanzasId });
  });

  afterAll(async () => {
    const asistencias = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, dni));
    await db.delete(schema.clasificacionesDeGoce).where(eq(schema.clasificacionesDeGoce.dni, dni));
    if (asistencias.length) await db.delete(schema.estadosManuales).where(inArray(schema.estadosManuales.asistenciaId, asistencias.map(({ id }) => id)));
    await db.delete(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.dni, dni));
    await db.delete(schema.turnosPublicados).where(eq(schema.turnosPublicados.dni, dni));
    await db.delete(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.id, periodoId));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, finanzasId));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await pool.end();
  });

  it("CU-01 Finanzas clasifica una jornada y queda guardada con su actor, su fecha y el vínculo dni + fecha", async () => {
    const { clasificarGoce, consultarClasificaciones } = await casosDeUso();
    await clasificarGoce(repositorio, finanzas, { dni, fecha, conGoce: false });

    const [clasificada] = (await consultarClasificaciones(repositorio, finanzas, { desde: "2092-09-26", hasta: "2092-10-25" })).filter((fila) => fila.dni === dni);
    expect(clasificada).toMatchObject({ dni, fecha, conGoce: false, clasificadoPorId: finanzasId });
    expect(clasificada.clasificadoEn).toBeInstanceOf(Date);
  });

  it.each(ajenos)("CU-02 %s no puede clasificar y no se guarda nada", async (_nombre, actor) => {
    const { clasificarGoce } = await casosDeUso();
    const antes = await filasDe(dni);
    await expect(clasificarGoce(repositorio, actor, { dni, fecha: "2092-10-07", conGoce: true })).rejects.toThrow("No tiene permiso para consultar ni editar Pagos.");
    expect(await filasDe(dni)).toEqual(antes);
  });

  it.each(ajenos)("CU-03 %s no puede consultar las clasificaciones", async (_nombre, actor) => {
    const { consultarClasificaciones } = await casosDeUso();
    await expect(consultarClasificaciones(repositorio, actor, { desde: "2092-09-26", hasta: "2092-10-25" })).rejects.toThrow("No tiene permiso para consultar ni editar Pagos.");
  });

  it("CU-04 clasificar no modifica el hecho diario de Asistencia", async () => {
    const { clasificarGoce } = await casosDeUso();
    const delDia = async () => (await periodos.leerHechosDelPeriodo(periodoId)).hechos.filter((hecho) => hecho.dni === dni && hecho.fecha === fecha);
    const antes = await delDia();
    expect(antes).toMatchObject([{ resultado: "permiso" }]);
    await clasificarGoce(repositorio, finanzas, { dni, fecha, conGoce: true });
    expect(await delDia()).toEqual(antes);
  });
});
