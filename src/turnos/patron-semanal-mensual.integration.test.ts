import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import * as schema from "@/db/schema";
import { eliminarRelacionesDePrueba, registrarRelacionConfirmadaDePrueba } from "@/relaciones-laborales/relacion-de-prueba";

import { aplicarPatronSemanalAlMes } from "./casos-de-uso-planes-semanales";
import { RepositorioPostgresDeTurnos } from "./repositorio-postgres";

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL");

describe.skipIf(!url)("persistencia PostgreSQL del patrón mensual", () => {
  const pool = new Pool({ connectionString: url });
  const intentosDeEscritura: unknown[][] = [];
  const db = drizzle({ client: pool, schema, logger: { logQuery(query, params) {
    if (query.startsWith('insert into "celdas_planes_semanales_en_borrador"')) intentosDeEscritura.push(params);
  } } });
  const repositorio = new RepositorioPostgresDeTurnos(db);
  const grupo = `Patrón mensual ${randomUUID()}`;
  const dni = dniDePrueba();
  const descanso = { descanso: true, motivoNoAsistencia: "descanso" as const, sede: null, entradaProgramada: null, salidaProgramada: null };

  beforeAll(async () => {
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.colaboradores).values({ dni, nombre: "Prueba patrón mensual", grupo, activo: true });
    await registrarRelacionConfirmadaDePrueba(db, dni);
  });

  afterAll(async () => {
    try {
      await db.delete(schema.turnosPublicados).where(eq(schema.turnosPublicados.dni, dni));
      await db.delete(schema.celdasDePlanesSemanalesEnBorrador).where(eq(schema.celdasDePlanesSemanalesEnBorrador.dni, dni));
      await db.delete(schema.planesSemanalesEnBorrador).where(eq(schema.planesSemanalesEnBorrador.equipo, grupo));
      await eliminarRelacionesDePrueba(db, [dni]);
      await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
      await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    } finally {
      await pool.end();
    }
  });

  it.each([{ primera: "2037-04-06", segunda: "2037-04-13" }])("G3 revierte planes y jornadas cuando PostgreSQL rechaza la segunda semana", async ({ primera, segunda }) => {
    const modeloInexistente = randomUUID();
    const error = await repositorio.enTransaccionDePatronMensual(dni, tx =>
      tx.guardarNuevasJornadasDelMes(grupo, [
        { dni, fecha: primera, ...descanso },
        { dni, fecha: segunda, sede: "Centro", modeloHorarioId: modeloInexistente, entradaProgramada: "08:00", salidaProgramada: "17:00" },
      ]),
    ).catch((error: unknown) => error);

    expect(error, "PostgreSQL rechaza el segundo insert por su clave foránea")
      .toMatchObject({ cause: { code: "23503" } });
    expect(intentosDeEscritura).toEqual([expect.arrayContaining([primera]), expect.arrayContaining([segunda, modeloInexistente])]);
    expect(await db.select().from(schema.planesSemanalesEnBorrador).where(eq(schema.planesSemanalesEnBorrador.equipo, grupo))).toEqual([]);
    expect(await repositorio.listarBorradoresDelEquipoEnRango(grupo, primera, segunda)).toEqual([]);
  });
  it.each([
    { modo: "reintento", mes: "2037-04", primera: "2037-04-06", segunda: "2037-04-13", tercera: "2037-04-20", publicada: "2037-04-27", motivoExistente: "descanso" },
    { modo: "colisión concurrente", mes: "2037-05", primera: "2037-05-04", segunda: "2037-05-11", tercera: "2037-05-18", publicada: "2037-05-25", motivoExistente: "permiso" },
  ] as const)("G4 preserva la asignación ante $modo y permite releer el resultado", async ({ modo, mes, primera, segunda, tercera, publicada, motivoExistente }) => {
    const sesion = { obtenerActorActual: async () => ({ id: "administrador", rol: "administrador" as const }) };
    const entrada = { equipo: grupo, dni, mes, patron: { 0: "descanso" as const } };
    await db.insert(schema.turnosPublicados).values({ dni, grupo, fecha: publicada, ...descanso, motivoNoAsistencia: "permiso" });

    if (modo === "reintento") {
      const primeraAplicacion = await repositorio.enTransaccionDePatronMensual(dni, tx => aplicarPatronSemanalAlMes(tx, sesion, entrada));
      expect(primeraAplicacion).toEqual({ guardadas: [primera, segunda, tercera], omitidas: [{ fecha: publicada, motivo: "Asignación existente" }] });

      const resguardo = await repositorio.enTransaccionDePatronMensual(dni, tx =>
        tx.guardarNuevasJornadasDelMes(grupo, [{ dni, fecha: primera, ...descanso }]));
      expect(resguardo, "un borrador que ya existe no se vuelve a guardar")
        .toEqual({ guardadas: [], omitidas: [{ fecha: primera, motivo: "Asignación existente" }] });
    } else {
      const plan = await repositorio.obtenerOCrear(primera, grupo);
      const conexionA = await pool.connect();
      const conexionB = await pool.connect();
      const dbA = drizzle({ client: conexionA, schema });
      const repositorioB = new RepositorioPostgresDeTurnos(drizzle({ client: conexionB, schema }));
      const { rows: [{ pid: pidA }] } = await conexionA.query<{ pid: number }>("select pg_backend_pid() as pid");
      const { rows: [{ pid: pidB }] } = await conexionB.query<{ pid: number }>("select pg_backend_pid() as pid");
      let liberarEscritura!: () => void;
      const permisoDeCommit = new Promise<void>(resolve => { liberarEscritura = resolve; });
      let avisarEscritura!: () => void;
      let rechazarEscritura!: (error: unknown) => void;
      const escrituraPreparada = new Promise<void>((resolve, reject) => {
        avisarEscritura = resolve;
        rechazarEscritura = reject;
      });
      // A guarda el permiso y retiene su transacción; B debe esperar, sin que A espere el resultado de B.
      const escritura = dbA.transaction(async tx => {
        await new RepositorioPostgresDeTurnos(tx).guardarCelda({
          dni, planId: plan.id, fecha: primera, ...descanso, motivoNoAsistencia: "permiso", descanso: false,
        });
        avisarEscritura();
        await permisoDeCommit;
      });
      void escritura.catch(rechazarEscritura);
      let aplicacion: ReturnType<typeof aplicarPatronSemanalAlMes> | undefined;
      let resultado;
      try {
        await escrituraPreparada;
        aplicacion = repositorioB.enTransaccionDePatronMensual(dni, tx => aplicarPatronSemanalAlMes(tx, sesion, entrada));
        // Observación real de PostgreSQL: no basta con que la promesa aún no se haya resuelto.
        await expect.poll(async () => {
          const { rows } = await pool.query<{ esperando: boolean }>(`
            select exists (
              select 1 from pg_locks
              where pid = $1 and relation = 'periodos_planilla'::regclass
                and mode = 'ShareRowExclusiveLock' and not granted
                and $2 = any(pg_blocking_pids($1))
            ) as esperando
          `, [pidB, pidA]);
          return rows[0].esperando;
        }, { timeout: 1000 }).toBe(true);
        liberarEscritura();
        await escritura;
        resultado = await aplicacion;
      } finally {
        liberarEscritura();
        await Promise.allSettled([escritura, aplicacion]);
        conexionA.release();
        conexionB.release();
      }
      expect(resultado, "un borrador que ya existe no se vuelve a guardar").toEqual({
        guardadas: [segunda, tercera],
        omitidas: [{ fecha: primera, motivo: "Asignación existente" }, { fecha: publicada, motivo: "Asignación existente" }],
      });
    }

    const reintento = await repositorio.enTransaccionDePatronMensual(dni, tx => aplicarPatronSemanalAlMes(tx, sesion, entrada));
    expect(reintento).toEqual({
      guardadas: [],
      omitidas: [primera, segunda, tercera, publicada].map(fecha => ({ fecha, motivo: "Asignación existente" })),
    });
    const mesLeido = await repositorio.listarBorradoresDelEquipoEnRango(grupo, primera, publicada);
    expect(mesLeido.map(celda => [celda.fecha, celda.motivoNoAsistencia]).sort()).toEqual([
      [primera, motivoExistente], [segunda, "descanso"], [tercera, "descanso"],
    ]);
    expect(await repositorio.buscarPorId(mesLeido.find(celda => celda.fecha === primera)!.planId)).toMatchObject({
      semana: primera,
      celdas: [{ dni, fecha: primera, motivoNoAsistencia: motivoExistente }],
    });
    expect(await repositorio.buscarPublicado(dni, publicada)).toMatchObject({ motivoNoAsistencia: "permiso" });
    expect(await repositorio.buscarPublicado(dni, primera)).toBeUndefined();
  });
});
