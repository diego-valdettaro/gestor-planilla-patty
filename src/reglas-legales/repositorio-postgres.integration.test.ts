import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import * as schema from "@/db/schema";

import {
  activarReglaLegal,
  consultarHistorialDeRegla,
  consultarReglaVigente,
  corregirReglaLegal,
  listarReglasLegales,
} from "./gestionar-reglas-legales";
import { RepositorioPostgresDeReglasLegales } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

// Las reglas legales son globales (no hay un grupo ni una sede propios de la prueba). Los datos de la prueba usan
// vigencias de los años noventa, que ningún dato de demostración ni real toca, y se borran por responsable al terminar.
describe.skipIf(!databaseUrl)("reglas legales con vigencia (integración PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeReglasLegales(db);
  const cuentaFinanzas = randomUUID();
  const cuentaAdministrador = randomUUID();
  const finanzas: Actor = { id: cuentaFinanzas, rol: "finanzas", nombreUsuario: "finanzas-prueba" };
  const administrador: Actor = { id: cuentaAdministrador, rol: "administrador" };
  const FUENTE = "Norma sintética de prueba";

  const activar = (codigo: string, valor: string, vigenteDesde: string, fuenteOficial = FUENTE) => activarReglaLegal(repositorio, finanzas, { codigo, valor, vigenteDesde, fuenteOficial });
  const guardadas = () => db.select().from(schema.reglasLegales).where(inArray(schema.reglasLegales.activadaPorId, [cuentaFinanzas, cuentaAdministrador]));

  beforeAll(async () => {
    await db.insert(schema.cuentasLocales).values([
      { id: cuentaFinanzas, nombreUsuario: `finanzas-${cuentaFinanzas}`, hashContrasena: "prueba", rol: "finanzas" },
      { id: cuentaAdministrador, nombreUsuario: `admin-${cuentaAdministrador}`, hashContrasena: "prueba", rol: "administrador" },
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.reglasLegales).where(inArray(schema.reglasLegales.activadaPorId, [cuentaFinanzas, cuentaAdministrador]));
    await db.delete(schema.cuentasLocales).where(inArray(schema.cuentasLocales.id, [cuentaFinanzas, cuentaAdministrador]));
    await pool.end();
  });

  it("conserva cada valor con su vigencia, su fuente oficial y el usuario que lo activó; consultar una fecha devuelve la versión vigente", async () => {
    await activar("rmv", "1000", "1990-01-01");
    await activar("rmv", "1250,75", "1995-06-01", "Otra norma sintética");
    await activar("essalud_tasa", "8,5", "1990-01-01");

    expect(await consultarReglaVigente(repositorio, finanzas, "rmv", "1995-05-31")).toMatchObject({ estado: "vigente", regla: { valor: 100000, vigenteDesde: "1990-01-01", fuenteOficial: FUENTE, activadaPorId: cuentaFinanzas, activadaPor: `finanzas-${cuentaFinanzas}` } });
    expect(await consultarReglaVigente(repositorio, finanzas, "rmv", "1995-06-01")).toMatchObject({ estado: "vigente", regla: { valor: 125075, fuenteOficial: "Otra norma sintética" } });
    expect(await consultarReglaVigente(repositorio, finanzas, "essalud_tasa", "1991-01-01")).toMatchObject({ regla: { valor: 850 } });
  });

  it("sin regla vigente en la fecha el dato falta de forma explícita", async () => {
    expect(await consultarReglaVigente(repositorio, finanzas, "rmv", "1989-12-31")).toEqual({ estado: "faltante", codigo: "rmv", fecha: "1989-12-31" });
  });

  it("guarda porcentajes e importes en su columna y la base rechaza combinaciones y valores inválidos", async () => {
    const [tasa] = await db.select().from(schema.reglasLegales).where(eq(schema.reglasLegales.codigo, "essalud_tasa"));
    const [importe] = await db.select().from(schema.reglasLegales).where(eq(schema.reglasLegales.codigo, "rmv"));
    expect(tasa).toMatchObject({ tasaCentesimasDePunto: expect.any(Number), importeCentimos: null });
    expect(importe).toMatchObject({ importeCentimos: expect.any(Number), tasaCentesimasDePunto: null });

    const insertar = (valores: Partial<typeof schema.reglasLegales.$inferInsert>) => db.insert(schema.reglasLegales)
      .values({ codigo: "onp_tasa", tasaCentesimasDePunto: 1300, vigenteDesde: "1980-01-01", fuenteOficial: FUENTE, activadaPorId: cuentaFinanzas, ...valores });
    await expect(insertar({ tasaCentesimasDePunto: null })).rejects.toThrow();
    await expect(insertar({ importeCentimos: 100 })).rejects.toThrow();
    await expect(insertar({ tasaCentesimasDePunto: 10001 })).rejects.toThrow();
    await expect(insertar({ tasaCentesimasDePunto: -1 })).rejects.toThrow();
    await expect(insertar({ tasaCentesimasDePunto: null, importeCentimos: 0 })).rejects.toThrow();
    await expect(insertar({ fuenteOficial: "   " })).rejects.toThrow();
    await expect(insertar({ fuenteOficial: "x".repeat(501) })).rejects.toThrow();
    await expect(insertar({ vigenteDesde: "1980-01-02", reemplazadaEn: new Date() })).rejects.toThrow();
    await expect(insertar({ activadaPorId: randomUUID() })).rejects.toThrow();
  });

  it("solo una versión activa por código y fecha: la repetida se rechaza y la historia no se reescribe", async () => {
    await activar("onp_tasa", "13", "1990-01-01");
    await expect(activar("onp_tasa", "14", "1990-01-01")).rejects.toThrow("use «Corregir»");
    await expect(activar("centro_de_costo", "14", "1990-01-01")).rejects.toThrow("Elija el valor legal");
    expect(await consultarReglaVigente(repositorio, finanzas, "onp_tasa", "1990-01-01")).toMatchObject({ regla: { valor: 1300 } });
  });

  it("dos activaciones simultáneas de la misma vigencia dejan una sola", async () => {
    const resultados = await Promise.allSettled([activar("afp_prima_seguro", "1,37", "1991-01-01"), activar("afp_prima_seguro", "1,40", "1991-01-01")]);

    expect(resultados.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(resultados.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const delCodigo = await db.select().from(schema.reglasLegales).where(eq(schema.reglasLegales.codigo, "afp_prima_seguro"));
    expect(delCodigo.filter(({ vigenteDesde }) => vigenteDesde === "1991-01-01")).toHaveLength(1);
  });

  it("permite cargar la historia en desorden y deriva la vigencia de cada versión", async () => {
    await activar("afp_remuneracion_maxima_asegurable", "12000", "1993-01-01");
    await activar("afp_remuneracion_maxima_asegurable", "9000", "1991-01-01");
    await activar("afp_remuneracion_maxima_asegurable", "10500", "1992-01-01");

    const detalle = await consultarHistorialDeRegla(repositorio, finanzas, "afp_remuneracion_maxima_asegurable", "1999-06-01");
    expect(detalle!.historial.map(({ valor, vigenteDesde, vigenteHasta, estado }) => ({ valor, vigenteDesde, vigenteHasta, estado }))).toEqual([
      { valor: 900000, vigenteDesde: "1991-01-01", vigenteHasta: "1991-12-31", estado: "anterior" },
      { valor: 1050000, vigenteDesde: "1992-01-01", vigenteHasta: "1992-12-31", estado: "anterior" },
      { valor: 1200000, vigenteDesde: "1993-01-01", vigenteHasta: null, estado: "vigente" },
    ]);
  });

  it("corregir reemplaza con motivo en una sola transacción y conserva la historia", async () => {
    const errada = await activar("afp_aporte_obligatorio", "100", "1990-01-01");
    await expect(corregirReglaLegal(repositorio, finanzas, { reglaId: errada.id, valor: "10", motivo: "" })).rejects.toThrow("motivo");
    await corregirReglaLegal(repositorio, finanzas, { reglaId: errada.id, valor: "10", motivo: "Error de digitación" });
    await expect(corregirReglaLegal(repositorio, finanzas, { reglaId: errada.id, valor: "11", motivo: "Otra vez" })).rejects.toThrow("ya fue reemplazado");

    const detalle = await consultarHistorialDeRegla(repositorio, finanzas, "afp_aporte_obligatorio", "1999-06-01");
    expect(detalle!.historial.map(({ valor, estado, motivoDeReemplazo }) => ({ valor, estado, motivoDeReemplazo }))).toEqual([
      { valor: 10000, estado: "reemplazado", motivoDeReemplazo: "Error de digitación" },
      { valor: 1000, estado: "vigente", motivoDeReemplazo: null },
    ]);
    expect(await consultarReglaVigente(repositorio, finanzas, "afp_aporte_obligatorio", "1990-02-01")).toMatchObject({ regla: { valor: 1000, activadaPorId: cuentaFinanzas } });
  });

  it("el listado trae una fila por valor legal y marca los que no tienen regla vigente", async () => {
    const filas = await listarReglasLegales(repositorio, finanzas, { hoy: "1999-06-01" });
    expect(filas.find(({ definicion }) => definicion.codigo === "rmv")?.vigente).toMatchObject({ valor: 125075 });
    expect(filas.find(({ definicion }) => definicion.codigo === "horas_extra_sobretasa_horas_posteriores")?.vigente).toBeUndefined();
    expect(filas.length).toBeGreaterThan(10);
  });

  it("el Administrador del sistema recibe el rechazo del servidor y la base no cambia", async () => {
    const antes = await guardadas();
    await expect(activarReglaLegal(repositorio, administrador, { codigo: "rmv", valor: "9999", vigenteDesde: "1998-01-01", fuenteOficial: FUENTE })).rejects.toThrow("No tiene permiso");
    await expect(listarReglasLegales(repositorio, administrador, { hoy: "1999-06-01" })).rejects.toThrow("No tiene permiso");
    await expect(consultarReglaVigente(repositorio, administrador, "rmv", "1999-06-01")).rejects.toThrow("No tiene permiso");
    expect(await guardadas()).toHaveLength(antes.length);
  });
});
