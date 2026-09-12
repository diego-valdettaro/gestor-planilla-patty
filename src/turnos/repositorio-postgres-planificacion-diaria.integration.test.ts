import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import { crearCasosDeUsoDePlanesSemanales } from "./casos-de-uso-planes-semanales";
import { publicarPlanSemanal } from "./publicar-plan-semanal";
import { RepositorioPostgresDeTurnos } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("persistencia de planificación diaria por grupo", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeTurnos(db);
  const sufijo = randomUUID();
  const grupo = `Grupo ${sufijo}`;
  const otroGrupo = `Otro ${sufijo}`;
  const sedeNorte = `Norte ${sufijo}`;
  const sedeSur = `Sur ${sufijo}`;
  const sedeNueva = `Nueva ${sufijo}`;
  const idHuellero = `HU-${sufijo}`;
  const modeloId = randomUUID();
  const cuentaId = randomUUID();
  const semana = "2034-09-04";
  const fechas = Array.from({ length: 7 }, (_, indice) => `2034-09-${String(4 + indice).padStart(2, "0")}`);

  beforeAll(async () => {
    await db.insert(schema.grupos).values([{ nombre: grupo }, { nombre: otroGrupo }]);
    await db.insert(schema.sedes).values([
      { nombre: sedeNorte, grupo, activa: true },
      { nombre: sedeSur, grupo, activa: true },
      { nombre: sedeNueva, grupo: otroGrupo, activa: true },
    ]);
    await db.insert(schema.colaboradores).values({ idHuellero, nombre: "Ana Grupo", sede: sedeNorte, grupo, activo: true });
    await db.insert(schema.modelosDeHorario).values({ id: modeloId, sede: sedeNorte, nombre: "Apertura", entrada: "09:00", salida: "18:00", activo: true });
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `plan-${sufijo}`, hashContrasena: "prueba", rol: "operaciones" });
    await db.insert(schema.periodosPlanilla).values({ inicio: "2034-08-26", fin: "2034-09-25", estado: "abierto" });
  });

  afterAll(async () => {
    const publicados = await db.select({ id: schema.turnosPublicados.id }).from(schema.turnosPublicados)
      .where(eq(schema.turnosPublicados.idHuellero, idHuellero));
    await db.delete(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.idHuellero, idHuellero));
    if (publicados.length) await db.delete(schema.historialDeTurnosPublicados)
      .where(inArray(schema.historialDeTurnosPublicados.turnoPublicadoId, publicados.map(({ id }) => id)));
    await db.delete(schema.turnosPublicados).where(eq(schema.turnosPublicados.idHuellero, idHuellero));
    await db.delete(schema.celdasDePlanesSemanalesEnBorrador).where(eq(schema.celdasDePlanesSemanalesEnBorrador.idHuellero, idHuellero));
    await db.delete(schema.planesSemanalesEnBorrador).where(eq(schema.planesSemanalesEnBorrador.semana, semana));
    await db.delete(schema.modelosDeHorario).where(eq(schema.modelosDeHorario.id, modeloId));
    await db.delete(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.inicio, "2034-08-26"));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.idHuellero, idHuellero));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await db.delete(schema.sedes).where(inArray(schema.sedes.nombre, [sedeNorte, sedeSur, sedeNueva]));
    await db.delete(schema.grupos).where(inArray(schema.grupos.nombre, [grupo, otroGrupo]));
    await pool.end();
  });

  it("publica una semana multisede y conserva grupo, sedes y motivos aunque cambie el colaborador", async () => {
    const casosDeUso = crearCasosDeUsoDePlanesSemanales(repositorio, {
      obtenerActorActual: async () => ({ id: cuentaId, rol: "operaciones" }),
    });
    const plan = await casosDeUso.obtenerOCrear(semana, grupo);
    await casosDeUso.guardarBorrador(plan.id, [
      { idHuellero, fecha: fechas[0], sede: sedeNorte, modeloHorarioId: modeloId, entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null },
      { idHuellero, fecha: fechas[1], sede: sedeSur, modeloHorarioId: null, entradaProgramada: "10:00", salidaProgramada: "19:00", descanso: false, motivoNoAsistencia: null },
      ...(["descanso", "feriado", "vacaciones", "permiso", "suspension"] as const).map((motivo, indice) => ({
        idHuellero,
        fecha: fechas[indice + 2],
        sede: null,
        modeloHorarioId: null,
        entradaProgramada: null,
        salidaProgramada: null,
        descanso: motivo === "descanso",
        motivoNoAsistencia: motivo,
      })),
    ]);

    await expect(publicarPlanSemanal(repositorio, { id: cuentaId, rol: "operaciones" }, plan.id, [idHuellero]))
      .resolves.toEqual({ publicados: 1, errores: [] });
    await db.update(schema.colaboradores).set({ grupo: otroGrupo, sede: sedeNueva }).where(eq(schema.colaboradores.idHuellero, idHuellero));

    const { rows: jornadas } = await pool.query<{
      grupo: string;
      sede: string | null;
      motivo_no_asistencia: string | null;
    }>("SELECT grupo, sede, motivo_no_asistencia FROM turnos_publicados WHERE id_huellero = $1 ORDER BY fecha", [idHuellero]);
    expect(jornadas).toEqual([
      { grupo, sede: sedeNorte, motivo_no_asistencia: null },
      { grupo, sede: sedeSur, motivo_no_asistencia: null },
      ...["descanso", "feriado", "vacaciones", "permiso", "suspension"].map((motivo_no_asistencia) => ({ grupo, sede: null, motivo_no_asistencia })),
    ]);
    await expect(db.select().from(schema.asistenciasEsperadas).where(eq(schema.asistenciasEsperadas.idHuellero, idHuellero)))
      .resolves.toHaveLength(2);
  });
});
