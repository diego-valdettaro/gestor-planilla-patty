import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import * as schema from "@/db/schema";
import { eliminarRelacionesDePrueba, registrarRelacionConfirmadaDePrueba } from "@/relaciones-laborales/relacion-de-prueba";
import { crearCasosDeUsoDePlanesSemanales } from "@/turnos/casos-de-uso-planes-semanales";
import { publicarPlanSemanal } from "@/turnos/publicar-plan-semanal";
import { RepositorioPostgresDeGrupos } from "@/turnos/repositorio-postgres-grupos";
import { RepositorioPostgresDeTurnos } from "@/turnos/repositorio-postgres";
import { diasDeLaSemana, inicioDeSemana } from "@/turnos/semana";

import { dniDePrueba } from "./dni-de-prueba";
import { RepositorioPostgresDeColaboradores } from "./repositorio-postgres";
import { actualizarColaborador, consultarColaborador, registrarColaborador } from "./registrar-colaborador";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// Un gerente da de alta a una persona en su grupo; el grupo no cambia aunque sus jornadas se
// publiquen en distintas sedes del grupo, y solo ese gerente puede operarla (ADR 0012).
describe.skipIf(!databaseUrl)("alta de personas por el gerente de su grupo (integración PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const colaboradores = new RepositorioPostgresDeColaboradores(db);
  const turnos = new RepositorioPostgresDeTurnos(db);
  const grupos = new RepositorioPostgresDeGrupos(db);

  const sufijo = randomUUID();
  const grupoPropio = `Grupo propio ${sufijo}`;
  const grupoAjeno = `Grupo ajeno ${sufijo}`;
  const sedeNorte = `Sede norte ${sufijo}`;
  const sedeSur = `Sede sur ${sufijo}`;
  const sedeAjena = `Sede ajena ${sufijo}`;
  const dni = dniDePrueba();
  const semana = inicioDeSemana("2034-05-01");
  const dias = diasDeLaSemana(semana);
  const cuentaId = randomUUID();
  const gerentePropio: Actor = { id: cuentaId, rol: "gerente_de_area", grupos: [{ nombre: grupoPropio, gestionaAsistencia: true }] };
  const gerenteAjeno: Actor = { id: cuentaId, rol: "gerente_de_area", grupos: [{ nombre: grupoAjeno, gestionaAsistencia: true }] };

  afterAll(async () => {
    const planes = await db.select({ id: schema.planesSemanalesEnBorrador.id }).from(schema.planesSemanalesEnBorrador)
      .where(and(eq(schema.planesSemanalesEnBorrador.semana, semana), eq(schema.planesSemanalesEnBorrador.equipo, grupoPropio)));
    if (planes.length) await db.delete(schema.celdasDePlanesSemanalesEnBorrador).where(inArray(schema.celdasDePlanesSemanalesEnBorrador.planId, planes.map(({ id }) => id)));
    await db.delete(schema.planesSemanalesEnBorrador).where(and(eq(schema.planesSemanalesEnBorrador.semana, semana), inArray(schema.planesSemanalesEnBorrador.equipo, [grupoPropio, grupoAjeno])));
    const publicados = await db.select({ id: schema.turnosPublicados.id }).from(schema.turnosPublicados)
      .where(and(eq(schema.turnosPublicados.dni, dni), inArray(schema.turnosPublicados.fecha, dias)));
    if (publicados.length) await db.delete(schema.historialDeTurnosPublicados).where(inArray(schema.historialDeTurnosPublicados.turnoPublicadoId, publicados.map(({ id }) => id)));
    await db.delete(schema.turnosPublicados).where(and(eq(schema.turnosPublicados.dni, dni), inArray(schema.turnosPublicados.fecha, dias)));
    await db.delete(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.dni, dni), inArray(schema.asistenciasEsperadas.fecha, dias)));
    await eliminarRelacionesDePrueba(db, [dni]);
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await db.delete(schema.sedes).where(inArray(schema.sedes.nombre, [sedeNorte, sedeSur, sedeAjena]));
    await db.delete(schema.periodosPlanilla).where(eq(schema.periodosPlanilla.inicio, dias[0]));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaId));
    await db.delete(schema.grupos).where(inArray(schema.grupos.nombre, [grupoPropio, grupoAjeno]));
    await pool.end();
  });

  it("deja a la persona en el grupo del gerente que la crea, sin que cambie al trabajar en distintas sedes, y solo ese gerente la opera", async () => {
    await db.insert(schema.grupos).values([{ nombre: grupoPropio }, { nombre: grupoAjeno }]);
    await db.insert(schema.sedes).values([
      { nombre: sedeNorte, grupo: grupoPropio, activa: true },
      { nombre: sedeSur, grupo: grupoPropio, activa: true },
      { nombre: sedeAjena, grupo: grupoAjeno, activa: true },
    ]);
    await db.insert(schema.periodosPlanilla).values({ inicio: dias[0], fin: dias[6], estado: "abierto" });
    await db.insert(schema.cuentasLocales).values({ id: cuentaId, nombreUsuario: `grupo-gerente-${cuentaId}`, hashContrasena: "prueba", rol: "gerente_de_area" });

    // Alta: solo en un grupo del gerente; en uno ajeno el servidor la rechaza y no deja nada.
    await expect(registrarColaborador(colaboradores, gerentePropio, { dni, nombre: "Persona del grupo", sede: sedeNorte, grupo: grupoAjeno, activo: true }))
      .rejects.toThrow("No tiene permiso para administrar colaboradores de este grupo.");
    await expect(colaboradores.buscarPorDni(dni)).resolves.toBeUndefined();
    await registrarColaborador(colaboradores, gerentePropio, { dni, nombre: "Persona del grupo", sede: sedeNorte, grupo: grupoPropio, activo: true });
    await expect(colaboradores.buscarPorDni(dni)).resolves.toMatchObject({ grupo: grupoPropio, sede: sedeNorte });
    await registrarRelacionConfirmadaDePrueba(db, dni);

    // Horarios en dos sedes distintas del grupo, publicados por su gerente.
    const planes = crearCasosDeUsoDePlanesSemanales(turnos, { obtenerActorActual: async () => gerentePropio });
    const plan = await planes.obtenerOCrear(semana, grupoPropio);
    for (const [indice, fecha] of dias.entries()) {
      await planes.guardarCelda(plan.id, {
        dni, fecha, sede: indice % 2 === 0 ? sedeNorte : sedeSur, modeloHorarioId: null,
        entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false, motivoNoAsistencia: null,
      });
    }
    await expect(publicarPlanSemanal(turnos, gerentePropio, plan.id, [dni])).resolves.toMatchObject({ publicados: 1, errores: [] });
    const publicadas = await Promise.all(dias.map((fecha) => turnos.buscarPublicado(dni, fecha)));
    expect(new Set(publicadas.map((turno) => turno?.sede))).toEqual(new Set([sedeNorte, sedeSur]));
    await expect(colaboradores.buscarPorDni(dni)).resolves.toMatchObject({ grupo: grupoPropio });
    await expect(turnos.obtenerGrupoDelColaborador(dni)).resolves.toBe(grupoPropio);

    // Otro gerente no la ve, no la edita y no la programa.
    await expect(consultarColaborador(colaboradores, gerenteAjeno, dni)).rejects.toThrow("No tiene permiso para administrar colaboradores de este grupo.");
    await expect(actualizarColaborador(colaboradores, gerenteAjeno, { dni, nombre: "Otro nombre", sede: sedeAjena, grupo: grupoPropio, activo: true }))
      .rejects.toThrow("No tiene permiso para administrar colaboradores de este grupo.");
    await expect(colaboradores.buscarPorDni(dni)).resolves.toMatchObject({ nombre: "Persona del grupo", sede: sedeNorte });
    await expect(crearCasosDeUsoDePlanesSemanales(turnos, { obtenerActorActual: async () => gerenteAjeno }).obtenerOCrear(semana, grupoPropio))
      .rejects.toThrow("No tiene permiso para editar planes semanales de este grupo.");
    await expect(publicarPlanSemanal(turnos, gerenteAjeno, plan.id, [dni])).rejects.toThrow("No tiene permiso para publicar planes semanales de este grupo.");
    await expect(grupos.listarOperablesPor(gerenteAjeno)).resolves.toEqual([grupoAjeno]);
    await expect(turnos.listarColaboradoresActivosPorEquipo(grupoAjeno)).resolves.not.toContainEqual(expect.objectContaining({ dni }));
    await expect(grupos.listarOperablesPor(gerentePropio)).resolves.toEqual([grupoPropio]);
    await expect(turnos.listarColaboradoresActivosPorEquipo(grupoPropio)).resolves.toContainEqual(expect.objectContaining({ dni }));
  });
});
