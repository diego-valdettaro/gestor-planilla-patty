import { describe, expect, it } from "vitest";

import { CONCEPTOS } from "@/conceptos-de-preliquidacion/catalogo";
import type { ImporteExterno } from "@/fuentes-externas/gestionar-fuentes-externas";

import { calcularBorrador, type EntradaDeBorrador } from "./calcular-borrador";

// Cese sin conciliar y duplicación de la liquidación por cese (#128). Esperados de ejemplos-sinteticos.md (C-E1..C-E8) y de
// la aritmética del sueldo del fixture (12 días de 30 con sueldo 200000 = 80000), en céntimos. Datos sintéticos.
const mes = "2026-10";
const corte = { inicio: "2026-09-26", fin: "2026-10-25" };
const persona = (id: string, dni: string, nombre: string, parcial: Partial<EntradaDeBorrador["relaciones"][number]> = {}) =>
  ({ id, dni, nombre, grupo: "Taller", ingreso: "2026-01-01", cese: null, ingresoConfirmado: true, ceseConfirmado: false, ...parcial });
const ana = persona("r1", "11111111", "Ana", { cese: "2026-10-12", ceseConfirmado: true });
const anaSinCese = persona("r1", "11111111", "Ana");
const carla = persona("r2", "22222222", "Carla");
const carlos = persona("r3", "33333333", "Carlos", { cese: "2026-10-12", ceseConfirmado: false });
const beto = persona("r4", "44444444", "Beto", { cese: "2026-09-28", ceseConfirmado: true });

const condiciones = (relacionId: string, sueldo: number): EntradaDeBorrador["condiciones"] => ([
  ["sueldo", sueldo], ["jornada_ordinaria_diaria", 480], ["regimen_laboral", "general"], ["afiliacion_pensionaria", "onp"], ["elegibilidad_familiar", false], ["sede_de_adscripcion", "Taller"],
] as const).map(([dato, valor]) => ({ relacionId, dato, valor, vigenteDesde: "2026-01-01" }));

const reglasDemo: EntradaDeBorrador["reglas"] = [
  { codigo: "onp_tasa", valor: 1300, vigenteDesde: "2026-01-01" },
  { codigo: "essalud_tasa", valor: 900, vigenteDesde: "2026-01-01" },
  { codigo: "essalud_base_minima", valor: 100000, vigenteDesde: "2026-01-01" },
];

function entrada(parcial: Partial<EntradaDeBorrador> = {}): EntradaDeBorrador {
  return { mesDePago: mes, corte, relaciones: [ana, carla], condiciones: [...condiciones("r1", 200000), ...condiciones("r2", 200000), ...condiciones("r3", 200000), ...condiciones("r4", 200000)],
    reglas: reglasDemo, problemasDelCorte: [], revisiones: [], hechosPorDni: {}, sustitutorios: [],
    hechosDeOrigenPorDni: {}, fuentesPendientes: [], importes: [], diasDeVacaciones: {}, abonosVacacionales: [], vacacionesProvisionales: false, ...parcial };
}
const calcular = (parcial: Partial<EntradaDeBorrador> = {}) => calcularBorrador(entrada(parcial));
const de = (resultado: ReturnType<typeof calcular>, nombre: string) => {
  const encontrada = resultado.personas.find((candidata) => candidata.relacion.nombre === nombre);
  if (!encontrada) throw new Error(`Falta ${nombre} en el borrador.`);
  return encontrada;
};

function importe(concepto: string, tipoDeFuente: string, monto: number, parcial: Partial<ImporteExterno> = {}): ImporteExterno {
  return { id: `${concepto}-${monto}-${parcial.mesDeDevengue ?? mes}`, nombre: "Ana", dni: ana.dni, concepto, tipoDeFuente: tipoDeFuente as ImporteExterno["tipoDeFuente"], fechaDelHecho: "2026-10-12", mesDeDevengue: mes, mesDeAplicacion: mes, monto,
    procedencia: "carga_manual", registradoPorId: "f-1", registradoPor: "Finanzas", registradoEn: new Date("2026-10-13T00:00:00Z"), anuladoEn: null, motivoDeAnulacion: null,
    importacionId: null, estadoDeIncidencia: null, sustento: null, autorizadoPor: null, fechaDeAutorizacion: null, conceptoAjustado: null, sentidoAjuste: null, motivoDeAjuste: null, ...parcial };
}
const conciliacion = (concepto: string, monto: number, parcial: Partial<ImporteExterno> = {}) => importe(concepto, "conciliacion_de_liquidacion_por_cese", monto, parcial);
const vacacionesTruncas = (monto = 40000, parcial: Partial<ImporteExterno> = {}) => conciliacion("vacaciones_truncas", monto, parcial);
const ctsTrunca = (monto = 90000) => conciliacion("cts_trunca", monto);
const abono = (monto = 70000) => conciliacion("abono_de_liquidacion", monto, { fechaDelHecho: "2026-10-13" });
const filasDeC2 = () => [vacacionesTruncas(), ctsTrunca()];

const BLOQUEO_DE_CESE = "El cese de Ana no tiene su liquidación conciliada.";
const conBloqueoDeCese = (bloqueos: string[]) => bloqueos.filter((bloqueo) => bloqueo.includes("no tiene su liquidación conciliada"));

describe("cese sin conciliar", () => {
  it("CAL-04 un cese confirmado en el mes, sin filas y con el tipo sin confirmar bloquea el mes y a la persona", () => {
    const resultado = calcular({ conciliacionConfirmada: false });
    expect(resultado.bloqueosDelMes).toContain(BLOQUEO_DE_CESE);
    expect(de(resultado, "Ana").bloqueos).toContain(BLOQUEO_DE_CESE);
    expect(de(resultado, "Ana").netoCentimos).toBeNull();
    expect(de(resultado, "Carla").netoCentimos).toBe(200000);
    expect(conBloqueoDeCese(de(resultado, "Carla").bloqueos)).toEqual([]);
  });

  it("CAL-05 conciliada (tipo confirmado y dos filas vigentes): sin bloqueo y la liquidación no suma al neto", () => {
    const resultado = calcular({ conciliacionConfirmada: true, importes: filasDeC2() });
    expect(conBloqueoDeCese(resultado.bloqueosDelMes)).toEqual([]);
    expect(resultado.bloqueosDelMes.some((bloqueo) => /duplicación/i.test(bloqueo))).toBe(false);
    expect(de(resultado, "Ana").bloqueos).toEqual([]);
    expect(de(resultado, "Ana").netoCentimos).toBe(80000);
    expect(de(resultado, "Ana").conciliacion?.conceptosCentimos).toBe(130000);
  });

  it("CAL-06 el tipo confirmado pero sin filas de la persona sigue bloqueando", () => {
    const resultado = calcular({ conciliacionConfirmada: true, importes: [] });
    expect(resultado.bloqueosDelMes).toContain(BLOQUEO_DE_CESE);
    expect(de(resultado, "Ana").bloqueos).toContain(BLOQUEO_DE_CESE);
  });

  it("CAL-07 con filas vigentes pero el tipo sin confirmar sigue bloqueando", () => {
    const resultado = calcular({ conciliacionConfirmada: false, importes: filasDeC2() });
    expect(resultado.bloqueosDelMes).toContain(BLOQUEO_DE_CESE);
    expect(de(resultado, "Ana").bloqueos).toContain(BLOQUEO_DE_CESE);
  });

  it("CAL-08 una fila anulada no cuenta como vigente", () => {
    const anulada = vacacionesTruncas(40000, { anuladoEn: new Date("2026-10-14T00:00:00Z"), motivoDeAnulacion: "Error de carga" });
    const resultado = calcular({ conciliacionConfirmada: true, importes: [anulada] });
    expect(resultado.bloqueosDelMes).toContain(BLOQUEO_DE_CESE);
    expect(de(resultado, "Ana").bloqueos).toContain(BLOQUEO_DE_CESE);
  });

  it("CAL-09 un cese sin confirmar por RR. HH. no bloquea", () => {
    const resultado = calcular({ relaciones: [ana, carlos], conciliacionConfirmada: false });
    // Control positivo: la regla sí bloquea a Ana, cuyo cese está confirmado.
    expect(resultado.bloqueosDelMes).toContain(BLOQUEO_DE_CESE);
    expect(resultado.bloqueosDelMes.some((bloqueo) => bloqueo.includes("Carlos"))).toBe(false);
    expect(conBloqueoDeCese(de(resultado, "Carlos").bloqueos)).toEqual([]);
    expect(de(resultado, "Carlos").netoCentimos).not.toBeNull();
  });

  it("CAL-10 un cese de otro mes no bloquea el mes", () => {
    const resultado = calcular({ relaciones: [ana, beto], conciliacionConfirmada: false });
    // Control positivo: la regla sí bloquea a Ana, cuyo cese cae en el mes de pago.
    expect(resultado.bloqueosDelMes).toContain(BLOQUEO_DE_CESE);
    expect(resultado.bloqueosDelMes.some((bloqueo) => bloqueo.includes("Beto"))).toBe(false);
    expect(resultado.personas.flatMap(({ bloqueos }) => bloqueos).some((bloqueo) => bloqueo.includes("Beto"))).toBe(false);
  });
});

describe("importes de la conciliación fuera del neto y de las bases", () => {
  it("CAL-11 los importes de conciliación y el abono no entran al neto, ni a las bases, ni a las líneas; el total se expone aparte", () => {
    const resultado = de(calcular({ conciliacionConfirmada: true, importes: [...filasDeC2(), abono()] }), "Ana");
    expect(resultado.netoCentimos).toBe(80000);
    expect(resultado.basesPorDevengue).toEqual([{ mesDeDevengue: mes, pensionariaCentimos: 80000, essaludRemunerativaCentimos: 80000,
      essaludAplicableCentimos: expect.anything(), quintaCentimos: 80000 }]);
    const conceptosDeConciliacion = ["vacaciones_truncas", "cts_trunca", "gratificacion_trunca", "remuneracion_pendiente_del_mes", "abono_de_liquidacion"];
    expect(resultado.lineas.filter(({ concepto }) => conceptosDeConciliacion.includes(concepto))).toEqual([]);
    expect(resultado.conciliacion).toEqual({ conceptosCentimos: 130000, abonosCentimos: 70000 });
  });

  it("CAL-12 una fila con devengue anterior no agrega un mes «Pendiente» a las bases", () => {
    const resultado = de(calcular({ conciliacionConfirmada: true, importes: [vacacionesTruncas(40000, { mesDeDevengue: "2026-09" })] }), "Ana");
    expect(resultado.basesPorDevengue.map(({ mesDeDevengue }) => mesDeDevengue)).toEqual([mes]);
  });
});

describe("no duplicación con el pago mensual y la gratificación", () => {
  const conVacaciones = {
    relaciones: [anaSinCese], condiciones: condiciones("r1", 90000),
    diasDeVacaciones: { [anaSinCese.dni]: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"] },
  };

  it("CAL-13 las vacaciones truncas equivalentes a la remuneración vacacional del pago mensual bloquean a la persona; con otro devengue no", () => {
    const base = de(calcular({ ...conVacaciones }), "Ana");
    // El pago mensual ya incluye 5 días × 90000 ÷ 30 = 15000 de remuneración vacacional (C-E5).
    expect(base.lineas).toContainEqual(expect.objectContaining({ concepto: "remuneracion_vacacional", importeCentimos: 15000, mesDeDevengue: mes }));
    const duplicada = de(calcular({ ...conVacaciones, importes: [vacacionesTruncas()] }), "Ana");
    expect(duplicada.bloqueos.some((bloqueo) => /duplicación: vacaciones truncas ya incluidas en el pago mensual/i.test(bloqueo))).toBe(true);
    expect(duplicada.netoCentimos).toBeNull();
    const otroDevengue = de(calcular({ ...conVacaciones, importes: [vacacionesTruncas(40000, { mesDeDevengue: "2026-09" })] }), "Ana");
    expect(otroDevengue.bloqueos.some((bloqueo) => /duplicación/i.test(bloqueo))).toBe(false);
    expect(otroDevengue.netoCentimos).toBe(base.netoCentimos);
    expect(otroDevengue.netoCentimos).toBe(90000);
  });

  it("CAL-14 la gratificación trunca duplica a una gratificación legal ya cargada del mismo devengue", () => {
    const gratificacionLegal = importe("gratificacion_legal", "gratificacion_y_bonificacion", 50000, { mesDeDevengue: "2026-07", fechaDelHecho: "2026-07-15" });
    const trunca = conciliacion("gratificacion_trunca", 30000, { mesDeDevengue: "2026-07" });
    const duplicada = de(calcular({ relaciones: [anaSinCese], importes: [gratificacionLegal, trunca] }), "Ana");
    expect(duplicada.bloqueos.filter((bloqueo) => /duplicación/i.test(bloqueo))).toHaveLength(1);
    expect(duplicada.netoCentimos).toBeNull();
    expect(duplicada.lineas.filter(({ concepto }) => ["gratificacion_legal", "gratificacion_trunca"].includes(concepto))).toEqual([]);
    const sinPrevia = de(calcular({ relaciones: [anaSinCese], importes: [trunca] }), "Ana");
    expect(sinPrevia.bloqueos.some((bloqueo) => /duplicación/i.test(bloqueo))).toBe(false);
    expect(sinPrevia.netoCentimos).toBe(200000);
  });

  it("CAL-16 un duplicado exacto no se suma dos veces en el total de la conciliación", () => {
    const resultado = de(calcular({ conciliacionConfirmada: true, importes: [vacacionesTruncas(), { ...vacacionesTruncas(), id: "otro-id" }] }), "Ana");
    expect(resultado.conciliacion?.conceptosCentimos).toBe(40000);
    expect(resultado.bloqueos).toEqual([]);
  });
});

// Prueba posterior (regresión, no TDD): C5 / C-E9, ADR 0009. Comprobación estructural; no demuestra ausencia de tablas contables fuera del módulo.
describe("sin provisiones ni asientos", () => {
  it("RG-01 ninguna línea del borrador ni código del catálogo es una provisión o un asiento", () => {
    const resultado = de(calcular({ conciliacionConfirmada: true, importes: [...filasDeC2(), abono()] }), "Ana");
    expect(resultado.lineas.filter(({ concepto }) => /provisi|asiento/i.test(concepto))).toEqual([]);
    expect(CONCEPTOS.filter(({ codigo, nombre }) => /provisi|asiento/i.test(`${codigo} ${nombre}`))).toEqual([]);
  });
});
