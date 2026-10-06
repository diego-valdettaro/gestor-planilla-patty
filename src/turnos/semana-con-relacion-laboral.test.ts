import { describe, expect, it } from "vitest";

import { ajustarSemanaALaRelacionLaboral, celdaSinRelacionLaboral } from "./semana-con-relacion-laboral";

const semana = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
const laboral = (fecha: string) => ({ dni: "99900001", fecha, sede: "Taller", modeloHorarioId: null, entradaProgramada: "07:00", salidaProgramada: "16:00", descanso: false, motivoNoAsistencia: null });

describe("ajustarSemanaALaRelacionLaboral", () => {
  it("completa con «Sin relación laboral» los días anteriores al ingreso", () => {
    const celdas = semana.slice(2).map(laboral);
    const resultado = ajustarSemanaALaRelacionLaboral([{ ingreso: "2026-10-07", cese: null }], "99900001", semana, celdas);
    expect(resultado.slice(0, 2)).toEqual([celdaSinRelacionLaboral("99900001", "2026-10-05"), celdaSinRelacionLaboral("99900001", "2026-10-06")]);
    expect(resultado.slice(2)).toEqual(celdas);
  });

  it("completa los días posteriores al cese confirmado y el hueco entre dos relaciones", () => {
    const vigencias = [{ ingreso: "2026-01-01", cese: "2026-10-06" }, { ingreso: "2026-10-09", cese: null }];
    const resultado = ajustarSemanaALaRelacionLaboral(vigencias, "99900001", semana, [laboral("2026-10-05"), laboral("2026-10-06"), laboral("2026-10-09"), laboral("2026-10-10"), laboral("2026-10-11")]);
    expect(resultado.map((celda) => celda.motivoNoAsistencia)).toEqual([null, null, "sin_relacion_laboral", "sin_relacion_laboral", null, null, null]);
  });

  it("descarta un «Sin relación laboral» guardado en un día que ahora está dentro de la relación", () => {
    const obsoleta = celdaSinRelacionLaboral("99900001", "2026-10-05");
    const resultado = ajustarSemanaALaRelacionLaboral([{ ingreso: "2026-01-01", cese: null }], "99900001", semana, [obsoleta, laboral("2026-10-06")]);
    expect(resultado).toEqual([laboral("2026-10-06")]);
  });

  it("conserva un estado distinto fuera de la relación para que la validación lo rechace", () => {
    const indebida = laboral("2026-10-05");
    const resultado = ajustarSemanaALaRelacionLaboral([{ ingreso: "2026-10-07", cese: null }], "99900001", semana, [indebida]);
    expect(resultado[0]).toBe(indebida);
  });

  it("sin relaciones confirmadas toda la semana queda «Sin relación laboral»", () => {
    const resultado = ajustarSemanaALaRelacionLaboral([], "99900001", semana, []);
    expect(resultado).toHaveLength(7);
    expect(resultado.every((celda) => celda.motivoNoAsistencia === "sin_relacion_laboral")).toBe(true);
  });
});
