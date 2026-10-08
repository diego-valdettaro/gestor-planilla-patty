import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as XLSX from "xlsx";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import { dniDePrueba } from "@/colaboradores/dni-de-prueba";
import * as schema from "@/db/schema";
import type { ArchivoFuente } from "@/importaciones/importar-semana-por-sede";

import { confirmarFuente, consultarEstadoDeFuentes, consultarFuente, registrarImporte } from "./gestionar-fuentes-externas";
import { ErroresDeImportacionDeFuente, importarFuente, previsualizarImportacionDeFuente, type AlmacenamientoDeArchivos } from "./importar-fuente";
import { ENCABEZADOS_DE_FUENTE, HOJA_DE_IMPORTES } from "./parsear-archivo-de-fuente";
import { RepositorioPostgresDeFuentesExternas } from "./repositorio-postgres";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl && process.env.CI) throw new Error("CI requiere TEST_DATABASE_URL para ejecutar las pruebas de integración PostgreSQL.");

function libro(...filas: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...ENCABEZADOS_DE_FUENTE], ...filas]), HOJA_DE_IMPORTES);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

// Los archivos fuente son sintéticos y se conservan en un directorio temporal. Los meses son de 2001, que ningún dato toca.
describe.skipIf(!databaseUrl)("importar fuentes externas desde un XLSX (integración PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  const repositorio = new RepositorioPostgresDeFuentesExternas(db);
  const sufijo = randomUUID();
  const grupo = `Grupo importar ${sufijo}`;
  const sede = `Sede importar ${sufijo}`;
  const cuentaFinanzas = randomUUID();
  const finanzas: Actor = { id: cuentaFinanzas, rol: "finanzas", nombreUsuario: "finanzas-prueba" };
  const ana = dniDePrueba();
  const beto = dniDePrueba();
  const MES = "2001-10";
  const TIPO = "comisiones_de_ventas";
  let directorio: string;

  const almacenamiento: AlmacenamientoDeArchivos = {
    conservar: async (nombre, contenido): Promise<ArchivoFuente> => {
      const ubicacion = join(directorio, `${randomUUID()}.xlsx`);
      await writeFile(ubicacion, contenido);
      return { nombre, ubicacion, hashSha256: createHash("sha256").update(contenido).digest("hex") };
    },
    descartar: async (archivo) => { await rm(archivo.ubicacion, { force: true }); },
  };
  const comision = (dni: string, monto: number, fecha = "2001-09-28") => [dni, "comision_de_ventas", fecha, "2001-09", monto];
  const importar = (contenido: Uint8Array, nombre = "comisiones.xlsx", cambios: { tipoDeFuente?: string; mes?: string } = {}) =>
    importarFuente(repositorio, finanzas, { tipoDeFuente: TIPO, mes: MES, nombre, contenido, ...cambios }, almacenamiento);
  const importesDeLaPrueba = () => db.select().from(schema.importesExternos).where(inArray(schema.importesExternos.dni, [ana, beto]));
  const importacionesDeLaPrueba = () => db.select().from(schema.importacionesDeFuente).where(eq(schema.importacionesDeFuente.usuarioId, cuentaFinanzas));

  beforeAll(async () => {
    directorio = await mkdtemp(join(tmpdir(), "fuentes-"));
    await db.insert(schema.cuentasLocales).values({ id: cuentaFinanzas, nombreUsuario: `finanzas-${cuentaFinanzas}`, hashContrasena: "prueba", rol: "finanzas" });
    await db.insert(schema.grupos).values({ nombre: grupo });
    await db.insert(schema.sedes).values({ nombre: sede, activa: true, grupo });
    await db.insert(schema.colaboradores).values([
      { dni: ana, nombre: "Ana Importada", sede, grupo, activo: true },
      { dni: beto, nombre: "Beto Importado", sede, grupo, activo: true },
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.importesExternos).where(inArray(schema.importesExternos.dni, [ana, beto]));
    await db.delete(schema.confirmacionesDeFuente).where(eq(schema.confirmacionesDeFuente.confirmadaPorId, cuentaFinanzas));
    await db.delete(schema.importacionesDeFuente).where(eq(schema.importacionesDeFuente.usuarioId, cuentaFinanzas));
    await db.delete(schema.colaboradores).where(inArray(schema.colaboradores.dni, [ana, beto]));
    await db.delete(schema.sedes).where(eq(schema.sedes.nombre, sede));
    // Otras pruebas aprueban todos los grupos de la base, también los que crea esta: sin esto el borrado falla según el orden de ejecución.
    await db.delete(schema.aprobacionesDeAsistencia).where(eq(schema.aprobacionesDeAsistencia.grupo, grupo));
    await db.delete(schema.grupos).where(eq(schema.grupos.nombre, grupo));
    await db.delete(schema.cuentasLocales).where(eq(schema.cuentasLocales.id, cuentaFinanzas));
    await rm(directorio, { recursive: true, force: true });
    await pool.end();
  });

  it("un archivo válido crea los importes y conserva archivo, hash, responsable, tipo, mes y validación", async () => {
    const contenido = libro(comision(ana, 25050), comision(beto, 100));

    const resultado = await importar(contenido);

    expect(resultado).toMatchObject({ filas: 2, total: 2515000 });
    const [guardada] = await importacionesDeLaPrueba();
    expect(guardada).toMatchObject({
      id: resultado.importacion.id, tipoDeFuente: TIPO, mesDeAplicacion: MES, archivoNombre: "comisiones.xlsx", usuarioId: cuentaFinanzas, filas: 2,
      totalCentimos: 2515000, validacion: { filasValidas: 2, filasConError: 0, duplicadas: 0, personasDesconocidas: 0 }, reemplazadaEn: null,
    });
    expect(guardada.importadaEn).toBeInstanceOf(Date);
    expect(guardada.archivoHashSha256).toBe(createHash("sha256").update(contenido).digest("hex"));
    expect(Buffer.from(await readFile(guardada.archivoUbicacion)).equals(Buffer.from(contenido))).toBe(true);

    const importes = await importesDeLaPrueba();
    expect(importes).toHaveLength(2);
    expect(importes).toEqual(expect.arrayContaining([
      expect.objectContaining({ dni: ana, concepto: "comision_de_ventas", tipoDeFuente: TIPO, fechaDelHecho: "2001-09-28", mesDeDevengue: "2001-09", mesDeAplicacion: MES, montoCentimos: 2505000, procedencia: "archivo:comisiones.xlsx", importacionId: guardada.id, registradoPorId: cuentaFinanzas }),
    ]));
    const detalle = await consultarFuente(repositorio, finanzas, TIPO, MES);
    expect(detalle).toMatchObject({ estado: "pendiente", filas: 2, ultimoOrigen: { procedencia: "archivo:comisiones.xlsx", importacionId: guardada.id } });
  });

  it("importar otra vez el mismo archivo se detecta y no cambia nada", async () => {
    const contenido = libro(comision(ana, 25050), comision(beto, 100));

    await expect(importar(contenido, "copia.xlsx")).rejects.toThrow(/Este archivo ya se importó.*comisiones\.xlsx/s);
    expect((await previsualizarImportacionDeFuente(repositorio, finanzas, { tipoDeFuente: TIPO, mes: MES, nombre: "copia.xlsx", contenido })).errorDelArchivo).toMatch(/ya se importó/);

    expect(await importesDeLaPrueba()).toHaveLength(2);
    expect(await importacionesDeLaPrueba()).toHaveLength(1);
  });

  it("un archivo con errores o duplicados no crea nada: ni filas, ni registro, ni archivo conservado", async () => {
    const archivosAntes = (await importacionesDeLaPrueba()).length;
    const duplicada = libro(comision(ana, 25050), comision(beto, 5), comision(beto, 5));
    const desconocida = libro(comision(beto, 7), ["00000001", "comision_de_ventas", "2001-09-28", "2001-09", 5]);

    for (const contenido of [duplicada, desconocida]) {
      const error = await importar(contenido, "malo.xlsx").catch((causa: unknown) => causa);
      expect(error).toBeInstanceOf(ErroresDeImportacionDeFuente);
    }

    expect(await importesDeLaPrueba()).toHaveLength(2);
    expect(await importacionesDeLaPrueba()).toHaveLength(archivosAntes);
    expect(await readdirDelDirectorio()).toHaveLength(archivosAntes);
  });

  it("la base impide dos importaciones vigentes del mismo tipo y mes, y rechaza un hash mal formado", async () => {
    const [existente] = await importacionesDeLaPrueba();
    const { id: _id, importadaEn: _importadaEn, ...fila } = existente;

    await expect(db.insert(schema.importacionesDeFuente).values(fila)).rejects.toThrow();
    await expect(db.insert(schema.importacionesDeFuente).values({ ...fila, mesDeAplicacion: "2001-11", archivoHashSha256: "no-es-un-hash" })).rejects.toThrow();
    await expect(db.insert(schema.importacionesDeFuente).values({ ...fila, mesDeAplicacion: "2001-11", filas: 0 })).rejects.toThrow();
    expect(await importacionesDeLaPrueba()).toHaveLength(1);
  });

  it("un archivo distinto reemplaza al anterior: anula sus filas con motivo, conserva su archivo y devuelve la fuente a Pendiente", async () => {
    await registrarImporte(repositorio, finanzas, { tipoDeFuente: TIPO, dni: beto, concepto: "comision_de_ventas", fechaDelHecho: "2001-09-01", mesDeDevengue: "2001-09", mesDeAplicacion: MES, monto: "30" });
    await confirmarFuente(repositorio, finanzas, { tipoDeFuente: TIPO, mes: MES });
    const [anterior] = await importacionesDeLaPrueba();

    const resultado = await importar(libro(comision(ana, 99900)), "segundo.xlsx");

    expect(resultado).toMatchObject({ volvioAPendiente: true, reemplazo: { id: anterior.id, importesAnulados: 2 } });
    const importes = await importesDeLaPrueba();
    const vigentes = importes.filter((importe) => importe.anuladoEn === null);
    expect(vigentes.map((importe) => [importe.dni, importe.montoCentimos, importe.procedencia]).sort()).toEqual([[ana, 9990000, "archivo:segundo.xlsx"], [beto, 3000, "carga_manual"]].sort());
    const anulados = importes.filter((importe) => importe.anuladoEn !== null);
    expect(anulados).toHaveLength(2);
    expect(anulados.every((importe) => importe.importacionId === anterior.id && /^Reemplazado por el archivo segundo\.xlsx \([0-9a-f]{8}\)$/.test(importe.motivoDeAnulacion ?? ""))).toBe(true);

    const importaciones = await importacionesDeLaPrueba();
    expect(importaciones).toHaveLength(2);
    expect(importaciones.find((importacion) => importacion.id === anterior.id)?.reemplazadaEn).toBeInstanceOf(Date);
    expect((await stat(anterior.archivoUbicacion)).isFile()).toBe(true);
    expect((await consultarEstadoDeFuentes(repositorio, finanzas, MES)).find((fila) => fila.tipo.codigo === TIPO)).toMatchObject({ estado: "pendiente", filas: 2 });
  });

  it("dos importaciones simultáneas de archivos distintos dejan una sola vigente", async () => {
    const resultados = await Promise.allSettled([
      importar(libro(comision(ana, 111)), "a.xlsx", { mes: "2001-11" }),
      importar(libro(comision(beto, 222)), "b.xlsx", { mes: "2001-11" }),
    ]);

    expect(resultados.filter((resultado) => resultado.status === "fulfilled")).toHaveLength(2);
    const vigentes = (await importacionesDeLaPrueba()).filter((importacion) => importacion.mesDeAplicacion === "2001-11" && importacion.reemplazadaEn === null);
    expect(vigentes).toHaveLength(1);
    expect((await importesDeLaPrueba()).filter((importe) => importe.mesDeAplicacion === "2001-11" && importe.anuladoEn === null)).toHaveLength(1);
  });

  async function readdirDelDirectorio() {
    const { readdir } = await import("node:fs/promises");
    return readdir(directorio);
  }
});
