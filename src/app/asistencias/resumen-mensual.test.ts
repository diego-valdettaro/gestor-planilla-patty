import { describe, expect, it } from "vitest";

import { resumirMes } from "./resumen-mensual";
import type { FilaDeResumenMensual } from "@/asistencias/repositorio-postgres";

const base: FilaDeResumenMensual = {
  fecha: "2031-03-10", estado: "confirmada", entrada: "2031-03-10T09:00", salida: "2031-03-10T18:00",
  entradaProgramada: "09:00", salidaProgramada: "18:00", minutosTrabajados: 540, minutosDeTardanza: 12,
  minutosAl25: 30, minutosAl35: 0, estadoManual: null, entradaPropuesta: null, salidaPropuesta: null,
  hayMarcasCrudas: true, enPeriodoCerrado: false,
};

describe("resumirMes", () => {
  it("agrega estados, horas, tardanzas y tramos de hora extra por día", () => {
    const resultado = resumirMes(["2031-03-09", "2031-03-10", "2031-03-11"], [base, {
      ...base, fecha: "2031-03-11", estado: "pendiente", entrada: null, salida: null,
      minutosTrabajados: null, minutosDeTardanza: null, minutosAl25: 0, minutosAl35: 60,
      hayMarcasCrudas: true, entradaPropuesta: null, salidaPropuesta: null,
    }]);
    expect(resultado.porEstado).toEqual({ "sin-planificacion": 1, esperada: 0, "pendiente-de-revision": 1, registrada: 1, liquidado: 0 });
    expect(resultado.minutosTrabajados).toBe(540);
    expect(resultado.minutosDeTardanza).toBe(12);
    expect(resultado.minutosAl25).toBe(30);
    expect(resultado.minutosAl35).toBe(60);
  });
});
