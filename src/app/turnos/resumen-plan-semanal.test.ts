import { describe, expect, it } from "vitest";

import { resumirPlanSemanal } from "./resumen-plan-semanal";

describe("resumirPlanSemanal", () => {
  it("cuenta como asignada una celda publicada aunque no esté en el borrador", () => {
    const resumen = resumirPlanSemanal(
      [{ idHuellero: "A" }, { idHuellero: "B" }],
      ["2026-09-07", "2026-09-08"],
      [{ idHuellero: "A", fecha: "2026-09-08", sede: "Taller", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false }],
      [{ idHuellero: "A", fecha: "2026-09-07", sede: "Taller", entradaProgramada: "09:00", salidaProgramada: "18:00", descanso: false }],
    );

    expect(resumen).toEqual({ total: 4, asignadas: 2, faltantesPorColaborador: [{ idHuellero: "B" }] });
  });
});
