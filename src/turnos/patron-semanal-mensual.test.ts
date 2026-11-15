import { describe, expect, it, vi } from "vitest";

import { aplicarPatronSemanalAlMes, type RepositorioDelPatronMensual } from "./casos-de-uso-planes-semanales";

const equipo = "Tiendas";
const dni = "12345678";
const sesion = { obtenerActorActual: async () => ({ id: "gerente", rol: "gerente_de_area" as const, grupos: [{ nombre: equipo, gestionaAsistencia: true }] }) };
const modelo = { id: "manana", nombre: "Mañana", sede: "Centro", entrada: "08:00", salida: "17:00", activo: true };

function crearRepositorio() {
  return {
    colaboradorPerteneceAEquipo: vi.fn(async () => true),
    listarVigenciasConfirmadas: vi.fn(async () => [{ ingreso: "2026-01-01", cese: null as string | null }]),
    sedeActivaPerteneceAlGrupo: vi.fn(async () => true),
    buscarModeloDeHorario: vi.fn(async () => modelo),
    consultarEstadoDeFechas: vi.fn(async () => ({ cerradas: [] as string[], sinPeriodo: [] as string[] })),
    listarBorradoresDelEquipoEnRango: vi.fn(async () => [] as Array<{ dni: string; fecha: string }>),
    buscarPublicado: vi.fn<RepositorioDelPatronMensual["buscarPublicado"]>(async () => undefined),
    horarioSemanalEstaProcesado: vi.fn(async (_dni: string, _semana: string) => false),
    guardarNuevasJornadasDelMes: vi.fn(async (_equipo: string, jornadas: Array<{ fecha: string }>) => ({
      guardadas: jornadas.map(jornada => jornada.fecha),
      omitidas: [],
    })),
  };
}

describe("patrón semanal mensual", () => {
  it.each([
    {
      mes: "2026-04",
      patron: { 0: { modeloHorarioId: modelo.id }, 6: "descanso" },
      fechas: ["2026-04-05", "2026-04-06", "2026-04-12", "2026-04-13", "2026-04-19", "2026-04-20", "2026-04-26", "2026-04-27"],
      fechasDeModelo: ["2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"],
    },
    {
      mes: "2028-02",
      patron: { 1: { modeloHorarioId: modelo.id } },
      fechas: ["2028-02-01", "2028-02-08", "2028-02-15", "2028-02-22", "2028-02-29"],
      fechasDeModelo: ["2028-02-01", "2028-02-08", "2028-02-15", "2028-02-22", "2028-02-29"],
    },
  ] as const)("G1 aplica solo los días seleccionados dentro de $mes", async ({ mes, patron, fechas, fechasDeModelo }) => {
    const repositorio = crearRepositorio();
    const resultado = await aplicarPatronSemanalAlMes(repositorio, sesion, { equipo, dni, mes, patron });
    expect(resultado, "el patrón devuelve las fechas del mes que guardó").toEqual({ guardadas: fechas, omitidas: [] });
    expect(repositorio.guardarNuevasJornadasDelMes).toHaveBeenCalledTimes(1);
    const jornadas = repositorio.guardarNuevasJornadasDelMes.mock.calls[0][1];
    expect(jornadas).toEqual(fechas.map(fecha => (fechasDeModelo as ReadonlyArray<string>).includes(fecha)
      ? { dni, fecha, modeloHorarioId: modelo.id, sede: modelo.sede, entradaProgramada: "08:00", salidaProgramada: "17:00" }
      : { dni, fecha, descanso: true, motivoNoAsistencia: "descanso", sede: null, entradaProgramada: null, salidaProgramada: null }));
  });
  it.each([
    { caso: "borrador existente", borrador: true, omitidas: [{ fecha: "2026-04-20", motivo: "Asignación existente" }] },
    { caso: "publicado existente", publicado: true, omitidas: [{ fecha: "2026-04-20", motivo: "Asignación existente" }] },
    { caso: "sin relación laboral", sinRelacion: true, omitidas: [{ fecha: "2026-04-20", motivo: "Sin relación laboral" }, { fecha: "2026-04-27", motivo: "Sin relación laboral" }] },
    { caso: "semana liquidada", liquidada: true, omitidas: [{ fecha: "2026-04-20", motivo: "Semana liquidada" }, { fecha: "2026-04-26", motivo: "Semana liquidada" }] },
    { caso: "abril confirmado", cerrado: true, borrador: true, omitidas: [{ fecha: "2026-04-19", motivo: "Fecha cerrada" }, { fecha: "2026-04-20", motivo: "Asignación existente" }] },
  ])("G2 conserva $caso y devuelve omisiones con motivo", async ({ borrador, publicado, sinRelacion, liquidada, cerrado, omitidas }) => {
    const repositorio = crearRepositorio();
    if (borrador) repositorio.listarBorradoresDelEquipoEnRango.mockResolvedValue([{ dni, fecha: "2026-04-20" }]);
    if (publicado) repositorio.buscarPublicado.mockImplementation(async (_dni, fecha) =>
      fecha === "2026-04-20"
        ? { dni, fecha, sede: null, entradaProgramada: null, salidaProgramada: null, motivoNoAsistencia: "descanso" }
        : undefined);
    if (cerrado) repositorio.consultarEstadoDeFechas.mockResolvedValue({ cerradas: ["2026-04-19"], sinPeriodo: [] });
    if (liquidada) repositorio.horarioSemanalEstaProcesado.mockImplementation(async (_dni, semana) => semana === "2026-04-20");
    if (sinRelacion) repositorio.listarVigenciasConfirmadas.mockResolvedValue([
      { ingreso: "2026-01-01", cese: "2026-04-19" }, { ingreso: "2026-04-26", cese: "2026-04-26" },
    ]);

    const fechaPatron = ["2026-04-05", "2026-04-06", "2026-04-12", "2026-04-13", "2026-04-19", "2026-04-20", "2026-04-26", "2026-04-27"];
    const esperadas = fechaPatron.filter(fecha => !omitidas.some(omision => omision.fecha === fecha));
    const resultado = await aplicarPatronSemanalAlMes(repositorio, sesion, {
      equipo, dni, mes: "2026-04", patron: { 0: { modeloHorarioId: modelo.id }, 6: "descanso" },
    });

    expect(resultado, "el patrón conserva las fechas omitidas y explica el motivo").toEqual({ guardadas: esperadas, omitidas });
    expect(repositorio.guardarNuevasJornadasDelMes.mock.calls[0][1].map(jornada => jornada.fecha)).toEqual(esperadas);
  });
});
