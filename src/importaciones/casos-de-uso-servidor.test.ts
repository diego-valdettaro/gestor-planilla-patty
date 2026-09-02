import { describe, expect, it } from "vitest";

import { crearCasosDeUsoDeImportaciones } from "./casos-de-uso-servidor";
import type {
  AsistenciaPendiente,
  ImportacionSemanal,
  RepositorioDeImportaciones,
} from "./importar-semana-por-sede";

function crearRepositorioEnMemoria(): {
  asistencias: Array<AsistenciaPendiente | { idHuellero: string; fecha: string; estado: "confirmada"; entradaReal: string; salidaReal: string }>;
  importaciones: ImportacionSemanal[];
  repositorio: RepositorioDeImportaciones;
} {
  const asistencias: AsistenciaPendiente[] = [
    { idHuellero: "HU-1024", fecha: "2026-09-01", estado: "pendiente" },
  ];
  const importaciones: ImportacionSemanal[] = [];

  return {
    asistencias,
    importaciones,
    repositorio: {
      buscarColaborador: async (idHuellero) =>
        idHuellero === "HU-1024" ? { idHuellero, sede: "Lima" } : undefined,
      buscarTurnoPublicado: async (idHuellero, fecha) =>
        idHuellero === "HU-1024" && fecha === "2026-09-01" ? { idHuellero, fecha } : undefined,
      perteneceAPeriodoAbierto: async (fecha) => fecha >= "2026-08-26" && fecha <= "2026-09-25",
      guardar: async (importacion) => {
        importaciones.push(importacion);
        for (const propuesta of importacion.propuestas) {
          const indice = asistencias.findIndex(
            (asistencia) => asistencia.idHuellero === propuesta.idHuellero && asistencia.fecha === propuesta.fecha,
          );
          if (indice >= 0 && asistencias[indice].estado === "pendiente") {
            asistencias[indice] = propuesta;
          }
        }
      },
    },
  };
}

describe("casos de uso de importaciones en el servidor", () => {
  it("conserva la importación y propone primera y última marca para una asistencia pendiente", async () => {
    const { asistencias, importaciones, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeImportaciones(repositorio, {
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administracion" }),
    });

    await casosDeUso.importar({
      sede: "Lima",
      semana: "2026-08-31",
      archivo: { nombre: "huellero.csv", ubicacion: "importaciones/archivo.csv", hashSha256: "abc123" },
      marcasCrudas: [
        { idHuellero: "HU-1024", fecha: "2026-09-01", instante: "2026-09-01T09:04:00-05:00" },
        { idHuellero: "HU-1024", fecha: "2026-09-01", instante: "2026-09-01T18:02:00-05:00" },
      ],
    });

    expect(importaciones).toHaveLength(1);
    expect(importaciones[0]).toMatchObject({
      sede: "Lima",
      semana: "2026-08-31",
      usuarioId: "administracion-1",
      archivo: { nombre: "huellero.csv", hashSha256: "abc123" },
    });
    expect(asistencias).toEqual([
      {
        idHuellero: "HU-1024",
        fecha: "2026-09-01",
        estado: "pendiente",
        entradaPropuesta: "2026-09-01T09:04:00-05:00",
        salidaPropuesta: "2026-09-01T18:02:00-05:00",
      },
    ]);
  });

  it("deja pendiente una asistencia con una sola marca o con cantidad impar", async () => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeImportaciones(repositorio, {
      obtenerActorActual: async () => ({ id: "finanzas-1", rol: "finanzas" }),
    });

    await casosDeUso.importar({
      sede: "Lima",
      semana: "2026-08-31",
      archivo: { nombre: "huellero.csv", ubicacion: "importaciones/archivo.csv", hashSha256: "abc123" },
      marcasCrudas: [
        { idHuellero: "HU-1024", fecha: "2026-09-01", instante: "2026-09-01T09:04:00-05:00" },
        { idHuellero: "HU-1024", fecha: "2026-09-01", instante: "2026-09-01T12:00:00-05:00" },
        { idHuellero: "HU-1024", fecha: "2026-09-01", instante: "2026-09-01T18:02:00-05:00" },
      ],
    });

    expect(importaciones[0].propuestas).toEqual([
      { idHuellero: "HU-1024", fecha: "2026-09-01", estado: "pendiente" },
    ]);
  });

  it("registra una incidencia para un ID de huellero desconocido sin crear colaborador", async () => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeImportaciones(repositorio, {
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administracion" }),
    });

    await casosDeUso.importar({
      sede: "Lima",
      semana: "2026-08-31",
      archivo: { nombre: "huellero.csv", ubicacion: "importaciones/archivo.csv", hashSha256: "abc123" },
      marcasCrudas: [{ idHuellero: "DESCONOCIDO", fecha: "2026-09-01", instante: "2026-09-01T09:00:00-05:00" }],
    });

    expect(importaciones[0].incidencias).toEqual([
      { idHuellero: "DESCONOCIDO", fecha: "2026-09-01", motivo: "ID de huellero desconocido." },
    ]);
  });

  it("deja pendiente una marca sin turno publicado", async () => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeImportaciones(repositorio, {
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administracion" }),
    });

    await casosDeUso.importar({
      sede: "Lima",
      semana: "2026-08-31",
      archivo: { nombre: "huellero.csv", ubicacion: "importaciones/archivo.csv", hashSha256: "abc123" },
      marcasCrudas: [
        { idHuellero: "HU-1024", fecha: "2026-09-02", instante: "2026-09-02T09:00:00-05:00" },
        { idHuellero: "HU-1024", fecha: "2026-09-02", instante: "2026-09-02T18:00:00-05:00" },
      ],
    });

    expect(importaciones[0].marcasPendientesSinTurno).toEqual([
      {
        idHuellero: "HU-1024",
        fecha: "2026-09-02",
        estado: "pendiente",
        entradaPropuesta: "2026-09-02T09:00:00-05:00",
        salidaPropuesta: "2026-09-02T18:00:00-05:00",
      },
    ]);
  });

  it("conserva pendiente una asistencia esperada que no recibe marcas", async () => {
    const { asistencias, importaciones, repositorio } = crearRepositorioEnMemoria();
    const casosDeUso = crearCasosDeUsoDeImportaciones(repositorio, {
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administracion" }),
    });

    await casosDeUso.importar({
      sede: "Lima",
      semana: "2026-08-31",
      archivo: { nombre: "huellero.csv", ubicacion: "importaciones/archivo.csv", hashSha256: "abc123" },
      marcasCrudas: [],
    });

    expect(importaciones[0].propuestas).toEqual([]);
    expect(asistencias).toEqual([{ idHuellero: "HU-1024", fecha: "2026-09-01", estado: "pendiente" }]);
  });

  it("no sobrescribe una asistencia confirmada durante una nueva importación", async () => {
    const { asistencias, repositorio } = crearRepositorioEnMemoria();
    asistencias[0] = {
      idHuellero: "HU-1024", fecha: "2026-09-01", estado: "confirmada",
      entradaReal: "2026-09-01T09:03:00-05:00", salidaReal: "2026-09-01T18:01:00-05:00",
    };
    const casosDeUso = crearCasosDeUsoDeImportaciones(repositorio, {
      obtenerActorActual: async () => ({ id: "administracion-1", rol: "administracion" }),
    });

    await casosDeUso.importar({
      sede: "Lima", semana: "2026-08-31",
      archivo: { nombre: "huellero.csv", ubicacion: "importaciones/archivo.csv", hashSha256: "abc123" },
      marcasCrudas: [
        { idHuellero: "HU-1024", fecha: "2026-09-01", instante: "2026-09-01T09:10:00-05:00" },
        { idHuellero: "HU-1024", fecha: "2026-09-01", instante: "2026-09-01T18:10:00-05:00" },
      ],
    });

    expect(asistencias).toEqual([{
      idHuellero: "HU-1024", fecha: "2026-09-01", estado: "confirmada",
      entradaReal: "2026-09-01T09:03:00-05:00", salidaReal: "2026-09-01T18:01:00-05:00",
    }]);
  });
});
