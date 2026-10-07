import { describe, expect, it } from "vitest";

import { armarHistorial, datosFaltantes, fechaDeHoyEnLima, valorVigenteEn, valoresVigentesEn, type CondicionLaboral } from "./vigencia";

let contador = 0;
function condicion(parcial: Partial<CondicionLaboral> & Pick<CondicionLaboral, "dato" | "valor" | "vigenteDesde">): CondicionLaboral {
  contador += 1;
  return {
    id: `c${contador}`, relacionId: "r1", registradaPorId: "f1", registradaPor: "finanzas",
    registradaEn: new Date(Date.UTC(2026, 0, 1, 0, 0, contador)), reemplazadaEn: null, motivoDeReemplazo: null, ...parcial,
  };
}

const sueldos = [
  condicion({ dato: "sueldo", valor: 150000, vigenteDesde: "2026-03-02" }),
  condicion({ dato: "sueldo", valor: 180000, vigenteDesde: "2026-09-16" }),
];

describe("valor vigente en una fecha", () => {
  it("devuelve el valor de la última vigencia que ya empezó", () => {
    expect(valorVigenteEn(sueldos, "sueldo", "2026-03-02")).toBe(150000);
    expect(valorVigenteEn(sueldos, "sueldo", "2026-09-15")).toBe(150000);
    expect(valorVigenteEn(sueldos, "sueldo", "2026-09-16")).toBe(180000);
    expect(valorVigenteEn(sueldos, "sueldo", "2030-01-01")).toBe(180000);
  });

  it("un cambio de sueldo a mitad de mes se representa con dos vigencias contiguas", () => {
    const [primera, segunda] = armarHistorial(sueldos, "2026-09-20");
    expect(primera).toMatchObject({ vigenteDesde: "2026-03-02", vigenteHasta: "2026-09-15", estado: "anterior" });
    expect(segunda).toMatchObject({ vigenteDesde: "2026-09-16", vigenteHasta: null, estado: "vigente" });
  });

  it("antes de la primera vigencia no hay valor: falta, no es cero", () => {
    expect(valorVigenteEn(sueldos, "sueldo", "2026-03-01")).toBeUndefined();
    expect(valorVigenteEn([], "sueldo", "2026-03-01")).toBeUndefined();
  });

  it("ignora los valores reemplazados", () => {
    const reemplazado = condicion({ dato: "sueldo", valor: 99900, vigenteDesde: "2026-09-16", registradaEn: new Date("2026-01-01T00:00:00Z"), reemplazadaEn: new Date(), motivoDeReemplazo: "Error de digitación" });
    expect(valorVigenteEn([...sueldos, reemplazado], "sueldo", "2026-09-20")).toBe(180000);
  });

  it("no mezcla datos distintos", () => {
    const jornada = condicion({ dato: "jornada_ordinaria_diaria", valor: 480, vigenteDesde: "2026-03-02" });
    expect(valorVigenteEn([...sueldos, jornada], "sueldo", "2026-04-01")).toBe(150000);
  });
});

describe("historial de un dato", () => {
  it("marca como programado lo que empieza después de hoy y como vigente lo que rige hoy", () => {
    const historial = armarHistorial([...sueldos, condicion({ dato: "sueldo", valor: 200000, vigenteDesde: "2026-11-01" })], "2026-10-07");
    expect(historial.map(({ estado }) => estado)).toEqual(["anterior", "vigente", "programado"]);
    expect(historial[1].vigenteHasta).toBe("2026-10-31");
  });

  it("conserva los reemplazados con su motivo junto a quien los sustituyó", () => {
    const errado = condicion({ dato: "sueldo", valor: 99900, vigenteDesde: "2026-09-16", registradaEn: new Date("2026-01-01T00:00:00Z"), reemplazadaEn: new Date(), motivoDeReemplazo: "Error de digitación" });
    const historial = armarHistorial([sueldos[1], errado, sueldos[0]], "2026-10-07");
    expect(historial.map(({ estado }) => estado)).toEqual(["anterior", "reemplazado", "vigente"]);
    expect(historial[1]).toMatchObject({ motivoDeReemplazo: "Error de digitación", vigenteHasta: null });
  });

  it("sin condiciones el historial está vacío", () => {
    expect(armarHistorial([], "2026-10-07")).toEqual([]);
  });
});

describe("valores vigentes y datos faltantes", () => {
  const completas = [
    condicion({ dato: "sueldo", valor: 150000, vigenteDesde: "2026-03-02" }),
    condicion({ dato: "jornada_ordinaria_diaria", valor: 480, vigenteDesde: "2026-03-02" }),
    condicion({ dato: "regimen_laboral", valor: "general", vigenteDesde: "2026-03-02" }),
    condicion({ dato: "afiliacion_pensionaria", valor: "onp", vigenteDesde: "2026-03-02" }),
    condicion({ dato: "elegibilidad_familiar", valor: false, vigenteDesde: "2026-03-02" }),
    condicion({ dato: "sede_de_adscripcion", valor: "Taller", vigenteDesde: "2026-03-02" }),
  ];

  it("devuelve los siete datos de la fecha, con undefined donde falta", () => {
    const vigentes = valoresVigentesEn(completas, "2026-04-01");
    expect(vigentes.sueldo).toBe(150000);
    expect(vigentes.elegibilidad_familiar).toBe(false);
    expect(vigentes.comision_afp).toBeUndefined();
  });

  it("con ONP no se exige el esquema de comisión; con AFP sí", () => {
    expect(datosFaltantes(valoresVigentesEn(completas, "2026-04-01"))).toEqual([]);
    const conAfp = [...completas.slice(0, 3), condicion({ dato: "afiliacion_pensionaria", valor: "afp_integra", vigenteDesde: "2026-03-02" }), ...completas.slice(4)];
    expect(datosFaltantes(valoresVigentesEn(conAfp, "2026-04-01"))).toEqual(["comision_afp"]);
  });

  it("una persona sin nada tiene todos los datos pendientes menos el esquema", () => {
    expect(datosFaltantes(valoresVigentesEn([], "2026-04-01"))).toEqual(["sueldo", "jornada_ordinaria_diaria", "regimen_laboral", "afiliacion_pensionaria", "elegibilidad_familiar", "sede_de_adscripcion"]);
  });
});

describe("hoy en Lima", () => {
  it("usa la fecha civil de Lima, no la UTC", () => {
    expect(fechaDeHoyEnLima(new Date("2026-10-08T03:30:00Z"))).toBe("2026-10-07");
    expect(fechaDeHoyEnLima(new Date("2026-10-08T05:30:00Z"))).toBe("2026-10-08");
  });
});
