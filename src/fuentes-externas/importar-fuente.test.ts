import { createHash } from "node:crypto";

import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "@/autenticacion/permisos";
import type { ArchivoFuente } from "@/importaciones/importar-semana-por-sede";

import { confirmarFuente, registrarImporte } from "./gestionar-fuentes-externas";
import { ErroresDeImportacionDeFuente, importarFuente, previsualizarImportacionDeFuente, type AlmacenamientoDeArchivos } from "./importar-fuente";
import { ENCABEZADOS_DE_FUENTE, HOJA_DE_IMPORTES } from "./parsear-archivo-de-fuente";
import { crearRepositorioEnMemoria } from "./repositorio-en-memoria";

// Datos sintéticos: DNI inventados e importes pequeños; los XLSX se arman en memoria.
const finanzas: Actor = { id: "fin-1", rol: "finanzas" };
const otrosRoles: Array<[string, Actor]> = [
  ["el Administrador del sistema", { id: "adm-1", rol: "administrador" }],
  ["un gerente de área", { id: "ger-1", rol: "gerente_de_area", grupos: [{ nombre: "Tiendas", gestionaAsistencia: true }] }],
  ["Recursos Humanos", { id: "rrhh-1", rol: "recursos_humanos" }],
];
const ANA = "11111111";
const BETO = "22222222";
const MES = "2026-10";
const TIPO = "comisiones_de_ventas";

function libro(...filas: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...ENCABEZADOS_DE_FUENTE], ...filas]), HOJA_DE_IMPORTES);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}
const hash = (contenido: Uint8Array) => createHash("sha256").update(contenido).digest("hex");
const comision = (dni: string, monto: number | string, fecha = "2026-09-28") => [dni, "comision_de_ventas", fecha, "2026-09", monto];

describe("importar un XLSX normalizado de una fuente externa", () => {
  let contexto: ReturnType<typeof crearRepositorioEnMemoria>;
  let conservados: ArchivoFuente[];
  let descartados: ArchivoFuente[];
  let almacenamiento: AlmacenamientoDeArchivos;

  beforeEach(() => {
    contexto = crearRepositorioEnMemoria({ [ANA]: "Ana Sintética", [BETO]: "Beto Sintético" });
    conservados = [];
    descartados = [];
    almacenamiento = {
      conservar: async (nombre, contenido) => {
        const archivo = { nombre, ubicacion: `/almacen/${conservados.length}-${nombre}`, hashSha256: hash(contenido) };
        conservados.push(archivo);
        return archivo;
      },
      descartar: async (archivo) => { descartados.push(archivo); },
    };
  });

  const solicitud = (contenido: Uint8Array, cambios: Partial<Parameters<typeof importarFuente>[2]> = {}) => ({ tipoDeFuente: TIPO, mes: MES, nombre: "comisiones.xlsx", contenido, ...cambios });
  const importar = (contenido: Uint8Array, cambios: Partial<Parameters<typeof importarFuente>[2]> = {}, actor = finanzas) => importarFuente(contexto.repositorio, actor, solicitud(contenido, cambios), almacenamiento);
  const previsualizar = (contenido: Uint8Array, cambios: Partial<Parameters<typeof importarFuente>[2]> = {}, actor = finanzas) => previsualizarImportacionDeFuente(contexto.repositorio, actor, solicitud(contenido, cambios));
  const rechazo = async (contenido: Uint8Array, cambios: Partial<Parameters<typeof importarFuente>[2]> = {}) => {
    const error = await importar(contenido, cambios).catch((causa: unknown) => causa);
    expect(error).toBeInstanceOf(Error);
    return error as Error;
  };

  describe("un archivo válido", () => {
    it("crea los importes externos con su procedencia, devengue y mes de aplicación, y conserva el archivo", async () => {
      const contenido = libro(comision(ANA, "250,50"), ["22222222", "Comisión de ventas", "2026-10-02", "2026-10", 100]);

      const resultado = await importar(contenido);

      expect(resultado).toMatchObject({ filas: 2, total: 35050, volvioAPendiente: false, reemplazo: undefined });
      expect(contexto.importes()).toMatchObject([
        { dni: ANA, concepto: "comision_de_ventas", tipoDeFuente: TIPO, fechaDelHecho: "2026-09-28", mesDeDevengue: "2026-09", mesDeAplicacion: MES, monto: 25050, procedencia: "archivo:comisiones.xlsx", registradoPorId: "fin-1", importacionId: resultado.importacion.id },
        { dni: BETO, concepto: "comision_de_ventas", fechaDelHecho: "2026-10-02", mesDeDevengue: "2026-10", mesDeAplicacion: MES, monto: 10000, procedencia: "archivo:comisiones.xlsx", importacionId: resultado.importacion.id },
      ]);
    });

    it("guarda archivo, hash, responsable, tipo, mes y el resultado de la validación para la auditoría", async () => {
      const contenido = libro(comision(ANA, 100), comision(BETO, 50));

      const { importacion } = await importar(contenido);

      expect(conservados).toHaveLength(1);
      expect(contexto.importaciones()).toEqual([expect.objectContaining({
        id: importacion.id, tipoDeFuente: TIPO, mesDeAplicacion: MES, archivoNombre: "comisiones.xlsx", archivoUbicacion: conservados[0].ubicacion,
        archivoHashSha256: hash(contenido), usuarioId: "fin-1", filas: 2, total: 15000, reemplazadaEn: null,
        validacion: { filasValidas: 2, filasConError: 0, duplicadas: 0, personasDesconocidas: 0 },
      })]);
      expect(importacion.importadaEn).toBeInstanceOf(Date);
    });

    it("acepta el código o el nombre del concepto de los que admite el tipo", async () => {
      const contenido = libro(["11111111", "gratificacion_legal", "2026-07-15", "2026-07", 800], ["22222222", "Bonificación extraordinaria", "2026-07-15", "2026-07", 72]);

      await importar(contenido, { tipoDeFuente: "gratificacion_y_bonificacion" });

      expect(contexto.importes().map((importe) => importe.concepto)).toEqual(["gratificacion_legal", "bonificacion_extraordinaria"]);
    });

    it("importar no confirma la fuente, y si estaba confirmada la devuelve a Pendiente", async () => {
      await importar(libro(comision(ANA, 100)));
      expect(contexto.confirmaciones()).toEqual([]);

      await confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente: TIPO, mes: MES });
      const resultado = await importar(libro(comision(ANA, 200)));

      expect(resultado.volvioAPendiente).toBe(true);
      expect(contexto.confirmaciones()).toEqual([]);
    });

    it("la vista previa cuenta filas válidas y total sin guardar nada", async () => {
      const vista = await previsualizar(libro(comision(ANA, "10,25"), comision(BETO, 5)));

      expect(vista).toMatchObject({ errores: [], resumen: { filasValidas: 2, filasConError: 0, duplicadas: 0, personasDesconocidas: 0, total: 1525 }, reemplaza: undefined });
      expect(contexto.importes()).toEqual([]);
      expect(contexto.importaciones()).toEqual([]);
      expect(conservados).toEqual([]);
    });
  });

  describe("un archivo inválido se rechaza completo y no crea nada", () => {
    const sinEfectos = () => {
      expect(contexto.importes()).toEqual([]);
      expect(contexto.importaciones()).toEqual([]);
      expect(conservados).toEqual(descartados);
    };

    it("informa cada fila con error y no importa ni las filas buenas", async () => {
      const contenido = libro(
        comision(ANA, 100),
        ["99999999", "comision_de_ventas", "2026-09-28", "2026-09", 10],
        [BETO, "horas_extra_25", "2026-09-28", "2026-09", 10],
        [BETO, "adelanto", "2026-09-28", "2026-09", 10],
        [BETO, "no_existe", "2026-09-28", "2026-09", 10],
        ["123", "comision_de_ventas", "2026-09-28", "2026-09", 10],
      );

      const error = await rechazo(contenido);

      expect(error).toBeInstanceOf(ErroresDeImportacionDeFuente);
      expect((error as ErroresDeImportacionDeFuente).errores.map(({ fila, dni, motivo }) => [fila, dni, motivo])).toEqual([
        [3, "99999999", "DNI desconocido: no existe una persona con ese DNI."],
        [4, BETO, expect.stringContaining("línea calculada")],
        [5, BETO, expect.stringContaining("no se importa en Comisiones de ventas")],
        [6, BETO, expect.stringContaining("Concepto desconocido")],
        [7, "123", "El DNI debe tener exactamente 8 dígitos."],
      ]);
      sinEfectos();
    });

    it("la vista previa muestra los conteos, con las filas con error fuera del total", async () => {
      const vista = await previsualizar(libro(comision(ANA, 100), ["99999999", "comision_de_ventas", "2026-09-28", "2026-09", 10], comision(BETO, 0)));

      expect(vista).toMatchObject({ resumen: { filasValidas: 1, filasConError: 2, duplicadas: 0, personasDesconocidas: 1, total: 10000 } });
      expect(vista.errores).toHaveLength(2);
    });

    it("«Personas desconocidas» cuenta personas distintas, no filas", async () => {
      const vista = await previsualizar(libro(["99999999", "comision_de_ventas", "2026-09-28", "2026-09", 5], ["99999999", "comision_de_ventas", "2026-09-29", "2026-09", 5], comision(ANA, 1)));

      expect(vista.resumen).toMatchObject({ filasValidas: 1, filasConError: 2, personasDesconocidas: 1 });
    });

    it("rechaza el archivo ilegible, sin hoja, sin encabezados o sin filas con un error del archivo", async () => {
      expect((await previsualizar(new TextEncoder().encode("texto"))).errorDelArchivo).toMatch(/No se pudo leer/);
      expect((await previsualizar(libro(), {})).errorDelArchivo).toMatch(/no tiene filas/);
      expect((await rechazo(libro(), {})).message).toMatch(/no tiene filas/);
      expect((await rechazo(libro(comision(ANA, 1)), { nombre: "comisiones.csv" })).message).toMatch(/extensión \.xlsx/);
      sinEfectos();
    });

    it("rechaza un tipo de fuente o un mes que no existen", async () => {
      expect((await rechazo(libro(comision(ANA, 1)), { tipoDeFuente: "otro" })).message).toMatch(/Elija el tipo de fuente/);
      expect((await rechazo(libro(comision(ANA, 1)), { mes: "2026-13" })).message).toMatch(/mes de pago no es válido/);
      sinEfectos();
    });

    it("rechaza el archivo si el mes de pago ya está finalizado", async () => {
      contexto.mesesFinalizados.add(MES);

      expect((await rechazo(libro(comision(ANA, 1)))).message).toMatch(/ya está finalizado/);
      sinEfectos();
    });

    it("descarta el archivo conservado si la importación falla después de guardarlo", async () => {
      const original = contexto.repositorio.ejecutarSobreFuente;
      contexto.repositorio.ejecutarSobreFuente = (tipo, mes, operacion) => original(tipo, mes, async (almacen) => {
        const resultado = await operacion(almacen);
        throw new Error("falló el commit");
        return resultado;
      });

      await expect(importar(libro(comision(ANA, 1)))).rejects.toThrow("falló el commit");

      expect(conservados).toHaveLength(1);
      expect(descartados).toEqual(conservados);
      expect(contexto.importes()).toEqual([]);
      expect(contexto.importaciones()).toEqual([]);
    });

    it.each(otrosRoles)("%s no previsualiza ni importa", async (_nombre, actor) => {
      await expect(importar(libro(comision(ANA, 1)), {}, actor)).rejects.toThrow(/No tiene permiso/);
      await expect(previsualizar(libro(comision(ANA, 1)), {}, actor)).rejects.toThrow(/No tiene permiso/);
      sinEfectos();
    });
  });

  describe("duplicados", () => {
    it("importar dos veces el mismo archivo se detecta y no duplica nada", async () => {
      const contenido = libro(comision(ANA, 100));
      await importar(contenido);

      const error = await rechazo(contenido, { nombre: "copia.xlsx" });

      expect(error.message).toMatch(/Este archivo ya se importó.*comisiones\.xlsx.*fin-1/s);
      expect((await previsualizar(contenido)).errorDelArchivo).toMatch(/Este archivo ya se importó/);
      expect(contexto.importes()).toHaveLength(1);
      expect(contexto.importaciones()).toHaveLength(1);
    });

    it("el mismo archivo se puede importar de nuevo si se anularon todos sus importes", async () => {
      const contenido = libro(comision(ANA, 100));
      const { importacion } = await importar(contenido);
      Object.assign(contexto.importes()[0], { anuladoEn: new Date(), motivoDeAnulacion: "Se anuló a mano" });

      const segunda = await importar(contenido);

      expect(segunda.importacion.id).not.toBe(importacion.id);
      expect(contexto.importes().filter((importe) => importe.anuladoEn === null)).toHaveLength(1);
    });

    it("una fila repetida dentro del archivo es un error de la segunda fila y cuenta como duplicada", async () => {
      const contenido = libro(comision(ANA, 100), comision(BETO, 20), comision(ANA, "100,00"));

      const vista = await previsualizar(contenido);

      expect(vista.errores).toEqual([{ fila: 4, dni: ANA, motivo: "Duplicada: repite la fila 2 del archivo." }]);
      expect(vista.resumen).toMatchObject({ filasValidas: 2, filasConError: 1, duplicadas: 1, total: 12000 });
      await expect(importar(contenido)).rejects.toBeInstanceOf(ErroresDeImportacionDeFuente);
      expect(contexto.importes()).toEqual([]);
    });

    it("una fila igual a un importe cargado a mano es duplicada y no se importa", async () => {
      await registrarImporte(contexto.repositorio, finanzas, { tipoDeFuente: TIPO, dni: ANA, concepto: "comision_de_ventas", fechaDelHecho: "2026-09-28", mesDeDevengue: "2026-09", mesDeAplicacion: MES, monto: "100" });

      const vista = await previsualizar(libro(comision(ANA, 100), comision(BETO, 5)));

      expect(vista.errores).toEqual([{ fila: 2, dni: ANA, motivo: "Duplicada: ya existe ese importe cargado en esta fuente para el mes de pago." }]);
      expect(vista.resumen).toMatchObject({ duplicadas: 1, filasValidas: 1 });
      await expect(importar(libro(comision(ANA, 100), comision(BETO, 5)))).rejects.toBeInstanceOf(ErroresDeImportacionDeFuente);
      expect(contexto.importes()).toHaveLength(1);
    });
  });

  describe("reemplazo de un archivo anterior del mismo tipo y mes", () => {
    it("anula con motivo las filas del archivo anterior, conserva su registro y deja las filas manuales", async () => {
      await registrarImporte(contexto.repositorio, finanzas, { tipoDeFuente: TIPO, dni: BETO, concepto: "comision_de_ventas", fechaDelHecho: "2026-09-10", mesDeDevengue: "2026-09", mesDeAplicacion: MES, monto: "30" });
      const primera = await importar(libro(comision(ANA, 100), comision(ANA, 200, "2026-09-29")), { nombre: "primero.xlsx" });
      await confirmarFuente(contexto.repositorio, finanzas, { tipoDeFuente: TIPO, mes: MES });

      const vista = await previsualizar(libro(comision(ANA, 150)), { nombre: "segundo.xlsx" });
      expect(vista.reemplaza).toMatchObject({ archivoNombre: "primero.xlsx", importesVigentes: 2 });

      const segunda = await importar(libro(comision(ANA, 150)), { nombre: "segundo.xlsx" });

      expect(segunda).toMatchObject({ volvioAPendiente: true, reemplazo: { id: primera.importacion.id, importesAnulados: 2 } });
      const vigentes = contexto.importes().filter((importe) => importe.anuladoEn === null);
      expect(vigentes.map((importe) => [importe.dni, importe.monto, importe.procedencia])).toEqual([[BETO, 3000, "carga_manual"], [ANA, 15000, "archivo:segundo.xlsx"]]);
      const anulados = contexto.importes().filter((importe) => importe.anuladoEn !== null);
      expect(anulados).toHaveLength(2);
      expect(anulados[0].motivoDeAnulacion).toMatch(/^Reemplazado por el archivo segundo\.xlsx \([0-9a-f]{8}\)$/);
      expect(contexto.importaciones().map((importacion) => [importacion.archivoNombre, importacion.reemplazadaEn instanceof Date])).toEqual([["primero.xlsx", true], ["segundo.xlsx", false]]);
      expect(conservados.map((archivo) => archivo.nombre)).toEqual(["primero.xlsx", "segundo.xlsx"]);
      expect(descartados).toEqual([]);
    });

    it("el archivo nuevo puede repetir una fila del anterior, que se reemplaza", async () => {
      await importar(libro(comision(ANA, 100)), { nombre: "primero.xlsx" });

      await importar(libro(comision(ANA, 100), comision(BETO, 1)), { nombre: "segundo.xlsx" });

      expect(contexto.importes().filter((importe) => importe.anuladoEn === null).map((importe) => importe.dni)).toEqual([ANA, BETO]);
    });

    it("si el archivo nuevo se rechaza, el anterior sigue vigente", async () => {
      await importar(libro(comision(ANA, 100)), { nombre: "primero.xlsx" });

      await expect(importar(libro(["99999999", "comision_de_ventas", "2026-09-28", "2026-09", 1]), { nombre: "segundo.xlsx" })).rejects.toBeInstanceOf(ErroresDeImportacionDeFuente);

      expect(contexto.importes().filter((importe) => importe.anuladoEn === null)).toHaveLength(1);
      expect(contexto.importaciones()).toHaveLength(1);
      expect(contexto.importaciones()[0].reemplazadaEn).toBeNull();
    });

    it("las importaciones de otro tipo o de otro mes son independientes", async () => {
      await importar(libro(comision(ANA, 100)));

      await importar(libro(comision(ANA, 100)), { mes: "2026-11" });
      await importar(libro(["11111111", "adelanto", "2026-09-28", "2026-09", 100]), { tipoDeFuente: "adelantos" });

      expect(contexto.importes().filter((importe) => importe.anuladoEn === null)).toHaveLength(3);
      expect(contexto.importaciones().every((importacion) => importacion.reemplazadaEn === null)).toBe(true);
    });
  });
});
