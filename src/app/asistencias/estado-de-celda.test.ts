import { describe, expect, it } from "vitest";

import {
  ESTADOS_DE_CELDA_ASISTENCIA,
  estadoDeCeldaAsistencia,
  etiquetaDeCeldaAsistencia,
  type DiaDeAsistencia,
} from "./estado-de-celda";

const base: DiaDeAsistencia = {
  estado: "pendiente",
  designacionManual: null,
  hayMarcasCrudas: false,
  propuestaCompleta: false,
  enPeriodoCerrado: false,
};

describe("estadoDeCeldaAsistencia", () => {
  it("es 'sin-planificacion' cuando no hay horario publicado para el día", () => {
    expect(estadoDeCeldaAsistencia(undefined)).toBe("sin-planificacion");
  });

  it("es 'esperada' cuando el día está pendiente y no hay marcas del huellero", () => {
    expect(estadoDeCeldaAsistencia({ ...base })).toBe("esperada");
  });

  it("sigue 'esperada' aunque el día ya haya pasado: no depende de la fecha", () => {
    // La función pura no recibe "hoy"; sin marcas, un día pendiente es Esperada.
    expect(estadoDeCeldaAsistencia({ ...base })).toBe("esperada");
  });

  it("es 'esperada' cuando hay marcas que sí permiten proponer entrada y salida completas", () => {
    expect(estadoDeCeldaAsistencia({ ...base, hayMarcasCrudas: true, propuestaCompleta: true })).toBe("esperada");
  });

  it("es 'pendiente-de-revision' cuando hay marcas que no permiten proponer entrada/salida completas", () => {
    expect(estadoDeCeldaAsistencia({ ...base, hayMarcasCrudas: true, propuestaCompleta: false })).toBe("pendiente-de-revision");
  });

  it("es 'registrada' cuando la asistencia está confirmada", () => {
    expect(estadoDeCeldaAsistencia({ ...base, estado: "confirmada" })).toBe("registrada");
  });

  it("es 'registrada' cuando el día tiene una designación manual", () => {
    expect(estadoDeCeldaAsistencia({ ...base, estado: "manual", designacionManual: "feriado" })).toBe("registrada");
  });

  it("es 'liquidado' cuando la fecha cae en un período de planilla cerrado, sin importar el estado", () => {
    expect(estadoDeCeldaAsistencia({ ...base, enPeriodoCerrado: true })).toBe("liquidado");
    expect(estadoDeCeldaAsistencia({ ...base, estado: "confirmada", enPeriodoCerrado: true })).toBe("liquidado");
    expect(estadoDeCeldaAsistencia({ ...base, estado: "manual", designacionManual: "falta", enPeriodoCerrado: true })).toBe("liquidado");
    expect(estadoDeCeldaAsistencia({ ...base, hayMarcasCrudas: true, enPeriodoCerrado: true })).toBe("liquidado");
  });

  it("distingue Esperada de Pendiente de revisión solo por las marcas y la propuesta", () => {
    const sinMarcas = estadoDeCeldaAsistencia({ ...base, hayMarcasCrudas: false });
    const marcasAmbiguas = estadoDeCeldaAsistencia({ ...base, hayMarcasCrudas: true, propuestaCompleta: false });
    expect(sinMarcas).toBe("esperada");
    expect(marcasAmbiguas).toBe("pendiente-de-revision");
  });

  it("clasifica cualquier combinación de entradas en exactamente uno de los cinco estados", () => {
    for (const estado of ["pendiente", "confirmada", "manual"] as const) {
      for (const designacionManual of [null, "feriado"]) {
        for (const hayMarcasCrudas of [false, true]) {
          for (const propuestaCompleta of [false, true]) {
            for (const enPeriodoCerrado of [false, true]) {
              const resultado = estadoDeCeldaAsistencia({
                estado,
                designacionManual,
                hayMarcasCrudas,
                propuestaCompleta,
                enPeriodoCerrado,
              });
              expect(ESTADOS_DE_CELDA_ASISTENCIA).toContain(resultado);
            }
          }
        }
      }
    }
    expect(estadoDeCeldaAsistencia(undefined)).toBe("sin-planificacion");
  });
});

describe("etiquetaDeCeldaAsistencia", () => {
  it("muestra el tipo de la designación manual cuando el estado es 'registrada'", () => {
    expect(etiquetaDeCeldaAsistencia("registrada", "feriado")).toBe("Feriado");
    expect(etiquetaDeCeldaAsistencia("registrada", "suspension")).toBe("Suspensión");
  });

  it("muestra 'Registrada' cuando no hay designación manual", () => {
    expect(etiquetaDeCeldaAsistencia("registrada", null)).toBe("Registrada");
  });

  it("usa el nombre del estado para el resto de los estados", () => {
    expect(etiquetaDeCeldaAsistencia("esperada", null)).toBe("Esperada");
    expect(etiquetaDeCeldaAsistencia("pendiente-de-revision", null)).toBe("Pendiente de revisión");
    expect(etiquetaDeCeldaAsistencia("sin-planificacion", null)).toBe("Sin planificación");
    expect(etiquetaDeCeldaAsistencia("liquidado", null)).toBe("Liquidado");
    // Una designación manual no cambia la etiqueta si el estado no es 'registrada'.
    expect(etiquetaDeCeldaAsistencia("liquidado", "feriado")).toBe("Liquidado");
  });
});
