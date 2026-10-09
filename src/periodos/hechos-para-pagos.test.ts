import { describe, expect, it } from "vitest";

import type { PeriodoPlanilla } from "./periodo-planilla";
import {
  CoberturaDelCorteInvalidaError,
  RevisionDeAsistenciaNoDisponibleError,
  corteDeIncidencias,
  hechosParaFinalizar,
  obtenerHechosDelCorte,
  verificarCoberturaDelCorte,
  type HechoDiarioDeAsistencia,
  type LectorDeHechosDeAsistencia,
  type RevisionDeAsistenciaParaPagos,
} from "./hechos-para-pagos";

const corte = { inicio: "2026-09-26", fin: "2026-10-25" };

function periodo(id: string, inicio: string, fin: string, estado: "abierto" | "cerrado" = "cerrado") {
  return { id, inicio, fin, estado };
}

function hecho(dni: string, fecha: string, cambios: Partial<HechoDiarioDeAsistencia> = {}): HechoDiarioDeAsistencia {
  return {
    dni,
    fecha,
    grupo: "Taller",
    sede: "PRODUCCION",
    horarioAplicado: { entradaProgramada: "09:00", salidaProgramada: "17:00" },
    resultado: "trabajada",
    minutosTrabajados: 480,
    tardanza: null,
    horaExtra: null,
    diaEspecial: null,
    evidencia: { asistenciaId: `asistencia-${dni}-${fecha}`, turnoPublicadoId: `turno-${dni}-${fecha}` },
    ...cambios,
  };
}

function lector(periodos: PeriodoPlanilla[], revisiones: RevisionDeAsistenciaParaPagos[]): LectorDeHechosDeAsistencia {
  return {
    listar: async () => periodos,
    leerHechosDelPeriodo: async (periodoId) => {
      const revision = revisiones.find((item) => item.periodoId === periodoId);
      if (!revision) throw new Error(`Sin revisión para ${periodoId}`);
      return revision;
    },
  };
}

function revision(periodoId: string, inicio: string, fin: string, hechos: HechoDiarioDeAsistencia[], provisional = false): RevisionDeAsistenciaParaPagos {
  return { periodoId, revisionId: provisional ? null : `rev-${periodoId}`, numero: provisional ? null : 1, inicio, fin, provisional, hechos };
}

describe("corteDeIncidencias", () => {
  it("va del día 26 del mes anterior al día 25 del mes de pago", () => {
    expect(corteDeIncidencias("2026-10")).toEqual({ inicio: "2026-09-26", fin: "2026-10-25" });
  });

  it("para enero empieza el 26 de diciembre del año anterior", () => {
    expect(corteDeIncidencias("2027-01")).toEqual({ inicio: "2026-12-26", fin: "2027-01-25" });
  });

  it("rechaza un mes de pago mal formado", () => {
    expect(() => corteDeIncidencias("2026-13")).toThrow();
    expect(() => corteDeIncidencias("octubre")).toThrow();
  });
});

describe("verificarCoberturaDelCorte", () => {
  it("acepta un solo período que coincide con el corte", () => {
    const resultado = verificarCoberturaDelCorte(corte, [periodo("a", "2026-09-26", "2026-10-25")]);
    expect(resultado).toEqual({ problemas: [], cubreExactamente: true });
  });

  it("acepta períodos partidos que cubren el corte sin huecos ni solapamientos", () => {
    const resultado = verificarCoberturaDelCorte(corte, [
      periodo("b", "2026-10-06", "2026-10-25"),
      periodo("a", "2026-09-26", "2026-10-05"),
    ]);
    expect(resultado.problemas).toEqual([]);
    expect(resultado.cubreExactamente).toBe(true);
  });

  it("sin períodos reporta un hueco con todo el corte", () => {
    const { problemas, cubreExactamente } = verificarCoberturaDelCorte(corte, []);
    expect(cubreExactamente).toBe(false);
    expect(problemas).toEqual([expect.objectContaining({ tipo: "hueco", desde: "2026-09-26", hasta: "2026-10-25" })]);
  });

  it("detecta y explica un hueco al inicio, en medio y al final", () => {
    const { problemas } = verificarCoberturaDelCorte(corte, [
      periodo("a", "2026-09-28", "2026-10-05"),
      periodo("b", "2026-10-10", "2026-10-20"),
    ]);
    expect(problemas.filter(({ tipo }) => tipo === "hueco")).toEqual([
      expect.objectContaining({ desde: "2026-09-26", hasta: "2026-09-27" }),
      expect.objectContaining({ desde: "2026-10-06", hasta: "2026-10-09" }),
      expect.objectContaining({ desde: "2026-10-21", hasta: "2026-10-25" }),
    ]);
    expect(problemas[1].mensaje).toBe("Falta cobertura del 06/10/2026 al 09/10/2026: ningún período la incluye.");
  });

  it("detecta y explica un solapamiento entre períodos", () => {
    const { problemas, cubreExactamente } = verificarCoberturaDelCorte(corte, [
      periodo("a", "2026-09-26", "2026-10-05"),
      periodo("b", "2026-10-03", "2026-10-25"),
    ]);
    expect(cubreExactamente).toBe(false);
    expect(problemas).toEqual([expect.objectContaining({
      tipo: "solapamiento",
      periodoIds: ["a", "b"],
      desde: "2026-10-03",
      hasta: "2026-10-05",
      mensaje: "Los períodos del 26/09/2026 al 05/10/2026 y del 03/10/2026 al 25/10/2026 se solapan.",
    })]);
  });

  it("detecta un período que atraviesa el día 25 por el final del corte", () => {
    const { problemas } = verificarCoberturaDelCorte(corte, [
      periodo("a", "2026-09-26", "2026-10-19"),
      periodo("b", "2026-10-20", "2026-10-30"),
    ]);
    expect(problemas).toEqual([expect.objectContaining({
      tipo: "cruza_corte",
      periodoId: "b",
      mensaje: "El período del 20/10/2026 al 30/10/2026 cruza el día 25: sale del corte del 26/09/2026 al 25/10/2026.",
    })]);
  });

  it("detecta un período que atraviesa el día 25 por el inicio del corte", () => {
    const { problemas } = verificarCoberturaDelCorte(corte, [
      periodo("a", "2026-09-10", "2026-10-05"),
      periodo("b", "2026-10-06", "2026-10-25"),
    ]);
    expect(problemas).toEqual([expect.objectContaining({ tipo: "cruza_corte", periodoId: "a" })]);
  });

  it("ignora los períodos que no tocan el corte", () => {
    const { problemas } = verificarCoberturaDelCorte(corte, [
      periodo("anterior", "2026-08-26", "2026-09-25"),
      periodo("a", "2026-09-26", "2026-10-25"),
      periodo("siguiente", "2026-10-26", "2026-11-25"),
    ]);
    expect(problemas).toEqual([]);
  });

  it("marca los períodos abiertos sin romper la cobertura exacta", () => {
    const resultado = verificarCoberturaDelCorte(corte, [
      periodo("a", "2026-09-26", "2026-10-05"),
      periodo("b", "2026-10-06", "2026-10-25", "abierto"),
    ]);
    expect(resultado.cubreExactamente).toBe(true);
    expect(resultado.problemas).toEqual([expect.objectContaining({
      tipo: "periodo_abierto",
      periodoId: "b",
      mensaje: "El período del 06/10/2026 al 25/10/2026 no está cerrado: sus hechos son provisionales.",
    })]);
  });
});

describe("obtenerHechosDelCorte", () => {
  it("muestra un bloqueo si un período cerrado carece de revisión y conserva las demás fuentes", async () => {
    const fuente: LectorDeHechosDeAsistencia = {
      listar: async () => [
        periodo("sin-revision", "2026-09-26", "2026-10-05") as PeriodoPlanilla,
        periodo("con-revision", "2026-10-06", "2026-10-25") as PeriodoPlanilla,
      ],
      leerHechosDelPeriodo: async (id) => {
        if (id === "sin-revision") throw new RevisionDeAsistenciaNoDisponibleError("El período cerrado no tiene una revisión.");
        return revision(id, "2026-10-06", "2026-10-25", [hecho("12345678", "2026-10-10")]);
      },
    };
    const resultado = await obtenerHechosDelCorte(fuente, corte);
    expect(resultado.problemas).toEqual([expect.objectContaining({ tipo: "revision_no_disponible", periodoId: "sin-revision" })]);
    expect(resultado.revisiones).toHaveLength(1);
    expect(resultado.hechosPorDni["12345678"]).toHaveLength(1);
    expect(resultado.finalizable).toBe(false);
    await expect(hechosParaFinalizar(fuente, corte)).rejects.toThrow(/no tiene una revisión de asistencia/);
  });
  const periodos: PeriodoPlanilla[] = [
    { id: "a", inicio: "2026-09-26", fin: "2026-10-05", estado: "cerrado" },
    { id: "b", inicio: "2026-10-06", fin: "2026-10-25", estado: "cerrado" },
  ];

  it("agrupa por DNI los hechos de todas las revisiones que cubren el corte", () => {
    const resultado = obtenerHechosDelCorte(lector(periodos, [
      revision("b", "2026-10-06", "2026-10-25", [hecho("222", "2026-10-06"), hecho("111", "2026-10-06")]),
      revision("a", "2026-09-26", "2026-10-05", [hecho("111", "2026-10-05"), hecho("111", "2026-09-26")]),
    ]), corte);
    return resultado.then((cubierto) => {
      expect(cubierto.finalizable).toBe(true);
      expect(cubierto.provisional).toBe(false);
      expect(cubierto.problemas).toEqual([]);
      expect(cubierto.revisiones.map(({ periodoId }) => periodoId)).toEqual(["a", "b"]);
      expect(cubierto.hechosPorDni["111"].map(({ fecha }) => fecha)).toEqual(["2026-09-26", "2026-10-05", "2026-10-06"]);
      expect(cubierto.hechosPorDni["222"]).toHaveLength(1);
    });
  });

  it("marca como provisional el resultado cuando algún período sigue abierto", async () => {
    const abiertos: PeriodoPlanilla[] = [periodos[0], { ...periodos[1], estado: "abierto" }];
    const resultado = await obtenerHechosDelCorte(lector(abiertos, [
      revision("a", "2026-09-26", "2026-10-05", [hecho("111", "2026-09-26")]),
      revision("b", "2026-10-06", "2026-10-25", [hecho("111", "2026-10-06")], true),
    ]), corte);
    expect(resultado.provisional).toBe(true);
    expect(resultado.finalizable).toBe(false);
    expect(resultado.revisiones.map(({ provisional }) => provisional)).toEqual([false, true]);
    expect(resultado.hechosPorDni["111"]).toHaveLength(2);
  });

  it("recorta a las fechas del corte los hechos de un período que lo excede", async () => {
    const excede: PeriodoPlanilla[] = [{ id: "x", inicio: "2026-10-20", fin: "2026-10-30", estado: "cerrado" }];
    const resultado = await obtenerHechosDelCorte(lector(excede, [
      revision("x", "2026-10-20", "2026-10-30", [hecho("111", "2026-10-25"), hecho("111", "2026-10-26")]),
    ]), corte);
    expect(resultado.hechosPorDni["111"].map(({ fecha }) => fecha)).toEqual(["2026-10-25"]);
    expect(resultado.problemas.map(({ tipo }) => tipo)).toEqual(expect.arrayContaining(["hueco", "cruza_corte"]));
  });

  it("no consulta los períodos que no tocan el corte", async () => {
    const consultados: string[] = [];
    const base = lector([...periodos, { id: "otro", inicio: "2026-11-26", fin: "2026-12-25", estado: "cerrado" }], [
      revision("a", "2026-09-26", "2026-10-05", []),
      revision("b", "2026-10-06", "2026-10-25", []),
    ]);
    await obtenerHechosDelCorte({
      listar: base.listar,
      leerHechosDelPeriodo: async (id) => { consultados.push(id); return base.leerHechosDelPeriodo(id); },
    }, corte);
    expect(consultados.sort()).toEqual(["a", "b"]);
  });
});

describe("hechosParaFinalizar", () => {
  it("entrega los hechos cuando el corte está cubierto exactamente por revisiones cerradas", async () => {
    const resultado = await hechosParaFinalizar(lector(
      [{ id: "a", inicio: corte.inicio, fin: corte.fin, estado: "cerrado" }],
      [revision("a", corte.inicio, corte.fin, [hecho("111", "2026-10-01")])],
    ), corte);
    expect(resultado.finalizable).toBe(true);
    expect(resultado.hechosPorDni["111"]).toHaveLength(1);
  });

  it("rechaza un corte con huecos y explica cada problema", async () => {
    const error = await hechosParaFinalizar(lector(
      [{ id: "a", inicio: "2026-09-26", fin: "2026-10-05", estado: "cerrado" }],
      [revision("a", "2026-09-26", "2026-10-05", [])],
    ), corte).catch((falla: unknown) => falla);
    expect(error).toBeInstanceOf(CoberturaDelCorteInvalidaError);
    expect((error as CoberturaDelCorteInvalidaError).problemas).toEqual([expect.objectContaining({ tipo: "hueco", desde: "2026-10-06" })]);
    expect((error as Error).message).toContain("Falta cobertura del 06/10/2026 al 25/10/2026");
  });

  it("rechaza un corte con un período abierto", async () => {
    await expect(hechosParaFinalizar(lector(
      [{ id: "a", inicio: corte.inicio, fin: corte.fin, estado: "abierto" }],
      [revision("a", corte.inicio, corte.fin, [], true)],
    ), corte)).rejects.toThrow(/no está cerrado/);
  });
});

describe("contrato del hecho diario", () => {
  it("no asocia importes a la jornada ni copia la aprobación o el cierre", () => {
    expect(Object.keys(hecho("111", "2026-10-01")).sort()).toEqual([
      "diaEspecial", "dni", "evidencia", "fecha", "grupo", "horaExtra", "horarioAplicado",
      "minutosTrabajados", "resultado", "sede", "tardanza",
    ]);
  });
});
