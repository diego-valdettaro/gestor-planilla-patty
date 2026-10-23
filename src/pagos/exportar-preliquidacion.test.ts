import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import type { LineaDeFuenteExterna } from "./fuentes-en-el-neto";
import type { LineaDeSueldo } from "./calcular-borrador";
import type { CondicionLaboral } from "@/condiciones-laborales/vigencia";

import { construirArchivoDePreliquidacion, sedeDeAdscripcionAlFinalizar, type PersonaParaExportar, type PreliquidacionParaExportar } from "./exportar-preliquidacion";

// Esperados escritos a mano desde el caso resuelto del escenario #130 (mes 2019-12, corte 26/11 al 25/12): Néstor Neto Negativo, sueldo S/ 1.500,00 y préstamo S/ 3.000,00.
const CORTE = { inicio: "2019-11-26", fin: "2019-12-25" };
const sueldo: LineaDeSueldo = { concepto: "sueldo_basico", importeCentimos: 150000, dias: 30, sueldoMensualCentimos: 150000, desde: "2019-12-01", hasta: "2019-12-30",
  mesDePago: "2019-12", corte: CORTE, mesDeDevengue: "2019-12", origen: "Condición laboral" };
const prestamo: LineaDeFuenteExterna = { concepto: "cuota_de_prestamo", tipoDeFuente: "prestamos", importeCentimos: 300000, efectoEnNeto: "resta",
  efectosEnBases: { pensionaria: "no_afecta", essalud: "no_afecta", quinta: "no_afecta" }, origen: "Fuente externa", procedencia: "Carga manual de finanzas",
  fechaDelHecho: "2019-12-02", mesDeDevengue: "2019-12", mesDePago: "2019-12", corte: CORTE };

const nestor: PersonaParaExportar = { dni: "99913004", nombre: "Néstor Neto Negativo", sedeDeAdscripcion: "Tienda Benavides", sueldoCalculadoCentimos: 150000,
  netoCentimos: null, bloqueos: ["Neto negativo: −S/ 1.500,00"], lineas: [sueldo, prestamo],
  bases: [{ mesDeDevengue: "2019-12", pensionariaCentimos: 150000, essaludRemunerativaCentimos: 150000, essaludAplicableCentimos: 150000, quintaCentimos: null }] };

const base: PreliquidacionParaExportar = { mes: "2019-12", corte: CORTE, estado: { tipo: "borrador" }, generadaEn: new Date("2026-10-22T15:30:00Z"), generadaPor: "finanzas",
  revisiones: [{ inicio: "2019-11-26", fin: "2019-12-25", numero: 1 }], personas: [nestor], fuentes: [{ nombre: "Préstamos (cuotas)", estado: "Confirmada", filas: 1 }] };

const version2 = { tipo: "version" as const, numero: 2, finalizadaPor: "finanzas", finalizadaEn: new Date("2019-12-26T14:00:00Z") };

function leer(archivo: { contenido: Uint8Array }) {
  const libro = XLSX.read(archivo.contenido, { type: "array" });
  const hojas = Object.fromEntries(libro.SheetNames.map((nombre) => [nombre, XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], { header: 1, defval: "" })]));
  return { nombres: libro.SheetNames, hojas };
}
const textoDe = (filas: unknown[][]) => filas.flat().map(String).join("\n");
const valorDe = (filas: unknown[][], rotulo: string) => filas.find(([r]) => r === rotulo)?.[1];

describe("G1 estado y encabezado de la exportación", () => {
  it("F-01 un borrador declara «Borrador, no definitivo» y que no tiene versión", () => {
    const { hojas } = leer(construirArchivoDePreliquidacion(base));
    expect(valorDe(hojas["Preliquidación"], "Estado")).toBe("Borrador, no definitivo");
    expect(valorDe(hojas["Preliquidación"], "Identificador")).toBe("Sin versión finalizada");
  });

  it("F-02 una versión declara «Versión 2 finalizada», su identificador, responsable y fecha", () => {
    const { hojas } = leer(construirArchivoDePreliquidacion({ ...base, estado: version2 }));
    const encabezado = hojas["Preliquidación"];
    expect(valorDe(encabezado, "Estado")).toBe("Versión 2 finalizada");
    expect(valorDe(encabezado, "Identificador")).toBe("2019-12-v2");
    expect(valorDe(encabezado, "Finalizada por")).toBe("finanzas");
    expect(valorDe(encabezado, "Finalizada el")).toBe("26/12/2019");
    expect(textoDe(encabezado)).not.toContain("Borrador");
  });

  it("F-03 el archivo se llama preliquidacion-… y declara que no es el resumen del período ni una planilla oficial", () => {
    const borrador = construirArchivoDePreliquidacion(base);
    const version = construirArchivoDePreliquidacion({ ...base, estado: version2 });
    expect(borrador.nombre).toBe("preliquidacion-2019-12-borrador.xlsx");
    expect(version.nombre).toBe("preliquidacion-2019-12-version-2.xlsx");
    const { nombres, hojas } = leer(borrador);
    expect(nombres[0]).toBe("Preliquidación");
    expect(valorDe(hojas["Preliquidación"], "Documento")).toBe("Preliquidación del mes de pago 12/2019");
    expect(valorDe(hojas["Preliquidación"], "Aviso")).toBe("No es una planilla oficial ni sustituye PLAME. Para el resumen de asistencia, use la exportación del período.");
    expect(valorDe(hojas["Preliquidación"], "Mes de pago")).toBe("12/2019");
    expect(valorDe(hojas["Preliquidación"], "Corte de incidencias")).toBe("26/11/2019 al 25/12/2019");
    expect(valorDe(hojas["Preliquidación"], "Generado el")).toBe("22/10/2026");
    expect(valorDe(hojas["Preliquidación"], "Generado por")).toBe("finanzas");
  });
});

const ENCABEZADO_DE_CONCEPTOS = ["DNI", "Persona", "Sede de adscripción", "Concepto", "Efecto en el neto", "Importe (S/)", "Fecha del hecho", "Mes de devengue", "Mes de aplicación", "Mes de pago", "Procedencia", "Detalle"];
const ENCABEZADO_DE_BASES = ["DNI", "Persona", "Sede de adscripción", "Mes de devengue", "Base pensionaria (S/)", "Base de EsSalud remunerativa (S/)", "Base de EsSalud aplicable (S/)", "Base de quinta categoría (S/)"];

describe("G2 líneas: conceptos, tres tiempos, procedencia y bases", () => {
  it("F-04 y F-05 cada línea trae concepto, efecto en el neto, importe en soles, fecha del hecho, devengue, aplicación y procedencia", () => {
    const { hojas } = leer(construirArchivoDePreliquidacion(base));
    expect(hojas["Conceptos"]).toEqual([
      ENCABEZADO_DE_CONCEPTOS,
      ["99913004", "Néstor Neto Negativo", "Tienda Benavides", "Sueldo básico", "Suma", 1500, "01/12/2019 al 30/12/2019", "12/2019", "12/2019", "12/2019", "Condición laboral", "30 días"],
      ["99913004", "Néstor Neto Negativo", "Tienda Benavides", "Cuota de préstamo", "Resta", 3000, "02/12/2019", "12/2019", "12/2019", "12/2019", "Fuente externa · Carga manual de finanzas", ""],
    ]);
  });

  it("F-04 un importe aplicado un mes después conserva su devengue y su mes de aplicación por separado", () => {
    const regularizacion: LineaDeFuenteExterna = { ...prestamo, concepto: "adelanto", tipoDeFuente: "adelantos", importeCentimos: 12345, fechaDelHecho: "2019-10-15", mesDeDevengue: "2019-10", mesDePago: "2019-12" };
    const { hojas } = leer(construirArchivoDePreliquidacion({ ...base, personas: [{ ...nestor, lineas: [regularizacion] }] }));
    expect(hojas["Conceptos"][1]).toEqual(["99913004", "Néstor Neto Negativo", "Tienda Benavides", "Adelanto", "Resta", 123.45, "15/10/2019", "10/2019", "12/2019", "12/2019", "Fuente externa · Carga manual de finanzas", ""]);
  });

  it("F-04 un aporte del trabajador no entra al subtotal «Neto antes de aportes del trabajador» y lo dice", () => {
    const onp = { concepto: "aporte_onp", importeCentimos: 19500, baseCentimos: 150000, tasaEnCentesimasDePunto: 1300, tipo: "deduccion_del_trabajador", efectoEnNeto: "resta",
      mesDeDevengue: "2019-12", mesDePago: "2019-12", corte: CORTE, origen: "Reglas legales y condiciones laborales" } as const;
    const { hojas } = leer(construirArchivoDePreliquidacion({ ...base, personas: [{ ...nestor, lineas: [onp] }] }));
    expect(hojas["Conceptos"][1]).toEqual(["99913004", "Néstor Neto Negativo", "Tienda Benavides", "Aporte ONP", "No entra al subtotal", 195, "", "12/2019", "12/2019", "12/2019", "Reglas legales y condiciones laborales", ""]);
  });

  it("F-04 el mes de pago del archivo y el mes de aplicación de la línea son datos distintos", () => {
    const aplicadaDespues: LineaDeFuenteExterna = { ...prestamo, mesDePago: "2020-01" };
    const { hojas } = leer(construirArchivoDePreliquidacion({ ...base, personas: [{ ...nestor, lineas: [aplicadaDespues] }] }));
    expect(hojas["Conceptos"][1].slice(7, 10)).toEqual(["12/2019", "01/2020", "12/2019"]);
  });

  it("F-06 las bases por devengue de cada persona; la que no se puede determinar dice «Pendiente»", () => {
    const { hojas } = leer(construirArchivoDePreliquidacion(base));
    expect(hojas["Bases"]).toEqual([
      ENCABEZADO_DE_BASES,
      ["99913004", "Néstor Neto Negativo", "Tienda Benavides", "12/2019", 1500, 1500, 1500, "Pendiente"],
    ]);
  });
});

const ENCABEZADO_DE_PERSONAS = ["DNI", "Persona", "Sede de adscripción", "Sueldo calculado (S/)", "Neto antes de aportes del trabajador (S/)", "Estado", "Bloqueos"];

describe("G3 sede de adscripción", () => {
  it("F-07 la sede de adscripción de cada persona está en Personas, y «Sede pendiente» si no tiene", () => {
    const sinSede = { ...nestor, dni: "99913005", nombre: "Cecilia", sedeDeAdscripcion: null };
    const { hojas } = leer(construirArchivoDePreliquidacion({ ...base, personas: [nestor, sinSede] }));
    expect(hojas["Personas"].map((fila) => fila.slice(0, 3))).toEqual([ENCABEZADO_DE_PERSONAS.slice(0, 3), ["99913004", "Néstor Neto Negativo", "Tienda Benavides"], ["99913005", "Cecilia", "Sede pendiente"]]);
  });

  // Caso resuelto a mano: mes 2019-12 (se consulta la sede el día 25), versión finalizada el 26/12/2019 a las 14:00 UTC.
  const condicion = (id: string, valor: string, vigenteDesde: string, registradaEn: string, reemplazadaEn: string | null = null): CondicionLaboral => ({
    id, relacionId: "r1", dato: "sede_de_adscripcion", valor, vigenteDesde, registradaPorId: "f", registradaPor: "finanzas",
    registradaEn: new Date(registradaEn), reemplazadaEn: reemplazadaEn ? new Date(reemplazadaEn) : null, motivoDeReemplazo: reemplazadaEn ? "Corrección" : null,
  });
  const FINALIZADA = new Date("2019-12-26T14:00:00Z");
  it.each([
    ["la sede vigente el día 25 al finalizar", [condicion("1", "Taller", "2019-01-01", "2019-01-01T10:00:00Z")], "2019-01-01", "Taller"],
    ["ignora una sede registrada después de finalizar, aunque su vigencia sea anterior", [condicion("1", "Taller", "2019-01-01", "2019-01-01T10:00:00Z"), condicion("2", "Tienda Benavides", "2019-12-01", "2020-01-10T10:00:00Z")], "2019-01-01", "Taller"],
    ["una sede reemplazada después de finalizar sigue siendo la que se usó", [condicion("1", "Taller", "2019-01-01", "2019-01-01T10:00:00Z", "2020-01-10T10:00:00Z"), condicion("2", "Tienda Benavides", "2019-01-01", "2020-01-10T10:00:00Z")], "2019-01-01", "Taller"],
    ["una sede reemplazada antes de finalizar ya no rige", [condicion("1", "Taller", "2019-01-01", "2019-01-01T10:00:00Z", "2019-12-10T10:00:00Z"), condicion("2", "Tienda Benavides", "2019-01-01", "2019-12-10T10:00:00Z")], "2019-01-01", "Tienda Benavides"],
    ["una vigencia posterior al día 25 todavía no rige", [condicion("1", "Taller", "2019-01-01", "2019-01-01T10:00:00Z"), condicion("2", "Tienda Benavides", "2019-12-26", "2019-12-01T10:00:00Z")], "2019-01-01", "Taller"],
    ["quien ingresa después del 25 se consulta el día de su ingreso", [condicion("1", "Taller", "2019-12-28", "2019-12-20T10:00:00Z")], "2019-12-28", "Taller"],
    ["sin sede registrada no hay sede", [], "2019-01-01", null],
  ])("F-08 %s", (_caso, condiciones, ingreso, esperada) => {
    expect(sedeDeAdscripcionAlFinalizar({ condiciones, relacionId: "r1", ingreso, mes: "2019-12", finalizadaEn: FINALIZADA })).toBe(esperada);
  });
});

describe("G4 contenido cerrado: sin datos bancarios y con el subtotal declarado", () => {
  it("F-09 el libro tiene exactamente las hojas y encabezados acordados y ninguno es bancario", () => {
    const { nombres, hojas } = leer(construirArchivoDePreliquidacion({ ...base, estado: version2 }));
    expect(nombres).toEqual(["Preliquidación", "Personas", "Conceptos", "Bases", "Fuentes"]);
    expect(hojas["Personas"][0]).toEqual(ENCABEZADO_DE_PERSONAS);
    expect(hojas["Conceptos"][0]).toEqual(ENCABEZADO_DE_CONCEPTOS);
    expect(hojas["Bases"][0]).toEqual(ENCABEZADO_DE_BASES);
    expect(hojas["Fuentes"]).toEqual([["Tipo de fuente", "Estado", "Filas (n.º)"], ["Préstamos (cuotas)", "Confirmada", 1]]);
    const rotulos = [...nombres, ...nombres.flatMap((hoja) => hojas[hoja].slice(0, 1).flat()), ...hojas["Preliquidación"].map(([rotulo]) => rotulo)].join("\n").toLowerCase();
    expect(rotulos).not.toMatch(/banc|cuenta|cci|iban|transferencia|abono a|orden de pago/);
  });

  it("F-10 con personas bloqueadas el subtotal solo suma a las calculadas y el encabezado lo declara «Incompleto»", () => {
    const calculada: PersonaParaExportar = { ...nestor, dni: "99913001", nombre: "Ana", netoCentimos: 200000, bloqueos: [], lineas: [sueldo] };
    const { hojas } = leer(construirArchivoDePreliquidacion({ ...base, personas: [calculada, nestor] }));
    const encabezado = hojas["Preliquidación"];
    expect(valorDe(encabezado, "Personas")).toBe(2);
    expect(valorDe(encabezado, "Personas con bloqueo")).toBe(1);
    expect(valorDe(encabezado, "Subtotal de las personas calculadas (S/)")).toBe(2000);
    expect(valorDe(encabezado, "Cobertura del subtotal")).toBe("Incompleto: 1 persona con bloqueo no suma");
    expect(valorDe(encabezado, "Revisiones de asistencia")).toBe("Período 26/11/2019 al 25/12/2019, revisión n.º 1");
    expect(hojas["Personas"][2]).toEqual(["99913004", "Néstor Neto Negativo", "Tienda Benavides", 1500, "Incompleto", "Bloqueada", "Neto negativo: −S/ 1.500,00"]);
  });

  it("F-10 sin bloqueos el subtotal está completo", () => {
    const calculada: PersonaParaExportar = { ...nestor, netoCentimos: 150000, bloqueos: [], lineas: [sueldo] };
    const { hojas } = leer(construirArchivoDePreliquidacion({ ...base, estado: version2, personas: [calculada] }));
    expect(valorDe(hojas["Preliquidación"], "Cobertura del subtotal")).toBe("Completo");
    expect(valorDe(hojas["Preliquidación"], "Subtotal de las personas calculadas (S/)")).toBe(1500);
  });
});
