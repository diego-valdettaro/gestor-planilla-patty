import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import * as schema from "@/db/schema";

import {
  anularImporte,
  confirmarFuente,
  consultarEstadoDeFuentes,
  consultarFuente,
  consultarImportesDePersona,
  registrarImporte,
  volverAPendiente,
} from "./gestionar-fuentes-externas";
import { RepositorioPostgresDeFuentesExternas } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// Las fuentes externas se confirman por tipo y mes, sin un grupo ni una sede propios. Las pruebas usan meses de 1991 a 1993,
// que ningún dato de demostración ni real toca, y borran por persona y por responsable al terminar.
describe.skipIf(!databaseUrl)("fuentes externas de Pagos (integración PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeFuentesExternas(db);
  const sufijo = randomUUID();
  const grupo = `Grupo fuentes ${sufijo}`;
  const sede = `Sede fuentes ${sufijo}`;
  const cuentaFinanzas = randomUUID();
  const cuentaAdministrador = randomUUID();
  const finanzas: Actor = { id: cuentaFinanzas, rol: "finanzas", nombreUsuario: "finanzas-prueba" };
  const administrador: Actor = { id: cuentaAdministrador, rol: "administrador" };
  const ana = dniDePrueba();
  const beto = dniDePrueba();
  const MES = "1992-10";

  const registrar = (cambios: Partial<Parameters<typeof registrarImporte>[2]> = {}) => registrarImporte(repositorio, finanzas, {
    tipoDeFuente: "comisiones_de_ventas", dni: ana, concepto: "comision_de_ventas", fechaDelHecho: "1992-09-28",
    mesDeDevengue: "1992-09", mesDeAplicacion: MES, monto: "250,50", ...cambios,
  });
  const importesDeLaPrueba = () => db.select().from(schema.importesExternos).where(inArray(schema.importesExternos.dni, [ana, beto]));

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values([
      { id: cuentaFinanzas, nombreUsuario: `finanzas-${cuentaFinanzas}`, hashContrasena: "prueba", rol: "finanzas" },
      { id: cuentaAdministrador, nombreUsuario: `admin-${cuentaAdministrador}`, hashContrasena: "prueba", rol: "administrador" },
    ]);
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.sedes).values({ nombre: sede, activa: true, grupo });
    await db.insert(schema.colaboradores).values([
      { dni: ana, nombre: "Ana Fuentes", sede, grupo, activo: true },
      { dni: beto, nombre: "Beto Fuentes", sede, grupo, activo: true },
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.importesExternos).where(inArray(schema.importesExternos.dni, [ana, beto]));
    await db.delete(schema.confirmacionesDeFuente).where(eq(schema.confirmacionesDeFuente.confirmadaPorId, cuentaFinanzas));
    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.dni, [ana, beto]));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    // Otras pruebas aprueban todos los grupos de la base, también los que crea esta: sin esto el borrado falla según el orden de ejecución.
    await db.delete(schema.aprobacionesDeAsistencia).where(eq(schema.aprobacionesDeAsistencia.grupo, grupo));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(inArray(schema.cuentasLocales.id, [cuentaFinanzas, cuentaAdministrador]));
    await pool.end();
  });

  it("conserva DNI, fecha del hecho, devengue, aplicación, monto y procedencia de cada importe", async () => {
    const { importe } = await registrar();

    const [guardado] = await db.select().from(schema.importesExternos).where(eq(schema.importesExternos.id, importe.id));
    expect(guardado).toMatchObject({
      dni: ana, concepto: "comision_de_ventas", tipoDeFuente: "comisiones_de_ventas", fechaDelHecho: "1992-09-28", mesDeDevengue: "1992-09",
      mesDeAplicacion: "1992-10", montoCentimos: 25050, procedencia: "carga_manual", registradoPorId: cuentaFinanzas, anuladoEn: null,
    });
    const detalle = await consultarFuente(repositorio, finanzas, "comisiones_de_ventas", MES);
    expect(detalle?.importes).toEqual([expect.objectContaining({ id: importe.id, nombre: "Ana Fuentes", dni: ana, monto: 25050, registradoPor: `finanzas-${cuentaFinanzas}` })]);
    expect(detalle).toMatchObject({ estado: "pendiente", filas: 1, total: 25050 });
  });

  it("rechaza un importe duplicado y la base lo impide aunque la regla no se aplique", async () => {
    await expect(registrar()).rejects.toThrow(/Ya existe ese importe/);

    const [existente] = await importesDeLaPrueba();
    const { id: _id, registradoEn: _registradoEn, ...fila } = existente;
    await expect(db.insert(schema.importesExternos).values(fila)).rejects.toThrow();
    expect(await importesDeLaPrueba()).toHaveLength(1);
  });

  it("la base rechaza montos no positivos, meses mal formados, procedencia vacía y anulaciones sin motivo", async () => {
    const [base] = await importesDeLaPrueba();
    const { id: _id, registradoEn: _registradoEn, ...fila } = base;
    const insertar = (cambios: Partial<typeof schema.importesExternos.$inferInsert>) => db.insert(schema.importesExternos).values({ ...fila, fechaDelHecho: "1992-09-01", ...cambios });

    await expect(insertar({ montoCentimos: 0 })).rejects.toThrow();
    await expect(insertar({ montoCentimos: -1 })).rejects.toThrow();
    await expect(insertar({ mesDeAplicacion: "1992-13" })).rejects.toThrow();
    await expect(insertar({ mesDeDevengue: "92-09" })).rejects.toThrow();
    await expect(insertar({ procedencia: "  " })).rejects.toThrow();
    await expect(insertar({ anuladoEn: new Date() })).rejects.toThrow();
    await expect(insertar({ motivoDeAnulacion: "sin fecha" })).rejects.toThrow();
    await expect(insertar({ dni: "00000000" })).rejects.toThrow();
    expect(await importesDeLaPrueba()).toHaveLength(1);
  });

  it("confirmar un tipo sin importes es un cero confirmado, distinto de pendiente", async () => {
    expect((await consultarImportesDePersona(repositorio, finanzas, ana, MES)).adelantos).toEqual({ estado: "pendiente" });

    await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "adelantos", mes: MES });

    expect((await consultarImportesDePersona(repositorio, finanzas, ana, MES)).adelantos).toEqual({ estado: "confirmado", importes: [], total: 0 });
    const fila = (await consultarEstadoDeFuentes(repositorio, finanzas, MES)).find((candidata) => candidata.tipo.codigo === "adelantos");
    expect(fila).toMatchObject({ estado: "confirmada_sin_importes", filas: 0, total: 0, confirmacion: { confirmadaPorId: cuentaFinanzas, confirmadaPor: `finanzas-${cuentaFinanzas}` } });
    expect(fila?.confirmacion?.confirmadaEn).toBeInstanceOf(Date);
    await expect(confirmarFuente(repositorio, finanzas, { tipoDeFuente: "adelantos", mes: MES })).rejects.toThrow(/ya está confirmada/);
  });

  it("con importes confirmados, quien no tiene fila vale cero y la confirmación es del mes", async () => {
    await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "comisiones_de_ventas", mes: MES });

    const delTipo = (dni: string, mes: string) => consultarImportesDePersona(repositorio, finanzas, dni, mes).then((porTipo) => porTipo.comisiones_de_ventas);
    expect(await delTipo(ana, MES)).toMatchObject({ estado: "confirmado", total: 25050 });
    expect(await delTipo(beto, MES)).toEqual({ estado: "confirmado", importes: [], total: 0 });
    expect(await delTipo(ana, "1992-11")).toEqual({ estado: "pendiente" });
  });

  it("cambiar las filas de una fuente confirmada la devuelve a pendiente; anular conserva el historial y libera el duplicado", async () => {
    const { importe, volvioAPendiente } = await registrar({ dni: beto, monto: "100" });
    expect(volvioAPendiente).toBe(true);
    expect((await consultarImportesDePersona(repositorio, finanzas, beto, MES)).comisiones_de_ventas).toEqual({ estado: "pendiente" });

    await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "comisiones_de_ventas", mes: MES });
    const anulada = await anularImporte(repositorio, finanzas, { importeId: importe.id, motivo: "Monto mal digitado" });
    expect(anulada.volvioAPendiente).toBe(true);

    const [guardado] = await db.select().from(schema.importesExternos).where(eq(schema.importesExternos.id, importe.id));
    expect(guardado).toMatchObject({ montoCentimos: 10000, motivoDeAnulacion: "Monto mal digitado" });
    expect(guardado.anuladoEn).toBeInstanceOf(Date);
    expect((await consultarFuente(repositorio, finanzas, "comisiones_de_ventas", MES))?.importes.map((fila) => fila.dni)).toEqual([ana]);
    await expect(registrar({ dni: beto, monto: "100" })).resolves.toBeDefined();
    await expect(anularImporte(repositorio, finanzas, { importeId: importe.id, motivo: "otra vez" })).rejects.toThrow(/ya fue anulado/);
  });

  it("volver a pendiente deshace la confirmación", async () => {
    await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "prestamos", mes: MES });
    await volverAPendiente(repositorio, finanzas, { tipoDeFuente: "prestamos", mes: MES });

    expect((await consultarImportesDePersona(repositorio, finanzas, ana, MES)).prestamos).toEqual({ estado: "pendiente" });
    await expect(volverAPendiente(repositorio, finanzas, { tipoDeFuente: "prestamos", mes: MES })).rejects.toThrow(/ya está pendiente/);
  });

  it("no carga líneas calculadas ni personas inexistentes, y otros roles no tocan nada", async () => {
    await expect(registrar({ concepto: "horas_extra_25" })).rejects.toThrow(/línea calculada/);
    await expect(registrar({ dni: "00000000" })).rejects.toThrow(/No existe una persona/);
    await expect(registrarImporte(repositorio, administrador, {
      tipoDeFuente: "adelantos", dni: ana, concepto: "adelanto", fechaDelHecho: "1992-10-01", mesDeDevengue: "1992-10", mesDeAplicacion: MES, monto: "10",
    })).rejects.toThrow(/No tiene permiso/);
    await expect(consultarEstadoDeFuentes(repositorio, administrador, MES)).rejects.toThrow(/No tiene permiso/);
  });

  it("dos cargas simultáneas del mismo importe guardan una sola", async () => {
    const resultados = await Promise.allSettled([registrar({ monto: "77" }), registrar({ monto: "77" })]);

    expect(resultados.filter((resultado) => resultado.status === "fulfilled")).toHaveLength(1);
    expect(resultados.filter((resultado) => resultado.status === "rejected")).toHaveLength(1);
    expect((await importesDeLaPrueba()).filter((fila) => fila.montoCentimos === 7700)).toHaveLength(1);
  });
});
