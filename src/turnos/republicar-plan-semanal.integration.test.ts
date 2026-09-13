import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { republicarPlanSemanal } from "./republicar-plan-semanal";
import { RepositorioPostgresDeTurnos } from "./repositorio-postgres";
import { diasDeLaSemana, inicioDeSemana } from "./semana";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// Cubre, contra PostgreSQL real, que republicar los siete días corregidos de un colaborador
// es atómico: si uno de los días ya no puede corregirse (p. ej. su asistencia fue confirmada
// concurrentemente entre que se armó la corrección y que se confirmó la republicación), no
// queda modificado NINGÚN día de los siete, ni siquiera los que sí eran válidos y ya se habían
// actualizado dentro de la misma transacción. El actor es de rol Finanzas para ejercer también,
// contra la base real, que republica con las mismas reglas que Operaciones.
describe.skipIf(!databaseUrl)("republicarPlanSemanal (atomicidad, integración PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeTurnos(db);
  const grupo = `Grupo republicacion ${randomUUID()}`;
  const sede = `Sede republicacion ${randomUUID()}`;
  const huId = `HU-${randomUUID()}`;
  const cuentaId = randomUUID();
  const semana = inicioDeSemana("2032-04-05");
  const dias = diasDeLaSemana(semana);
  const actor = { id: cuentaId, rol: "finanzas" as const };

  afterAll(async () => {
    const planes = await db.select({ id: schema.planesSemanalesEnBorrador.id }).from(schema.planesSemanalesEnBorrador)
      .where(and(eq(schema.planesSemanalesEnBorrador.semana, semana), eq(schema.planesSemanalesEnBorrador.equipo, grupo)));
    if (planes.length) await db.delete(schema.celdasDePlanesSemanalesEnBorrador).where(inArray(schema.celdasDePlanesSemanalesEnBorrador.planId, planes.map(({ id }) => id)));
    await db.delete(schema.planesSemanalesEnBorrador).where(and(eq(schema.planesSemanalesEnBorrador.semana, semana), eq(schema.planesSemanalesEnBorrador.equipo, grupo)));

    const publicados = await db.select({ id: schema.turnosPublicados.id }).from(schema.turnosPublicados)
      .where(and(eq(schema.turnosPublicados.idHuellero, huId), inArray(schema.turnosPublicados.fecha, dias)));
    if (publicados.length) await db.delete(schema.historialDeTurnosPublicados).where(inArray(schema.historialDeTurnosPublicados.turnoPublicadoId, publicados.map(({ id }) => id)));
    await db.delete(schema.turnosPublicados).where(and(eq(schema.turnosPublicados.idHuellero, huId), inArray(schema.turnosPublicados.fecha, dias)));
    await db.delete(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.idHuellero, huId), inArray(schema.asistenciasEsperadas.fecha, dias)));

    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.idHuellero, huId));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.inicio, dias[0]));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await pool.end();
  });

  it("no corrige ningún día de la semana si uno de ellos ya fue confirmado concurrentemente", async () => {
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.sedes).values({ nombre: sede, grupo, activa: true });
    await db.insert(schema.colaboradores).values({ idHuellero: huId, nombre: "Colaborador republicación", sede, grupo, activo: true });
    await db.insert(schema.periodosPlanilla).values({ inicio: dias[0], fin: dias[6], estado: "abierto" });
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `republicacion-${cuentaId}`, hashContrasena: "prueba", rol: "finanzas" });

    const originales = dias.map((fecha) => ({ idHuellero: huId, fecha, sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false }));
    await repositorio.publicarEnLote(originales, actor);

    // Entre que se arma la corrección y se confirma la republicación, otra vía (p. ej. una
    // importación) ya confirmó la asistencia del cuarto día. El caso de uso solo consulta
    // `asistenciaEstaProcesada` antes de entrar a la transacción; forzamos que esa
    // pre-verificación no detecte el conflicto (como si ocurriera justo después) para
    // ejercer la verificación real que hace la transacción de `reemplazarSemanaPublicada`.
    const fechaEnConflicto = dias[3];
    const [asistenciaEnConflicto] = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas)
      .where(and(eq(schema.asistenciasEsperadas.idHuellero, huId), eq(schema.asistenciasEsperadas.fecha, fechaEnConflicto)));
    await db.update(schema.asistenciasEsperadas).set({ estado: "confirmada" }).where(eq(schema.asistenciasEsperadas.id, asistenciaEnConflicto.id));
    repositorio.asistenciaEstaProcesada = async () => false;

    const plan = await repositorio.obtenerOCrear(semana, grupo);
    await repositorio.guardarCeldas(dias.map((fecha) => ({
      planId: plan.id, idHuellero: huId, fecha, sede, entradaProgramada: "10:00", salidaProgramada: "19:00", descanso: false,
    })));

    await expect(republicarPlanSemanal(repositorio, actor, plan.id, huId, "Corrige entrada pactada"))
      .rejects.toThrow("No se puede corregir un horario semanal que ya fue procesado.");

    // Ninguno de los siete días quedó corregido, incluidos los anteriores al día en conflicto
    // que la transacción ya había alcanzado a actualizar antes de fallar.
    for (const fecha of dias) {
      await expect(repositorio.buscarPublicado(huId, fecha)).resolves.toMatchObject({ entradaProgramada: "09:00", salidaProgramada: "18:00" });
    }
    const publicados = await db.select({ id: schema.turnosPublicados.id }).from(schema.turnosPublicados)
      .where(and(eq(schema.turnosPublicados.idHuellero, huId), inArray(schema.turnosPublicados.fecha, dias)));
    const historial = await db.select({ motivo: schema.historialDeTurnosPublicados.motivo }).from(schema.historialDeTurnosPublicados)
      .where(inArray(schema.historialDeTurnosPublicados.turnoPublicadoId, publicados.map(({ id }) => id)));
    // Solo queda el historial de la publicación inicial: ninguna fila de "Corrige entrada
    // pactada" se agregó para ningún día de los siete.
    expect(historial.every(({ motivo }) => motivo !== "Corrige entrada pactada")).toBe(true);
  });
});
