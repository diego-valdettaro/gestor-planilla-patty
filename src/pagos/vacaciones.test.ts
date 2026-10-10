import { describe, expect, it } from "vitest";

import { asociarAbono, descansosDe, diasConvencionalesDelMes, fechasEnMes, mesesDelDescanso, repartirAbono, ventanaDeVacaciones } from "./vacaciones";

const referencia = ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];

describe("descansos vacacionales", () => {
  it("agrupa los días consecutivos «vacaciones» en un descanso, sin repetir fechas ni depender del orden", () => {
    const descansos = descansosDe([...referencia].reverse().concat(referencia[0], "2026-10-10", "2026-10-11"));
    expect(descansos.map(({ inicio, fin, fechas }) => ({ inicio, fin, dias: fechas.length }))).toEqual([
      { inicio: "2026-09-29", fin: "2026-10-04", dias: 6 },
      { inicio: "2026-10-10", fin: "2026-10-11", dias: 2 },
    ]);
  });

  it("une descansos que cruzan el fin de año y de febrero bisiesto", () => {
    expect(descansosDe(["2026-12-30", "2026-12-31", "2027-01-01"])).toHaveLength(1);
    expect(descansosDe(["2028-02-28", "2028-02-29", "2028-03-01"])).toHaveLength(1);
  });

  it("separa por mes calendario los días de un descanso que cruza meses", () => {
    const [descanso] = descansosDe(referencia);
    expect(mesesDelDescanso(descanso)).toEqual(["2026-09", "2026-10"]);
    expect(fechasEnMes(descanso, "2026-09")).toHaveLength(2);
    expect(fechasEnMes(descanso, "2026-10")).toHaveLength(4);
  });
});

describe("abono anticipado", () => {
  it("se asocia al descanso más cercano que empieza en o después de la fecha del abono", () => {
    const descansos = descansosDe([...referencia, "2026-11-10", "2026-11-11"]);
    expect(asociarAbono(descansos, "2026-09-28")?.inicio).toBe("2026-09-29");
    expect(asociarAbono(descansos, "2026-09-29")?.inicio).toBe("2026-09-29");
    expect(asociarAbono(descansos, "2026-10-05")?.inicio).toBe("2026-11-10");
    expect(asociarAbono(descansos, "2026-11-12")).toBeUndefined();
  });

  it("se reparte por días calendario y los céntimos sobrantes van al último mes", () => {
    const [descanso] = descansosDe(referencia);
    expect(repartirAbono(descanso, 100_000)).toEqual([{ mes: "2026-09", centimos: 33_333 }, { mes: "2026-10", centimos: 66_667 }]);
    const reparto = repartirAbono(descanso, 100_001);
    expect(reparto.reduce((suma, { centimos }) => suma + centimos, 0)).toBe(100_001);
    expect(reparto[0].centimos).toBe(33_333);
  });

  it("un descanso de un solo mes asigna todo el abono a ese mes", () => {
    const [descanso] = descansosDe(["2026-10-12", "2026-10-13"]);
    expect(repartirAbono(descanso, 5_000)).toEqual([{ mes: "2026-10", centimos: 5_000 }]);
  });
});

describe("días convencionales de un mes de 30", () => {
  it("el día 31 no suma y febrero completa los 30 días si el descanso llega a su último día", () => {
    expect(diasConvencionalesDelMes(["2026-10-29", "2026-10-30", "2026-10-31"], "2026-10")).toBe(2);
    expect(diasConvencionalesDelMes(["2026-09-29", "2026-09-30"], "2026-09")).toBe(2);
    expect(diasConvencionalesDelMes(["2026-02-25", "2026-02-26", "2026-02-27", "2026-02-28"], "2026-02")).toBe(6);
    expect(diasConvencionalesDelMes(["2028-02-28", "2028-02-29"], "2028-02")).toBe(3);
    expect(diasConvencionalesDelMes(["2026-02-10", "2026-02-11"], "2026-02")).toBe(2);
  });
});

describe("ventana de lectura de vacaciones", () => {
  it("va del primer día del mes anterior al último del mes siguiente, también entre años", () => {
    expect(ventanaDeVacaciones("2026-10")).toEqual({ inicio: "2026-09-01", fin: "2026-11-30" });
    expect(ventanaDeVacaciones("2027-01")).toEqual({ inicio: "2026-12-01", fin: "2027-02-28" });
    expect(ventanaDeVacaciones("2026-12")).toEqual({ inicio: "2026-11-01", fin: "2027-01-31" });
  });
});
