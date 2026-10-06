import { describe, expect, it } from "vitest";

import {
  estaVigenteEn,
  seSuperponeConElRango,
  verificarJornadaContraLaVigencia,
  verificarQueLaSemanaTengaRelacion,
  vigenciasConfirmadas,
  type RelacionLaboral,
} from "./vigencia";

function relacion(parcial: Partial<RelacionLaboral>): RelacionLaboral {
  return { id: "r1", dni: "99900001", ingreso: "2026-03-02", cese: null, ingresoConfirmado: true, ceseConfirmado: false, ...parcial };
}

describe("vigenciasConfirmadas", () => {
  it("ignora la relación cuyo ingreso Recursos Humanos aún no confirmó", () => {
    expect(vigenciasConfirmadas([relacion({ ingresoConfirmado: false })])).toEqual([]);
  });

  it("un cese sin confirmar no corta la vigencia", () => {
    expect(vigenciasConfirmadas([relacion({ cese: "2026-06-30", ceseConfirmado: false })])).toEqual([{ ingreso: "2026-03-02", cese: null }]);
  });

  it("un cese confirmado corta la vigencia", () => {
    expect(vigenciasConfirmadas([relacion({ cese: "2026-06-30", ceseConfirmado: true })])).toEqual([{ ingreso: "2026-03-02", cese: "2026-06-30" }]);
  });
});

describe("estaVigenteEn", () => {
  const vigencias = [{ ingreso: "2026-03-02", cese: "2026-06-30" }, { ingreso: "2026-09-09", cese: null }];

  it.each([
    ["2026-03-01", false],
    ["2026-03-02", true],
    ["2026-06-30", true],
    ["2026-07-01", false],
    ["2026-09-08", false],
    ["2026-09-09", true],
    ["2030-01-01", true],
  ])("%s -> %s", (fecha, esperado) => {
    expect(estaVigenteEn(vigencias, fecha)).toBe(esperado);
  });
});

describe("seSuperponeConElRango", () => {
  it("detecta cualquier día en común con el rango, incluidos los extremos", () => {
    const vigencia = { ingreso: "2026-03-02", cese: "2026-06-30" };
    expect(seSuperponeConElRango(vigencia, "2026-06-30", "2026-07-05")).toBe(true);
    expect(seSuperponeConElRango(vigencia, "2026-07-01", "2026-07-05")).toBe(false);
    expect(seSuperponeConElRango(vigencia, "2026-02-20", "2026-03-02")).toBe(true);
    expect(seSuperponeConElRango(vigencia, "2026-02-20", "2026-03-01")).toBe(false);
    expect(seSuperponeConElRango({ ingreso: "2026-09-09", cese: null }, "2027-01-01", "2027-01-31")).toBe(true);
  });
});

describe("verificarJornadaContraLaVigencia", () => {
  const vigencias = [{ ingreso: "2026-10-07", cese: null }];

  it("rechaza una jornada previa al ingreso que no sea «Sin relación laboral»", () => {
    expect(() => verificarJornadaContraLaVigencia(vigencias, "2026-10-06", null))
      .toThrow(/06\/10\/2026.*fuera de la relación laboral confirmada.*Sin relación laboral/);
    expect(() => verificarJornadaContraLaVigencia(vigencias, "2026-10-06", "descanso")).toThrow(/fuera de la relación laboral/);
  });

  it("acepta «Sin relación laboral» fuera de la relación", () => {
    expect(() => verificarJornadaContraLaVigencia(vigencias, "2026-10-06", "sin_relacion_laboral")).not.toThrow();
  });

  it("acepta cualquier jornada dentro de la relación, menos «Sin relación laboral»", () => {
    expect(() => verificarJornadaContraLaVigencia(vigencias, "2026-10-07", null)).not.toThrow();
    expect(() => verificarJornadaContraLaVigencia(vigencias, "2026-10-07", "vacaciones")).not.toThrow();
    expect(() => verificarJornadaContraLaVigencia(vigencias, "2026-10-07", "sin_relacion_laboral")).toThrow(/dentro de una relación laboral confirmada/);
  });

  it("sin ninguna relación confirmada toda jornada laboral queda fuera", () => {
    expect(() => verificarJornadaContraLaVigencia([], "2026-10-07", null)).toThrow(/fuera de la relación laboral/);
  });
});

describe("verificarQueLaSemanaTengaRelacion", () => {
  const semana = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];

  it("pasa si al menos un día cae dentro de una relación confirmada", () => {
    expect(() => verificarQueLaSemanaTengaRelacion([{ ingreso: "2026-10-11", cese: null }], semana)).not.toThrow();
    expect(() => verificarQueLaSemanaTengaRelacion([{ ingreso: "2026-01-01", cese: "2026-10-05" }], semana)).not.toThrow();
  });

  it("falla con la causa y el siguiente paso si ningún día está dentro", () => {
    expect(() => verificarQueLaSemanaTengaRelacion([], semana)).toThrow(/Recursos Humanos.*registre y confirme/i);
    expect(() => verificarQueLaSemanaTengaRelacion([{ ingreso: "2026-10-12", cese: null }], semana)).toThrow(/relación laboral confirmada/);
    expect(() => verificarQueLaSemanaTengaRelacion([{ ingreso: "2026-01-01", cese: "2026-10-04" }], semana)).toThrow(/relación laboral confirmada/);
  });
});
