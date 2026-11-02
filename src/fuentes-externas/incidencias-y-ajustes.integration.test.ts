import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import * as schema from "@/db/schema";

import { confirmarFuente, consultarImportesDePersona } from "./gestionar-fuentes-externas";
import { decidirIncidencia, registrarAjuste, registrarIncidencia } from "./incidencias-y-ajustes";
import { RepositorioPostgresDeFuentesExternas } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar PostgreSQL.");

describe.skipIf(!databaseUrl)("incidencias y ajustes en PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeFuentesExternas(db);
  const id = randomUUID();
  const gerenteId = randomUUID();
  const nuevoGerenteId = randomUUID();
  const grupo = `Grupo especial ${id}`;
  const grupoAjeno = `Grupo ajeno ${id}`;
  const sede = `Sede especial ${id}`;
  const dni = dniDePrueba();
  const finanzas: Actor = { id, rol: "finanzas", nombreUsuario: "finanzas-prueba" };
  const gerente: Actor = { id: gerenteId, rol: "gerente_de_area", grupos: [{ nombre: grupo, gestionaAsistencia: true }] };
  const datos = { dni, fechaDelHecho: "2002-09-29", mesDeDevengue: "2002-09", mesDeAplicacion: "2002-10", monto: "80,50" };

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values([
      { id, nombreUsuario: `finanzas-${id}`, hashContrasena: "prueba", rol: "finanzas" },
      { id: gerenteId, nombreUsuario: `gerente-${gerenteId}`, hashContrasena: "prueba", rol: "gerente_de_area" },
      { id: nuevoGerenteId, nombreUsuario: `gerente-nuevo-${nuevoGerenteId}`, hashContrasena: "prueba", rol: "gerente_de_area" },
    ]);
    await db.insert(schema.grupos).values([{ nombre: grupo }, { nombre: grupoAjeno }]);
    await db.insert(schema.sedes).values({ nombre: sede, activa: true, grupo });
    await db.insert(schema.colaboradores).values({ dni, nombre: "Ana Especial", sede, grupo, activo: true });
    await db.insert(schema.gerentesDeGrupo).values({ grupo, cuentaId: gerenteId });
  });
  afterAll(async () => {
    await db.delete(schema.importesExternos).where(eq(schema.importesExternos.dni, dni));
    await db.delete(schema.confirmacionesDeFuente).where(eq(schema.confirmacionesDeFuente.confirmadaPorId, id));
    await db.delete(schema.gerentesDeGrupo).where(eq(schema.gerentesDeGrupo.grupo, grupo));
    await db.delete(schema.colaboradores).where(eq(schema.colaboradores.dni, dni));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    await db.delete(schema.aprobacionesDeAsistencia).where(eq(schema.aprobacionesDeAsistencia.grupo, grupo));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupoAjeno));
    await db.delete(schema.cuentasLocales).where(inArray(schema.cuentasLocales.id, [id, gerenteId, nuevoGerenteId]));
    await pool.end();
  });

  it("solo descuenta tras persistir sustento, autorizador y fecha; investigación permite confirmar", async () => {
    const primera = await registrarIncidencia(repositorio, finanzas, datos);
    const segunda = await registrarIncidencia(repositorio, finanzas, { ...datos, fechaDelHecho: "2002-09-30" });
    await expect(confirmarFuente(repositorio, finanzas, { tipoDeFuente: "incidencias_de_tienda", mes: datos.mesDeAplicacion })).rejects.toThrow(/sin sustento/);
    await decidirIncidencia(repositorio, finanzas, { id: primera.id, decision: "no_descontar", sustento: "", autorizadoPor: "", fechaDeAutorizacion: "" });
    await decidirIncidencia(repositorio, finanzas, { id: segunda.id, decision: "autorizar", sustento: "Acta de merma", autorizadoPor: "Encargada", fechaDeAutorizacion: "2002-10-01" });
    await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "incidencias_de_tienda", mes: datos.mesDeAplicacion });
    const fuente = (await consultarImportesDePersona(repositorio, finanzas, dni, datos.mesDeAplicacion)).incidencias_de_tienda;
    expect(fuente).toMatchObject({ estado: "confirmado", total: 8050, importes: [{ id: segunda.id, sustento: "Acta de merma", autorizadoPor: "Encargada", fechaDeAutorizacion: "2002-10-01" }] });
    const [guardada] = await db.select().from(schema.importesExternos).where(eq(schema.importesExternos.id, primera.id));
    expect(guardada.estadoDeIncidencia).toBe("en_investigacion");
  });

  it("el ajuste persiste concepto corregido, sentido, motivo, responsable y meses separados", async () => {
    const ajuste = await registrarAjuste(repositorio, finanzas, { ...datos, conceptoAjustado: "sueldo_basico", sentidoAjuste: "resta", motivo: "Diferencia de septiembre" });
    const [fila] = await db.select().from(schema.importesExternos).where(eq(schema.importesExternos.id, ajuste.id));
    expect(fila).toMatchObject({ dni, fechaDelHecho: "2002-09-29", mesDeDevengue: "2002-09", mesDeAplicacion: "2002-10", montoCentimos: 8050, conceptoAjustado: "sueldo_basico", sentidoAjuste: "resta", motivoDeAjuste: "Diferencia de septiembre", registradoPorId: id });
  });

  it("G13 persiste motivo y autor de la incidencia y los deja visibles para Finanzas", async () => {
    const registrada = await registrarIncidencia(repositorio, gerente, {
      dni, fechaDelHecho: "2002-09-24", monto: "25", motivo: "Producto dañado",
    });
    await expect(confirmarFuente(repositorio, finanzas, { tipoDeFuente: "incidencias_de_tienda", mes: "2002-09" })).rejects.toThrow(/sin sustento/);
    await decidirIncidencia(repositorio, finanzas, {
      id: registrada.id, decision: "autorizar", sustento: "Acta de merma", autorizadoPor: "Finanzas", fechaDeAutorizacion: "2002-10-01",
    });
    await confirmarFuente(repositorio, finanzas, { tipoDeFuente: "incidencias_de_tienda", mes: "2002-09" });
    await db.update(schema.colaboradores).set({ grupo: grupoAjeno }).where(eq(schema.colaboradores.dni, dni));

    const vista = await consultarImportesDePersona(repositorio, finanzas, dni, "2002-09");
    const fuenteDeIncidencias = vista.incidencias_de_tienda;
    if (fuenteDeIncidencias.estado !== "confirmado") throw new Error("Se esperaba la fuente de incidencias confirmada.");
    expect(fuenteDeIncidencias.importes).toMatchObject([
      { id: registrada.id, motivoIncidencia: "Producto dañado", registradoPorId: gerenteId },
    ]);
    await expect(consultarImportesDePersona(repositorio, gerente, dni, "2002-09")).rejects.toThrow("No tiene permiso");
    await db.update(schema.colaboradores).set({ grupo }).where(eq(schema.colaboradores.dni, dni));
  });

  it("G14 espera el cambio concurrente de grupo y rechaza el gerente anterior", async () => {
    const bloqueo = await pool.connect();
    await bloqueo.query("BEGIN");
    await bloqueo.query("UPDATE gerentes_de_grupo SET cuenta_id=$1 WHERE grupo=$2", [nuevoGerenteId, grupo]);
    let resuelta = false;
    const registro = registrarIncidencia(repositorio, gerente, {
      dni, fechaDelHecho: "2002-09-24", monto: "27", motivo: "Prueba concurrente",
    }).then((valor) => { resuelta = true; return { valor }; }, (error: unknown) => { resuelta = true; return { error }; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(resuelta).toBe(false);
      await bloqueo.query("COMMIT");
      const resultado = await registro;
      expect(resultado).toMatchObject({ error: expect.objectContaining({ message: "No tiene permiso para registrar incidencias de esta persona." }) });
      expect(await db.select().from(schema.importesExternos).where(and(
        eq(schema.importesExternos.dni, dni), eq(schema.importesExternos.fechaDelHecho, "2002-09-24"), eq(schema.importesExternos.montoCentimos, 2700),
      ))).toEqual([]);
    } finally {
      await bloqueo.query("ROLLBACK").catch(() => undefined);
      bloqueo.release();
    }
  });
});
