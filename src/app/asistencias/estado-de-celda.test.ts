import { describe, expect, it } from "vitest";

import {
  celdaDeAsistenciaEsEditable,
  ESTADOS_DE_CELDA_ASISTENCIA,
  estadoDeCeldaAsistencia,
  etiquetaDeCeldaAsistencia,
  type EvidenciaDeCeldaAsistencia,
} from "./estado-de-celda";

const base: EvidenciaDeCeldaAsistencia = {
  estado: "pendiente",
  estadoManual: null,
  entradaPropuesta: null,
  salidaPropuesta: null,
  hayMarcasCrudas: false,
  enPeriodoCerrado: false,
};

describe("estadoDeCeldaAsistencia", () => {
  it("es 'sin-planificacion' cuando no hay horario publicado para el día", () => {
    expect(estadoDeCeldaAsistencia(undefined)).toBe("sin-planificacion");
  });

  it("es 'esperada' cuando el día está pendiente y no hay marcas del huellero", () => {
    expect(estadoDeCeldaAsistencia({ ...base })).toBe("esperada");
  });

  it("es 'esperada' cuando hay marcas que sí permiten proponer entrada y salida completas", () => {
    expect(estadoDeCeldaAsistencia({ ...base, hayMarcasCrudas: true, entradaPropuesta: "2026-09-01T09:00", salidaPropuesta: "2026-09-01T18:00" })).toBe("esperada");
  });

  it("es 'pendiente-de-revision' cuando hay marcas que no permiten proponer entrada/salida completas", () => {
    expect(estadoDeCeldaAsistencia({ ...base, hayMarcasCrudas: true, entradaPropuesta: "2026-09-01T09:00", salidaPropuesta: null })).toBe("pendiente-de-revision");
    expect(estadoDeCeldaAsistencia({ ...base, hayMarcasCrudas: true })).toBe("pendiente-de-revision");
  });

  it("es 'registrada' cuando la asistencia está confirmada", () => {
    expect(estadoDeCeldaAsistencia({ ...base, estado: "confirmada" })).toBe("registrada");
  });

  it("es 'registrada' cuando el día tiene una designación manual", () => {
    expect(estadoDeCeldaAsistencia({ ...base, estado: "manual", estadoManual: "feriado" })).toBe("registrada");
  });

  it("es 'liquidado' cuando la fecha cae en un período de planilla cerrado, sin importar el estado", () => {
    expect(estadoDeCeldaAsistencia({ ...base, enPeriodoCerrado: true })).toBe("liquidado");
    expect(estadoDeCeldaAsistencia({ ...base, estado: "confirmada", enPeriodoCerrado: true })).toBe("liquidado");
    expect(estadoDeCeldaAsistencia({ ...base, estado: "manual", estadoManual: "falta", enPeriodoCerrado: true })).toBe("liquidado");
    expect(estadoDeCeldaAsistencia({ ...base, hayMarcasCrudas: true, enPeriodoCerrado: true })).toBe("liquidado");
  });

  it("distingue Esperada de Pendiente de revisión solo por las marcas y la propuesta", () => {
    expect(estadoDeCeldaAsistencia({ ...base, hayMarcasCrudas: false })).toBe("esperada");
    expect(estadoDeCeldaAsistencia({ ...base, hayMarcasCrudas: true })).toBe("pendiente-de-revision");
  });

  it("clasifica cualquier combinación de entradas en exactamente uno de los cinco estados", () => {
    for (const estado of ["pendiente", "confirmada", "manual"] as const) {
      for (const estadoManual of [null, "feriado"] as const) {
        for (const entradaPropuesta of [null, "2026-09-01T09:00"]) {
          for (const salidaPropuesta of [null, "2026-09-01T18:00"]) {
            for (const hayMarcasCrudas of [false, true]) {
              for (const enPeriodoCerrado of [false, true]) {
                const resultado = estadoDeCeldaAsistencia({
                  estado,
                  estadoManual,
                  entradaPropuesta,
                  salidaPropuesta,
                  hayMarcasCrudas,
                  enPeriodoCerrado,
                });
                expect(ESTADOS_DE_CELDA_ASISTENCIA).toContain(resultado);
              }
            }
          }
        }
      }
    }
    expect(estadoDeCeldaAsistencia(undefined)).toBe("sin-planificacion");
  });
});

describe("celdaDeAsistenciaEsEditable", () => {
  it("es editable cuando el día está pendiente o confirmado y no liquidado", () => {
    expect(celdaDeAsistenciaEsEditable({ ...base, estado: "pendiente" })).toBe(true);
    expect(celdaDeAsistenciaEsEditable({ ...base, estado: "pendiente", hayMarcasCrudas: true })).toBe(true);
    expect(celdaDeAsistenciaEsEditable({ ...base, estado: "confirmada" })).toBe(true);
  });

  it("no es editable sin horario, con designación manual ni dentro de un período cerrado", () => {
    expect(celdaDeAsistenciaEsEditable(undefined)).toBe(false);
    expect(celdaDeAsistenciaEsEditable({ ...base, estado: "manual", estadoManual: "feriado" })).toBe(false);
    expect(celdaDeAsistenciaEsEditable({ ...base, estado: "confirmada", enPeriodoCerrado: true })).toBe(false);
    expect(celdaDeAsistenciaEsEditable({ ...base, estado: "pendiente", enPeriodoCerrado: true })).toBe(false);
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
    expect(etiquetaDeCeldaAsistencia("liquidado", "feriado")).toBe("Liquidado");
  });
});
