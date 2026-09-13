import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { publicarPlanSemanal } from "./publicar-plan-semanal";
import { RepositorioPostgresDeTurnos } from "./repositorio-postgres";
import { diasDeLaSemana, inicioDeSemana } from "./semana";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// Cubre, contra PostgreSQL real, que una publicación de varios colaboradores seleccionados
// es atómica: si uno de ellos ya no puede publicarse (p. ej. otra persona lo publicó
// concurrentemente entre que se armó la selección y que se confirmó), no queda publicado
// NINGÚN colaborador de la selección, ni siquiera los que sí eran válidos.
describe.skipIf(!databaseUrl)("publicarPlanSemanal (selección, integración PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeTurnos(db);
  const grupo = `Grupo publicacion ${randomUUID()}`;
  const sede = `Sede publicacion ${randomUUID()}`;
  const huIdValido = `HU-${randomUUID()}`;
  const huIdConflicto = `HU-${randomUUID()}`;
  const semana = inicioDeSemana("2032-03-01");
  const dias = diasDeLaSemana(semana);
  const cuentaId = randomUUID();
  const actor = { id: cuentaId, rol: "operaciones" as const };

  afterAll(async () => {
    const planes = await db.select({ id: schema.planesSemanalesEnBorrador.id }).from(schema.planesSemanalesEnBorrador)
      .where(and(eq(schema.planesSemanalesEnBorrador.semana, semana), eq(schema.planesSemanalesEnBorrador.equipo, grupo)));
    if (planes.length) await db.delete(schema.celdasDePlanesSemanalesEnBorrador).where(inArray(schema.celdasDePlanesSemanalesEnBorrador.planId, planes.map(({ id }) => id)));
    await db.delete(schema.planesSemanalesEnBorrador).where(and(eq(schema.planesSemanalesEnBorrador.semana, semana), eq(schema.planesSemanalesEnBorrador.equipo, grupo)));

    const publicados = await db.select({ id: schema.turnosPublicados.id }).from(schema.turnosPublicados)
      .where(and(inArray(schema.turnosPublicados.idHuellero, [huIdValido, huIdConflicto]), inArray(schema.turnosPublicados.fecha, dias)));
    if (publicados.length) await db.delete(schema.historialDeTurnosPublicados).where(inArray(schema.historialDeTurnosPublicados.turnoPublicadoId, publicados.map(({ id }) => id)));
    await db.delete(schema.turnosPublicados).where(and(inArray(schema.turnosPublicados.idHuellero, [huIdValido, huIdConflicto]), inArray(schema.turnosPublicados.fecha, dias)));
    await db.delete(schema.asistenciasEsperadas).where(and(inArray(schema.asistenciasEsperadas.idHuellero, [huIdValido, huIdConflicto]), inArray(schema.asistenciasEsperadas.fecha, dias)));

    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.idHuellero, [huIdValido, huIdConflicto]));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.inicio, dias[0]));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await pool.end();
  });

  it("no publica a nadie de la selección si uno de los seleccionados ya fue publicado concurrentemente", async () => {
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.sedes).values({ nombre: sede, grupo, activa: true });
    await db.insert(schema.colaboradores).values([
      { idHuellero: huIdValido, nombre: "Colaborador válido", sede, grupo, activo: true },
      { idHuellero: huIdConflicto, nombre: "Colaborador en conflicto", sede, grupo, activo: true },
    ]);
    await db.insert(schema.periodosPlanilla).values({ inicio: dias[0], fin: dias[6], estado: "abierto" });
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `publicacion-${cuentaId}`, hashContrasena: "prueba", rol: "operaciones" });

    const plan = await repositorio.obtenerOCrear(semana, grupo);
    const jornada = (idHuellero: string, fecha: string) => ({
      planId: plan.id, idHuellero, fecha, sede, modeloHorarioId: null,
      entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null,
    });
    await repositorio.guardarCeldas(dias.flatMap((fecha) => [jornada(huIdValido, fecha), jornada(huIdConflicto, fecha)]));

    // Simula que, entre que se completó la fila y se confirmó la publicación, otra persona
    // ya publicó el primer día de huIdConflicto por otra vía (p. ej. otra pestaña).
    await repositorio.publicarEnLote([{ idHuellero: huIdConflicto, fecha: dias[0], sede, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false }]);

    const resultado = await publicarPlanSemanal(repositorio, actor, plan.id, [huIdValido, huIdConflicto]);

    expect(resultado.publicados).toBe(0);
    expect(resultado.errores).toContainEqual(expect.objectContaining({
      idHuellero: huIdConflicto, fecha: dias[0], mensaje: "Ya existe un horario semanal publicado para este colaborador y fecha.",
    }));
    // Ninguno de los días del colaborador válido quedó publicado: la falla de uno solo
    // en la selección deja intacta toda la selección, no solo al que falló.
    for (const fecha of dias) {
      await expect(repositorio.buscarPublicado(huIdValido, fecha)).resolves.toBeUndefined();
    }
    // El único publicado sigue siendo el que ya existía antes de intentar la publicación seleccionada.
    for (const fecha of dias.slice(1)) {
      await expect(repositorio.buscarPublicado(huIdConflicto, fecha)).resolves.toBeUndefined();
    }
    await expect(repositorio.buscarPublicado(huIdConflicto, dias[0])).resolves.toBeDefined();
  });
});
