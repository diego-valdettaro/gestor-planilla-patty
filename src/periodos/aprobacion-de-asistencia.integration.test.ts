import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RepositorioPostgresDeAsistencias } from "@/asistencias/repositorio-postgres";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import { RepositorioPostgresDeColaboradores } from "@/colaboradores/repositorio-postgres";
import * as schema from "@/db/schema";
import { RepositorioPostgresDeImportaciones } from "@/importaciones/repositorio-postgres";
import { RepositorioPostgresDeRelacionesLaborales } from "@/relaciones-laborales/repositorio-postgres";
import { eliminarRelacionesDePrueba, registrarRelacionConfirmadaDePrueba } from "@/relaciones-laborales/relacion-de-prueba";
import { RepositorioPostgresDeTurnos } from "@/turnos/repositorio-postgres";

import { aprobarGruposQueGestionanAsistenciaDePrueba, eliminarAprobacionesDePrueba } from "./aprobaciones-de-prueba";
import { AprobacionBloqueadaError } from "./periodo-planilla";
import { RepositorioPostgresDePeriodos } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// Aprobación de la asistencia por grupo y período contra PostgreSQL real (issue #114, ADR 0012).
describe.skipIf(!databaseUrl)("aprobación de asistencia por grupo (integración PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const periodos = new RepositorioPostgresDePeriodos(db);
  const asistencias = new RepositorioPostgresDeAsistencias(db);
  const turnos = new RepositorioPostgresDeTurnos(db);
  const repositorioDeImportaciones = new RepositorioPostgresDeImportaciones(db);
  const relaciones = new RepositorioPostgresDeRelacionesLaborales(db);
  const colaboradoresRepo = new RepositorioPostgresDeColaboradores(db);

  const sufijo = randomUUID().slice(0, 8);
  const grupoA = `Aprobación A ${sufijo}`;
  const grupoB = `Aprobación B ${sufijo}`;
  const grupoSinAsistencia = `Aprobación sin asistencia ${sufijo}`;
  const grupoCircuito = `Aprobación circuito ${sufijo}`;
  const sedeA = `Sede A ${sufijo}`;
  const sedeCircuito = `Sede circuito ${sufijo}`;
  const gerenteId = randomUUID();
  const finanzasId = randomUUID();
  const dias = ["2074-05-04", "2074-05-05", "2074-05-06", "2074-05-07"];
  const diasCircuito = ["2074-07-06", "2074-07-07", "2074-07-08"];
  const periodosCreados: string[] = [];
  const personas: string[] = [];
  let reloj = 0;
  /** Instantes crecientes (posteriores a cualquier aprobación de otra prueba) para ordenar el historial sin depender del reloj real. */
  const instante = () => new Date(Date.parse("2074-05-09T00:00:00Z") + (reloj += 1) * 1000);
  let periodoId = "";
  let periodoDeCierreId = "";
  let periodoCircuitoId = "";

  const ana = dniDePrueba();
  const beto = dniDePrueba();
  const dario = dniDePrueba();
  const carla = dniDePrueba();
  const hugo = dniDePrueba();

  async function crearPersona(dni: string, nombre: string, grupo: string, sede: string, relacion: "confirmada" | "ninguna" | "sin_confirmar" = "confirmada") {
    personas.push(dni);
    await db.insert(schema.colaboradores).values({ dni, nombre, sede, grupo, activo: true });
    if (relacion === "confirmada") await registrarRelacionConfirmadaDePrueba(db, dni);
    if (relacion === "sin_confirmar") await db.insert(schema.relacionesLaborales).values({ dni, ingreso: "2020-01-01", registradaPorId: gerenteId });
  }

  async function publicarJornadas(dni: string, grupo: string, sede: string, fechas: string[], estado: "confirmada" | "pendiente" | "manual") {
    await db.insert(schema.turnosPublicados).values(fechas.map((fecha) => ({ dni, fecha, grupo, sede, entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false })));
    await db.insert(schema.asistenciasEsperadas).values(fechas.map((fecha) => estado === "confirmada"
      ? { dni, fecha, estado, entradaReal: `${fecha}T09:00`, salidaReal: `${fecha}T17:00`, minutosTrabajados: 480, instantaneaDeTurno: { sede, entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false } }
      : { dni, fecha, estado }));
    if (estado === "manual") {
      const filas = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.dni, dni), inArray(schema.asistenciasEsperadas.fecha, fechas)));
      await db.insert(schema.estadosManuales).values(filas.map(({ id }) => ({ asistenciaId: id, tipo: "falta" as const, comentario: "Prueba", responsableId: gerenteId })));
    }
  }

  async function aprobacionesDe(periodo: string, grupo: string) {
    return db.select().from(schema.aprobacionesDeAsistencia)
      .where(and(eq(schema.aprobacionesDeAsistencia.periodoId, periodo), eq(schema.aprobacionesDeAsistencia.grupo, grupo)))
      .orderBy(schema.aprobacionesDeAsistencia.aprobadaEn);
  }

  /** Deja una aprobación vigente del grupo sin pasar por las comprobaciones: aísla la prueba del escritor que debe invalidarla. */
  async function sembrarAprobacion(periodo: string, grupo: string) {
    const vigentes = (await aprobacionesDe(periodo, grupo)).filter(({ invalidadaEn }) => invalidadaEn === null);
    if (!vigentes.length) await db.insert(schema.aprobacionesDeAsistencia).values({ periodoId: periodo, grupo, aprobadaPorId: gerenteId, aprobadaEn: instante() });
  }

  async function vigente(periodo: string, grupo: string): Promise<boolean> {
    return (await aprobacionesDe(periodo, grupo)).some(({ invalidadaEn }) => invalidadaEn === null);
  }

  async function ultimoMotivo(periodo: string, grupo: string): Promise<string | null> {
    const filas = await aprobacionesDe(periodo, grupo);
    return filas[filas.length - 1]?.motivoDeInvalidacion ?? null;
  }

  async function idDeAsistencia(dni: string, fecha: string): Promise<string> {
    const [fila] = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas).where(and(eq(schema.asistenciasEsperadas.dni, dni), eq(schema.asistenciasEsperadas.fecha, fecha)));
    return fila.id;
  }

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values([
      { id: gerenteId, nombreUsuario: `gerente-114-${sufijo}`, hashContrasena: "prueba", rol: "gerente_de_area" },
      { id: finanzasId, nombreUsuario: `finanzas-114-${sufijo}`, hashContrasena: "prueba", rol: "finanzas" },
    ]);
    await db.insert(schema.grupos).values([
      { nombre: grupoA }, { nombre: grupoB }, { nombre: grupoCircuito }, { nombre: grupoSinAsistencia, gestionaAsistencia: false },
    ]);
    await db.insert(schema.gerentesDeGrupo).values({ grupo: grupoA, cuentaId: gerenteId });
    await db.insert(schema.sedes).values([{ nombre: sedeA, grupo: grupoA, activa: true }, { nombre: sedeCircuito, grupo: grupoCircuito, activa: true }]);
    await db.insert(schema.politicasDePenalizacionPorTardanzas).values([sedeA, sedeCircuito].map((sede) => ({
      sede, toleranciaEnMinutos: 30, tardanzasAcumuladas: 3, horasPenalizadas: 1, version: 1, vigenteDesde: "2000-01-01", configuradaPorId: finanzasId,
    })));
    const creados = await db.insert(schema.periodosPlanilla).values([
      { inicio: dias[0], fin: dias[3], estado: "abierto" },
      { inicio: "2074-06-01", fin: "2074-06-02", estado: "abierto" },
      { inicio: diasCircuito[0], fin: diasCircuito[2], estado: "abierto" },
    ]).returning({ id: schema.periodosPlanilla.id, inicio: schema.periodosPlanilla.inicio });
    periodosCreados.push(...creados.map(({ id }) => id));
    periodoId = creados.find(({ inicio }) => inicio === dias[0])!.id;
    periodoDeCierreId = creados.find(({ inicio }) => inicio === "2074-06-01")!.id;
    periodoCircuitoId = creados.find(({ inicio }) => inicio === diasCircuito[0])!.id;

    await crearPersona(ana, "Ana Resuelta", grupoA, sedeA);
    await crearPersona(beto, "Beto Sin Marcas", grupoA, sedeA);
    await crearPersona(dario, "Darío Sin Confirmar", grupoA, sedeA, "sin_confirmar");
    await crearPersona(carla, "Carla Administración", grupoSinAsistencia, sedeA);
    await crearPersona(hugo, "Hugo Circuito", grupoCircuito, sedeCircuito);
    await publicarJornadas(ana, grupoA, sedeA, dias, "confirmada");
    await publicarJornadas(hugo, grupoCircuito, sedeCircuito, diasCircuito, "confirmada");
  });

  afterAll(async () => {
    const filas = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.dni, personas));
    const ids = filas.map(({ id }) => id);
    if (ids.length) {
      await db.delete(schema.reemplazosDeAsistenciaImportada).where(inArray(schema.reemplazosDeAsistenciaImportada.asistenciaId, ids));
      await db.delete(schema.horasExtra).where(inArray(schema.horasExtra.asistenciaId, ids));
      await db.delete(schema.tardanzas).where(inArray(schema.tardanzas.asistenciaId, ids));
      await db.delete(schema.ajustesDeAsistencia).where(inArray(schema.ajustesDeAsistencia.asistenciaId, ids));
      await db.delete(schema.estadosManuales).where(inArray(schema.estadosManuales.asistenciaId, ids));
    }
    const importaciones = (await db.select({ id: schema.importacionesSemanales.id }).from(schema.importacionesSemanales).where(eq(schema.importacionesSemanales.usuarioId, gerenteId))).map(({ id }) => id);
    if (importaciones.length) {
      await db.delete(schema.marcasCrudas).where(inArray(schema.marcasCrudas.importacionId, importaciones));
      await db.delete(schema.importacionesSemanales).where(inArray(schema.importacionesSemanales.id, importaciones));
    }
    await db.delete(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.dni, personas));
    const publicados = await db.select({ id: schema.turnosPublicados.id }).from(schema.turnosPublicados).where(inArray(schema.turnosPublicados.dni, personas));
    if (publicados.length) await db.delete(schema.historialDeTurnosPublicados).where(inArray(schema.historialDeTurnosPublicados.turnoPublicadoId, publicados.map(({ id }) => id)));
    await db.delete(schema.turnosPublicados).where(inArray(schema.turnosPublicados.dni, personas));
    await eliminarAprobacionesDePrueba(db, periodosCreados);
    await db.delete(schema.revisionesDePeriodosPlanilla).where(inArray(schema.revisionesDePeriodosPlanilla.periodoId, periodosCreados));
    await db.delete(schema.auditoriaPeriodosPlanilla).where(inArray(schema.auditoriaPeriodosPlanilla.periodoId, periodosCreados));
    await db.delete(schema.periodosPlanilla).where(inArray(schema.periodosPlanilla.id, periodosCreados));
    await eliminarRelacionesDePrueba(db, personas);
    await db.delete(schema.relacionesLaborales).where(inArray(schema.relacionesLaborales.dni, personas));
    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.dni, personas));
    await db.delete(schema.politicasDePenalizacionPorTardanzas).where(inArray(schema.politicasDePenalizacionPorTardanzas.sede, [sedeA, sedeCircuito]));
    await db.delete(schema.sedes).where(inArray(schema.sedes.nombre, [sedeA, sedeCircuito]));
    await db.delete(schema.gerentesDeGrupo).where(eq(schema.gerentesDeGrupo.cuentaId, gerenteId));
    await db.delete(schema.grupos).where(inArray(schema.grupos.nombre, [grupoA, grupoB, grupoCircuito, grupoSinAsistencia]));
    await db.delete(schema.cuentasLocales).where(inArray(schema.cuentasLocales.id, [gerenteId, finanzasId]));
    await pool.end();
  });

  describe("qué cubre y qué bloquea", () => {
    it("bloquea por una persona sin horario ni marcas aunque no tenga ninguna fila de asistencia, e ignora a quien no tiene relación confirmada y a otros grupos", async () => {
      const error = await periodos.aprobarAsistencia(periodoId, grupoA, gerenteId, new Date()).catch((causa: unknown) => causa);

      expect(error).toBeInstanceOf(AprobacionBloqueadaError);
      expect((error as AprobacionBloqueadaError).bloqueos).toEqual([{ dni: beto, nombre: "Beto Sin Marcas", causa: "sin_horario", fechas: dias }]);
      expect(await aprobacionesDe(periodoId, grupoA)).toEqual([]);
    });

    it("no aprueba un grupo que no gestiona asistencia, aunque tenga personas con relación laboral y sin horario", async () => {
      await expect(periodos.aprobarAsistencia(periodoId, grupoSinAsistencia, gerenteId, new Date())).rejects.toThrow("no gestiona asistencia");
      const grupos = (await periodos.listarAprobaciones(periodoId)).map(({ grupo }) => grupo);
      expect(grupos).toContain(grupoA);
      expect(grupos).not.toContain(grupoSinAsistencia);
    });

    it("lista el estado de cada grupo con su gerente y las personas que bloquean", async () => {
      const delGrupo = (await periodos.listarAprobaciones(periodoId)).find(({ grupo }) => grupo === grupoA)!;

      expect(delGrupo).toMatchObject({ gerente: `gerente-114-${sufijo}`, estado: "pendiente", aprobadaPor: null });
      expect(delGrupo.bloqueos.map(({ nombre, causa }) => [nombre, causa])).toEqual([["Beto Sin Marcas", "sin_horario"]]);
      const sinGerente = (await periodos.listarAprobaciones(periodoId)).find(({ grupo }) => grupo === grupoB)!;
      expect(sinGerente.gerente).toBeNull();
    });

    it("bloquea por asistencia pendiente y deja aprobar cuando la situación de todas las personas está resuelta", async () => {
      await publicarJornadas(beto, grupoA, sedeA, dias.slice(0, 3), "manual");
      await publicarJornadas(beto, grupoA, sedeA, dias.slice(3), "pendiente");

      const error = await periodos.aprobarAsistencia(periodoId, grupoA, gerenteId, new Date()).catch((causa: unknown) => causa);
      expect((error as AprobacionBloqueadaError).bloqueos).toEqual([{ dni: beto, nombre: "Beto Sin Marcas", causa: "asistencia_pendiente", fechas: [dias[3]] }]);

      await asistencias.registrarEstadoManual({ dni: beto, fecha: dias[3], tipo: "falta", comentario: "No vino", responsableId: gerenteId, registradoEn: new Date() });
      const aprobadaEn = new Date("2074-05-08T15:00:00Z");
      await periodos.aprobarAsistencia(periodoId, grupoA, gerenteId, aprobadaEn);

      const [fila] = await aprobacionesDe(periodoId, grupoA);
      expect(fila).toMatchObject({ aprobadaPorId: gerenteId, aprobadaEn, invalidadaEn: null, motivoDeInvalidacion: null });
      const estado = (await periodos.listarAprobaciones(periodoId)).find(({ grupo }) => grupo === grupoA)!;
      expect(estado).toMatchObject({ estado: "aprobada", aprobadaPor: `gerente-114-${sufijo}`, bloqueos: [] });
      await expect(periodos.aprobarAsistencia(periodoId, grupoA, gerenteId, new Date())).rejects.toThrow("ya está aprobada");
    });

    it("rechaza aprobar un período cerrado", async () => {
      await aprobarGruposQueGestionanAsistenciaDePrueba(db, periodoDeCierreId, finanzasId);
      await periodos.cerrar(periodoDeCierreId, finanzasId, new Date());

      await expect(periodos.aprobarAsistencia(periodoDeCierreId, grupoB, gerenteId, new Date())).rejects.toThrow("no está abierto");
    });
  });

  describe("una corrección invalida la aprobación del grupo afectado", () => {
    it("ajustar una asistencia invalida solo la aprobación de su grupo y conserva la fila con su motivo", async () => {
      await sembrarAprobacion(periodoId, grupoA);
      await sembrarAprobacion(periodoId, grupoB);

      await asistencias.ajustar({ dni: ana, fecha: dias[1], entradaReal: `${dias[1]}T09:05`, salidaReal: `${dias[1]}T17:00`, motivo: "Marca corregida", minutosTrabajados: 475 }, gerenteId);

      expect(await vigente(periodoId, grupoA)).toBe(false);
      expect(await ultimoMotivo(periodoId, grupoA)).toContain(`Se ajustó la asistencia del ${dias[1]}`);
      expect(await vigente(periodoId, grupoB)).toBe(true);
      expect((await aprobacionesDe(periodoId, grupoA)).length).toBeGreaterThan(0);
    });

    it("confirmar una asistencia pendiente la invalida", async () => {
      await sembrarAprobacion(periodoId, grupoA);
      await db.update(schema.asistenciasEsperadas).set({ estado: "pendiente" }).where(eq(schema.asistenciasEsperadas.id, await idDeAsistencia(ana, dias[0])));

      await asistencias.confirmar({
        dni: ana, fecha: dias[0], entradaReal: `${dias[0]}T09:00`, salidaReal: `${dias[0]}T17:00`, minutosTrabajados: 480,
        instantaneaDeTurno: { sede: sedeA, entradaProgramada: "09:00", salidaProgramada: "17:00", descanso: false },
        confirmadoPorId: gerenteId, confirmadoEn: new Date(),
      });

      expect(await vigente(periodoId, grupoA)).toBe(false);
      expect(await ultimoMotivo(periodoId, grupoA)).toContain(`Se confirmó la asistencia del ${dias[0]}`);
    });

    it("registrar un estado manual la invalida", async () => {
      await sembrarAprobacion(periodoId, grupoA);
      await db.update(schema.asistenciasEsperadas).set({ estado: "pendiente" }).where(eq(schema.asistenciasEsperadas.id, await idDeAsistencia(beto, dias[0])));
      await db.delete(schema.estadosManuales).where(eq(schema.estadosManuales.asistenciaId, await idDeAsistencia(beto, dias[0])));

      await asistencias.registrarEstadoManual({ dni: beto, fecha: dias[0], tipo: "vacaciones", comentario: "Vacaciones", responsableId: gerenteId, registradoEn: new Date() });

      expect(await vigente(periodoId, grupoA)).toBe(false);
      expect(await ultimoMotivo(periodoId, grupoA)).toContain("estado manual");
    });

    it("confirmar por rango la invalida", async () => {
      await sembrarAprobacion(periodoId, grupoA);
      const turnoId = (await db.select({ id: schema.turnosPublicados.id }).from(schema.turnosPublicados).where(and(eq(schema.turnosPublicados.dni, beto), eq(schema.turnosPublicados.fecha, dias[1]))))[0].id;
      await db.update(schema.turnosPublicados).set({ descanso: true, motivoNoAsistencia: "descanso", sede: null, entradaProgramada: null, salidaProgramada: null }).where(eq(schema.turnosPublicados.id, turnoId));
      const asistenciaId = await idDeAsistencia(beto, dias[1]);
      await db.delete(schema.estadosManuales).where(eq(schema.estadosManuales.asistenciaId, asistenciaId));
      await db.update(schema.asistenciasEsperadas).set({ estado: "pendiente" }).where(eq(schema.asistenciasEsperadas.id, asistenciaId));

      await asistencias.confirmarColaboradoresPorRango({ dnis: [beto], inicio: dias[0], fin: dias[3] }, gerenteId);

      expect(await vigente(periodoId, grupoA)).toBe(false);
      expect(await ultimoMotivo(periodoId, grupoA)).toContain("Se confirmaron asistencias");
    });

    it("publicar y corregir horarios los invalida", async () => {
      const fabio = dniDePrueba();
      await crearPersona(fabio, "Fabio Horarios", grupoA, sedeA);
      await sembrarAprobacion(periodoId, grupoA);
      const actor = { id: gerenteId, rol: "administrador" as const };
      const jornada = (fecha: string, entrada: string) => ({ dni: fabio, fecha, sede: sedeA, entradaProgramada: entrada, salidaProgramada: "17:00", descanso: false });

      await turnos.publicarEnLote(dias.map((fecha) => jornada(fecha, "09:00")), actor);
      expect(await vigente(periodoId, grupoA)).toBe(false);
      expect(await ultimoMotivo(periodoId, grupoA)).toContain("Se publicó un horario");

      await sembrarAprobacion(periodoId, grupoA);
      await turnos.reemplazarSemanaPublicada(dias.map((fecha) => jornada(fecha, "10:00")), actor, "Cambio de turno");
      expect(await vigente(periodoId, grupoA)).toBe(false);
      expect(await ultimoMotivo(periodoId, grupoA)).toContain("Se corrigió un horario publicado");
    });

    it("importar marcas (propuestas nuevas o un reemplazo) la invalida", async () => {
      const fabio = personas[personas.length - 1];
      await sembrarAprobacion(periodoId, grupoA);
      const archivo = (nombre: string) => ({ nombre, ubicacion: `prueba/${nombre}`, hashSha256: "0".repeat(64) });

      await repositorioDeImportaciones.guardar({
        archivo: archivo("propuesta.xlsx"), usuarioId: gerenteId, importadaEn: new Date(), marcasCrudas: [], reemplazos: [],
        propuestas: [{ dni: fabio, fecha: dias[2], estado: "pendiente", entradaPropuesta: `${dias[2]}T10:01`, salidaPropuesta: `${dias[2]}T17:02` }],
      });
      expect(await vigente(periodoId, grupoA)).toBe(false);
      expect(await ultimoMotivo(periodoId, grupoA)).toContain("Se importaron marcas");

      await sembrarAprobacion(periodoId, grupoA);
      const asistenciaId = await idDeAsistencia(ana, dias[2]);
      await repositorioDeImportaciones.guardar({
        archivo: archivo("reemplazo.xlsx"), usuarioId: gerenteId, importadaEn: new Date(), marcasCrudas: [], propuestas: [],
        reemplazos: [{ dni: ana, fecha: dias[2], asistenciaId, estadoAnterior: "confirmada", valorAnterior: { entradaReal: `${dias[2]}T09:00`, salidaReal: `${dias[2]}T17:00` }, entradaPropuesta: `${dias[2]}T09:30`, salidaPropuesta: `${dias[2]}T17:30` }],
      });
      expect(await vigente(periodoId, grupoA)).toBe(false);
    });

    it("confirmar un ingreso o un cese de Recursos Humanos la invalida", async () => {
      const gaby = dniDePrueba();
      await crearPersona(gaby, "Gaby Relación", grupoA, sedeA, "ninguna");
      const [relacion] = await db.insert(schema.relacionesLaborales).values({ dni: gaby, ingreso: "2074-05-05", cese: "2074-05-06", registradaPorId: gerenteId }).returning({ id: schema.relacionesLaborales.id });

      await sembrarAprobacion(periodoId, grupoA);
      await relaciones.ejecutarSobreColaborador(gaby, (almacen) => almacen.confirmarIngreso(relacion.id, gerenteId, new Date()));
      expect(await vigente(periodoId, grupoA)).toBe(false);
      expect(await ultimoMotivo(periodoId, grupoA)).toContain("Se confirmó un ingreso");

      await sembrarAprobacion(periodoId, grupoA);
      await relaciones.ejecutarSobreColaborador(gaby, (almacen) => almacen.confirmarCese(relacion.id, gerenteId, new Date()));
      expect(await vigente(periodoId, grupoA)).toBe(false);
      expect(await ultimoMotivo(periodoId, grupoA)).toContain("Se confirmó un cese");
    });

    it("cambiar de grupo a una persona invalida la aprobación del grupo que deja y la del que recibe, solo en períodos abiertos", async () => {
      const gaby = personas[personas.length - 1];
      const [colaborador] = await db.select().from(schema.colaboradores).where(eq(schema.colaboradores.dni, gaby));
      await sembrarAprobacion(periodoId, grupoA);
      await sembrarAprobacion(periodoId, grupoB);
      await sembrarAprobacion(periodoDeCierreId, grupoB);

      await colaboradoresRepo.actualizar({ dni: gaby, nombre: colaborador.nombre, sede: colaborador.sede, grupo: grupoB, activo: true });

      expect(await vigente(periodoId, grupoA)).toBe(false);
      expect(await vigente(periodoId, grupoB)).toBe(false);
      expect(await ultimoMotivo(periodoId, grupoB)).toContain(`entró al grupo ${grupoB}`);
      expect(await vigente(periodoDeCierreId, grupoB)).toBe(true);
    });

    it("una corrección espera el mismo bloqueo del período que toma aprobar: se serializan", async () => {
      await sembrarAprobacion(periodoId, grupoA);
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        await cliente.query("SELECT id FROM periodos_planilla WHERE id = $1 FOR UPDATE", [periodoId]);
        let terminada = false;
        const ajuste = asistencias.ajustar({ dni: ana, fecha: dias[1], entradaReal: `${dias[1]}T09:10`, salidaReal: `${dias[1]}T17:00`, motivo: "Otra corrección", minutosTrabajados: 470 }, gerenteId)
          .finally(() => { terminada = true; });
        await new Promise((resolver) => setTimeout(resolver, 300));
        expect(terminada).toBe(false);
        await cliente.query("COMMIT");
        await ajuste;
        expect(await vigente(periodoId, grupoA)).toBe(false);
      } finally {
        cliente.release();
      }
    });
  });

  describe("cierre y circuito de reapertura", () => {
    it("el cierre exige la aprobación vigente de todos los grupos que gestionan asistencia; un grupo que no gestiona asistencia no bloquea", async () => {
      const periodo = (await db.insert(schema.periodosPlanilla).values({ inicio: "2074-08-01", fin: "2074-08-02", estado: "abierto" }).returning({ id: schema.periodosPlanilla.id }))[0].id;
      periodosCreados.push(periodo);
      await aprobarGruposQueGestionanAsistenciaDePrueba(db, periodo, finanzasId, { excepto: [grupoA] });

      await expect(periodos.cerrar(periodo, finanzasId, new Date())).rejects.toThrow(grupoA);
      await expect(periodos.cerrar(periodo, finanzasId, new Date())).rejects.toThrow("Finanzas no aprueba en su nombre");
      expect((await periodos.buscar(periodo))?.estado).toBe("abierto");

      await db.insert(schema.aprobacionesDeAsistencia).values({ periodoId: periodo, grupo: grupoA, aprobadaPorId: gerenteId, aprobadaEn: new Date() });
      await periodos.cerrar(periodo, finanzasId, new Date());
      expect((await periodos.buscar(periodo))?.estado).toBe("cerrado");
    });

    it("una aprobación invalidada no cuenta para el cierre", async () => {
      const periodo = (await db.insert(schema.periodosPlanilla).values({ inicio: "2074-09-01", fin: "2074-09-02", estado: "abierto" }).returning({ id: schema.periodosPlanilla.id }))[0].id;
      periodosCreados.push(periodo);
      await aprobarGruposQueGestionanAsistenciaDePrueba(db, periodo, finanzasId);
      await db.update(schema.aprobacionesDeAsistencia).set({ invalidadaEn: new Date(), motivoDeInvalidacion: "Corrección" })
        .where(and(eq(schema.aprobacionesDeAsistencia.periodoId, periodo), eq(schema.aprobacionesDeAsistencia.grupo, grupoA)));

      await expect(periodos.cerrar(periodo, finanzasId, new Date())).rejects.toThrow(grupoA);
    });

    it("cerrar, reabrir, corregir, aprobar de nuevo y cerrar conserva las revisiones y el historial de aprobaciones", async () => {
      await aprobarGruposQueGestionanAsistenciaDePrueba(db, periodoCircuitoId, finanzasId, { excepto: [grupoCircuito] });
      await periodos.aprobarAsistencia(periodoCircuitoId, grupoCircuito, gerenteId, new Date("2074-07-09T10:00:00Z"));
      await periodos.cerrar(periodoCircuitoId, finanzasId, new Date("2074-07-09T11:00:00Z"));
      const [primera] = await periodos.listarRevisiones(periodoCircuitoId);
      const resumenDeLaPrimera = structuredClone(primera.resumen);

      await periodos.reabrir(periodoCircuitoId, finanzasId, "Corregir una marca", new Date("2074-07-09T12:00:00Z"));
      expect(await vigente(periodoCircuitoId, grupoCircuito)).toBe(true);
      await asistencias.ajustar({ dni: hugo, fecha: diasCircuito[1], entradaReal: `${diasCircuito[1]}T09:10`, salidaReal: `${diasCircuito[1]}T17:00`, motivo: "Marca corregida", minutosTrabajados: 470 }, gerenteId);

      expect(await vigente(periodoCircuitoId, grupoCircuito)).toBe(false);
      await expect(periodos.cerrar(periodoCircuitoId, finanzasId, new Date("2074-07-09T13:00:00Z"))).rejects.toThrow(grupoCircuito);

      await periodos.aprobarAsistencia(periodoCircuitoId, grupoCircuito, gerenteId, new Date("2074-07-09T14:00:00Z"));
      await periodos.cerrar(periodoCircuitoId, finanzasId, new Date("2074-07-09T15:00:00Z"));

      const revisiones = await periodos.listarRevisiones(periodoCircuitoId);
      expect(revisiones.map(({ numero }) => numero)).toEqual([1, 2]);
      expect(revisiones[0].resumen).toEqual(resumenDeLaPrimera);
      expect(revisiones[1].resumen.totales.minutosTrabajados).toBe(470 + 480 + 480);
      const historial = await aprobacionesDe(periodoCircuitoId, grupoCircuito);
      expect(historial).toHaveLength(2);
      expect(historial[0]).toMatchObject({ invalidadaEn: expect.any(Date), motivoDeInvalidacion: expect.stringContaining("Se ajustó la asistencia") });
      expect(historial[1]).toMatchObject({ invalidadaEn: null, motivoDeInvalidacion: null });
      expect((await periodos.buscar(periodoCircuitoId))?.estado).toBe("cerrado");
    });
  });
});
