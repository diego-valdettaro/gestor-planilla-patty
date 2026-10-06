import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import * as schema from "@/db/schema";

import {
  asignarDescansoSemanal,
  consultarDiasDeDescansoOFeriado,
  listarDescansosSemanales,
  listarFeriados,
  quitarFeriado,
  registrarDescansoSustitutorio,
  registrarFeriado,
  verificarDescansoSustitutorio,
} from "./gestionar-descansos-y-feriados";
import { RepositorioPostgresDeDescansosYFeriados } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

describe.skipIf(!databaseUrl)("descansos semanales, feriados y descansos sustitutorios (integración PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeDescansosYFeriados(db);
  const grupo = `Grupo descansos ${randomUUID()}`;
  const cuentaFinanzas = randomUUID();
  const cuentaGerente = randomUUID();
  const finanzas: Actor = { id: cuentaFinanzas, rol: "finanzas" };
  const gerente: Actor = { id: cuentaGerente, rol: "gerente_de_area", grupos: [{ nombre: grupo, gestionaAsistencia: true }] };
  const ana = dniDePrueba();
  const beto = dniDePrueba();
  const dniDeTodos = [ana, beto];
  // Años lejanos: el calendario de feriados es global y no debe chocar con otras pruebas.
  const MIERCOLES = "2044-03-09";
  const LUNES = "2044-03-07";
  const DOMINGO = "2044-03-13";
  const fechasDeFeriados = ["2044-05-01", "2044-07-28", "2044-07-29", "2044-10-08"];

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values([
      { id: cuentaFinanzas, nombreUsuario: `finanzas-${cuentaFinanzas}`, hashContrasena: "prueba", rol: "finanzas" },
      { id: cuentaGerente, nombreUsuario: `gerente-${cuentaGerente}`, hashContrasena: "prueba", rol: "gerente_de_area" },
    ]);
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.colaboradores).values(dniDeTodos.map((dni, indice) => ({ dni, nombre: `Persona ${indice}`, sede: "Sede de prueba", grupo, activo: true })));
  });

  afterAll(async () => {
    const asistencias = await db.select({ id: schema.asistenciasEsperadas.id }).from(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.dni, dniDeTodos));
    if (asistencias.length) await db.delete(schema.estadosManuales).where(inArray(schema.estadosManuales.asistenciaId, asistencias.map(({ id }) => id)));
    await db.delete(schema.asistenciasEsperadas).where(inArray(schema.asistenciasEsperadas.dni, dniDeTodos));
    await db.delete(schema.descansosSustitutorios).where(inArray(schema.descansosSustitutorios.dni, dniDeTodos));
    await db.delete(schema.descansosSemanalesAsignados).where(inArray(schema.descansosSemanalesAsignados.dni, dniDeTodos));
    await db.delete(schema.feriados).where(inArray(schema.feriados.fecha, fechasDeFeriados));
    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.dni, dniDeTodos));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(inArray(schema.cuentasLocales.id, [cuentaFinanzas, cuentaGerente]));
    await pool.end();
  });

  it("asigna el descanso semanal por vigencia sin reescribir la historia y no asume el domingo", async () => {
    await expect(consultarDiasDeDescansoOFeriado(repositorio, finanzas, { dni: ana, desde: LUNES, hasta: DOMINGO })).resolves.toEqual([]);

    await asignarDescansoSemanal(repositorio, finanzas, { dni: ana, diaDeLaSemana: 7, vigenteDesde: "2044-03-01" });
    await asignarDescansoSemanal(repositorio, finanzas, { dni: ana, diaDeLaSemana: 3, vigenteDesde: "2044-03-16" });
    await expect(asignarDescansoSemanal(repositorio, finanzas, { dni: ana, diaDeLaSemana: 5, vigenteDesde: "2044-03-16" })).rejects.toThrow("ya tiene un descanso semanal asignado");
    await expect(asignarDescansoSemanal(repositorio, gerente, { dni: beto, diaDeLaSemana: 5, vigenteDesde: "2044-03-16" })).rejects.toThrow("No tiene permiso");

    await expect(listarDescansosSemanales(repositorio, finanzas, ana)).resolves.toMatchObject([{ diaDeLaSemana: 7, vigenteDesde: "2044-03-01" }, { diaDeLaSemana: 3, vigenteDesde: "2044-03-16" }]);
    const antes = await consultarDiasDeDescansoOFeriado(repositorio, finanzas, { dni: ana, desde: LUNES, hasta: "2044-03-27" });
    // Domingo 13/03 (vigencia anterior) y miércoles 16/03 y 23/03 (vigencia nueva); el domingo 20/03 ya no es su descanso.
    expect(antes.map(({ fecha }) => fecha)).toEqual([DOMINGO, "2044-03-16", "2044-03-23"]);
    await expect(consultarDiasDeDescansoOFeriado(repositorio, finanzas, { dni: beto, desde: LUNES, hasta: DOMINGO })).resolves.toEqual([]);
  });

  it("la base rechaza un día de descanso fuera de 1–7 y una vigencia repetida", async () => {
    const insertar = (valores: Partial<typeof schema.descansosSemanalesAsignados.$inferInsert>) => db.insert(schema.descansosSemanalesAsignados).values({ dni: beto, diaSemana: 2, vigenteDesde: "2044-04-04", registradoPorId: cuentaFinanzas, ...valores });

    await expect(insertar({ diaSemana: 0 })).rejects.toThrow();
    await expect(insertar({ diaSemana: 8 })).rejects.toThrow();
    await insertar({});
    await expect(insertar({ diaSemana: 3 })).rejects.toThrow();
    await db.delete(schema.descansosSemanalesAsignados).where(eq(schema.descansosSemanalesAsignados.dni, beto));
  });

  it("administra el calendario de feriados y distingue el 1 de mayo", async () => {
    await registrarFeriado(repositorio, finanzas, { fecha: "2044-07-28", nombre: "Fiestas Patrias" });
    await registrarFeriado(repositorio, finanzas, { fecha: "2044-05-01", nombre: "Día del Trabajo" });
    await expect(registrarFeriado(repositorio, finanzas, { fecha: "2044-07-28", nombre: "Repetido" })).rejects.toThrow("ya está en el calendario");
    await expect(registrarFeriado(repositorio, gerente, { fecha: "2044-07-29", nombre: "Sin permiso" })).rejects.toThrow("No tiene permiso");

    await expect(listarFeriados(repositorio, finanzas, "2044-01-01", "2044-12-31")).resolves.toEqual([
      { fecha: "2044-05-01", nombre: "Día del Trabajo", clase: "primero_de_mayo" },
      { fecha: "2044-07-28", nombre: "Fiestas Patrias", clase: "feriado" },
    ]);
    await registrarFeriado(repositorio, finanzas, { fecha: "2044-07-29", nombre: "Provisional" });
    await quitarFeriado(repositorio, finanzas, "2044-07-29");
    await expect(listarFeriados(repositorio, finanzas, "2044-07-29", "2044-07-29")).resolves.toEqual([]);
  });

  it("la base ata la clase del feriado a su fecha y exige un nombre", async () => {
    const insertar = (valores: Partial<typeof schema.feriados.$inferInsert>) => db.insert(schema.feriados).values({ fecha: "2044-10-08", nombre: "Combate de Angamos", clase: "feriado", registradoPorId: cuentaFinanzas, ...valores });

    await expect(insertar({ fecha: "2044-05-01", clase: "feriado" })).rejects.toThrow();
    await expect(insertar({ clase: "primero_de_mayo" })).rejects.toThrow();
    await expect(insertar({ nombre: "   " })).rejects.toThrow();
    await expect(insertar({ clase: "otro" as "feriado" })).rejects.toThrow();
    await insertar({});
    await db.delete(schema.feriados).where(eq(schema.feriados.fecha, "2044-10-08"));
  });

  it("distingue una jornada trabajada en descanso o feriado de un estado manual de descanso o feriado", async () => {
    // Ana descansa los miércoles desde el 16/03 y los domingos antes; el 28/07 y el 01/05 son feriados.
    const insertarAsistencia = async (valores: Partial<typeof schema.asistenciasEsperadas.$inferInsert> & { fecha: string }) => {
      const [fila] = await db.insert(schema.asistenciasEsperadas).values({ dni: ana, ...valores }).returning({ id: schema.asistenciasEsperadas.id });
      return fila.id;
    };
    await insertarAsistencia({ fecha: "2044-03-20", estado: "confirmada", entradaReal: "09:00", salidaReal: "17:30", minutosTrabajados: 510 });
    const manualDeFeriado = await insertarAsistencia({ fecha: "2044-07-28", estado: "manual" });
    await db.insert(schema.estadosManuales).values([
      { asistenciaId: manualDeFeriado, tipo: "permiso", comentario: "primero se registró un permiso", responsableId: cuentaFinanzas, registradoEn: new Date("2044-07-29T10:00:00Z") },
      { asistenciaId: manualDeFeriado, tipo: "feriado", comentario: "luego se corrigió a feriado", responsableId: cuentaFinanzas, registradoEn: new Date("2044-07-29T11:00:00Z") },
    ]);
    await insertarAsistencia({ fecha: "2044-03-23", estado: "manual" }).then((id) => db.insert(schema.estadosManuales).values({ asistenciaId: id, tipo: "descanso", comentario: "descanso registrado a mano", responsableId: cuentaFinanzas }));
    await insertarAsistencia({ fecha: "2044-05-01", estado: "confirmada", entradaReal: "08:00", salidaReal: "14:00", minutosTrabajados: 360 });

    const dias = await consultarDiasDeDescansoOFeriado(repositorio, finanzas, { dni: ana, desde: "2044-03-15", hasta: "2044-07-31" });

    const porFecha = new Map(dias.map((dia) => [dia.fecha, dia]));
    expect(porFecha.get("2044-03-23")).toMatchObject({ descansoSemanal: true, situacion: { tipo: "estado_manual", estado: "descanso" } });
    expect(porFecha.get("2044-07-28")).toMatchObject({ descansoSemanal: false, feriado: { clase: "feriado" }, situacion: { tipo: "estado_manual", estado: "feriado" } });
    expect(porFecha.get("2044-05-01")).toMatchObject({ feriado: { clase: "primero_de_mayo", nombre: "Día del Trabajo" }, situacion: { tipo: "jornada_trabajada", minutosTrabajados: 360 } });
    // El domingo 20/03 ya no es descanso de Ana desde el 16/03: trabajarlo no es trabajo en descanso.
    expect(porFecha.has("2044-03-20")).toBe(false);
    expect(porFecha.get("2044-03-16")).toMatchObject({ descansoSemanal: true, situacion: { tipo: "sin_resolver" } });
  });

  it("prevé un descanso sustitutorio y después lo marca otorgado o no otorgado", async () => {
    const otorgado = await registrarDescansoSustitutorio(repositorio, finanzas, { dni: ana, origenFecha: "2044-05-01", fechaPrevista: "2044-05-05" });
    const noOtorgado = await registrarDescansoSustitutorio(repositorio, finanzas, { dni: ana, origenFecha: "2044-03-23", fechaPrevista: "2044-03-25" });
    expect(otorgado).toMatchObject({ estado: "previsto", origenTipo: "primero_de_mayo", verificadoPorId: null });
    expect(noOtorgado.origenTipo).toBe("descanso_semanal");
    // El miércoles 09/03 es anterior a la vigencia del miércoles: no era descanso asignado de Ana.
    await expect(registrarDescansoSustitutorio(repositorio, finanzas, { dni: ana, origenFecha: MIERCOLES, fechaPrevista: "2044-03-11" })).rejects.toThrow("no es feriado ni el descanso semanal");

    await expect(verificarDescansoSustitutorio(repositorio, finanzas, otorgado.id, "otorgado", "2044-05-04")).rejects.toThrow("solo puede verificarse ese día o después");
    await verificarDescansoSustitutorio(repositorio, finanzas, otorgado.id, "otorgado", "2044-05-05");
    await verificarDescansoSustitutorio(repositorio, finanzas, noOtorgado.id, "no_otorgado", "2044-03-30");
    await expect(verificarDescansoSustitutorio(repositorio, finanzas, otorgado.id, "no_otorgado", "2044-05-06")).rejects.toThrow("ya fue verificado");

    const filas = await db.select().from(schema.descansosSustitutorios).where(eq(schema.descansosSustitutorios.dni, ana));
    const porId = new Map(filas.map((fila) => [fila.id, fila]));
    expect(porId.get(otorgado.id)).toMatchObject({ estado: "otorgado", verificadoPorId: cuentaFinanzas });
    expect(porId.get(otorgado.id)?.verificadoEn).toBeInstanceOf(Date);
    expect(porId.get(noOtorgado.id)).toMatchObject({ estado: "no_otorgado", verificadoPorId: cuentaFinanzas });

    const dias = await consultarDiasDeDescansoOFeriado(repositorio, finanzas, { dni: ana, desde: "2044-05-01", hasta: "2044-05-01" });
    expect(dias[0].sustitutorio).toEqual({ id: otorgado.id, estado: "otorgado", fechaPrevista: "2044-05-05" });
  });

  it("no quita un feriado con sustitutorio y la base impide registros contradictorios", async () => {
    await expect(quitarFeriado(repositorio, finanzas, "2044-05-01")).rejects.toThrow("tiene descansos sustitutorios registrados");

    const insertar = (valores: Partial<typeof schema.descansosSustitutorios.$inferInsert>) => db.insert(schema.descansosSustitutorios).values({
      dni: beto, origenFecha: "2044-07-28", origenTipo: "feriado", fechaPrevista: "2044-07-30", registradoPorId: cuentaFinanzas, ...valores,
    });
    await expect(insertar({ fechaPrevista: "2044-07-28" })).rejects.toThrow();
    await expect(insertar({ estado: "otorgado" })).rejects.toThrow();
    await expect(insertar({ verificadoPorId: cuentaFinanzas, verificadoEn: new Date() })).rejects.toThrow();
    await expect(insertar({ estado: "no_otorgado", verificadoPorId: cuentaFinanzas })).rejects.toThrow();
    await expect(insertar({ origenTipo: "domingo" as "feriado" })).rejects.toThrow();
    await insertar({});
    await expect(insertar({ fechaPrevista: "2044-08-01" })).rejects.toThrow();
  });

  it("dos registros o dos verificaciones simultáneos de un sustitutorio no se duplican", async () => {
    const registros = await Promise.allSettled([
      registrarDescansoSustitutorio(repositorio, finanzas, { dni: ana, origenFecha: "2044-03-30", fechaPrevista: "2044-04-01" }),
      registrarDescansoSustitutorio(repositorio, finanzas, { dni: ana, origenFecha: "2044-03-30", fechaPrevista: "2044-04-02" }),
    ]);
    expect(registros.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const ganador = registros.find((registro): registro is PromiseFulfilledResult<Awaited<ReturnType<typeof registrarDescansoSustitutorio>>> => registro.status === "fulfilled")!.value;

    const verificaciones = await Promise.allSettled([
      verificarDescansoSustitutorio(repositorio, finanzas, ganador.id, "otorgado", "2044-04-30"),
      verificarDescansoSustitutorio(repositorio, finanzas, ganador.id, "no_otorgado", "2044-04-30"),
    ]);
    expect(verificaciones.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  });
});
