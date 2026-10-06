import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { crearCasosDeUsoDeImportaciones } from "./casos-de-uso-servidor";
import type { AsistenciaExistente, ImportacionDeAsistencias, RepositorioDeImportaciones } from "./importar-semana-por-sede";
import { parsearArchivoHuellero, type FilaDeAsistenciaImportada } from "./parsear-archivo-huellero";

const filaValida: FilaDeAsistenciaImportada = {
  fila: 2, dni: "00001024", sede: "Centro", fecha: "2026-09-01", entrada: "09:00", salida: "18:00",
};

function crearRepositorioEnMemoria(existentes: AsistenciaExistente[] = []): {
  importaciones: ImportacionDeAsistencias[];
  repositorio: RepositorioDeImportaciones;
} {
  const importaciones: ImportacionDeAsistencias[] = [];
  const repositorio: RepositorioDeImportaciones = {
    buscarColaborador: async (dni) => dni === "00001024" ? { dni, grupo: "Tiendas" } : dni === "00002048" ? { dni, grupo: "Taller" } : undefined,
    buscarSede: async (nombre) => nombre.trim().toLocaleLowerCase() === "centro" ? "Centro" : undefined,
    buscarTurnoPublicado: async (dni, fecha) => (dni === "00001024" || dni === "00002048")
      ? { dni, fecha, sede: "Centro", descanso: false, motivoNoAsistencia: null }
      : undefined,
    perteneceAPeriodoAbierto: async (fecha) => fecha !== "2026-08-31",
    buscarAsistenciasExistentes: async (identidades) => existentes.filter((existente) =>
      identidades.some(({ dni, fecha }) => dni === existente.dni && fecha === existente.fecha)),
    guardar: async (importacion) => { importaciones.push(importacion); },
  };
  return { importaciones, repositorio };
}

function casosDeUso(repositorio: RepositorioDeImportaciones) {
  return crearCasosDeUsoDeImportaciones(repositorio, {
    obtenerActorActual: async () => ({ id: "administracion-1", rol: "administrador" }),
  });
}

describe("casos de uso de importaciones", () => {
  it("prevalida cada jornada y reúne todas las incidencias sin guardar nada", async () => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria();
    repositorio.buscarTurnoPublicado = async (dni, fecha) => {
      if (dni === "00001024" && fecha === "2026-09-03") return { dni, fecha, sede: "Centro", descanso: true, motivoNoAsistencia: "feriado" };
      if (dni === "00001024" && fecha === "2026-09-04") return { dni, fecha, sede: "Norte", descanso: false, motivoNoAsistencia: null };
      return undefined;
    };

    const { errores } = await casosDeUso(repositorio).previsualizar({
      filas: [
        { ...filaValida, fila: 2, dni: "99999999" },
        { ...filaValida, fila: 3, sede: "Sede inexistente" },
        { ...filaValida, fila: 4, fecha: "2026-09-02" },
        { ...filaValida, fila: 5, fecha: "2026-09-03" },
        { ...filaValida, fila: 6, fecha: "2026-09-04" },
        { ...filaValida, fila: 7, fecha: "2026-08-31" },
      ],
      erroresDelArchivo: [{ fila: 8, dni: "00001024", fecha: "2026-09-01", motivo: "La jornada duplica la fila 2." }],
    });

    expect(errores).toEqual(expect.arrayContaining([
      expect.objectContaining({ fila: 2, motivo: "DNI desconocido." }),
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

    const { errores } = await casosDeUso(repositorio).previsualizar({
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
      ["DNI", "Sede", "Fecha", "Entrada", "Salida"],
      ["99999999", "Centro", "2026-09-01", "18:00", "09:00"],
      ["00001024", "Centro", "fecha-inválida", "09:00", "18:00"],
    ]), "Asistencias");
    const contenido = await parsearArchivoHuellero(new File([
      XLSX.write(libro, { bookType: "xlsx", type: "array" }),
    ], "asistencias.xlsx"));

    const { errores } = await casosDeUso(repositorio).previsualizar({
      filas: contenido.filas,
      erroresDelArchivo: contenido.errores,
    });

    expect(errores).toEqual(expect.arrayContaining([
      expect.objectContaining({ fila: 2, motivo: "DNI desconocido." }),
      expect.objectContaining({ fila: 2, motivo: "La salida debe ser posterior a la entrada." }),
      expect.objectContaining({ fila: 3, motivo: "Fecha debe ser una fecha Excel o usar YYYY-MM-DD." }),
    ]));
    expect(importaciones).toEqual([]);
  });

  it("clasifica filas nuevas, iguales, pendientes que cambian y confirmadas que cambian", async () => {
    const { repositorio } = crearRepositorioEnMemoria([
      {
        dni: "00001024", fecha: "2026-09-02", asistenciaId: "a-pendiente-igual", estado: "pendiente",
        entradaPropuesta: "2026-09-02T09:00:00", salidaPropuesta: "2026-09-02T18:00:00", entradaReal: null, salidaReal: null,
      },
      {
        dni: "00001024", fecha: "2026-09-03", asistenciaId: "a-pendiente-cambia", estado: "pendiente",
        entradaPropuesta: "2026-09-03T08:00:00", salidaPropuesta: "2026-09-03T17:00:00", entradaReal: null, salidaReal: null,
      },
      {
        dni: "00001024", fecha: "2026-09-04", asistenciaId: "a-confirmada-igual", estado: "confirmada",
        entradaPropuesta: null, salidaPropuesta: null, entradaReal: "2026-09-04T09:00:00", salidaReal: "2026-09-04T18:00:00",
      },
      {
        dni: "00002048", fecha: "2026-09-05", asistenciaId: "a-confirmada-cambia", estado: "confirmada",
        entradaPropuesta: null, salidaPropuesta: null, entradaReal: "2026-09-05T08:30:00", salidaReal: "2026-09-05T17:30:00",
      },
    ]);

    const { vistaPrevia } = await casosDeUso(repositorio).previsualizar({
      filas: [
        { ...filaValida, fila: 2, fecha: "2026-09-01" },
        { ...filaValida, fila: 3, fecha: "2026-09-02" },
        { ...filaValida, fila: 4, fecha: "2026-09-03" },
        { ...filaValida, fila: 5, fecha: "2026-09-04" },
        { ...filaValida, fila: 6, dni: "00002048", fecha: "2026-09-05" },
      ],
      erroresDelArchivo: [],
    });

    expect(vistaPrevia).toEqual({
      conteos: { nuevo: 1, igual: 2, pendiente: 1, confirmado: 1 },
      filas: [
        { fila: 2, dni: "00001024", fecha: "2026-09-01", categoria: "nuevo" },
        { fila: 3, dni: "00001024", fecha: "2026-09-02", categoria: "igual" },
        { fila: 4, dni: "00001024", fecha: "2026-09-03", categoria: "pendiente" },
        { fila: 5, dni: "00001024", fecha: "2026-09-04", categoria: "igual" },
        { fila: 6, dni: "00002048", fecha: "2026-09-05", categoria: "confirmado" },
      ],
    });
  });

  it("trata una jornada con estado manual como confirmada: nunca es igual y exige la misma confirmación", async () => {
    const { repositorio } = crearRepositorioEnMemoria([{
      dni: "00001024", fecha: "2026-09-01", asistenciaId: "a-manual", estado: "manual",
      entradaPropuesta: null, salidaPropuesta: null, entradaReal: null, salidaReal: null,
      estadoManual: { tipo: "vacaciones", comentario: "Vacaciones anuales" },
    }]);

    const { vistaPrevia } = await casosDeUso(repositorio).previsualizar({ filas: [filaValida], erroresDelArchivo: [] });

    expect(vistaPrevia).toEqual({
      conteos: { nuevo: 0, igual: 0, pendiente: 0, confirmado: 1 },
      filas: [{ fila: 2, dni: "00001024", fecha: "2026-09-01", categoria: "confirmado" }],
    });
  });

  it("aplica una carga sin confirmadas: guarda solo lo nuevo o distinto y cuenta las jornadas cambiadas", async () => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria([{
      dni: "00001024", fecha: "2026-09-02", asistenciaId: "a-pendiente-igual", estado: "pendiente",
      entradaPropuesta: "2026-09-02T09:00:00", salidaPropuesta: "2026-09-02T18:00:00", entradaReal: null, salidaReal: null,
    }]);

    const resultado = await casosDeUso(repositorio).aplicar({
      filas: [
        { ...filaValida, fila: 2, fecha: "2026-09-01" },
        { ...filaValida, fila: 3, fecha: "2026-09-02" },
      ],
      erroresDelArchivo: [],
      archivo: { nombre: "asistencias.xlsx", ubicacion: "importaciones/asistencias.xlsx", hashSha256: "abc123" },
      confirmarReemplazoDeConfirmadas: false,
    });

    expect(resultado).toEqual({ requiereConfirmacion: false, jornadas: 1 });
    expect(importaciones).toHaveLength(1);
    expect(importaciones[0].reemplazos).toEqual([]);
    expect(importaciones[0].propuestas).toEqual([
      { dni: "00001024", fecha: "2026-09-01", estado: "pendiente", entradaPropuesta: "2026-09-01T09:00:00", salidaPropuesta: "2026-09-01T18:00:00" },
    ]);
    expect(importaciones[0].marcasCrudas).toHaveLength(4);
  });

  it("exige una sola confirmación para toda la carga cuando reemplazaría jornadas confirmadas", async () => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria([{
      dni: "00001024", fecha: "2026-09-01", asistenciaId: "a-confirmada", estado: "confirmada",
      entradaPropuesta: null, salidaPropuesta: null, entradaReal: "2026-09-01T08:30:00", salidaReal: "2026-09-01T17:30:00",
    }]);

    const resultado = await casosDeUso(repositorio).aplicar({
      filas: [filaValida],
      erroresDelArchivo: [],
      archivo: { nombre: "asistencias.xlsx", ubicacion: "importaciones/asistencias.xlsx", hashSha256: "abc123" },
      confirmarReemplazoDeConfirmadas: false,
    });

    expect(resultado).toEqual({ requiereConfirmacion: true, conteos: { nuevo: 0, igual: 0, pendiente: 0, confirmado: 1 } });
    expect(importaciones).toEqual([]);
  });

  it("reemplaza una jornada confirmada tras la confirmación explícita, conservando el valor anterior", async () => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria([{
      dni: "00001024", fecha: "2026-09-01", asistenciaId: "a-confirmada", estado: "confirmada",
      entradaPropuesta: null, salidaPropuesta: null, entradaReal: "2026-09-01T08:30:00", salidaReal: "2026-09-01T17:30:00",
    }]);

    const resultado = await casosDeUso(repositorio).aplicar({
      filas: [filaValida],
      erroresDelArchivo: [],
      archivo: { nombre: "asistencias.xlsx", ubicacion: "importaciones/asistencias.xlsx", hashSha256: "abc123" },
      confirmarReemplazoDeConfirmadas: true,
    });

    expect(resultado).toEqual({ requiereConfirmacion: false, jornadas: 1 });
    expect(importaciones).toEqual([expect.objectContaining({
      propuestas: [],
      reemplazos: [{
        dni: "00001024", fecha: "2026-09-01", asistenciaId: "a-confirmada", estadoAnterior: "confirmada",
        valorAnterior: { entradaReal: "2026-09-01T08:30:00", salidaReal: "2026-09-01T17:30:00" },
        entradaPropuesta: "2026-09-01T09:00:00", salidaPropuesta: "2026-09-01T18:00:00",
      }],
    })]);
  });

  it("reemplaza una jornada en estado manual conservando su tipo y comentario como valor anterior", async () => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria([{
      dni: "00001024", fecha: "2026-09-01", asistenciaId: "a-manual", estado: "manual",
      entradaPropuesta: null, salidaPropuesta: null, entradaReal: null, salidaReal: null,
      estadoManual: { tipo: "vacaciones", comentario: "Vacaciones anuales" },
    }]);

    const resultado = await casosDeUso(repositorio).aplicar({
      filas: [filaValida],
      erroresDelArchivo: [],
      archivo: { nombre: "asistencias.xlsx", ubicacion: "importaciones/asistencias.xlsx", hashSha256: "abc123" },
      confirmarReemplazoDeConfirmadas: true,
    });

    expect(resultado).toEqual({ requiereConfirmacion: false, jornadas: 1 });
    expect(importaciones[0].reemplazos).toEqual([{
      dni: "00001024", fecha: "2026-09-01", asistenciaId: "a-manual", estadoAnterior: "manual",
      valorAnterior: { tipo: "vacaciones", comentario: "Vacaciones anuales" },
      entradaPropuesta: "2026-09-01T09:00:00", salidaPropuesta: "2026-09-01T18:00:00",
    }]);
  });
});

describe("importación de marcas por rol y grupo", () => {
  const solicitud = (filas: FilaDeAsistenciaImportada[]) => ({ filas, erroresDelArchivo: [] });
  const propia = filaValida;
  const ajena: FilaDeAsistenciaImportada = { ...filaValida, fila: 3, dni: "00002048" };
  const archivo = { nombre: "huellero.xlsx", ubicacion: "x", hashSha256: "h" };
  const gerente = (...grupos: Array<[string, boolean]>) => ({
    id: "gerente-1", rol: "gerente_de_area" as const, grupos: grupos.map(([nombre, gestionaAsistencia]) => ({ nombre, gestionaAsistencia })),
  });
  const con = (repositorio: RepositorioDeImportaciones, actor: Parameters<typeof crearCasosDeUsoDeImportaciones>[1] extends { obtenerActorActual(): Promise<infer A> } ? A : never) =>
    crearCasosDeUsoDeImportaciones(repositorio, { obtenerActorActual: async () => actor });

  it("un gerente importa las marcas de las personas de su grupo", async () => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria();
    const casos = con(repositorio, gerente(["Tiendas", true]));

    await expect(casos.previsualizar(solicitud([propia]))).resolves.toMatchObject({ errores: [] });
    await expect(casos.aplicar({ ...solicitud([propia]), archivo, confirmarReemplazoDeConfirmadas: false })).resolves.toEqual({ requiereConfirmacion: false, jornadas: 1 });
    expect(importaciones).toHaveLength(1);
  });

  it("rechaza una fila de una persona de otro grupo aunque haya filas propias y no guarda nada", async () => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria();
    const casos = con(repositorio, gerente(["Tiendas", true]));
    const mensaje = "El colaborador no pertenece a un grupo que usted gestiona.";

    const { errores } = await casos.previsualizar(solicitud([propia, ajena]));
    expect(errores).toEqual([expect.objectContaining({ fila: 3, dni: "00002048", motivo: mensaje })]);
    await expect(casos.aplicar({ ...solicitud([propia, ajena]), archivo, confirmarReemplazoDeConfirmadas: false })).rejects.toMatchObject({
      errores: [expect.objectContaining({ fila: 3, motivo: mensaje })],
    });
    expect(importaciones).toEqual([]);
  });

  it("un gerente con varios grupos importa las personas de cualquiera de ellos", async () => {
    const { repositorio } = crearRepositorioEnMemoria();
    await expect(con(repositorio, gerente(["Tiendas", true], ["Taller", true])).previsualizar(solicitud([propia, ajena]))).resolves.toMatchObject({ errores: [] });
  });

  it.each([
    ["Finanzas", { id: "f1", rol: "finanzas" as const }],
    ["el Administrador", { id: "a1", rol: "administrador" as const }],
  ])("%s importa filas de cualquier grupo", async (_nombre, actor) => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria();
    const casos = con(repositorio, actor);

    await expect(casos.previsualizar(solicitud([propia, ajena]))).resolves.toMatchObject({ errores: [] });
    await casos.aplicar({ ...solicitud([propia, ajena]), archivo, confirmarReemplazoDeConfirmadas: false });
    expect(importaciones).toHaveLength(1);
  });

  it.each([
    ["Recursos Humanos", { id: "r1", rol: "recursos_humanos" as const }],
    ["un gerente sin grupos", gerente()],
    ["un gerente solo de un grupo que no gestiona asistencia", gerente(["Tiendas", false])],
  ])("rechaza a %s al prevalidar, previsualizar y aplicar", async (_nombre, actor) => {
    const { importaciones, repositorio } = crearRepositorioEnMemoria();
    const casos = con(repositorio, actor);

    await expect(casos.previsualizar(solicitud([propia]))).rejects.toThrow("No tiene permiso para importar asistencias.");
    await expect(casos.aplicar({ ...solicitud([propia]), archivo, confirmarReemplazoDeConfirmadas: false })).rejects.toThrow("No tiene permiso para importar asistencias.");
    expect(importaciones).toEqual([]);
  });
});
