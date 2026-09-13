import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { crearCasosDeUsoDeImportaciones } from "./casos-de-uso-servidor";
import type { ImportacionDeAsistencias, RepositorioDeImportaciones } from "./importar-semana-por-sede";
import { parsearArchivoHuellero, type FilaDeAsistenciaImportada } from "./parsear-archivo-huellero";

const filaValida: FilaDeAsistenciaImportada = {
  fila: 2, idHuellero: "HU-1024", sede: "Centro", fecha: "2026-09-01", entrada: "09:00", salida: "18:00",
};

function crearRepositorioEnMemoria(): { importaciones: ImportacionDeAsistencias[]; repositorio: RepositorioDeImportaciones } {
  const importaciones: ImportacionDeAsistencias[] = [];
  const repositorio: RepositorioDeImportaciones = {
    buscarColaborador: async (idHuellero) => idHuellero === "HU-1024" ? { idHuellero } : undefined,
    buscarSede: async (nombre) => nombre.trim().toLocaleLowerCase() === "centro" ? "Centro" : undefined,
    buscarTurnoPublicado: async (idHuellero, fecha) => idHuellero === "HU-1024" && fecha === "2026-09-01"
      ? { idHuellero, fecha, sede: "Centro", descanso: false, motivoNoAsistencia: null }
      : undefined,
    perteneceAPeriodoAbierto: async (fecha) => fecha !== "2026-08-31",
    guardar: async (importacion) => { importaciones.push(importacion); },
  };
  return { importaciones, repositorio };
}

function casosDeUso(repositorio: RepositorioDeImportaciones) {
  return crearCasosDeUsoDeImportaciones(repositorio, {
    obtenerActorActual: async () => ({ id: "administracion-1", rol: "administracion" }),
  });
}

describe("casos de uso de importaciones", () => {
  it("prevalida cada jornada y reúne todas las incidencias sin guardar nada", async () => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria();
    repositorio.buscarTurnoPublicado = async (idHuellero, fecha) => {
      if (idHuellero === "HU-1024" && fecha === "2026-09-03") return { idHuellero, fecha, sede: "Centro", descanso: true, motivoNoAsistencia: "feriado" };
      if (idHuellero === "HU-1024" && fecha === "2026-09-04") return { idHuellero, fecha, sede: "Norte", descanso: false, motivoNoAsistencia: null };
      return undefined;
    };

    const errores = await casosDeUso(repositorio).prevalidar({
      filas: [
        { ...filaValida, fila: 2, idHuellero: "DESCONOCIDO" },
        { ...filaValida, fila: 3, sede: "Sede inexistente" },
        { ...filaValida, fila: 4, fecha: "2026-09-02" },
        { ...filaValida, fila: 5, fecha: "2026-09-03" },
        { ...filaValida, fila: 6, fecha: "2026-09-04" },
        { ...filaValida, fila: 7, fecha: "2026-08-31" },
      ],
      erroresDelArchivo: [{ fila: 8, idHuellero: "HU-1024", fecha: "2026-09-01", motivo: "La jornada duplica la fila 2." }],
    });

    expect(errores).toEqual(expect.arrayContaining([
      expect.objectContaining({ fila: 2, motivo: "ID de huellero desconocido." }),
      expect.objectContaining({ fila: 3, motivo: "Sede desconocida." }),
      expect.objectContaining({ fila: 4, motivo: "No tiene horario publicado." }),
      expect.objectContaining({ fila: 5, motivo: "El horario publicado tiene Feriado planificado." }),
      expect.objectContaining({ fila: 6, motivo: "La sede no coincide con la del horario publicado." }),
      expect.objectContaining({ fila: 7, motivo: "El período de planilla está cerrado. Pida a Finanzas que lo reabra." }),
      expect.objectContaining({ fila: 8, motivo: "La jornada duplica la fila 2." }),
    ]));
    expect(importaciones).toEqual([]);
  });

  it("rechaza una salida que no es posterior a la entrada y no conserva el archivo", async () => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria();

    const errores = await casosDeUso(repositorio).prevalidar({
      filas: [{ ...filaValida, entrada: "18:00", salida: "09:00" }],
      erroresDelArchivo: [],
    });

    expect(errores).toEqual([expect.objectContaining({ motivo: "La salida debe ser posterior a la entrada." })]);
    expect(importaciones).toEqual([]);
  });

  it("recorre un XLSX y reúne los errores del archivo con los del horario", async () => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria();
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
      ["ID de huellero", "Sede", "Fecha", "Entrada", "Salida"],
      ["DESCONOCIDO", "Centro", "2026-09-01", "18:00", "09:00"],
      ["HU-1024", "Centro", "fecha-inválida", "09:00", "18:00"],
    ]), "Asistencias");
    const contenido = await parsearArchivoHuellero(new File([
      XLSX.write(libro, { bookType: "xlsx", type: "array" }),
    ], "asistencias.xlsx"));

    const errores = await casosDeUso(repositorio).prevalidar({
      filas: contenido.filas,
      erroresDelArchivo: contenido.errores,
    });

    expect(errores).toEqual(expect.arrayContaining([
      expect.objectContaining({ fila: 2, motivo: "ID de huellero desconocido." }),
      expect.objectContaining({ fila: 2, motivo: "La salida debe ser posterior a la entrada." }),
      expect.objectContaining({ fila: 3, motivo: "Fecha debe ser una fecha Excel o usar YYYY-MM-DD." }),
    ]));
    expect(importaciones).toEqual([]);
  });

  it("guarda una carga válida y conserva sus dos marcas crudas por jornada", async () => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria();
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
      ["ID de huellero", "Sede", "Fecha", "Entrada", "Salida"],
      ["HU-1024", "Centro", "2026-09-01", "09:00", "18:00"],
    ]), "Asistencias");
    const contenido = await parsearArchivoHuellero(new File([
      XLSX.write(libro, { bookType: "xlsx", type: "array" }),
    ], "asistencias.xlsx"));

    const resultado = await casosDeUso(repositorio).importar({
      filas: contenido.filas, erroresDelArchivo: contenido.errores,
      archivo: { nombre: "asistencias.xlsx", ubicacion: "importaciones/asistencias.xlsx", hashSha256: "abc123" },
    });

    expect(resultado).toEqual({ jornadas: 1 });
    expect(importaciones).toEqual([expect.objectContaining({
      usuarioId: "administracion-1",
      propuestas: [{ idHuellero: "HU-1024", fecha: "2026-09-01", estado: "pendiente", entradaPropuesta: "2026-09-01T09:00:00", salidaPropuesta: "2026-09-01T18:00:00" }],
      marcasCrudas: [
        { idHuellero: "HU-1024", sede: "Centro", fecha: "2026-09-01", instante: "2026-09-01T09:00:00" },
        { idHuellero: "HU-1024", sede: "Centro", fecha: "2026-09-01", instante: "2026-09-01T18:00:00" },
      ],
    })]);
  });
});
